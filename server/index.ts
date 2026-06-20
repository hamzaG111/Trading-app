// AURUM autopilot server. Exposes a small REST API the UI uses to start/stop the
// autonomous loop and stream its live state. Runs independently of the browser,
// so it keeps trading (paper by default) as long as the process is alive.
import express from "express";
import cors from "cors";
import { DEMO_SYMBOLS } from "../src/engine/data";
import { RISK_PRESETS } from "../src/engine/risk";
import { STRATEGIES } from "../src/engine/strategies";
import { PROP_PRESETS } from "../src/engine/propFirm";
import { defaultPortfolioConfig, type RiskModel } from "../src/engine/portfolio";
import { Autopilot } from "./autopilot";
import type { AutopilotConfig } from "./types";

const PORT = Number(process.env.PORT ?? 8787);

const defaultConfig: AutopilotConfig = {
  mode: "paper",
  strategyId: "__ensemble__",
  riskPreset: "balanced",
  risk: RISK_PRESETS.balanced.config,
  symbols: [...DEMO_SYMBOLS],
  initialEquity: 100_000,
  intervalMs: 2500,
  killSwitch: { maxDrawdown: 0.2, maxDailyLoss: 0.05 },
  // Trade the empirically-best integrated engine by default (HRP + factor tilt).
  engine: defaultPortfolioConfig(),
};

const autopilot = new Autopilot(defaultConfig);

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "aurum-autopilot" }));

app.get("/api/status", (_req, res) => res.json(autopilot.snapshot()));

app.get("/api/meta", (_req, res) => {
  res.json({
    strategies: [
      { id: "__ensemble__", name: "Multi-Strategy Ensemble", nameAr: "المحفظة المدمجة" },
      ...STRATEGIES.map((s) => ({ id: s.id, name: s.name, nameAr: s.nameAr })),
    ],
    riskPresets: Object.entries(RISK_PRESETS).map(([key, v]) => ({ key, nameAr: v.nameAr })),
    propPresets: PROP_PRESETS,
  });
});

app.post("/api/start", (_req, res) => {
  autopilot.start();
  res.json(autopilot.snapshot());
});

app.post("/api/stop", (_req, res) => {
  autopilot.stop();
  res.json(autopilot.snapshot());
});

app.post("/api/reset", (req, res) => {
  const patch = sanitizeConfig(req.body ?? {});
  autopilot.reset(patch);
  res.json(autopilot.snapshot());
});

app.post("/api/config", (req, res) => {
  const patch = sanitizeConfig(req.body ?? {});
  autopilot.updateConfig(patch);
  res.json(autopilot.snapshot());
});

/** Whitelist + normalise incoming config (maps riskPreset -> concrete risk config). */
function sanitizeConfig(body: Record<string, unknown>): Partial<AutopilotConfig> {
  const patch: Partial<AutopilotConfig> = {};
  if (typeof body.strategyId === "string") patch.strategyId = body.strategyId;
  if (typeof body.intervalMs === "number") patch.intervalMs = Math.max(500, body.intervalMs);
  if (typeof body.initialEquity === "number" && body.initialEquity > 0) {
    patch.initialEquity = body.initialEquity;
  }
  if (body.riskPreset === "conservative" || body.riskPreset === "balanced" || body.riskPreset === "aggressive") {
    patch.riskPreset = body.riskPreset;
    patch.risk = RISK_PRESETS[body.riskPreset].config;
  }
  if (body.prop === null) patch.prop = undefined;
  else if (typeof body.prop === "object") patch.prop = body.prop as AutopilotConfig["prop"];
  if (typeof body.killSwitch === "object" && body.killSwitch) {
    patch.killSwitch = body.killSwitch as AutopilotConfig["killSwitch"];
  }
  // Construction-engine controls.
  if (body.engineEnabled === false) {
    patch.engine = null;
  } else if (
    body.engineEnabled === true ||
    body.riskModel !== undefined ||
    body.riskBlend !== undefined ||
    body.factorTilt !== undefined ||
    body.regimeAdaptive !== undefined
  ) {
    const e = defaultPortfolioConfig();
    const models: RiskModel[] = ["none", "inv-var", "erc", "hrp", "min-var"];
    if (typeof body.riskModel === "string" && models.includes(body.riskModel as RiskModel)) {
      e.riskModel = body.riskModel as RiskModel;
    }
    if (typeof body.riskBlend === "number") e.riskBlend = Math.max(0, Math.min(1, body.riskBlend));
    if (typeof body.factorTilt === "number") e.factorTilt = Math.max(0, Math.min(1, body.factorTilt));
    if (typeof body.regimeAdaptive === "boolean") e.regimeAdaptive = body.regimeAdaptive;
    patch.engine = e;
  }
  return patch;
}

app.listen(PORT, () => {
  console.log(`\n  ◆ AURUM autopilot server running on http://localhost:${PORT}`);
  console.log(`  ◆ Mode: PAPER (no real money). Start it from the Autopilot page.\n`);
});
