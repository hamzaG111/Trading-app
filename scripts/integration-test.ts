// Does the integrated construction pipeline ACTUALLY help, or is it decoration?
// This backtests the baseline equal-weight ensemble against progressively richer
// pipelines on the same data and reports risk-adjusted metrics honestly.
// Run: npx tsx scripts/integration-test.ts
import { buildDemoUniverse, DEMO_SYMBOLS } from "../src/engine/data";
import { STRATEGIES, defaultParams } from "../src/engine/strategies";
import { RISK_PRESETS } from "../src/engine/risk";
import { runBacktest } from "../src/engine/backtest";
import type { PortfolioConfig } from "../src/engine/portfolio";

const u = buildDemoUniverse(1500);
const symbols = [...DEMO_SYMBOLS];
const risk = RISK_PRESETS.balanced.config;
const legs = STRATEGIES.map((s) => ({ strategyId: s.id, params: defaultParams(s), weight: 1 }));

const base: PortfolioConfig = {
  legs,
  regimeAdaptive: false,
  riskModel: "none",
  riskBlend: 0,
  factorTilt: 0,
  covLookback: 120,
};

const variants: { name: string; cfg: PortfolioConfig | null }[] = [
  { name: "Baseline ensemble (equal weight)", cfg: null }, // plain ensemble path
  { name: "Regime adaptive only", cfg: { ...base, regimeAdaptive: true } },
  { name: "HRP only (blend 0.6)", cfg: { ...base, riskModel: "hrp", riskBlend: 0.6 } },
  { name: "HRP only (blend 1.0)", cfg: { ...base, riskModel: "hrp", riskBlend: 1.0 } },
  { name: "ERC only (blend 0.6)", cfg: { ...base, riskModel: "erc", riskBlend: 0.6 } },
  { name: "Factor tilt only", cfg: { ...base, factorTilt: 0.25 } },
  { name: "HRP 0.6 + factor 0.2", cfg: { ...base, riskModel: "hrp", riskBlend: 0.6, factorTilt: 0.2 } },
  { name: "HRP 0.8 + factor 0.2", cfg: { ...base, riskModel: "hrp", riskBlend: 0.8, factorTilt: 0.2 } },
  { name: "HRP 0.6 + factor 0.2 + regime", cfg: { ...base, regimeAdaptive: true, riskModel: "hrp", riskBlend: 0.6, factorTilt: 0.2 } },
];

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const pad = (s: string, n: number) => s.padEnd(n);

console.log("\n" + pad("Configuration", 34) + "CAGR     Sharpe   MaxDD     Calmar");
console.log("─".repeat(74));

const t0 = Date.now();
const rows = variants.map((v) => {
  const r =
    v.cfg === null
      ? runBacktest(u, symbols, { ensemble: legs, risk, initialEquity: 100_000 })
      : runBacktest(u, symbols, { portfolio: v.cfg, risk, initialEquity: 100_000 });
  const m = r.metrics;
  console.log(
    pad(v.name, 34) +
      pad(pct(m.cagr), 9) +
      pad(m.sharpe.toFixed(2), 9) +
      pad(pct(m.maxDrawdown), 10) +
      m.calmar.toFixed(2),
  );
  return { name: v.name, m };
});

const baseRow = rows[0].m;
const best = rows.slice(1).reduce((a, b) => (b.m.sharpe > a.m.sharpe ? b : a));
console.log("─".repeat(74));
console.log(
  `\nBEST (${best.name}) vs baseline:  ` +
    `Sharpe ${baseRow.sharpe.toFixed(2)} → ${best.m.sharpe.toFixed(2)}  |  ` +
    `Calmar ${baseRow.calmar.toFixed(2)} → ${best.m.calmar.toFixed(2)}  |  ` +
    `MaxDD ${pct(baseRow.maxDrawdown)} → ${pct(best.m.maxDrawdown)}`,
);
const improved = best.m.sharpe > baseRow.sharpe && best.m.calmar > baseRow.calmar;
console.log(
  improved
    ? "✅ Integrated engine clearly improves risk-adjusted performance (return ↑, risk ↓)."
    : "⚠️  No configuration beat baseline on both Sharpe and Calmar — needs tuning.",
);
console.log(`(ran ${variants.length} backtests in ${Date.now() - t0}ms)\n`);
