// Technical indicators. Pure functions over number[] (typically closing prices).
// Each returns an array aligned to the input length; values that cannot yet be
// computed (insufficient lookback) are NaN, which downstream code treats as "no signal".

/** Simple moving average. */
export function sma(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average. Seeded with the first value. */
export function ema(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  if (period <= 0 || values.length === 0) return out;
  const k = 2 / (period + 1);
  let prev = values[0];
  out[0] = prev;
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Fractional simple returns: r[i] = v[i]/v[i-1] - 1. r[0] = 0. */
export function simpleReturns(values: number[]): number[] {
  const out = new Array(values.length).fill(0);
  for (let i = 1; i < values.length; i++) {
    out[i] = values[i - 1] !== 0 ? values[i] / values[i - 1] - 1 : 0;
  }
  return out;
}

/** Log returns: r[i] = ln(v[i]/v[i-1]). r[0] = 0. */
export function logReturns(values: number[]): number[] {
  const out = new Array(values.length).fill(0);
  for (let i = 1; i < values.length; i++) {
    out[i] = values[i - 1] > 0 ? Math.log(values[i] / values[i - 1]) : 0;
  }
  return out;
}

/** Rolling standard deviation (population) over `period` samples. */
export function rollingStd(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  if (period <= 1) return out;
  for (let i = period - 1; i < values.length; i++) {
    let mean = 0;
    for (let j = i - period + 1; j <= i; j++) mean += values[j];
    mean /= period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = values[j] - mean;
      variance += d * d;
    }
    out[i] = Math.sqrt(variance / period);
  }
  return out;
}

/**
 * Annualised rolling volatility estimated from daily simple returns.
 * Multiplies the rolling daily sigma by sqrt(periodsPerYear).
 */
export function rollingAnnualVol(
  values: number[],
  period: number,
  periodsPerYear = 252,
): number[] {
  const rets = simpleReturns(values);
  const std = rollingStd(rets, period);
  return std.map((s) => (Number.isNaN(s) ? NaN : s * Math.sqrt(periodsPerYear)));
}

/** Relative Strength Index (Wilder's smoothing). */
export function rsi(values: number[], period = 14): number[] {
  const out = new Array(values.length).fill(NaN);
  if (values.length <= period) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = 100 - 100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss));
  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
}

/** Rolling z-score of a value relative to its own moving average and std. */
export function zScore(values: number[], period: number): number[] {
  const mean = sma(values, period);
  const std = rollingStd(values, period);
  return values.map((v, i) => {
    if (Number.isNaN(mean[i]) || Number.isNaN(std[i]) || std[i] === 0) return NaN;
    return (v - mean[i]) / std[i];
  });
}

/** Average True Range (Wilder). Needs full candles, returned aligned to input. */
export function atr(
  high: number[],
  low: number[],
  close: number[],
  period = 14,
): number[] {
  const n = close.length;
  const out = new Array(n).fill(NaN);
  if (n === 0) return out;
  const tr = new Array(n).fill(0);
  tr[0] = high[0] - low[0];
  for (let i = 1; i < n; i++) {
    tr[i] = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1]),
    );
  }
  if (n <= period) return out;
  let prev = 0;
  for (let i = 1; i <= period; i++) prev += tr[i];
  prev /= period;
  out[period] = prev;
  for (let i = period + 1; i < n; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** Total return over a trailing window: v[i]/v[i-lookback] - 1. */
export function trailingReturn(values: number[], lookback: number): number[] {
  const out = new Array(values.length).fill(NaN);
  for (let i = lookback; i < values.length; i++) {
    if (values[i - lookback] !== 0) out[i] = values[i] / values[i - lookback] - 1;
  }
  return out;
}
