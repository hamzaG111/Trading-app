// Linear-algebra core for the quant suite: the matrix math that portfolio
// optimisation, factor models and risk analytics are built on. Pure numeric
// functions, no domain knowledge — kept small, correct and dependency-free.

export type Vec = number[];
export type Matrix = number[][];

export function zeros(n: number): Vec {
  return new Array(n).fill(0);
}

export function identity(n: number): Matrix {
  const m: Matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) m[i][i] = 1;
  return m;
}

export function transpose(a: Matrix): Matrix {
  const r = a.length;
  const c = a[0]?.length ?? 0;
  const t: Matrix = Array.from({ length: c }, () => new Array(r).fill(0));
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) t[j][i] = a[i][j];
  return t;
}

export function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function matVec(a: Matrix, v: Vec): Vec {
  return a.map((row) => dot(row, v));
}

export function matmul(a: Matrix, b: Matrix): Matrix {
  const n = a.length;
  const m = b[0].length;
  const k = b.length;
  const out: Matrix = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++) {
    for (let p = 0; p < k; p++) {
      const aip = a[i][p];
      if (aip === 0) continue;
      for (let j = 0; j < m; j++) out[i][j] += aip * b[p][j];
    }
  }
  return out;
}

export function scaleVec(v: Vec, s: number): Vec {
  return v.map((x) => x * s);
}

export function addVec(a: Vec, b: Vec): Vec {
  return a.map((x, i) => x + b[i]);
}

/** Normalise a weight vector so its entries sum to 1 (no-op if sum ~ 0). */
export function normalizeSum(v: Vec): Vec {
  const s = v.reduce((a, b) => a + b, 0);
  if (Math.abs(s) < 1e-12) return v.slice();
  return v.map((x) => x / s);
}

/** wᵀ M w — the variance of a portfolio with weights w and covariance M. */
export function quadForm(w: Vec, m: Matrix): number {
  return dot(w, matVec(m, w));
}

export const mean = (v: Vec): number => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

/**
 * Sample covariance matrix from per-asset return series.
 * `returns[i]` is the time series for asset i; all rows share length T.
 */
export function covarianceMatrix(returns: Matrix): Matrix {
  const n = returns.length;
  const T = returns[0]?.length ?? 0;
  const means = returns.map(mean);
  const cov: Matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  const denom = Math.max(1, T - 1);
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      for (let t = 0; t < T; t++) s += (returns[i][t] - means[i]) * (returns[j][t] - means[j]);
      const v = s / denom;
      cov[i][j] = v;
      cov[j][i] = v;
    }
  }
  return cov;
}

/** Correlation matrix derived from a covariance matrix. */
export function correlation(cov: Matrix): Matrix {
  const n = cov.length;
  const sd = cov.map((row, i) => Math.sqrt(Math.max(row[i], 0)));
  const corr: Matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const d = sd[i] * sd[j];
      corr[i][j] = d > 1e-12 ? Math.max(-1, Math.min(1, cov[i][j] / d)) : i === j ? 1 : 0;
    }
  }
  return corr;
}

/**
 * Shrink the sample covariance toward a constant-correlation target
 * (Ledoit–Wolf style). Reduces estimation error from noisy sample covariances —
 * the difference between an optimiser that works out-of-sample and one that
 * blows up. `delta` in [0,1] is the shrinkage intensity (0 = raw sample).
 */
export function shrinkCovariance(cov: Matrix, delta = 0.25): Matrix {
  const n = cov.length;
  const sd = cov.map((row, i) => Math.sqrt(Math.max(row[i], 0)));
  // Average pairwise correlation for the target.
  let sumCorr = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = sd[i] * sd[j];
      if (d > 1e-12) {
        sumCorr += cov[i][j] / d;
        count++;
      }
    }
  }
  const rbar = count > 0 ? sumCorr / count : 0;
  const d = Math.max(0, Math.min(1, delta));
  const out: Matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const target = i === j ? cov[i][i] : rbar * sd[i] * sd[j];
      out[i][j] = (1 - d) * cov[i][j] + d * target;
    }
  }
  return out;
}

/** Add a small ridge (λ on the diagonal) to keep a matrix invertible/PSD. */
export function regularize(m: Matrix, lambda = 1e-8): Matrix {
  const n = m.length;
  const tr = m.reduce((a, row, i) => a + row[i], 0) / n;
  const eps = lambda * (tr > 0 ? tr : 1);
  return m.map((row, i) => row.map((x, j) => (i === j ? x + eps : x)));
}

/** Matrix inverse via Gauss–Jordan elimination with partial pivoting. */
export function invert(input: Matrix): Matrix {
  const n = input.length;
  // Work on a regularised copy for numerical stability.
  const a = regularize(input, 1e-10).map((row) => row.slice());
  const inv = identity(n);
  for (let col = 0; col < n; col++) {
    // Partial pivot.
    let pivot = col;
    let max = Math.abs(a[col][col]);
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r][col]) > max) {
        max = Math.abs(a[r][col]);
        pivot = r;
      }
    }
    if (max < 1e-14) {
      a[col][col] += 1e-8; // singular column — nudge
    } else if (pivot !== col) {
      [a[col], a[pivot]] = [a[pivot], a[col]];
      [inv[col], inv[pivot]] = [inv[pivot], inv[col]];
    }
    const d = a[col][col];
    for (let j = 0; j < n; j++) {
      a[col][j] /= d;
      inv[col][j] /= d;
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (f === 0) continue;
      for (let j = 0; j < n; j++) {
        a[r][j] -= f * a[col][j];
        inv[r][j] -= f * inv[col][j];
      }
    }
  }
  return inv;
}

/** Risk contribution of each asset: RCᵢ = wᵢ·(Σw)ᵢ / (wᵀΣw). Sums to 1. */
export function riskContributions(w: Vec, cov: Matrix): Vec {
  const sw = matVec(cov, w);
  const variance = dot(w, sw);
  if (variance <= 1e-18) return w.map(() => 0);
  return w.map((wi, i) => (wi * sw[i]) / variance);
}
