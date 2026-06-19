// Market-data provider for the autopilot.
//
// Two implementations behind one interface:
//   1. SyntheticLiveProvider — a continuing regime-switching random walk so the
//      autopilot is fully observable WITHOUT any API keys (paper/demo).
//   2. (interface) a real provider — drop in Alpaca / Polygon / Binance etc. by
//      implementing `seed()` and `next()`; the rest of the system is unchanged.
import { generateSeries, mulberry32 } from "../src/engine/data";
import type { Candle } from "../src/engine/types";

export interface MarketDataProvider {
  /** Symbols this provider serves. */
  symbols: string[];
  /** Initial history (most-recent-last) used to warm up indicators. */
  seed(symbol: string, bars: number): Candle[];
  /** Produce the next live bar for a symbol given the previous close. */
  next(symbol: string, prevClose: number, time: number): Candle;
}

interface SymState {
  rng: () => number;
  variance: number;
  longRunVar: number;
  drift: number;
  regime: number;
  regimeLeft: number;
}

export class SyntheticLiveProvider implements MarketDataProvider {
  symbols: string[];
  private state = new Map<string, SymState>();
  private cfg: Record<string, { startPrice: number; drift: number; vol: number; seed: number }>;

  constructor() {
    this.cfg = {
      AURX: { startPrice: 100, drift: 0.1, vol: 0.18, seed: 101 },
      TREND: { startPrice: 50, drift: 0.06, vol: 0.28, seed: 202 },
      MACRO: { startPrice: 200, drift: 0.04, vol: 0.12, seed: 303 },
      VOLX: { startPrice: 30, drift: 0.0, vol: 0.45, seed: 404 },
      CARRY: { startPrice: 80, drift: 0.07, vol: 0.15, seed: 505 },
    };
    this.symbols = Object.keys(this.cfg);
  }

  seed(symbol: string, bars: number): Candle[] {
    const c = this.cfg[symbol];
    const series = generateSeries({ symbol, days: bars, ...c });
    // Initialise live state from a fresh RNG so the live continuation is its own path.
    this.state.set(symbol, {
      rng: mulberry32(c.seed + 9999),
      variance: c.vol * c.vol,
      longRunVar: c.vol * c.vol,
      drift: c.drift,
      regime: 0,
      regimeLeft: 0,
    });
    return series;
  }

  next(symbol: string, prevClose: number, time: number): Candle {
    const s = this.state.get(symbol);
    if (!s) {
      // Not seeded — return a flat bar.
      return { time, open: prevClose, high: prevClose, low: prevClose, close: prevClose, volume: 0 };
    }
    const dt = 1 / 252;
    if (s.regimeLeft <= 0) {
      const roll = s.rng();
      s.regime = roll < 0.44 ? 1 : roll < 0.72 ? -1 : 0;
      s.regimeLeft = 45 + Math.floor(s.rng() * 110);
    }
    s.regimeLeft--;
    const shock = gaussian(s.rng);
    s.variance = 0.95 * s.variance + 0.05 * s.longRunVar + 0.012 * s.longRunVar * shock * shock;
    const sigma = Math.sqrt(Math.max(s.variance, 1e-8));
    const regimeDrift = s.drift + s.regime * 0.3;
    const z = gaussian(s.rng);
    const ret = (regimeDrift - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z;
    const open = prevClose;
    const close = +(prevClose * Math.exp(ret)).toFixed(2);
    const intraday = Math.abs(gaussian(s.rng)) * sigma * Math.sqrt(dt) * prevClose * 0.6;
    return {
      time,
      open,
      high: +(Math.max(open, close) + intraday).toFixed(2),
      low: +(Math.min(open, close) - intraday).toFixed(2),
      close,
      volume: Math.round(1_000_000 * (0.6 + s.rng())),
    };
  }
}

function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
