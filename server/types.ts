// Server-side types for the AURUM autopilot. Reuses the pure engine types so the
// exact same strategies/risk/prop logic that powers the research UI also drives
// live (paper) execution — no divergence between what you test and what runs.
import type { Candle, PropFirmRules, RiskConfig } from "../src/engine/types";
import type { PortfolioConfig } from "../src/engine/portfolio";

export type OrderSide = "buy" | "sell";

export interface Order {
  id: string;
  time: number;
  symbol: string;
  side: OrderSide;
  qty: number;
  price: number;
  cost: number;
  reason: string;
}

export interface Position {
  symbol: string;
  qty: number;
  avgPrice: number;
  lastPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  weight: number;
}

export type AutopilotMode = "paper" | "live";
export type AutopilotState = "idle" | "running" | "halted";

export interface KillSwitch {
  /** Flatten and halt if total drawdown from peak exceeds this fraction (e.g. 0.2). */
  maxDrawdown: number;
  /** Flatten and halt if loss within the current day exceeds this fraction. */
  maxDailyLoss: number;
}

export interface AutopilotConfig {
  mode: AutopilotMode;
  /** Single strategy id, or "__ensemble__" to run all strategies blended. */
  strategyId: string;
  riskPreset: "conservative" | "balanced" | "aggressive";
  risk: RiskConfig;
  symbols: string[];
  initialEquity: number;
  /** Milliseconds between decision ticks. Demo uses seconds; real use = minutes/hours. */
  intervalMs: number;
  /** Optional prop-firm rule set enforced live. */
  prop?: PropFirmRules;
  killSwitch: KillSwitch;
  /** Integrated construction pipeline (regime + risk model + factors). When set,
   *  it supersedes the plain strategyId/ensemble path. */
  engine?: PortfolioConfig | null;
  /** Where execution happens: in-process paper sim, or a real MT5 account bridge. */
  brokerKind: "paper" | "mt5";
  /** Base URL of the Python MT5 bridge (used when brokerKind === "mt5"). */
  bridgeUrl: string;
}

export interface DecisionLog {
  time: number;
  bar: number;
  message: string;
  level: "info" | "trade" | "warn" | "halt";
}

export interface AutopilotSnapshot {
  state: AutopilotState;
  mode: AutopilotMode;
  startedAt: number | null;
  bar: number;
  config: AutopilotConfig;
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
  /** Human-readable description of the active construction engine. */
  engineMode: string;
}

export interface MarketTick {
  symbol: string;
  candle: Candle;
}
