// Smoke test for the AURUM engine. Run with: npx tsx scripts/smoke.ts
// Verifies that every strategy, the ensemble, and the prop-firm guard produce
// finite, sane numbers end-to-end (no NaN/Infinity blow-ups).
import { buildDemoUniverse, DEMO_SYMBOLS } from "../src/engine/data";
import { STRATEGIES, defaultParams } from "../src/engine/strategies";
import { RISK_PRESETS } from "../src/engine/risk";
import { runBacktest } from "../src/engine/backtest";
import { PROP_PRESETS } from "../src/engine/propFirm";

const u = buildDemoUniverse(1500);
const symbols = [...DEMO_SYMBOLS];
let failures = 0;

function check(name: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.log(`  ✗ ${name}`);
  } else {
    console.log(`  ✓ ${name}`);
  }
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

console.log("\n=== Single strategies (balanced risk) ===");
for (const s of STRATEGIES) {
  const r = runBacktest(u, symbols, {
    strategyId: s.id,
    params: defaultParams(s),
    risk: RISK_PRESETS.balanced.config,
    initialEquity: 100_000,
  });
  const m = r.metrics;
  const finite =
    Number.isFinite(m.cagr) &&
    Number.isFinite(m.sharpe) &&
    Number.isFinite(m.maxDrawdown) &&
    Number.isFinite(m.annualVol) &&
    r.equity.length > 100;
  console.log(
    `${s.nameAr.padEnd(16)} CAGR ${pct(m.cagr).padStart(7)} | Sharpe ${m.sharpe
      .toFixed(2)
      .padStart(6)} | MaxDD ${pct(m.maxDrawdown).padStart(7)} | vol ${pct(m.annualVol)}`,
  );
  check(`${s.id} produces finite metrics`, finite);
  check(`${s.id} drawdown within [-1,0]`, m.maxDrawdown <= 0 && m.maxDrawdown >= -1);
  check(`${s.id} vol respects risk target band`, m.annualVol < 0.6);
}

console.log("\n=== Ensemble (all five, equal weight) ===");
const ens = runBacktest(u, symbols, {
  ensemble: STRATEGIES.map((s) => ({ strategyId: s.id, params: defaultParams(s), weight: 1 })),
  risk: RISK_PRESETS.balanced.config,
  initialEquity: 100_000,
});
console.log(
  `Ensemble        CAGR ${pct(ens.metrics.cagr)} | Sharpe ${ens.metrics.sharpe.toFixed(
    2,
  )} | MaxDD ${pct(ens.metrics.maxDrawdown)}`,
);
check("ensemble equity has full length", ens.equity.length > 1000);
check("ensemble metrics finite", Number.isFinite(ens.metrics.sharpe));

console.log("\n=== Prop-firm guard (FundedNext-style) ===");
for (const rules of PROP_PRESETS) {
  const r = runBacktest(u, symbols, {
    ensemble: STRATEGIES.map((s) => ({ strategyId: s.id, params: defaultParams(s), weight: 1 })),
    risk: RISK_PRESETS.conservative.config,
    initialEquity: rules.startingBalance,
    prop: rules,
  });
  const ev = r.prop!;
  console.log(
    `${rules.name.slice(0, 34).padEnd(35)} → ${
      ev.passed ? "PASS" : ev.failed ? "FAIL" : "IN-PROGRESS"
    } | worstDaily ${pct(ev.worstDailyLoss)} | days ${ev.tradingDays}`,
  );
  // The whole point of the guard: the worst daily loss must never exceed the rule.
  check(
    `${rules.id}: guard kept worst daily loss within limit`,
    ev.worstDailyLoss >= -rules.maxDailyLoss - 1e-6,
  );
  check(`${rules.id}: evaluation is finite`, Number.isFinite(ev.finalEquity));
}

console.log(
  failures === 0
    ? "\n✅ ALL SMOKE CHECKS PASSED\n"
    : `\n❌ ${failures} CHECK(S) FAILED\n`,
);
process.exit(failures === 0 ? 0 : 1);
