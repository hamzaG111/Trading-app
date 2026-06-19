// Core domain types for the AURUM quant engine.
// Everything downstream (indicators, strategies, risk, backtest) builds on these.

/** A single OHLCV bar. `time` is a Unix timestamp in seconds (UTC). */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Series = Candle[];

/** A universe of aligned price series, keyed by symbol. All series share the same timeline. */
export type Universe = Record<string, Series>;

/** Target portfolio weights per symbol. Positive = long, negative = short. */
export type Weights = Record<string, number>;

/** A parameter exposed by a strategy so the UI can render controls for it. */
export interface ParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** Optional unit shown in the UI, e.g. "days" or "%". */
  unit?: string;
}

export type StrategyCategory =
  | "trend"
  | "momentum"
  | "mean-reversion"
  | "risk-parity"
  | "volatility";

export interface Strategy {
  id: string;
  name: string;
  /** Arabic short name for the UI. */
  nameAr: string;
  category: StrategyCategory;
  /** A plain-language description of the edge and the research behind it. */
  description: string;
  /** Notable funds / papers this approach is associated with. */
  inspiration: string;
  params: ParamSpec[];
  /**
   * Decide target weights using ONLY information available up to and including bar `t`.
   * The backtester applies these weights to the return from `t` -> `t+1`,
   * which guarantees there is no look-ahead bias.
   */
  computeWeights(
    universe: Universe,
    symbols: string[],
    t: number,
    params: Record<string, number>,
  ): Weights;
}

/** Risk configuration applied as an overlay on top of any strategy's raw weights. */
export interface RiskConfig {
  /** Annualised volatility target for the whole portfolio, e.g. 0.10 = 10%. 0 disables targeting. */
  targetVol: number;
  /** Hard cap on gross exposure (sum of |weights|). 1 = fully invested, 3 = 3x leverage. */
  maxGross: number;
  /** Fraction of the (capped) Kelly bet to use. 0.25 = quarter-Kelly. 0 disables. */
  kellyFraction: number;
  /** Round-trip transaction cost per unit turnover, e.g. 0.0005 = 5 bps. */
  costPerTurnover: number;
  /** Lookback (bars) used to estimate volatility for targeting. */
  volLookback: number;
}

/** A prop-firm challenge rule set (FundedNext-style). All limits are fractions of starting balance. */
export interface PropFirmRules {
  id: string;
  name: string;
  startingBalance: number;
  /** Max loss in a single day, as a fraction of starting balance (e.g. 0.05 = 5%). */
  maxDailyLoss: number;
  /** Max total loss from the high-water mark or starting balance, depending on `trailing`. */
  maxOverallLoss: number;
  /** Profit target required to pass the phase (fraction of starting balance). */
  profitTarget: number;
  /** Whether the overall-loss limit trails the peak equity (true) or is static from start (false). */
  trailing: boolean;
  /** Minimum number of trading days before a pass is valid. */
  minTradingDays: number;
}

export interface Trade {
  time: number;
  symbol: string;
  /** Change in weight that was executed at this bar. */
  deltaWeight: number;
}

export interface BacktestResult {
  /** Equity curve as { time, value } points, starting at `initialEquity`. */
  equity: { time: number; value: number }[];
  /** Drawdown curve (0 to -1) aligned with equity. */
  drawdown: { time: number; value: number }[];
  /** Per-bar portfolio returns (fractional). */
  returns: number[];
  metrics: PerformanceMetrics;
  prop?: PropFirmEvaluation;
}

export interface PerformanceMetrics {
  totalReturn: number;
  cagr: number;
  annualVol: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  calmar: number;
  winRate: number;
  profitFactor: number;
  bestDay: number;
  worstDay: number;
  exposure: number;
}

export interface PropFirmEvaluation {
  passed: boolean;
  failed: boolean;
  failReason?: string;
  /** Day index where the challenge was decided, if any. */
  decidedAtDay?: number;
  peakEquity: number;
  finalEquity: number;
  worstDailyLoss: number;
  tradingDays: number;
}
