// The Autopilot: the autonomous trading loop. On every tick it pulls fresh bars
// from a MarketSource, asks the SAME engine used in research for target weights,
// rebalances the book through an ExecutionBroker, and enforces hard kill-switches.
// The source/broker are pluggable, so the identical loop runs on the in-process
// paper simulator OR on a real MetaTrader 5 account via the Python bridge.
import fs from "node:fs";
import path from "node:path";
import { applyRiskOverlay, estimatePortfolioDailyVol, gross, scale } from "../src/engine/risk";
import { STRATEGY_MAP, STRATEGIES, defaultParams, ensembleWeights } from "../src/engine/strategies";
import { constructPortfolio } from "../src/engine/portfolio";
import { propGuardMaxGross } from "../src/engine/propFirm";
import type { Universe, Weights } from "../src/engine/types";
import type { ExecutionBroker, MarketSource, SymbolInfo } from "./adapters";
import type {
  AutopilotConfig,
  AutopilotSnapshot,
  AutopilotState,
  DecisionLog,
  Order,
  Position,
} from "./types";

const DATA_DIR = path.resolve(process.cwd(), "server", ".data");
const STATE_FILE = path.join(DATA_DIR, "state.json");

const SEED_BARS = 320;
const HISTORY_CAP = 420;
const EQUITY_CAP = 2000;
const LOG_CAP = 250;
const BARS_PER_DAY = 24;

const ENSEMBLE = "__ensemble__";

export class Autopilot {
  private source: MarketSource;
  private broker: ExecutionBroker;
  private histories: Universe = {};
  private symInfoCache = new Map<string, SymbolInfo>();
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private seeded = false;

  private state: AutopilotState = "idle";
  private startedAt: number | null = null;
  private bar = 0;
  private peakEquity: number;
  private dayStartEquity: number;
  private baselineEquity: number;
  private haltReason?: string;

  // Cached account snapshot (refreshed each tick) so /api/status stays sync & cheap.
  private equity: number;
  private cash: number;
  private positionsView: Position[] = [];
  private lastPrices: Record<string, number> = {};

  private equityCurve: { time: number; value: number }[] = [];
  private orders: Order[] = [];
  private decisions: DecisionLog[] = [];

  config: AutopilotConfig;

  constructor(config: AutopilotConfig, source: MarketSource, broker: ExecutionBroker) {
    this.config = config;
    this.source = source;
    this.broker = broker;
    this.equity = config.initialEquity;
    this.cash = config.initialEquity;
    this.peakEquity = config.initialEquity;
    this.dayStartEquity = config.initialEquity;
    this.baselineEquity = config.initialEquity;
    this.load();
  }

  /** Swap the execution backend (e.g. paper ⇄ MT5) and start fresh. */
  async useBackend(source: MarketSource, broker: ExecutionBroker, config?: Partial<AutopilotConfig>) {
    this.stop();
    this.source = source;
    this.broker = broker;
    await this.reset(config);
  }

