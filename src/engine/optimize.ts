// Portfolio construction — the science of turning a covariance matrix into a set
// of weights. Spans the classics (Markowitz mean–variance, the efficient
// frontier, the global-minimum-variance and tangency portfolios) and the modern
// robust methods (true Equal-Risk-Contribution risk parity, and Hierarchical
// Risk Parity — López de Prado's 2016 clustering approach that needs no matrix
// inversion and survives noisy estimates far better out of sample).
import {
  correlation,
  covarianceMatrix,
  dot,
  invert,
  matVec,
  normalizeSum,
  quadForm,
  riskContributions,
  type Matrix,
  type Vec,
} from "./linalg";

const TRADING_DAYS = 252;
const ones = (n: number): Vec => new Array(n).fill(1);

export interface AllocatorResult {
  id: string;
  name: string;
  nameAr: string;
  blurb: string;
  weights: Vec;
  /** Annualised expected return / volatility / Sharpe under the sample estimate. */
  ret: number;
  vol: number;
  sharpe: number;
  /** Risk contribution of each asset (sums to 1). */
  riskContrib: Vec;
  diversification: number;
}

export interface FrontierPoint {
  vol: number;
  ret: number;
}

function projectLongOnly(w: Vec): Vec {
  const clipped = w.map((x) => (x > 0 ? x : 0));
  const s = clipped.reduce((a, b) => a + b, 0);
  if (s < 1e-12) return w.map(() => 1 / w.length);
  return clipped.map((x) => x / s);
}

/** Global minimum-variance portfolio: w ∝ Σ⁻¹·1. */
export function minVariance(cov: Matrix, longOnly = true): Vec {
  const inv = invert(cov);
  const w = normalizeSum(matVec(inv, ones(cov.length)));
  return longOnly ? projectLongOnly(w) : w;
}

/** Tangency (maximum-Sharpe) portfolio: w ∝ Σ⁻¹·(μ − rf). */
export function maxSharpe(cov: Matrix, mu: Vec, rf = 0, longOnly = true): Vec {
  const inv = invert(cov);
  const excess = mu.map((m) => m - rf);
  const w = normalizeSum(matVec(inv, excess));
  return longOnly ? projectLongOnly(w) : w;
}

/** Naive risk parity: weight inversely to variance (ignores correlations). */
export function inverseVariance(cov: Matrix): Vec {
  const iv = cov.map((row, i) => (row[i] > 1e-12 ? 1 / row[i] : 0));
  return normalizeSum(iv);
}

/**
 * True risk parity (Equal Risk Contribution). Iteratively finds weights where
 * every asset contributes the same share of portfolio risk — accounting for
 * correlations, unlike inverse-variance. Uses a damped multiplicative update on
 * the risk contributions, which converges robustly even with negative
 * covariances (where the naive bᵢ/(Σw)ᵢ fixed point breaks).
 */
export function equalRiskContribution(cov: Matrix, iters = 500): Vec {
  const n = cov.length;
  let w = inverseVariance(cov);
  const b = 1 / n;
  for (let k = 0; k < iters; k++) {
    const sw = matVec(cov, w);
    const variance = dot(w, sw);
    if (variance <= 1e-18) break;
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const rc = (w[i] * sw[i]) / variance; // risk-contribution fraction
      // Damped (sqrt) step toward equal contribution; floor rc to stay positive.
      const factor = Math.sqrt(b / Math.max(rc, 1e-10));
      const wi = Math.max(0, w[i] * factor);
      moved += Math.abs(wi - w[i]);
      w[i] = wi;
    }
    w = normalizeSum(w);
    if (moved < 1e-10) break;
  }
  return w;
}

// ----------------------------------------------------------------------------
// Hierarchical Risk Parity (HRP)
// ----------------------------------------------------------------------------

/** Single-linkage agglomerative clustering → quasi-diagonal leaf ordering. */
function quasiDiagOrder(dist: Matrix): number[] {
  const n = dist.length;
  let clusters = Array.from({ length: n }, (_, i) => [i]);
  const cdist = (a: number[], b: number[]): number => {
    let m = Infinity;
    for (const i of a) for (const j of b) m = Math.min(m, dist[i][j]);
    return m;
  };
  while (clusters.length > 1) {
    let bi = 0;
    let bj = 1;
    let best = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = cdist(clusters[i], clusters[j]);
        if (d < best) {
          best = d;
          bi = i;
          bj = j;
        }
      }
    }
    const merged = [...clusters[bi], ...clusters[bj]];
    clusters = clusters.filter((_, k) => k !== bi && k !== bj);
    clusters.push(merged);
  }
  return clusters[0];
}

/** Inverse-variance allocation within a sub-universe, and its resulting variance. */
function clusterVar(cov: Matrix, idx: number[]): number {
  const iv = idx.map((i) => (cov[i][i] > 1e-12 ? 1 / cov[i][i] : 0));
  const s = iv.reduce((a, b) => a + b, 0) || 1;
  const w = iv.map((x) => x / s);
  let v = 0;
  for (let a = 0; a < idx.length; a++)
    for (let b = 0; b < idx.length; b++) v += w[a] * w[b] * cov[idx[a]][idx[b]];
  return v;
}

/** Hierarchical Risk Parity weights (López de Prado, 2016). */
export function hrp(cov: Matrix): Vec {
  const n = cov.length;
  if (n === 1) return [1];
  const corr = correlation(cov);
  const dist: Matrix = corr.map((row, i) => row.map((c, j) => (i === j ? 0 : Math.sqrt(0.5 * (1 - c)))));
  const order = quasiDiagOrder(dist);
  const w = new Array(n).fill(1);
  let clusters: number[][] = [order];
  while (clusters.length > 0) {
    const next: number[][] = [];
    for (const c of clusters) {
      if (c.length <= 1) continue;
      const mid = Math.floor(c.length / 2);
      const left = c.slice(0, mid);
      const right = c.slice(mid);
      const vL = clusterVar(cov, left);
      const vR = clusterVar(cov, right);
      const alpha = 1 - vL / (vL + vR || 1);
      for (const i of left) w[i] *= alpha;
      for (const i of right) w[i] *= 1 - alpha;
      next.push(left, right);
    }
    clusters = next;
  }
  return normalizeSum(w);
}

