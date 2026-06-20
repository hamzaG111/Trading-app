// Pluggable data + execution adapters behind two small async interfaces, so the
// autopilot loop is identical whether it runs on the in-process paper simulator
// or on a real MetaTrader 5 account via the Python bridge.
import type { Candle } from "../src/engine/types";
import type { Order, OrderSide } from "./types";
import { PaperBroker } from "./broker";
import { SyntheticLiveProvider } from "./marketData";

export interface MarketSource {
  /** Most-recent-last history to warm up indicators. */
  seed(symbol: string, bars: number): Promise<Candle[]>;
  /** The next live bar for a symbol. */
  next(symbol: string): Promise<Candle>;
}

export interface SymbolInfo {
  contractSize: number;
  volumeMin: number;
  volumeStep: number;
  price?: number;
}

export interface ExecutionBroker {
  account(prices: Record<string, number>): Promise<{ balance: number; equity: number }>;
  positions(): Promise<Map<string, { qty: number; avgPrice: number }>>;
  symbolInfo(symbol: string): Promise<SymbolInfo>;
  submit(
    symbol: string,
    side: OrderSide,
    qty: number,
    price: number,
    costRate: number,
    reason: string,
    time: number,
  ): Promise<Order | null>;
  serialize?(): { cash: number; positions: { symbol: string; qty: number; avgPrice: number }[] };
  hydrate?(cash: number, positions: { symbol: string; qty: number; avgPrice: number }[]): void;
  /** Reset a simulated account to a fresh balance (paper only; real accounts can't). */
  resetAccount?(startCash: number): void;
}

// --------------------------------------------------------------- paper (local)
export class PaperSource implements MarketSource {
  private provider = new SyntheticLiveProvider();
  private lastPrice = new Map<string, number>();
  private lastTime = new Map<string, number>();

  async seed(symbol: string, bars: number): Promise<Candle[]> {
    const s = this.provider.seed(symbol, bars);
    const last = s[s.length - 1];
    if (last) {
      this.lastPrice.set(symbol, last.close);
      this.lastTime.set(symbol, last.time);
    }
    return s;
  }

  async next(symbol: string): Promise<Candle> {
    const prev = this.lastPrice.get(symbol) ?? 100;
    const t = (this.lastTime.get(symbol) ?? Math.floor(Date.now() / 1000)) + 86400;
    const c = this.provider.next(symbol, prev, t);
    this.lastPrice.set(symbol, c.close);
    this.lastTime.set(symbol, t);
    return c;
  }
}

export class PaperExecutionBroker implements ExecutionBroker {
  private broker: PaperBroker;
  constructor(startCash: number) {
    this.broker = new PaperBroker(startCash);
  }
  async account(prices: Record<string, number>) {
    return { balance: this.broker.getCash(), equity: this.broker.equity(prices) };
  }
  async positions() {
    const out = new Map<string, { qty: number; avgPrice: number }>();
    for (const [s, p] of this.broker.getPositions()) out.set(s, { qty: p.qty, avgPrice: p.avgPrice });
    return out;
  }
  async symbolInfo(): Promise<SymbolInfo> {
    return { contractSize: 1, volumeMin: 0, volumeStep: 0 };
  }
  async submit(symbol: string, side: OrderSide, qty: number, price: number, costRate: number, reason: string, time: number) {
    return this.broker.submit(symbol, side, qty, price, costRate, reason, time);
  }
  serialize() {
    return {
      cash: this.broker.getCash(),
      positions: [...this.broker.getPositions()].map(([symbol, p]) => ({ symbol, qty: p.qty, avgPrice: p.avgPrice })),
    };
  }
  hydrate(cash: number, positions: { symbol: string; qty: number; avgPrice: number }[]) {
    this.broker.hydrate(cash, positions);
  }
  resetAccount(startCash: number) {
    this.broker = new PaperBroker(startCash);
  }
}

// ------------------------------------------------------------- MT5 (via bridge)
async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`bridge ${r.status}`);
  return r.json() as Promise<T>;
}
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  return r.json() as Promise<T>;
}

export interface BridgeHealth {
  ok: boolean;
  mode: "mock" | "live";
  connected: boolean;
  symbols: string[];
  account: { server: string; balance: number; equity: number; currency: string };
}

export async function bridgeHealth(base: string): Promise<BridgeHealth | null> {
  try {
    return await getJson<BridgeHealth>(`${base}/health`);
  } catch {
    return null;
  }
}

export class Mt5Source implements MarketSource {
  constructor(private base: string) {}
  async seed(symbol: string, bars: number): Promise<Candle[]> {
    const r = await getJson<{ bars: Candle[] }>(`${this.base}/seed?symbol=${encodeURIComponent(symbol)}&count=${bars}`);
    return r.bars ?? [];
  }
  async next(symbol: string): Promise<Candle> {
    const r = await getJson<{ bar: Candle }>(`${this.base}/next?symbol=${encodeURIComponent(symbol)}`);
    return r.bar;
  }
}

export class Mt5Broker implements ExecutionBroker {
  private infoCache = new Map<string, SymbolInfo>();
  constructor(private base: string) {}

  async account() {
    const a = await getJson<{ balance: number; equity: number }>(`${this.base}/account`);
    return { balance: a.balance, equity: a.equity };
  }
  async positions() {
    const list = await getJson<{ symbol: string; volume: number; avgPrice: number }[]>(`${this.base}/positions`);
    const out = new Map<string, { qty: number; avgPrice: number }>();
    for (const p of list) out.set(p.symbol, { qty: p.volume, avgPrice: p.avgPrice });
    return out;
  }
  async symbolInfo(symbol: string): Promise<SymbolInfo> {
    const cached = this.infoCache.get(symbol);
    if (cached) return cached;
    const i = await getJson<SymbolInfo>(`${this.base}/symbol?symbol=${encodeURIComponent(symbol)}`);
    const info: SymbolInfo = {
      contractSize: i.contractSize || 1,
      volumeMin: i.volumeMin || 0.01,
      volumeStep: i.volumeStep || 0.01,
      price: i.price,
    };
    this.infoCache.set(symbol, info);
    return info;
  }
  async submit(symbol: string, side: OrderSide, qty: number, price: number, _costRate: number, reason: string, time: number) {
    const res = await postJson<{ ok: boolean; price?: number }>(`${this.base}/order`, {
      symbol,
      side,
      volume: Math.abs(qty),
    });
    if (!res.ok) return null;
    return {
      id: `O${time}-${symbol}`,
      time,
      symbol,
      side,
      qty: +Math.abs(qty).toFixed(4),
      price: +(res.price ?? price).toFixed(5),
      cost: 0,
      reason,
    };
  }
}