  // ---------- lifecycle ----------
  async start() {
    if (this.state === "running") return;
    if (!this.seeded || this.bar === 0) await this.seedHistories();
    this.state = "running";
    this.haltReason = undefined;
    if (this.startedAt === null) this.startedAt = Date.now();
    this.log("info", `Autopilot started · ${this.config.brokerKind.toUpperCase()}.`);
    this.schedule();
    this.save();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.state === "running") this.state = "idle";
    this.log("info", "Autopilot stopped by operator.");
    this.save();
  }

  async reset(config?: Partial<AutopilotConfig>) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (config) this.config = { ...this.config, ...config };
    this.histories = {};
    this.symInfoCache.clear();
    this.bar = 0;
    this.state = "idle";
    this.startedAt = null;
    this.seeded = false;
    this.haltReason = undefined;
    this.equityCurve = [];
    this.orders = [];
    this.decisions = [];
    this.broker.resetAccount?.(this.config.initialEquity);
    await this.seedHistories();
    this.log("info", "Autopilot reset to a fresh session.");
    this.save();
  }

  updateConfig(patch: Partial<AutopilotConfig>) {
    this.config = { ...this.config, ...patch };
    if (this.config.intervalMs && this.state === "running") this.schedule();
    this.save();
  }

  private schedule() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => void this.tick(), Math.max(500, this.config.intervalMs));
  }

  private async seedHistories() {
    for (const sym of this.config.symbols) {
      try {
        this.histories[sym] = await this.source.seed(sym, SEED_BARS);
      } catch {
        this.histories[sym] = this.histories[sym] ?? [];
      }
    }
    this.lastPrices = this.latestPrices();
    const acct = await this.safeAccount();
    this.equity = acct.equity;
    this.cash = acct.balance;
    this.baselineEquity = acct.equity;
    this.peakEquity = acct.equity;
    this.dayStartEquity = acct.equity;
    this.positionsView = await this.buildPositionsView();
    this.equityCurve = [{ time: Math.floor(Date.now() / 1000), value: +acct.equity.toFixed(2) }];
    this.seeded = true;
  }

  // ---------- the loop ----------
  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      // 1) Advance every market by one fresh bar (replace array ref to bust caches).
      for (const sym of this.config.symbols) {
        const bar = await this.source.next(sym);
        const hist = this.histories[sym] ?? [];
        const appended = [...hist, bar];
        this.histories[sym] = appended.length > HISTORY_CAP ? appended.slice(-HISTORY_CAP) : appended;
      }
      this.bar++;

      const symbols = this.config.symbols;
      const t = this.histories[symbols[0]].length - 1;
      const prices = this.latestPrices();
      this.lastPrices = prices;

      const acct = await this.safeAccount();
      let equity = acct.equity;
      this.cash = acct.balance;

      // 2) Daily accounting boundary + peak.
      if (this.bar % BARS_PER_DAY === 0) this.dayStartEquity = equity;
      if (equity > this.peakEquity) this.peakEquity = equity;

      // 3) Hard kill-switches — before any new risk is taken.
      const drawdown = equity / this.peakEquity - 1;
      const dailyPnl = equity / this.dayStartEquity - 1;
      if (this.state === "running") {
        if (drawdown <= -this.config.killSwitch.maxDrawdown) {
          await this.flatten(prices, "kill-switch: max drawdown");
          this.equity = (await this.safeAccount()).equity;
          this.positionsView = await this.buildPositionsView();
          return this.halt(`بلغ السحب الحدّ (${(drawdown * 100).toFixed(1)}%) — تم تسييل المراكز.`);
        }
        if (dailyPnl <= -this.config.killSwitch.maxDailyLoss) {
          await this.flatten(prices, "kill-switch: daily loss");
          this.equity = (await this.safeAccount()).equity;
          this.positionsView = await this.buildPositionsView();
          return this.halt(`بلغت الخسارة اليومية الحدّ (${(dailyPnl * 100).toFixed(1)}%) — تم التسييل.`);
        }
      }

      // 4) Decide + rebalance while running.
      if (this.state === "running") {
        const target = this.targetWeights(symbols, t, equity);
        await this.rebalance(symbols, target, prices, equity);
        equity = (await this.safeAccount()).equity;
      }

      // 5) Record + cache.
      this.equity = equity;
      this.positionsView = await this.buildPositionsView();
      const now = Math.max(this.lastTimeSec() + 1, Math.floor(Date.now() / 1000));
      this.equityCurve.push({ time: now, value: +equity.toFixed(2) });
      if (this.equityCurve.length > EQUITY_CAP) this.equityCurve.shift();
      this.save();
    } catch (e) {
      this.log("warn", `tick error: ${(e as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }

  private targetWeights(symbols: string[], t: number, equity: number): Weights {
    let raw: Weights;
    if (this.config.engine) {
      raw = constructPortfolio(this.histories, symbols, t, this.config.engine);
    } else if (this.config.strategyId === ENSEMBLE) {
      raw = ensembleWeights(
        STRATEGIES.map((s) => ({ strategy: s, params: defaultParams(s), weight: 1 })),
        this.histories,
        symbols,
        t,
      );
    } else {
      const strat = STRATEGY_MAP[this.config.strategyId] ?? STRATEGY_MAP["risk-parity"];
      raw = strat.computeWeights(this.histories, symbols, t, defaultParams(strat));
    }
    let w = applyRiskOverlay(raw, this.histories, symbols, t, this.config.risk);
    if (this.config.prop) {
      const estVol = estimatePortfolioDailyVol(w, this.histories, symbols, t, this.config.risk.volLookback);
      const maxG = propGuardMaxGross(this.config.prop, equity, this.dayStartEquity, this.peakEquity, estVol);
      const g = gross(w);
      if (g > maxG && g > 0) w = scale(w, Math.max(0, maxG) / g);
    }
    return w;
  }

  private async rebalance(symbols: string[], target: Weights, prices: Record<string, number>, equity: number) {
    const positions = await this.broker.positions();
    const minNotional = Math.max(1, equity * 0.0015);
    const now = Math.floor(Date.now() / 1000);
    for (const sym of symbols) {
      const price = prices[sym];
      if (!price || price <= 0) continue;
      const info = await this.symInfo(sym);
      const contract = info.contractSize || 1;
      const targetQty = ((target[sym] || 0) * equity) / (price * contract);
      const curQty = positions.get(sym)?.qty ?? 0;
      let delta = targetQty - curQty;
      if (info.volumeStep > 0) delta = Math.round(delta / info.volumeStep) * info.volumeStep;
      if (Math.abs(delta) * price * contract < minNotional) continue;
      if (info.volumeMin > 0 && Math.abs(delta) < info.volumeMin) continue;
      const order = await this.broker.submit(
        sym,
        delta > 0 ? "buy" : "sell",
        Math.abs(delta),
        price,
        this.config.risk.costPerTurnover,
        `target ${(target[sym] * 100).toFixed(0)}%`,
        now,
      );
      if (order) {
        this.orders.unshift(order);
        if (this.orders.length > LOG_CAP) this.orders.pop();
        this.log("trade", `${order.side === "buy" ? "شراء" : "بيع"} ${order.qty} ${sym} @ ${order.price}`);
      }
    }
  }

  private async flatten(prices: Record<string, number>, reason: string) {
    const positions = await this.broker.positions();
    const now = Math.floor(Date.now() / 1000);
    for (const [sym, pos] of [...positions]) {
      const price = prices[sym] ?? pos.avgPrice;
      const order = await this.broker.submit(
        sym,
        pos.qty > 0 ? "sell" : "buy",
        Math.abs(pos.qty),
        price,
        this.config.risk.costPerTurnover,
        reason,
        now,
      );
      if (order) {
        this.orders.unshift(order);
        if (this.orders.length > LOG_CAP) this.orders.pop();
      }
    }
  }

  private halt(reason: string) {
    this.state = "halted";
    this.haltReason = reason;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.log("halt", reason);
    const now = Math.max(this.lastTimeSec() + 1, Math.floor(Date.now() / 1000));
    this.equityCurve.push({ time: now, value: +this.equity.toFixed(2) });
    this.save();
  }

  // ---------- helpers ----------
  private async safeAccount(): Promise<{ balance: number; equity: number }> {
    try {
      return await this.broker.account(this.lastPrices);
    } catch {
      return { balance: this.cash, equity: this.equity };
    }
  }

  private async symInfo(sym: string): Promise<SymbolInfo> {
    const cached = this.symInfoCache.get(sym);
    if (cached) return cached;
    let info: SymbolInfo;
    try {
      info = await this.broker.symbolInfo(sym);
    } catch {
      info = { contractSize: 1, volumeMin: 0, volumeStep: 0 };
    }
    this.symInfoCache.set(sym, info);
    return info;
  }

  private async buildPositionsView(): Promise<Position[]> {
    let positions: Map<string, { qty: number; avgPrice: number }>;
    try {
      positions = await this.broker.positions();
    } catch {
      return this.positionsView;
    }
    const out: Position[] = [];
    for (const [sym, pos] of positions) {
      if (Math.abs(pos.qty) < 1e-9) continue;
      const info = await this.symInfo(sym);
      const contract = info.contractSize || 1;
      const last = this.lastPrices[sym] ?? pos.avgPrice;
      const marketValue = pos.qty * last * contract;
      out.push({
        symbol: sym,
        qty: +pos.qty.toFixed(4),
        avgPrice: +pos.avgPrice.toFixed(5),
        lastPrice: +last.toFixed(5),
        marketValue: +marketValue.toFixed(2),
        unrealizedPnl: +((last - pos.avgPrice) * pos.qty * contract).toFixed(2),
        weight: this.equity !== 0 ? +(marketValue / this.equity).toFixed(4) : 0,
      });
    }
    return out.sort((a, b) => Math.abs(b.marketValue) - Math.abs(a.marketValue));
  }

  private latestPrices(): Record<string, number> {
    const p: Record<string, number> = {};
    for (const sym of this.config.symbols) {
      const hist = this.histories[sym];
      if (hist?.length) p[sym] = hist[hist.length - 1].close;
    }
    return p;
  }

  private lastTimeSec(): number {
    return this.equityCurve.length ? this.equityCurve[this.equityCurve.length - 1].time : 0;
  }

  private log(level: DecisionLog["level"], message: string) {
    this.decisions.unshift({ time: Math.floor(Date.now() / 1000), bar: this.bar, level, message });
    if (this.decisions.length > LOG_CAP) this.decisions.pop();
  }

  snapshot(): AutopilotSnapshot {
    return {
      state: this.state,
      mode: this.config.mode,
      startedAt: this.startedAt,
      bar: this.bar,
      config: this.config,
      equity: +this.equity.toFixed(2),
      cash: +this.cash.toFixed(2),
      peakEquity: +this.peakEquity.toFixed(2),
      dayStartEquity: +this.dayStartEquity.toFixed(2),
      todayPnl: +(this.equity - this.dayStartEquity).toFixed(2),
      totalPnl: +(this.equity - this.baselineEquity).toFixed(2),
      drawdown: +(this.equity / this.peakEquity - 1).toFixed(4),
      positions: this.positionsView,
      equityCurve: this.equityCurve,
      orders: this.orders,
      decisions: this.decisions,
      prices: this.lastPrices,
      haltReason: this.haltReason,
      engineMode: this.describeEngine(),
    };
  }

  private describeEngine(): string {
    const e = this.config.engine;
    if (!e) return this.config.strategyId === ENSEMBLE ? "محفظة مدمجة" : (STRATEGY_MAP[this.config.strategyId]?.nameAr ?? this.config.strategyId);
    const parts: string[] = [];
    if (e.riskModel !== "none") parts.push(e.riskModel.toUpperCase());
    if (e.factorTilt > 0) parts.push(`عوامل ${e.factorTilt}`);
    if (e.regimeAdaptive) parts.push("تكيّف الحالة");
    return parts.length ? `محرّك متكامل: ${parts.join(" · ")}` : "محرّك متكامل";
  }

  // ---------- persistence ----------
  private save() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      const blob: Record<string, unknown> = {
        config: this.config,
        state: this.state === "running" ? "idle" : this.state, // never auto-resume trading
        startedAt: this.startedAt,
        bar: this.bar,
        seeded: this.seeded,
        peakEquity: this.peakEquity,
        dayStartEquity: this.dayStartEquity,
        baselineEquity: this.baselineEquity,
        equity: this.equity,
        cash: this.cash,
        haltReason: this.haltReason,
        histories: this.histories,
        positionsView: this.positionsView,
        lastPrices: this.lastPrices,
        equityCurve: this.equityCurve,
        orders: this.orders,
        decisions: this.decisions,
      };
      if (this.broker.serialize) blob.brokerState = this.broker.serialize();
      fs.writeFileSync(STATE_FILE, JSON.stringify(blob));
    } catch {
      /* best-effort persistence */
    }
  }

  private load(): boolean {
    try {
      if (!fs.existsSync(STATE_FILE)) return false;
      const blob = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      // Only restore if the persisted backend matches the current one.
      if (blob.config?.brokerKind && blob.config.brokerKind !== this.config.brokerKind) return false;
      this.config = { ...this.config, ...blob.config };
      this.state = blob.state ?? "idle";
      this.startedAt = blob.startedAt ?? null;
      this.bar = blob.bar ?? 0;
      this.seeded = !!blob.seeded && this.bar > 0;
      this.peakEquity = blob.peakEquity ?? this.config.initialEquity;
      this.dayStartEquity = blob.dayStartEquity ?? this.config.initialEquity;
      this.baselineEquity = blob.baselineEquity ?? this.config.initialEquity;
      this.equity = blob.equity ?? this.config.initialEquity;
      this.cash = blob.cash ?? this.config.initialEquity;
      this.haltReason = blob.haltReason;
      this.histories = blob.histories ?? {};
      this.positionsView = blob.positionsView ?? [];
      this.lastPrices = blob.lastPrices ?? {};
      this.equityCurve = blob.equityCurve ?? [];
      this.orders = blob.orders ?? [];
      this.decisions = blob.decisions ?? [];
      if (blob.brokerState && this.broker.hydrate) {
        this.broker.hydrate(blob.brokerState.cash, blob.brokerState.positions);
      }
      return this.seeded;
    } catch {
      return false;
    }
  }
}
