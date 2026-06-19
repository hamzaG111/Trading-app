// Trading strategies. Each one is a documented, research-backed approach used by
// real quantitative funds. None of them is magic: each has regimes where it wins
// and regimes where it loses. The risk overlay (risk.ts) and the backtester
// (backtest.ts) are what turn a raw signal into a survivable system.
import type { Series, Strategy, Universe, Weights } from "./types";

// ---- cached close-price access (avoids O(N^2) re-derivation during backtests) ----
const closesCache = new WeakMap<Series, number[]>();
function getCloses(s: Series): number[] {
  let c = closesCache.get(s);
  if (!c) {
    c = s.map((x) => x.close);
    closesCache.set(s, c);
  }
  return c;
}

function smaAt(arr: number[], period: number, t: number): number {
  if (t < period - 1) return NaN;
  let sum = 0;
  for (let i = t - period + 1; i <= t; i++) sum += arr[i];
  return sum / period;
}

function stdAt(arr: number[], period: number, t: number): number {
  if (t < period - 1) return NaN;
  const m = smaAt(arr, period, t);
  let v = 0;
  for (let i = t - period + 1; i <= t; i++) v += (arr[i] - m) * (arr[i] - m);
  return Math.sqrt(v / period);
}

/** Annualised vol of simple returns over the trailing window ending at t. */
function retStdAt(arr: number[], period: number, t: number): number {
  if (t < period) return NaN;
  let m = 0;
  const rets: number[] = [];
  for (let i = t - period + 1; i <= t; i++) {
    const r = arr[i - 1] !== 0 ? arr[i] / arr[i - 1] - 1 : 0;
    rets.push(r);
    m += r;
  }
  m /= period;
  let v = 0;
  for (const r of rets) v += (r - m) * (r - m);
  return Math.sqrt(v / period);
}

