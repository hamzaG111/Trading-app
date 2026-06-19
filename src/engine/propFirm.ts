// Prop-firm rule engine. Encodes the kind of challenge rules used by FundedNext
// and similar funded-trader programs, and provides BOTH:
//   1. live, risk-of-ruin-aware position sizing (so the system never knowingly
//      takes a bet that could breach a limit), and
//   2. post-hoc evaluation of an equity curve against the rules.
//
// NOTE: exact numbers (targets, daily/overall loss %, min days) vary by program
// and change over time. These presets are realistic defaults — ALWAYS replace
// them with the exact figures from your own contract before relying on them.
import type { PropFirmEvaluation, PropFirmRules } from "./types";

export const PROP_PRESETS: PropFirmRules[] = [
  {
    id: "fundednext-eval-2step",
    name: "FundedNext · Evaluation (2-Step) — example",
    startingBalance: 100_000,
    maxDailyLoss: 0.05,
    maxOverallLoss: 0.1,
    profitTarget: 0.1,
    trailing: false,
    minTradingDays: 5,
  },
  {
    id: "fundednext-express",
    name: "FundedNext · Express-style (1-Step) — example",
    startingBalance: 100_000,
    maxDailyLoss: 0.04,
    maxOverallLoss: 0.06,
    profitTarget: 0.08,
    trailing: true,
    minTradingDays: 5,
  },
  {
    id: "generic-conservative",
    name: "Generic Conservative Funded Account",
    startingBalance: 50_000,
    maxDailyLoss: 0.04,
    maxOverallLoss: 0.08,
    profitTarget: 0.08,
    trailing: false,
    minTradingDays: 10,
  },
];

/** The equity level at or below which the overall-loss rule is breached. */
export function overallFloor(rules: PropFirmRules, peakEquity: number): number {
  if (rules.trailing) {
    // Trailing drawdown of a fixed amount (based on starting balance) from the peak.
    return peakEquity - rules.maxOverallLoss * rules.startingBalance;
  }
  return rules.startingBalance * (1 - rules.maxOverallLoss);
}

/** The equity level that, if breached within a single day, fails the daily rule. */
export function dailyFloor(rules: PropFirmRules, dayStartEquity: number): number {
  return dayStartEquity - rules.maxDailyLoss * rules.startingBalance;
}

export function profitTargetEquity(rules: PropFirmRules): number {
  return rules.startingBalance * (1 + rules.profitTarget);
}

/**
 * Compute the maximum gross exposure that keeps an adverse daily move within the
 * remaining risk budget. `estDailyVol` is the portfolio's estimated daily vol
 * (fraction). `k` is how many sigmas of adverse move we defend against (≈2.5
 * covers ~99% of daily moves under a normal assumption — real tails are fatter,
 * which is exactly why we keep a margin).
 */
export function propGuardMaxGross(
  rules: PropFirmRules,
  equity: number,
  dayStartEquity: number,
  peakEquity: number,
  estDailyVol: number,
  k = 2.5,
): number {
  const floorDaily = dailyFloor(rules, dayStartEquity);
  const floorOverall = overallFloor(rules, peakEquity);
  const hardFloor = Math.max(floorDaily, floorOverall);
  const budget = equity - hardFloor; // money we can lose before a breach
  if (budget <= 0) return 0; // already at/over a limit → no risk allowed
  const budgetFrac = budget / equity;
  const vol = Math.max(estDailyVol, 0.002); // floor vol at 0.2%/day for safety
  return budgetFrac / (k * vol);
}

/**
 * Evaluate an equity curve (one value per trading day) against the rules.
 * Returns whether the challenge passed, failed, or is still in progress.
 */
export function evaluatePropChallenge(
  equity: number[],
  rules: PropFirmRules,
): PropFirmEvaluation {
  let peak = equity.length ? equity[0] : rules.startingBalance;
  let worstDailyLoss = 0;
  const target = profitTargetEquity(rules);

  for (let i = 0; i < equity.length; i++) {
    const eq = equity[i];
    if (eq > peak) peak = eq;

    const dayStart = i === 0 ? rules.startingBalance : equity[i - 1];
    const dailyPnL = eq - dayStart;
    const dailyLossFrac = dailyPnL / rules.startingBalance;
    if (dailyLossFrac < worstDailyLoss) worstDailyLoss = dailyLossFrac;

    // Daily-loss breach.
    if (eq <= dailyFloor(rules, dayStart)) {
      return {
        passed: false,
        failed: true,
        failReason: `Daily loss limit breached on day ${i + 1}`,
        decidedAtDay: i + 1,
        peakEquity: peak,
        finalEquity: eq,
        worstDailyLoss,
        tradingDays: i + 1,
      };
    }
    // Overall-loss breach.
    if (eq <= overallFloor(rules, peak)) {
      return {
        passed: false,
        failed: true,
        failReason: `Max overall drawdown breached on day ${i + 1}`,
        decidedAtDay: i + 1,
        peakEquity: peak,
        finalEquity: eq,
        worstDailyLoss,
        tradingDays: i + 1,
      };
    }
    // Profit target reached (only valid after the minimum number of trading days).
    if (eq >= target && i + 1 >= rules.minTradingDays) {
      return {
        passed: true,
        failed: false,
        decidedAtDay: i + 1,
        peakEquity: peak,
        finalEquity: eq,
        worstDailyLoss,
        tradingDays: i + 1,
      };
    }
  }

  return {
    passed: false,
    failed: false,
    failReason: "Challenge still in progress (target not yet reached)",
    peakEquity: peak,
    finalEquity: equity.length ? equity[equity.length - 1] : rules.startingBalance,
    worstDailyLoss,
    tradingDays: equity.length,
  };
}
