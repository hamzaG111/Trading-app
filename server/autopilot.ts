// The Autopilot: the autonomous trading loop. On every tick it pulls fresh
// prices, asks the SAME engine used in research for target weights, rebalances
// the (paper) book toward them, and enforces hard kill-switches. It persists its
// full state to disk so it survives restarts — the realistic meaning of
// "runs while you sleep": a server process, with guardrails and your oversight.
import fs from "node:fs";
import path from "node:path";
import { applyRiskOverlay, estimatePortfolioDailyVol, gross, scale } from "../src/engine/risk";
import { STRATEGY_MAP, STRATEGIES, defaultParams, ensembleWeights } from "../src/engine/strategies";
import { propGuardMaxGross } from "../src/engine/propFirm";
import type { Candle, Universe, Weights } from "../src/engine/types";
import { PaperBroker } from "./broker";
import { SyntheticLiveProvider } from "./marketData";
import type {
  AutopilotConfig,
  AutopilotSnapshot,
  AutopilotState,
  DecisionLog,
  Order,
} from "./types";

const DATA_DIR = path.resolve(process.cwd(), "server", ".data");
const STATE_FILE = path.join(DATA_DIR, "state.json");

const SEED_BARS = 320;
const HISTORY_CAP = 420;
const EQUITY_CAP = 2000;
const LOG_CAP = 250;
const BARS_PER_DAY = 24; // a "trading day" for daily-loss accounting in demo mode

const ENSEMBLE = "__ensemble__";

export class Autopilot {
  private provider = new SyntheticLiveProvider();
  private histories: Universe = {};
  private broker: PaperBroker;
  private timer: NodeJS.Timeout | null = null;

  private state: AutopilotState = "idle";
  private startedAt: number | null = null;
  private bar = 0;
  private lastTime = Math.floor(Date.now() / 1000);
  private peakEquity: number;
  private dayStartEquity: number;
  private haltReason?: string;

  private equityCurve: { time: number; value: number }[] = [];
  private orders: Order[] = [];
  private decisions: DecisionLog[] = [];

  config: AutopilotConfig;

  constructor(config: AutopilotConfig) {
    this.config = config;
    this.broker = new PaperBroker(config.initialEquity);
    this.peakEquity = config.initialEquity;
    this.dayStartEquity = config.initialEquity;
    if (!this.load()) this.seed();
  }

  // ---------- lifecycle ----------
  start() {
    if (this.state === "running") return;
    if (this.bar === 0) this.seed();
    this.state = "running";
    this.haltReason = undefined;
    if (this.startedAt === null) this.startedAt = Date.now();
    this.log("info", `Autopilot started in ${this.config.mode.toUpperCase()} mode.`);
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

  reset(config?: Partial<AutopilotConfig>) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (config) this.config = { ...this.config, ...config };
    this.broker = new PaperBroker(this.config.initialEquity);
    this.histories = {};
    this.bar = 0;
    this.state = "idle";
    this.startedAt = null;
    this.peakEquity = this.config.initialEquity;
    this.dayStartEquity = this.config.initialEquity;
    this.haltReason = undefined;
    this.equityCurve = [];
    this.orders = [];
    this.decisions = [];
    this.seed();
    this.log("info", "Autopilot reset to a fresh account.");
    this.save();
  }

  updateConfig(patch: Partial<AutopilotConfig>) {
    this.config = { ...this.config, ...patch };
    if (this.config.intervalMs && this.state === "running") this.schedule();
    this.save();
  }

