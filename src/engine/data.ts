// Market data: a deterministic synthetic generator for demos/backtests, plus a
// CSV loader interface so real historical data can be dropped in later.
//
// IMPORTANT: the synthetic data is for demonstration and strategy research only.
// It is NOT a forecast and must never be mistaken for real market behaviour.
import type { Candle, Series, Universe } from "./types";

/** Deterministic PRNG (mulberry32) so every backtest is reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller transform: turns two uniforms into a standard normal sample. */
function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface SyntheticConfig {
  symbol: string;
  days: number;
  startPrice: number;
  /** Annualised drift, e.g. 0.08 = 8%/yr. */
  drift: number;
  /** Baseline annualised volatility, e.g. 0.20 = 20%/yr. */
  vol: number;
  seed: number;
}

/**
 * Generate a single OHLC series using a regime-switching geometric Brownian
 * motion with volatility clustering (GARCH-like) and persistent trend regimes.
 * This produces the trends, reversals and vol spikes that real strategies must
 * navigate, without pretending to be any particular real instrument.
 */
export function generateSeries(cfg: SyntheticConfig): Series {
  const rng = mulberry32(cfg.seed);
  const dt = 1 / 252;
  const out: Series = [];
  let price = cfg.startPrice;
  let trendRegime = 0; // -1 down, 0 range, +1 up
  let regimeDaysLeft = 0;
  let variance = cfg.vol * cfg.vol; // current daily variance proxy (annualised)
  const longRunVar = cfg.vol * cfg.vol;

  // Start time: `days` business days back from a fixed recent date for stable demos.
  const endTime = Math.floor(Date.UTC(2025, 0, 1) / 1000);
  const dayInSec = 86400;

  for (let i = 0; i < cfg.days; i++) {
    if (regimeDaysLeft <= 0) {
      // Real markets trend more than they chop and carry a mild upward bias, so
      // up-regimes are a touch more likely and regimes persist for months.
      const roll = rng();
      trendRegime = roll < 0.44 ? 1 : roll < 0.72 ? -1 : 0;
      regimeDaysLeft = 45 + Math.floor(rng() * 110);
    }
    regimeDaysLeft--;

    // Volatility clustering: variance reverts to long-run mean but is shocked daily.
    const shock = gaussian(rng);
    variance = 0.95 * variance + 0.05 * longRunVar + 0.012 * longRunVar * shock * shock;
    const sigma = Math.sqrt(Math.max(variance, 1e-8));

    const regimeDrift = cfg.drift + trendRegime * 0.3;
    const z = gaussian(rng);
    const ret = (regimeDrift - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z;

    const open = price;
    const close = price * Math.exp(ret);
    const intraday = Math.abs(gaussian(rng)) * sigma * Math.sqrt(dt) * price * 0.6;
    const high = Math.max(open, close) + intraday;
    const low = Math.min(open, close) - intraday;
    const volume = Math.round(1_000_000 * (0.6 + rng()));

    out.push({
      time: endTime - (cfg.days - 1 - i) * dayInSec,
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume,
    });
    price = close;
  }
  return out;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** The default demo universe: a diversified, low-correlation-ish multi-asset set. */
export const DEMO_SYMBOLS = ["AURX", "TREND", "MACRO", "VOLX", "CARRY"] as const;

export function buildDemoUniverse(days = 1500): Universe {
  const configs: SyntheticConfig[] = [
    { symbol: "AURX", days, startPrice: 100, drift: 0.1, vol: 0.18, seed: 101 },
    { symbol: "TREND", days, startPrice: 50, drift: 0.06, vol: 0.28, seed: 202 },
    { symbol: "MACRO", days, startPrice: 200, drift: 0.04, vol: 0.12, seed: 303 },
    { symbol: "VOLX", days, startPrice: 30, drift: 0.0, vol: 0.45, seed: 404 },
    { symbol: "CARRY", days, startPrice: 80, drift: 0.07, vol: 0.15, seed: 505 },
  ];
  const u: Universe = {};
  for (const c of configs) u[c.symbol] = generateSeries(c);
  return u;
}

/**
 * Parse a CSV of historical candles. Expected header (order-insensitive):
 * time/date, open, high, low, close, volume. `time` may be ISO date or unix seconds.
 */
export function parseCsv(csv: string): Series {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
  const ti = idx(["time", "date", "timestamp"]);
  const oi = idx(["open", "o"]);
  const hi = idx(["high", "h"]);
  const li = idx(["low", "l"]);
  const ci = idx(["close", "c", "adj close", "adj_close"]);
  const vi = idx(["volume", "vol", "v"]);
  const out: Series = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 4) continue;
    const rawTime = cols[ti]?.trim() ?? String(i);
    const time = /^\d+$/.test(rawTime)
      ? parseInt(rawTime, 10)
      : Math.floor(new Date(rawTime).getTime() / 1000);
    const close = parseFloat(cols[ci]);
    if (Number.isNaN(close)) continue;
    const open = oi >= 0 ? parseFloat(cols[oi]) : close;
    const high = hi >= 0 ? parseFloat(cols[hi]) : close;
    const low = li >= 0 ? parseFloat(cols[li]) : close;
    out.push({
      time,
      open: Number.isNaN(open) ? close : open,
      high: Number.isNaN(high) ? close : high,
      low: Number.isNaN(low) ? close : low,
      close,
      volume: vi >= 0 ? parseFloat(cols[vi]) || 0 : 0,
    });
  }
  return out.sort((a, b) => a.time - b.time);
}

/** Extract the close-price array from a series. */
export function closes(series: Series): number[] {
  return series.map((c) => c.close);
}

// Cached close-price access so repeated backtest passes don't re-derive arrays.
const _closesCache = new WeakMap<Series, number[]>();
export function cachedCloses(series: Series): number[] {
  let c = _closesCache.get(series);
  if (!c) {
    c = series.map((x) => x.close);
    _closesCache.set(series, c);
  }
  return c;
}

/** Extract OHLC arrays. */
export function ohlc(series: Series): {
  open: number[];
  high: number[];
  low: number[];
  close: number[];
} {
  return {
    open: series.map((c) => c.open),
    high: series.map((c) => c.high),
    low: series.map((c) => c.low),
    close: series.map((c) => c.close),
  };
}

/** A single candle accessor that never goes out of bounds. */
export function candleAt(series: Series, t: number): Candle {
  const i = Math.max(0, Math.min(t, series.length - 1));
  return series[i];
}
