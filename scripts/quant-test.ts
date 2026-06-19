// Numeric verification of the quant-research suite. Run: npx tsx scripts/quant-test.ts
import { buildDemoUniverse, DEMO_SYMBOLS, cachedCloses } from "../src/engine/data";
import { covarianceMatrix, optimizeUniverse, returnsMatrix } from "../src/engine/optimize";
import { shrinkCovariance } from "../src/engine/linalg";
import { runMonteCarlo } from "../src/engine/montecarlo";
import { aggregateRegime } from "../src/engine/regime";
import { computeFactors, factorPortfolio } from "../src/engine/factors";
import { computeRiskMetrics } from "../src/engine/riskmetrics";
import { runBacktest } from "../src/engine/backtest";
import { RISK_PRESETS } from "../src/engine/risk";

let fails = 0;
const ok = (name: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${name}`);
  if (!cond) fails++;
};
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const finite = (a: number[]) => a.every((x) => Number.isFinite(x));
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

const u = buildDemoUniverse(1200);
const symbols = [...DEMO_SYMBOLS];
const closes = symbols.map((s) => cachedCloses(u[s]));

// ---- Optimizers ----
console.log("\n=== Portfolio optimizers ===");
const rets = returnsMatrix(closes);
const cov = shrinkCovariance(covarianceMatrix(rets), 0.2);
const mu = rets.map((r) => sum(r) / r.length);
const opt = optimizeUniverse(cov, mu);
for (const a of opt.allocators) {
  const wsum = sum(a.weights);
  console.log(
    `  ${a.nameAr.padEnd(22)} Σw=${wsum.toFixed(3)} ret=${pct(a.ret)} vol=${pct(a.vol)} sharpe=${a.sharpe.toFixed(2)} DR=${a.diversification.toFixed(2)}`,
  );
  ok(`${a.id}: weights finite`, finite(a.weights));
  ok(`${a.id}: weights sum≈1`, Math.abs(wsum - 1) < 1e-6);
  ok(`${a.id}: stats finite`, [a.ret, a.vol, a.sharpe].every(Number.isFinite));
}
ok("HRP long-only (no negatives)", opt.allocators.find((a) => a.id === "hrp")!.weights.every((w) => w >= -1e-9));
ok("ERC risk contributions ≈ equal", (() => {
  const erc = opt.allocators.find((a) => a.id === "erc")!;
  const rc = erc.riskContrib;
  return Math.max(...rc) - Math.min(...rc) < 0.05;
})());
ok("efficient frontier non-empty", opt.frontier.length > 5);
ok("frontier vols finite", finite(opt.frontier.map((f) => f.vol)));

// ---- Monte Carlo ----
console.log("\n=== Monte Carlo ===");
const bt = runBacktest(u, symbols, {
  ensemble: [{ strategyId: "risk-parity", params: { lookback: 60 }, weight: 1 }],
  risk: RISK_PRESETS.balanced.config,
  initialEquity: 100_000,
});
const mc = runMonteCarlo(bt.returns, {
  horizonDays: 252,
  paths: 2000,
  initialCapital: 100_000,
  method: "block",
  blockSize: 10,
  target: 150_000,
  ruinDrawdown: 0.5,
  seed: 42,
});
console.log(
  `  terminal p5=${(mc.terminal.p5 / 1000).toFixed(0)}k p50=${(mc.terminal.p50 / 1000).toFixed(0)}k p95=${(mc.terminal.p95 / 1000).toFixed(0)}k`,
);
console.log(`  P(target)=${pct(mc.probTarget)} P(loss)=${pct(mc.probLoss)} P(ruin)=${pct(mc.probRuin)} VaR95=${pct(mc.var95)} CVaR95=${pct(mc.cvar95)}`);
ok("MC bands ordered p5≤p50≤p95", mc.bands.every((b) => b.p5 <= b.p50 + 1e-6 && b.p50 <= b.p95 + 1e-6));
ok("MC probabilities in [0,1]", [mc.probTarget, mc.probLoss, mc.probRuin].every((p) => p >= 0 && p <= 1));
ok("MC bands length = horizon+1", mc.bands.length === 253);
ok("MC VaR/CVaR finite & CVaR≥VaR", Number.isFinite(mc.var95) && mc.cvar95 >= mc.var95 - 1e-9);

// ---- Regime ----
console.log("\n=== Regime detection ===");
const reg = aggregateRegime(closes);
console.log(`  regime=${reg.regimeAr} hurst=${reg.hurst.toFixed(2)} vol=${pct(reg.annualVol)} (${reg.volState}) trend=${reg.trendScore.toFixed(2)}`);
ok("hurst in [0,1]", reg.hurst >= 0 && reg.hurst <= 1);
ok("recommended sums≈1", Math.abs(sum(Object.values(reg.recommended)) - 1) < 1e-6);

// ---- Factors ----
console.log("\n=== Factor model ===");
const fs = computeFactors(closes, symbols);
for (const f of fs) console.log(`  ${f.symbol.padEnd(6)} mom=${f.momentum.toFixed(2)} trend=${f.trend.toFixed(2)} lowVol=${f.lowVol.toFixed(2)} rev=${f.reversal.toFixed(2)} qual=${f.quality.toFixed(2)} → comp=${f.composite.toFixed(2)}`);
ok("factor composites finite", finite(fs.map((f) => f.composite)));
const fp = factorPortfolio(fs);
ok("factor L/S nets ≈ 0", Math.abs(sum(Object.values(fp))) < 1e-9);

// ---- Risk metrics ----
console.log("\n=== Tail risk metrics ===");
const rm = computeRiskMetrics(bt.returns, bt.equity.map((e) => e.value));
console.log(`  VaR95=${pct(rm.var95)} CVaR95=${pct(rm.cvar95)} skew=${rm.skew.toFixed(2)} exKurt=${rm.kurtosis.toFixed(2)} ulcer=${rm.ulcerIndex.toFixed(2)} G2P=${rm.gainToPain.toFixed(2)}`);
ok("risk metrics finite", [rm.var95, rm.cvar95, rm.skew, rm.kurtosis, rm.ulcerIndex].every(Number.isFinite));

console.log(fails === 0 ? "\n✅ ALL QUANT CHECKS PASSED\n" : `\n❌ ${fails} CHECK(S) FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