  private schedule() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), Math.max(500, this.config.intervalMs));
  }

  private seed() {
    for (const sym of this.config.symbols) {
      this.histories[sym] = this.provider.seed(sym, SEED_BARS);
    }
    this.lastTime = this.histories[this.config.symbols[0]]?.slice(-1)[0]?.time ?? this.lastTime;
    const prices = this.latestPrices();
    const eq = this.broker.equity(prices);
    this.equityCurve = [{ time: Math.floor(Date.now() / 1000), value: eq }];
  }

  // ---------- the loop ----------
  tick() {
    // 1) Advance every market by one fresh bar.
    //    NB: we replace the array reference (rather than push in place) so the
    //    engine's per-Series close-price cache is invalidated each tick. Mutating
    //    in place would leave a stale cache where c[t] is undefined -> NaN signals.
    this.lastTime += 86400;
    for (const sym of this.config.symbols) {
      const hist = this.histories[sym];
      const prevClose = hist[hist.length - 1].close;
      const candle: Candle = this.provider.next(sym, prevClose, this.lastTime);
      const appended = [...hist, candle];
      this.histories[sym] = appended.length > HISTORY_CAP ? appended.slice(-HISTORY_CAP) : appended;
    }
    this.bar++;

    const symbols = this.config.symbols;
    const t = this.histories[symbols[0]].length - 1;
    const prices = this.latestPrices();
    let equity = this.broker.equity(prices);

    // 2) Daily accounting boundary.
    if (this.bar % BARS_PER_DAY === 0) this.dayStartEquity = equity;
    if (equity > this.peakEquity) this.peakEquity = equity;

    // 3) Hard kill-switches — checked before any new risk is taken.
    const drawdown = equity / this.peakEquity - 1;
    const dailyPnl = equity / this.dayStartEquity - 1;
    if (this.state === "running") {
      if (drawdown <= -this.config.killSwitch.maxDrawdown) {
        this.flatten(prices, "kill-switch: max drawdown");
        return this.halt(`بلغ السحب الحدّ (${(drawdown * 100).toFixed(1)}%) — تم تسييل المراكز.`);
      }
      if (dailyPnl <= -this.config.killSwitch.maxDailyLoss) {
        this.flatten(prices, "kill-switch: daily loss");
        return this.halt(`بلغت الخسارة اليومية الحدّ (${(dailyPnl * 100).toFixed(1)}%) — تم التسييل.`);
      }
    }

    // 4) Decide + rebalance only while running.
    if (this.state === "running") {
      const target = this.targetWeights(symbols, t, equity);
      this.rebalance(symbols, target, prices, equity);
      equity = this.broker.equity(prices);
    }

    // 5) Record.
    const now = Math.max(this.lastTimeSec() + 1, Math.floor(Date.now() / 1000));
    this.equityCurve.push({ time: now, value: +equity.toFixed(2) });
    if (this.equityCurve.length > EQUITY_CAP) this.equityCurve.shift();
    this.save();
  }

  private targetWeights(symbols: string[], t: number, equity: number): Weights {
    let raw: Weights;
    if (this.config.strategyId === ENSEMBLE) {
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
      const maxG = propGuardMaxGross(
        this.config.prop,
        equity,
        this.dayStartEquity,
        this.peakEquity,
        estVol,
      );
      const g = gross(w);
      if (g > maxG && g > 0) w = scale(w, Math.max(0, maxG) / g);
    }
    return w;
  }

  private rebalance(symbols: string[], target: Weights, prices: Record<string, number>, equity: number) {
    const positions = this.broker.getPositions();
    const minNotional = Math.max(1, equity * 0.0015);
    for (const sym of symbols) {
      const price = prices[sym];
      if (!price || price <= 0) continue;
      const targetQty = ((target[sym] || 0) * equity) / price;
      const curQty = positions.get(sym)?.qty ?? 0;
      const deltaQty = targetQty - curQty;
      if (Math.abs(deltaQty) * price < minNotional) continue;
      const order = this.broker.submit(
        sym,
        deltaQty > 0 ? "buy" : "sell",
        Math.abs(deltaQty),
        price,
        this.config.risk.costPerTurnover,
        `target ${(target[sym] * 100).toFixed(0)}%`,
        Math.floor(Date.now() / 1000),
      );
      if (order) {
        this.orders.unshift(order);
        if (this.orders.length > LOG_CAP) this.orders.pop();
        this.log("trade", `${order.side === "buy" ? "شراء" : "بيع"} ${order.qty} ${sym} @ ${order.price}`);
      }
    }
  }

  private flatten(prices: Record<string, number>, reason: string) {
    const positions = this.broker.getPositions();
    for (const [sym, pos] of [...positions]) {
      const price = prices[sym] ?? pos.avgPrice;
      const order = this.broker.submit(
        sym,
        pos.qty > 0 ? "sell" : "buy",
        Math.abs(pos.qty),
        price,
        this.config.risk.costPerTurnover,
        reason,
        Math.floor(Date.now() / 1000),
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
    this.equityCurve.push({ time: now, value: +this.broker.equity(this.latestPrices()).toFixed(2) });
    this.save();
  }

  // ---------- helpers ----------
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
    const prices = this.latestPrices();
    const equity = this.broker.equity(prices);
    return {
      state: this.state,
      mode: this.config.mode,
      startedAt: this.startedAt,
      bar: this.bar,
      config: this.config,
      equity: +equity.toFixed(2),
      cash: +this.broker.getCash().toFixed(2),
      peakEquity: +this.peakEquity.toFixed(2),
      dayStartEquity: +this.dayStartEquity.toFixed(2),
      todayPnl: +(equity - this.dayStartEquity).toFixed(2),
      totalPnl: +(equity - this.config.initialEquity).toFixed(2),
      drawdown: +(equity / this.peakEquity - 1).toFixed(4),
      positions: this.broker.positionsView(prices, equity),
      equityCurve: this.equityCurve,
      orders: this.orders,
      decisions: this.decisions,
      prices,
      haltReason: this.haltReason,
    };
  }

  // ---------- persistence ----------
  private save() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      const positions = [...this.broker.getPositions()].map(([symbol, p]) => ({
        symbol,
        qty: p.qty,
        avgPrice: p.avgPrice,
      }));
      const blob = {
        config: this.config,
        state: this.state === "running" ? "idle" : this.state, // never auto-resume trading
        startedAt: this.startedAt,
        bar: this.bar,
        lastTime: this.lastTime,
        peakEquity: this.peakEquity,
        dayStartEquity: this.dayStartEquity,
        haltReason: this.haltReason,
        cash: this.broker.getCash(),
        positions,
        histories: this.histories,
        equityCurve: this.equityCurve,
        orders: this.orders,
        decisions: this.decisions,
      };
      fs.writeFileSync(STATE_FILE, JSON.stringify(blob));
    } catch {
      /* best-effort persistence */
    }
  }

  private load(): boolean {
    try {
      if (!fs.existsSync(STATE_FILE)) return false;
      const blob = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      this.config = { ...this.config, ...blob.config };
      this.state = blob.state ?? "idle";
      this.startedAt = blob.startedAt ?? null;
      this.bar = blob.bar ?? 0;
      this.lastTime = blob.lastTime ?? this.lastTime;
      this.peakEquity = blob.peakEquity ?? this.config.initialEquity;
      this.dayStartEquity = blob.dayStartEquity ?? this.config.initialEquity;
      this.haltReason = blob.haltReason;
      this.histories = blob.histories ?? {};
      this.equityCurve = blob.equityCurve ?? [];
      this.orders = blob.orders ?? [];
      this.decisions = blob.decisions ?? [];
      this.broker.hydrate(blob.cash ?? this.config.initialEquity, blob.positions ?? []);
      // Re-seed any missing histories (e.g. new symbol added).
      for (const sym of this.config.symbols) {
        if (!this.histories[sym]?.length) this.histories[sym] = this.provider.seed(sym, SEED_BARS);
      }
      return this.bar > 0;
    } catch {
      return false;
    }
  }
}
