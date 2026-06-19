// Market-regime detection. Markets alternate between trending, mean-reverting and
// chaotic states — and no single strategy wins in all of them. Measuring the
// regime (Hurst exponent for memory, realized-vol state, and trend strength) lets
// the system tilt toward the strategies that actually fit the current world.

function linregSlope(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) * (xs[i] - mx);
  }
  return den !== 0 ? num / den : 0;
}

/**
 * Hurst exponent via the lagged-variance method on log prices.
 *  H ≈ 0.5 → random walk; H > 0.5 → trending (persistent);
 *  H < 0.5 → mean-reverting (anti-persistent).
 */
export function hurstExponent(closes: number[], maxLag = 20): number {
  const logp = closes.filter((c) => c > 0).map((c) => Math.log(c));
  if (logp.length < maxLag * 2) return 0.5;
  const lags: number[] = [];
  const tau: number[] = [];
  for (let lag = 2; lag <= maxLag; lag++) {
    let s = 0;
    let count = 0;
    for (let i = lag; i < logp.length; i++) {
      const d = logp[i] - logp[i - lag];
      s += d * d;
      count++;
    }
    const std = count > 0 ? Math.sqrt(s / count) : 0;
    if (std > 1e-12) {
      lags.push(Math.log(lag));
      tau.push(Math.log(std));
    }
  }
  if (lags.length < 2) return 0.5;
  const h = linregSlope(lags, tau);
  return Math.max(0, Math.min(1, h));
}

export interface RegimeAnalysis {
  hurst: number;
  annualVol: number;
  volState: "low" | "normal" | "high";
  trendScore: number; // -1 .. 1
  regimeKey: "trending" | "mean-reverting" | "choppy" | "crisis";
  regimeAr: string;
  descAr: string;
  /** Recommended emphasis across the five strategies (sums to 1). */
  recommended: Record<string, number>;
}

function annualVolFromCloses(closes: number[], lookback: number): number {
  const start = Math.max(1, closes.length - lookback);
  const rets: number[] = [];
  for (let i = start; i < closes.length; i++) {
    if (closes[i - 1] !== 0) rets.push(closes[i] / closes[i - 1] - 1);
  }
  if (rets.length < 2) return 0;
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((a, b) => a + (b - m) * (b - m), 0) / (rets.length - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}

export function analyzeRegime(closes: number[]): RegimeAnalysis {
  const hurst = hurstExponent(closes);
  const recentVol = annualVolFromCloses(closes, 40);
  const longVol = annualVolFromCloses(closes, 252) || recentVol || 0.0001;
  const volRatio = recentVol / longVol;
  const volState: RegimeAnalysis["volState"] =
    volRatio > 1.4 ? "high" : volRatio < 0.75 ? "low" : "normal";

  // Trend strength: 60-day return normalised by realized vol.
  const lb = Math.min(60, closes.length - 1);
  const ret = lb > 0 && closes[closes.length - 1 - lb] !== 0
    ? closes[closes.length - 1] / closes[closes.length - 1 - lb] - 1
    : 0;
  const trendScore = Math.max(-1, Math.min(1, ret / (recentVol * Math.sqrt(lb / 252) + 1e-6)));

  let regimeKey: RegimeAnalysis["regimeKey"];
  if (volState === "high" && Math.abs(trendScore) < 0.6) regimeKey = "crisis";
  else if (hurst > 0.55 && Math.abs(trendScore) > 0.3) regimeKey = "trending";
  else if (hurst < 0.45) regimeKey = "mean-reverting";
  else regimeKey = "choppy";

  const map: Record<RegimeAnalysis["regimeKey"], { ar: string; desc: string; rec: Record<string, number> }> = {
    trending: {
      ar: "سوق متّجه",
      desc: "ذاكرة إيجابية (Hurst>0.5) واتجاه واضح — الأفضلية لتتبّع الاتجاه والزخم.",
      rec: { "ts-momentum": 0.35, "ma-crossover": 0.25, "xs-momentum": 0.2, "risk-parity": 0.15, "mean-reversion": 0.05 },
    },
    "mean-reverting": {
      ar: "سوق مرتدّ",
      desc: "ذاكرة سلبية (Hurst<0.5) — الأسعار تعود لمتوسطها، الأفضلية للارتداد للمتوسط.",
      rec: { "mean-reversion": 0.45, "risk-parity": 0.25, "xs-momentum": 0.15, "ma-crossover": 0.1, "ts-momentum": 0.05 },
    },
    choppy: {
      ar: "سوق متذبذب/عشوائي",
      desc: "لا ذاكرة واضحة — التنويع وتكافؤ المخاطر هما الملاذ، وتقليل المراهنات الاتجاهية.",
      rec: { "risk-parity": 0.45, "xs-momentum": 0.2, "mean-reversion": 0.15, "ts-momentum": 0.1, "ma-crossover": 0.1 },
    },
    crisis: {
      ar: "سوق أزمة (تذبذب مرتفع)",
      desc: "تذبذب مرتفع وغموض — وضع دفاعي: تكافؤ مخاطر + تتبّع اتجاه (Crisis Alpha) وتقليل التعرّض.",
      rec: { "risk-parity": 0.4, "ts-momentum": 0.3, "ma-crossover": 0.2, "xs-momentum": 0.05, "mean-reversion": 0.05 },
    },
  };
  const chosen = map[regimeKey];

  return {
    hurst,
    annualVol: recentVol,
    volState,
    trendScore,
    regimeKey,
    regimeAr: chosen.ar,
    descAr: chosen.desc,
    recommended: chosen.rec,
  };
}

/** Aggregate regime across a universe by averaging the per-asset signals. */
export function aggregateRegime(closesByAsset: number[][]): RegimeAnalysis {
  const analyses = closesByAsset.map(analyzeRegime);
  const avg = (sel: (a: RegimeAnalysis) => number) =>
    analyses.reduce((s, a) => s + sel(a), 0) / (analyses.length || 1);
  const hurst = avg((a) => a.hurst);
  const annualVol = avg((a) => a.annualVol);
  const trendScore = avg((a) => a.trendScore);
  // Majority vote on regime key.
  const counts: Record<string, number> = {};
  for (const a of analyses) counts[a.regimeKey] = (counts[a.regimeKey] ?? 0) + 1;
  const regimeKey = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "choppy") as RegimeAnalysis["regimeKey"];
  const representative = analyses.find((a) => a.regimeKey === regimeKey) ?? analyzeRegime(closesByAsset[0] ?? []);
  return {
    ...representative,
    hurst,
    annualVol,
    trendScore,
  };
}