function trailingRet(arr: number[], lookback: number, t: number): number {
  if (t < lookback || arr[t - lookback] === 0) return NaN;
  return arr[t] / arr[t - lookback] - 1;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

// ============================================================================
// 1) TIME-SERIES MOMENTUM / TREND FOLLOWING
// Moskowitz, Ooi & Pedersen (2012); the core engine of Man AHL, Winton, AQR
// Managed Futures. Go long instruments trending up, short those trending down.
// ============================================================================
const trendFollowing: Strategy = {
  id: "ts-momentum",
  name: "Trend Following (Time-Series Momentum)",
  nameAr: "تتبّع الاتجاه",
  category: "trend",
  inspiration: "Man AHL · Winton · AQR — Moskowitz/Ooi/Pedersen (2012)",
  description:
    "For each market, take the sign of the trailing return over the lookback window. " +
    "Long uptrends, short downtrends, sized equally. The single most robust, " +
    "most-researched anomaly across centuries and asset classes.",
  params: [
    { key: "lookback", label: "Lookback", min: 20, max: 300, step: 10, default: 120, unit: "days" },
  ],
  computeWeights(u, symbols, t, p): Weights {
    const lb = Math.round(p.lookback);
    const w: Weights = {};
    const n = symbols.length || 1;
    for (const s of symbols) {
      const c = getCloses(u[s]);
      const tr = trailingRet(c, lb, t);
      w[s] = Number.isNaN(tr) ? 0 : Math.sign(tr) / n;
    }
    return w;
  },
};

// ============================================================================
// 2) DUAL MOVING-AVERAGE CROSSOVER
// The classic trend filter (Donchian / Turtle lineage). Long when fast MA is
// above slow MA. Slower to react than #1 but smoother and fewer whipsaws.
// ============================================================================
const maCrossover: Strategy = {
  id: "ma-crossover",
  name: "Dual Moving-Average Crossover",
  nameAr: "تقاطع المتوسطات",
  category: "trend",
  inspiration: "Donchian · Turtle Traders · Dunn Capital",
  description:
    "Long when the fast moving average sits above the slow one, short when below. " +
    "A smoother trend filter that trades less and survives chop better than raw momentum.",
  params: [
    { key: "fast", label: "Fast MA", min: 5, max: 60, step: 1, default: 20, unit: "days" },
    { key: "slow", label: "Slow MA", min: 30, max: 250, step: 5, default: 100, unit: "days" },
  ],
  computeWeights(u, symbols, t, p): Weights {
    const fast = Math.round(p.fast);
    const slow = Math.max(Math.round(p.slow), fast + 1);
    const w: Weights = {};
    const n = symbols.length || 1;
    for (const s of symbols) {
      const c = getCloses(u[s]);
      const f = smaAt(c, fast, t);
      const sl = smaAt(c, slow, t);
      w[s] = Number.isNaN(f) || Number.isNaN(sl) ? 0 : (f > sl ? 1 : -1) / n;
    }
    return w;
  },
};

// ============================================================================
// 3) CROSS-SECTIONAL MOMENTUM
// Jegadeesh & Titman (1993). Rank the universe by trailing return (skipping the
// most recent month to avoid short-term reversal); long the winners, short the
// losers. Market-neutral-ish relative-value momentum, as run at AQR.
// ============================================================================
const crossSectionalMomentum: Strategy = {
  id: "xs-momentum",
  name: "Cross-Sectional Momentum",
  nameAr: "الزخم النسبي",
  category: "momentum",
  inspiration: "AQR · Jegadeesh & Titman (1993)",
  description:
    "Rank every market by its 12-1 month return, go long the strongest and short " +
    "the weakest. Captures the tendency of relative winners to keep winning.",
  params: [
    { key: "lookback", label: "Formation", min: 60, max: 300, step: 10, default: 252, unit: "days" },
    { key: "skip", label: "Skip recent", min: 0, max: 40, step: 1, default: 21, unit: "days" },
  ],
  computeWeights(u, symbols, t, p): Weights {
    const lb = Math.round(p.lookback);
    const skip = Math.round(p.skip);
    const scored: { s: string; score: number }[] = [];
    for (const s of symbols) {
      const c = getCloses(u[s]);
      if (t - skip < lb || t < lb + skip) {
        scored.push({ s, score: NaN });
        continue;
      }
      const endIdx = t - skip;
      const score = c[endIdx - lb] !== 0 ? c[endIdx] / c[endIdx - lb] - 1 : NaN;
      scored.push({ s, score });
    }
    const valid = scored.filter((x) => !Number.isNaN(x.score));
    const w: Weights = {};
    for (const s of symbols) w[s] = 0;
    if (valid.length < 2) return w;
    valid.sort((a, b) => b.score - a.score);
    const k = Math.max(1, Math.floor(valid.length / 2));
    for (let i = 0; i < k; i++) w[valid[i].s] = 1 / (2 * k); // longs
    for (let i = 0; i < k; i++) w[valid[valid.length - 1 - i].s] = -1 / (2 * k); // shorts
    return w;
  },
};

// ============================================================================
// 4) MEAN REVERSION (Z-SCORE / BOLLINGER)
// Short-term reversal. When price stretches far from its moving average, fade
// the move. The bread-and-butter of stat-arb desks; complements trend (which
// loses in ranges, exactly where this wins).
// ============================================================================
const meanReversion: Strategy = {
  id: "mean-reversion",
  name: "Mean Reversion (Z-Score)",
  nameAr: "الارتداد للمتوسط",
  category: "mean-reversion",
  inspiration: "Stat-arb desks · Bollinger · Avellaneda-Lee",
  description:
    "Measure how many standard deviations price sits from its mean. Fade the " +
    "extreme: short when stretched high, long when stretched low. Wins in ranges, " +
    "the natural hedge to trend strategies.",
  params: [
    { key: "lookback", label: "Lookback", min: 5, max: 60, step: 1, default: 20, unit: "days" },
    { key: "entryZ", label: "Entry Z", min: 0.5, max: 3, step: 0.1, default: 1.5, unit: "σ" },
  ],
  computeWeights(u, symbols, t, p): Weights {
    const lb = Math.round(p.lookback);
    const entryZ = p.entryZ;
    const w: Weights = {};
    const n = symbols.length || 1;
    for (const s of symbols) {
      const c = getCloses(u[s]);
      const m = smaAt(c, lb, t);
      const sd = stdAt(c, lb, t);
      if (Number.isNaN(m) || Number.isNaN(sd) || sd === 0) {
        w[s] = 0;
        continue;
      }
      const z = (c[t] - m) / sd;
      // Fade: positive z -> short, negative z -> long. Scale up to a cap at entryZ.
      w[s] = clamp(-z / entryZ, -1, 1) / n;
    }
    return w;
  },
};

// ============================================================================
// 5) RISK PARITY (ALL-WEATHER)
// Ray Dalio / Bridgewater. Instead of weighting by capital, weight by RISK:
// allocate inversely to each asset's volatility so every market contributes the
// same risk. Diversification "the only free lunch in investing."
// ============================================================================
const riskParity: Strategy = {
  id: "risk-parity",
  name: "Risk Parity (All-Weather)",
  nameAr: "تكافؤ المخاطر",
  category: "risk-parity",
  inspiration: "Bridgewater All Weather · Ray Dalio",
  description:
    "Hold every market long, but size each inversely to its volatility so they " +
    "all contribute equal risk. A balanced, all-weather core that doesn't bet on " +
    "any single outcome.",
  params: [
    { key: "lookback", label: "Vol lookback", min: 20, max: 120, step: 5, default: 60, unit: "days" },
  ],
  computeWeights(u, symbols, t, p): Weights {
    const lb = Math.round(p.lookback);
    const inv: Record<string, number> = {};
    let total = 0;
    for (const s of symbols) {
      const c = getCloses(u[s]);
      const vol = retStdAt(c, lb, t);
      const iv = !Number.isNaN(vol) && vol > 1e-6 ? 1 / vol : 0;
      inv[s] = iv;
      total += iv;
    }
    const w: Weights = {};
    for (const s of symbols) w[s] = total > 0 ? inv[s] / total : 0;
    return w;
  },
};

export const STRATEGIES: Strategy[] = [
  trendFollowing,
  maCrossover,
  crossSectionalMomentum,
  meanReversion,
  riskParity,
];

export const STRATEGY_MAP: Record<string, Strategy> = Object.fromEntries(
  STRATEGIES.map((s) => [s.id, s]),
);

/** Build a default parameter object for a strategy. */
export function defaultParams(strategy: Strategy): Record<string, number> {
  const p: Record<string, number> = {};
  for (const spec of strategy.params) p[spec.key] = spec.default;
  return p;
}

/**
 * Combine several strategies into one ensemble by averaging their target weights.
 * This is how multi-strategy funds (Millennium, Citadel, Bridgewater) actually
 * run: many uncorrelated "pods" netted into one book, smoother than any single one.
 */
export function ensembleWeights(
  strategies: { strategy: Strategy; params: Record<string, number>; weight: number }[],
  u: Universe,
  symbols: string[],
  t: number,
): Weights {
  const out: Weights = {};
  for (const s of symbols) out[s] = 0;
  let totalW = 0;
  for (const leg of strategies) totalW += Math.abs(leg.weight);
  if (totalW === 0) totalW = 1;
  for (const leg of strategies) {
    const w = leg.strategy.computeWeights(u, symbols, t, leg.params);
    const scale = leg.weight / totalW;
    for (const s of symbols) out[s] += (w[s] || 0) * scale;
  }
  return out;
}
