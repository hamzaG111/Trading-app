// AURUM autopilot server. Exposes a small REST API the UI uses to start/stop the
// autonomous loop, stream its live state, and connect a real MT5 account (via the
// Python bridge). Runs independently of the browser.
import express from "express";
import cors from "cors";
import { DEMO_SYMBOLS } from "../src/engine/data";
import { RISK_PRESETS } from "../src/engine/risk";
import { STRATEGIES } from "../src/engine/strategies";
import { PROP_PRESETS } from "../src/engine/propFirm";
import { defaultPortfolioConfig, type RiskModel } from "../src/engine/portfolio";
import { Autopilot } from "./autopilot";
import {
  bridgeHealth,
  Mt5Broker,
  Mt5Source,
  PaperExecutionBroker,
  PaperSource,
  type ExecutionBroker,
  type MarketSource,
} from "./adapters";
import type { AutopilotConfig } from "./types";

const PORT = Number(process.env.PORT ?? 8787);
const BRIDGE_URL = process.env.MT5_BRIDGE_URL ?? "http://127.0.0.1:8799";
const START_KIND = (process.env.BROKER === "mt5" ? "mt5" : "paper") as "paper" | "mt5";
const MT5_FALLBACK_SYMBOLS = (process.env.MT5_SYMBOLS ?? "EURUSD,GBPUSD,XAUUSD,BTCUSD,US30")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

interface Backend {
  source: MarketSource;
  broker: ExecutionBroker;
  symbols: string[];
  mode: "paper" | "live";
  balance: number;
}

async function buildBackend(kind: "paper" | "mt5"): Promise<Backend> {
  if (kind === "mt5") {
    const h = await bridgeHealth(BRIDGE_URL);
    const symbols = h?.symbols?.length ? h.symbols : MT5_FALLBACK_SYMBOLS;
    const balance = h?.account?.equity ?? 100_000;
    return { source: new Mt5Source(BRIDGE_URL), broker: new Mt5Broker(BRIDGE_URL), symbols, mode: "live", balance };
  }
  return {
    source: new PaperSource(),
    broker: new PaperExecutionBroker(100_000),
    symbols: [...DEMO_SYMBOLS],
    mode: "paper",
    balance: 100_000,
  };
}

function makeConfig(backend: Backend, kind: "paper" | "mt5"): AutopilotConfig {
  return {
    mode: backend.mode,
    strategyId: "__ensemble__",
    riskPreset: "balanced",
    risk: RISK_PRESETS.balanced.config,
    symbols: backend.symbols,
    initialEquity: backend.balance,
    intervalMs: 2500,
    killSwitch: { maxDrawdown: 0.2, maxDailyLoss: 0.05 },
    engine: defaultPortfolioConfig(),
    brokerKind: kind,
    bridgeUrl: BRIDGE_URL,
  };
}

const initial = await buildBackend(START_KIND);
const autopilot = new Autopilot(makeConfig(initial, START_KIND), initial.source, initial.broker);

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

app.get("/api/connection", async (_req, res) => {
  const kind = autopilot.config.brokerKind;
  const bridge = kind === "mt5" ? await bridgeHealth(BRIDGE_URL) : null;
  res.json({ brokerKind: kind, bridgeUrl: BRIDGE_URL, symbols: autopilot.config.symbols, bridge });
});

// Connect / switch the execution backend (paper ⇄ MT5).
app.post("/api/connection", async (req, res) => {
  const kind = req.body?.brokerKind === "mt5" ? "mt5" : "paper";
  const backend = await buildBackend(kind);
  if (kind === "mt5") {
    const ok = await bridgeHealth(BRIDGE_URL);
    if (!ok) {
      return res.status(503).json({ error: "MT5 bridge unreachable", bridgeUrl: BRIDGE_URL });
    }
  }
  await autopilot.useBackend(backend.source, backend.broker, {
    brokerKind: kind,
    bridgeUrl: BRIDGE_URL,
    symbols: backend.symbols,
    initialEquity: backend.balance,
    mode: backend.mode,
  });
  res.json(autopilot.snapshot());
});

app.post("/api/start", async (_req, res) => {
  await autopilot.start();
  res.json(autopilot.snapshot());
});

app.post("/api/stop", (_req, res) => {
  autopilot.stop();
  res.json(autopilot.snapshot());
});

app.post("/api/reset", async (req, res) => {
  await autopilot.reset(sanitizeConfig(req.body ?? {}));
  res.json(autopilot.snapshot());
});

app.post("/api/config", (req, res) => {
  autopilot.updateConfig(sanitizeConfig(req.body ?? {}));
  res.json(autopilot.snapshot());
});

/** Whitelist + normalise incoming config (maps riskPreset/engine knobs). */
function sanitizeConfig(body: Record<string, unknown>): Partial<AutopilotConfig> {
  const patch: Partial<AutopilotConfig> = {};
  if (typeof body.strategyId === "string") patch.strategyId = body.strategyId;
  if (typeof body.intervalMs === "number") patch.intervalMs = Math.max(500, body.intervalMs);
  if (typeof body.initialEquity === "number" && body.initialEquity > 0) patch.initialEquity = body.initialEquity;
  if (body.riskPreset === "conservative" || body.riskPreset === "balanced" || body.riskPreset === "aggressive") {
    patch.riskPreset = body.riskPreset;
    patch.risk = RISK_PRESETS[body.riskPreset].config;
  }
  if (body.prop === null) patch.prop = undefined;
  else if (typeof body.prop === "object") patch.prop = body.prop as AutopilotConfig["prop"];
  if (typeof body.killSwitch === "object" && body.killSwitch) patch.killSwitch = body.killSwitch as AutopilotConfig["killSwitch"];
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
    if (typeof body.riskModel === "string" && models.includes(body.riskModel as RiskModel)) e.riskModel = body.riskModel as RiskModel;
    if (typeof body.riskBlend === "number") e.riskBlend = Math.max(0, Math.min(1, body.riskBlend));
    if (typeof body.factorTilt === "number") e.factorTilt = Math.max(0, Math.min(1, body.factorTilt));
    if (typeof body.regimeAdaptive === "boolean") e.regimeAdaptive = body.regimeAdaptive;
    patch.engine = e;
  }
  return patch;
}

app.listen(PORT, () => {
  console.log(`\n  ◆ AURUM autopilot server on http://localhost:${PORT}`);
  console.log(`  ◆ Execution: ${START_KIND.toUpperCase()}${START_KIND === "mt5" ? ` (bridge ${BRIDGE_URL})` : " (paper sim)"}\n`);
});