// ----------------------------------------------------------------------------
// Efficient frontier (exact Markowitz closed form)
// ----------------------------------------------------------------------------

export function efficientFrontier(cov: Matrix, mu: Vec, points = 45): FrontierPoint[] {
  const inv = invert(cov);
  const o = ones(cov.length);
  const invO = matVec(inv, o);
  const invMu = matVec(inv, mu);
  const A = dot(o, invO);
  const B = dot(o, invMu);
  const C = dot(mu, invMu);
  const D = A * C - B * B;
  if (Math.abs(D) < 1e-18) return [];
  const lo = Math.min(...mu);
  const hi = Math.max(...mu);
  const span = hi - lo || Math.abs(hi) || 1;
  const out: FrontierPoint[] = [];
  for (let k = 0; k < points; k++) {
    const r = lo - 0.2 * span + (k / (points - 1)) * 1.4 * span;
    const variance = (A * r * r - 2 * B * r + C) / D;
    if (variance <= 0) continue;
    out.push({ vol: Math.sqrt(variance) * Math.sqrt(TRADING_DAYS), ret: r * TRADING_DAYS });
  }
  return out;
}

// ----------------------------------------------------------------------------
// Orchestration
// ----------------------------------------------------------------------------

function annualStats(w: Vec, cov: Matrix, mu: Vec): { ret: number; vol: number; sharpe: number } {
  const ret = dot(w, mu) * TRADING_DAYS;
  const vol = Math.sqrt(Math.max(quadForm(w, cov), 0)) * Math.sqrt(TRADING_DAYS);
  return { ret, vol, sharpe: vol > 1e-9 ? ret / vol : 0 };
}

/** Diversification ratio: weighted-avg vol / portfolio vol (≥1; higher = better). */
function diversificationRatio(w: Vec, cov: Matrix): number {
  const wAvgVol = w.reduce((a, wi, i) => a + Math.abs(wi) * Math.sqrt(Math.max(cov[i][i], 0)), 0);
  const portVol = Math.sqrt(Math.max(quadForm(w, cov), 0));
  return portVol > 1e-12 ? wAvgVol / portVol : 1;
}

export interface OptimizeOutput {
  allocators: AllocatorResult[];
  frontier: FrontierPoint[];
  /** Frontier markers. */
  gmv: FrontierPoint;
  tangency: FrontierPoint;
  corr: Matrix;
}

/**
 * Run every allocator on a window of per-asset returns and return comparable
 * results plus the efficient frontier. `shrink` is the covariance shrinkage
 * already applied by the caller; this function only reads the matrices.
 */
export function optimizeUniverse(cov: Matrix, mu: Vec): OptimizeOutput {
  const make = (
    id: string,
    name: string,
    nameAr: string,
    blurb: string,
    weights: Vec,
  ): AllocatorResult => {
    const s = annualStats(weights, cov, mu);
    return {
      id,
      name,
      nameAr,
      blurb,
      weights,
      ...s,
      riskContrib: riskContributions(weights, cov),
      diversification: diversificationRatio(weights, cov),
    };
  };

  const allocators: AllocatorResult[] = [
    make("equal", "Equal Weight", "أوزان متساوية", "خطّ الأساس: 1/N. صعب التغلّب عليه بثبات.",
      new Array(cov.length).fill(1 / cov.length)),
    make("inv-var", "Inverse Variance", "عكس التباين", "وزن عكسي للتذبذب، يتجاهل الارتباطات.",
      inverseVariance(cov)),
    make("erc", "Risk Parity (ERC)", "تكافؤ المخاطر الحقيقي", "مساهمة مخاطرة متساوية لكل أصل مع مراعاة الارتباطات.",
      equalRiskContribution(cov)),
    make("min-var", "Minimum Variance", "أدنى تباين", "أقلّ محفظة تذبذباً ممكنة (Σ⁻¹·1).",
      minVariance(cov, true)),
    make("max-sharpe", "Max Sharpe (Tangency)", "أعلى شارب", "محفظة المماس: أفضل عائد لكل وحدة مخاطرة.",
      maxSharpe(cov, mu, 0, true)),
    make("hrp", "Hierarchical Risk Parity", "HRP الهرمي", "تجميع آلي هرمي ثم توزيع تنازلي — متين ضدّ ضوضاء التقدير.",
      hrp(cov)),
  ];

  const frontier = efficientFrontier(cov, mu);
  const gmvW = minVariance(cov, false);
  const tanW = maxSharpe(cov, mu, 0, false);
  const gmvS = annualStats(gmvW, cov, mu);
  const tanS = annualStats(tanW, cov, mu);

  return {
    allocators,
    frontier,
    gmv: { vol: gmvS.vol, ret: gmvS.ret },
    tangency: { vol: tanS.vol, ret: tanS.ret },
    corr: correlation(cov),
  };
}

/** Build a per-asset daily-return matrix from aligned close-price arrays. */
export function returnsMatrix(closesByAsset: number[][]): Matrix {
  return closesByAsset.map((c) => {
    const r: number[] = [];
    for (let i = 1; i < c.length; i++) r.push(c[i - 1] !== 0 ? c[i] / c[i - 1] - 1 : 0);
    return r;
  });
}

export { covarianceMatrix };
