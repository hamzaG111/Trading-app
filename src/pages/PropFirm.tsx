import { useMemo, useState } from "react";
import { ShieldCheck, ShieldAlert, Hourglass } from "lucide-react";
import { useApp } from "@/state/AppContext";
import { runBacktest, type BacktestConfig, type EnsembleLeg } from "@/engine/backtest";
import { defaultParams, STRATEGIES } from "@/engine/strategies";
import { RISK_PRESETS } from "@/engine/risk";
import {
  overallFloor,
  profitTargetEquity,
  PROP_PRESETS,
} from "@/engine/propFirm";
import type { PropFirmRules } from "@/engine/types";
import { Card, Segmented, Slider, Stat } from "@/components/ui";
import EquityChart, { type PriceLineDef } from "@/components/EquityChart";
import { fmtCompact, fmtCurrency, fmtNum, fmtPct } from "@/lib/format";
import { theme } from "@/theme";

type RiskKey = keyof typeof RISK_PRESETS;

export default function PropFirm() {
  const { universe, symbols } = useApp();
  const [presetId, setPresetId] = useState(PROP_PRESETS[0].id);
  const [rules, setRules] = useState<PropFirmRules>(PROP_PRESETS[0]);
  const [strategyId, setStrategyId] = useState<string>("__ensemble__");
  const [riskKey, setRiskKey] = useState<RiskKey>("conservative");

  function choosePreset(id: string) {
    setPresetId(id);
    const p = PROP_PRESETS.find((x) => x.id === id);
    if (p) setRules({ ...p });
  }
  const patch = (k: keyof PropFirmRules, v: number | boolean) =>
    setRules((prev) => ({ ...prev, [k]: v }));

  const config: BacktestConfig = useMemo(() => {
    const risk = RISK_PRESETS[riskKey].config;
    if (strategyId === "__ensemble__") {
      const ensemble: EnsembleLeg[] = STRATEGIES.map((s) => ({
        strategyId: s.id,
        params: defaultParams(s),
        weight: 1,
      }));
      return { ensemble, risk, initialEquity: rules.startingBalance, prop: rules };
    }
    return {
      strategyId,
      params: defaultParams(STRATEGIES.find((s) => s.id === strategyId)!),
      risk,
      initialEquity: rules.startingBalance,
      prop: rules,
    };
  }, [strategyId, riskKey, rules]);

  const result = useMemo(() => runBacktest(universe, symbols, config), [universe, symbols, config]);
  const ev = result.prop!;

  const lines: PriceLineDef[] = [
    { price: profitTargetEquity(rules), color: theme.green, title: "هدف الربح", dashed: true },
    { price: rules.startingBalance, color: theme.textMuted, title: "البداية" },
    {
      price: overallFloor(rules, rules.startingBalance),
      color: theme.red,
      title: "حدّ السحب",
      dashed: true,
    },
  ];

  const status = ev.passed ? "pass" : ev.failed ? "fail" : "progress";

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">محاكي شركات التمويل (Prop Firm)</h1>
        <p className="page-sub">
          النظام يفهم قواعد التحدّي ويُحجّم المراكز قبل كل صفقة حتى لا تكسر أيّ حدّ — حدّ الخسارة
          اليومي، حدّ السحب الكلي، وهدف الربح. اضبط قواعد برنامجك الفعلي وشاهد سلوك النظام تحت
          الضغط.
        </p>
      </div>

      <div className="grid cols-3" style={{ gap: 18 }}>
        <Card title="قواعد التحدّي" icon={<ShieldCheck size={15} />}>
          <div className="field-label" style={{ marginBottom: 9 }}>
            البرنامج
          </div>
          <select value={presetId} onChange={(e) => choosePreset(e.target.value)} style={{ marginBottom: 16 }}>
            {PROP_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <NumberField
            label="رأس المال"
            value={rules.startingBalance}
            step={5000}
            onChange={(v) => patch("startingBalance", v)}
          />
          <Slider
            label="حدّ الخسارة اليومي"
            unit="%"
            min={2}
            max={10}
            step={0.5}
            value={+(rules.maxDailyLoss * 100).toFixed(1)}
            onChange={(v) => patch("maxDailyLoss", v / 100)}
          />
          <Slider
            label="حدّ السحب الكلي"
            unit="%"
            min={4}
            max={15}
            step={0.5}
            value={+(rules.maxOverallLoss * 100).toFixed(1)}
            onChange={(v) => patch("maxOverallLoss", v / 100)}
          />
          <Slider
            label="هدف الربح"
            unit="%"
            min={4}
            max={15}
            step={0.5}
            value={+(rules.profitTarget * 100).toFixed(1)}
            onChange={(v) => patch("profitTarget", v / 100)}
          />
          <Slider
            label="أدنى أيام تداول"
            unit="يوم"
            min={0}
            max={20}
            step={1}
            value={rules.minTradingDays}
            onChange={(v) => patch("minTradingDays", v)}
          />
          <div className="row spread" style={{ marginTop: 4 }}>
            <span className="muted" style={{ fontSize: 13 }}>
              سحب متحرّك (Trailing)
            </span>
            <button
              className={`btn${rules.trailing ? " btn-primary" : ""}`}
              style={{ padding: "6px 14px" }}
              onClick={() => patch("trailing", !rules.trailing)}
            >
              {rules.trailing ? "مُفعّل" : "ثابت"}
            </button>
          </div>

          <div className="divider" />
          <div className="field-label" style={{ marginBottom: 9 }}>
            المحرّك
          </div>
          <select value={strategyId} onChange={(e) => setStrategyId(e.target.value)} style={{ marginBottom: 14 }}>
            <option value="__ensemble__">★ المحفظة المدمجة</option>
            {STRATEGIES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nameAr}
              </option>
            ))}
          </select>
          <Segmented<RiskKey>
            value={riskKey}
            onChange={setRiskKey}
            options={[
              { value: "conservative", label: "متحفّظ" },
              { value: "balanced", label: "متوازن" },
              { value: "aggressive", label: "هجومي" },
            ]}
          />
        </Card>

        <div style={{ gridColumn: "span 2" }}>
          <Card
            title="نتيجة التحدّي"
            icon={status === "pass" ? <ShieldCheck size={15} /> : status === "fail" ? <ShieldAlert size={15} /> : <Hourglass size={15} />}
          >
            <div className="row spread" style={{ marginBottom: 14 }}>
              <div>
                <div className="kpi" style={{ fontSize: 30, fontWeight: 700 }}>
                  {fmtCompact(ev.finalEquity)}
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                  من {fmtCurrency(rules.startingBalance)} · ذروة {fmtCompact(ev.peakEquity)}
                </div>
              </div>
              <span
                className={`tag ${status === "pass" ? "badge-pass" : status === "fail" ? "badge-fail" : ""}`}
                style={{ fontSize: 14, padding: "8px 16px" }}
              >
                {status === "pass" ? "✓ اجتاز التحدّي" : status === "fail" ? "✗ فشل" : "قيد التنفيذ"}
              </span>
            </div>
            <EquityChart
              data={result.equity}
              height={250}
              color={status === "fail" ? theme.red : theme.gold}
              priceLines={lines}
            />
            {ev.failReason && (
              <div className={status === "fail" ? "disclaimer" : "note"} style={{ marginTop: 14 }}>
                {status === "fail"
                  ? `سبب الفشل: ${arReason(ev.failReason)}`
                  : status === "pass"
                    ? `تم بلوغ هدف الربح في اليوم ${ev.decidedAtDay} مع احترام كل الحدود.`
                    : "لم يُبلَغ هدف الربح بعد ضمن الفترة — النظام حافظ على الحدود دون كسرها."}
              </div>
            )}
          </Card>

          <div className="grid cols-4" style={{ marginTop: 18 }}>
            <Stat label="أيام التداول" value={fmtNum(ev.tradingDays, 0)} />
            <Stat
              label="أسوأ خسارة يومية"
              value={fmtPct(ev.worstDailyLoss, 2)}
              tone="neg"
              foot={`الحدّ ${fmtPct(-rules.maxDailyLoss, 0)}`}
            />
            <Stat label="أقصى تراجع" value={fmtPct(result.metrics.maxDrawdown, 1)} tone="neg" />
            <Stat label="نسبة شارب" value={fmtNum(result.metrics.sharpe, 2)} />
          </div>
        </div>
      </div>

      <div className="note" style={{ marginTop: 18 }}>
        الأرقام الافتراضية أمثلة تقريبية؛ قواعد كل برنامج تتغيّر مع الوقت. أدخِل دائماً الأرقام
        الفعلية من عقدك. هذه المحاكاة تقيس مدى احترام النظام للحدود على بيانات توضيحية — وليست وعداً
        باجتياز أي تحدٍّ حقيقي.
      </div>
    </>
  );
}

function NumberField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        <b>{fmtCurrency(value)}</b>
      </div>
      <input
        type="number"
        value={value}
        step={step}
        min={1000}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function arReason(reason: string): string {
  if (reason.includes("Daily")) return "كسر حدّ الخسارة اليومي.";
  if (reason.includes("overall")) return "كسر حدّ السحب الكلي.";
  return reason;
}
