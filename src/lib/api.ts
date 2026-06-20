// Client for the AURUM autopilot server. Falls back gracefully when the engine
// is offline so the UI can tell the user how to start it.

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8787";

export type AutopilotState = "idle" | "running" | "halted";

export interface Position {
  symbol: string;
  qty: number;
  avgPrice: number;
  lastPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  weight: number;
}

export interface Order {
  id: string;
  time: number;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  cost: number;
  reason: string;
}

export interface DecisionLog {
  time: number;
  bar: number;
  message: string;
  level: "info" | "trade" | "warn" | "halt";
}

export interface Snapshot {
  state: AutopilotState;
  mode: "paper" | "live";
  startedAt: number | null;
  bar: number;
  config: {
    strategyId: string;
    riskPreset: string;
    symbols: string[];
    initialEquity: number;
    intervalMs: number;
    killSwitch: { maxDrawdown: number; maxDailyLoss: number };
    prop?: { name: string } | null;
    engine?: {
      riskModel: string;
      riskBlend: number;
      factorTilt: number;
      regimeAdaptive: boolean;
    } | null;
  };
  engineMode: string;
  equity: number;
  cash: number;
  peakEquity: number;
  dayStartEquity: number;
  todayPnl: number;
  totalPnl: number;
  drawdown: number;
  positions: Position[];
  equityCurve: { time: number; value: number }[];
  orders: Order[];
  decisions: DecisionLog[];
  prices: Record<string, number>;
  haltReason?: string;
}

export interface Meta {
  strategies: { id: string; name: string; nameAr: string }[];
  riskPresets: { key: string; nameAr: string }[];
  propPresets: { id: string; name: string }[];
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  base: BASE,
  health: () => req<{ ok: boolean }>("/api/health"),
  status: () => req<Snapshot>("/api/status"),
  meta: () => req<Meta>("/api/meta"),
  start: () => req<Snapshot>("/api/start", { method: "POST" }),
  stop: () => req<Snapshot>("/api/stop", { method: "POST" }),
  reset: (patch: Record<string, unknown> = {}) =>
    req<Snapshot>("/api/reset", { method: "POST", body: JSON.stringify(patch) }),
  config: (patch: Record<string, unknown>) =>
    req<Snapshot>("/api/config", { method: "POST", body: JSON.stringify(patch) }),
};
