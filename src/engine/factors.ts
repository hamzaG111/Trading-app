// Factor model. The academic backbone of AQR/Dimensional-style investing:
// decompose each asset into exposures to documented, persistent return drivers
// and combine them into a composite score. These are price-based proxies of the
// classic factors (fundamental data would refine Value/Quality further).

export interface FactorScores {
  symbol: string;
  momentum: number;
  trend: number;
  lowVol: number;
  reversal: number;
  quality: number;
  composite: number;
}

export const FACTOR_KEYS = ["momentum", "trend", "lowVol", "reversal", "quality"] as const;
export type FactorKey = (typeof FACTOR_KEYS)[number];

export const FACTOR_LABELS: Record<FactorKey, { ar: string; desc: string }> = {
  momentum: { ar: "الزخم", desc: "عائد 12-1 شهر: الرابحون يميلون للاستمرار." },
  trend: { ar: "الاتجاه", desc: "السعر مقابل متوسطه طويل المدى، معدّلاً بالتذبذب." },
  lowVol: { ar: "التذبذب المنخفض", desc: "شذوذ التذبذب المنخفض: الأصول الأهدأ تعطي عائداً أفضل للمخاطرة." },
  reversal: { ar: "الارتداد", desc: "عكس عائد الشهر الأخير: المبالغات قصيرة المدى تنعكس." },
  quality: { ar: "الجودة", desc: "ثبات العوائد: نسبة أيام صاعدة عالية وسحب منخفض." },
};

function trailingReturn(c: number[], lookback: number, end: number): number {
  if (end - lookback < 0 || c[end - lookback] === 0) return 0;
  return c[end] / c[end - lookback] - 1;
}

function realizedVol(c: number[], lookback: number, end: number): number {
  const start = Math.max(1, end - lookback + 1);
  const r: number[] = [];
  for (let i = start; i <= end; i++) if (c[i - 1] !== 0) r.push(c[i] / c[i - 1] - 1);
  if (r.length < 2) return 0;
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, b) => a + (b - m) * (b - m), 0) / r.length);
}

function smaAt(c: number[], period: number, end: number): number {
  if (end - period + 1 < 0) return c[end] ?? 0;
  let s = 0;
  for (let i = end - period + 1; i <= end; i++) s += c[i];
  return s / period;
}

function qualityScore(c: number[], lookback: number, end: number): number {
  const start = Math.max(1, end - lookback + 1);
  let up = 0;
  let total = 0;
  let peak = c[start - 1] ?? c[start];
  let maxDD = 0;
  for (let i = start; i <= end; i++) {
    if (c[i - 1] !== 0) {
      if (c[i] > c[i - 1]) up++;
      total++;
    }
    if (c[i] > peak) peak = c[i];
    const dd = peak > 0 ? c[i] / peak - 1 : 0;
    if (dd < maxDD) maxDD = dd;
  }
  const upRatio = total > 0 ? up / total : 0.5;
  // Higher = more "up" days and shallower drawdown.
  return upRatio + (1 + maxDD); // maxDD is negative; shallower DD → larger term
}

/** Cross-sectional z-score: standardise a raw factor across the universe. */
function zscore(values: number[]): number[] {
  const m = values.reduce((a, b) => a + b, 0) / (values.length || 1);
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - m) * (b - m), 0) / (values.length || 1));
  if (sd < 1e-12) return values.map(() => 0);
  return values.map((v) => (v - m) / sd);
}

export interface FactorWeights {
  momentum: number;
  trend: number;
  lowVol: number;
  reversal: number;
  quality: number;
}

export const DEFAULT_FACTOR_WEIGHTS: FactorWeights = {
  momentum: 1,
  trend: 1,
  lowVol: 1,
  reversal: 0.5,
  quality: 0.75,
};

/**
 * Compute standardized factor scores for each asset at the latest bar.
 * `closesByAsset` are aligned close-price arrays; `symbols` label them.
 */
export function computeFactors(
  closesByAsset: number[][],
  symbols: string[],
  weights: FactorWeights = DEFAULT_FACTOR_WEIGHTS,
): FactorScores[] {
  const ends = closesByAsset.map((c) => c.length - 1);

  const rawMom = closesByAsset.map((c, i) => trailingReturn(c, 231, ends[i] - 21)); // 12-1m
  const rawTrend = closesByAsset.map((c, i) => {
    const ma = smaAt(c, 100, ends[i]);
    const vol = realizedVol(c, 60, ends[i]) || 1e-6;
    return ma !== 0 ? (c[ends[i]] / ma - 1) / vol : 0;
  });
  const rawLowVol = closesByAsset.map((c, i) => -realizedVol(c, 60, ends[i])); // negate: low vol = high score
  const rawReversal = closesByAsset.map((c, i) => -trailingReturn(c, 21, ends[i])); // 1m reversal
  const rawQuality = closesByAsset.map((c, i) => qualityScore(c, 120, ends[i]));

  const zMom = zscore(rawMom);
  const zTrend = zscore(rawTrend);
  const zLowVol = zscore(rawLowVol);
  const zRev = zscore(rawReversal);
  const zQual = zscore(rawQuality);

  const wSum =
    weights.momentum + weights.trend + weights.lowVol + weights.reversal + weights.quality || 1;

  return symbols.map((symbol, i) => {
    const composite =
      (zMom[i] * weights.momentum +
        zTrend[i] * weights.trend +
        zLowVol[i] * weights.lowVol +
        zRev[i] * weights.reversal +
        zQual[i] * weights.quality) /
      wSum;
    return {
      symbol,
      momentum: zMom[i],
      trend: zTrend[i],
      lowVol: zLowVol[i],
      reversal: zRev[i],
      quality: zQual[i],
      composite,
    };
  });
}

/** Long-short weights from composite factor scores: long winners, short losers. */
export function factorPortfolio(scores: FactorScores[]): Record<string, number> {
  const sorted = [...scores].sort((a, b) => b.composite - a.composite);
  const k = Math.max(1, Math.floor(sorted.length / 2));
  const w: Record<string, number> = {};
  for (const s of scores) w[s.symbol] = 0;
  for (let i = 0; i < k; i++) w[sorted[i].symbol] = 1 / (2 * k);
  for (let i = 0; i < k; i++) w[sorted[sorted.length - 1 - i].symbol] = -1 / (2 * k);
  return w;
}
