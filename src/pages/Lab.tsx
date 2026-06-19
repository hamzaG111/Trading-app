import { useMemo, useState } from "react";
import { FlaskConical, Layers, SlidersHorizontal } from "lucide-react";
import { useApp } from "@/state/AppContext";
import { runBacktest, type BacktestConfig, type EnsembleLeg } from "@/engine/backtest";
import { defaultParams, STRATEGIES, STRATEGY_MAP } from "@/engine/strategies";
import { RISK_PRESETS } from "@/engine/risk";
import { Card, Segmented, Slider, Stat } from "@/components/ui";
import EquityChart from "@/components/EquityChart";
import { fmtCompact, fmtNum, fmtPct } from "@/lib/format";
import { theme } from "@/theme";

type RiskKey = keyof typeof RISK_PRESETS;

const ENSEMBLE_ID = "__ensemble__";

export default function Lab() {
  const { universe, symbols, capital } = useApp();
  const [strategyId, setStrategyId] = useState<string>("ts-momentum");
  const [params, setParams] = useState<Record<string, number>>(() =>
    defaultParams(STRATEGY_MAP["ts-momentum"]),
  );
  const [riskKey, setRiskKey] = useState<RiskKey>("balanced");

  const isEnsemble = strategyId === ENSEMBLE_ID;
  const strategy = STRATEGY_MAP[strategyId];

  function selectStrategy(id: string) {
    setStrategyId(id);
    if (id !== ENSEMBLE_ID) setParams(defaultParams(STRATEGY_MAP[id]));
  }

  const config: BacktestConfig = useMemo(() => {
    const risk = RISK_PRESETS[riskKey].config;
    if (isEnsemble) {
      const ensemble: EnsembleLeg[] = STRATEGIES.map((s) => ({
        strategyId: s.id,
        params: defaultParams(s),
        weight: 1,
      }));
      return { ensemble, risk, initialEquity: capital };
    }
    return { strategyId, params, risk, initialEquity: capital };
  }, [isEnsemble, strategyId, params, riskKey, capital]);

  const result = useMemo(
    () => runBacktest(universe, symbols, config),
    [universe, symbols, config],
  );
  const m = result.metrics;

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">مختبر الاختبار (Backtest Lab)</h1>
        <p className="page-sub">
          اضبط الاستراتيجية والمعاملات وملف المخاطر، وشاهد النتيجة فوراً على بيانات تاريخية — بلا
          نظرة مستقبلية (look-ahead) ومع خصم تكاليف التداول. هكذا تُختبر الأفكار قبل المخاطرة بمال
          حقيقي.
        </p>
      </div>

      <div className="grid cols-3" style={{ gap: 18 }}>
        {/* ---- Controls ---- */}
        <Card title="الإعدادات" icon={<SlidersHorizontal size={15} />}>
          <div className="field-label" style={{ marginBottom: 9 }}>
            الاستراتيجية
          </div>
          <select
            value={strategyId}
            onChange={(e) => selectStrategy(e.target.value)}
            style={{ marginBottom: 18 }}
          >
            <option value={ENSEMBLE_ID}>★ المحفظة المدمجة (كل الاستراتيجيات)</option>
            {STRATEGIES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nameAr} — {s.name}
              </option>
            ))}
          </select>

          {isEnsemble ? (
            <div className="note" style={{ marginBottom: 18 }}>
              <Layers size={14} style={{ verticalAlign: "-2px" }} /> تدمج الاستراتيجيات الخمس بأوزان
              متساوية في كتاب واحد — هكذا تعمل صناديق المنصّات (Millennium، Citadel): دمج محرّكات
              غير مترابطة لتنعيم المنحنى.
            </div>
          ) : (
            strategy.params.map((p) => (
              <Slider
                key={p.key}
                label={p.label}
                unit={p.unit}
                min={p.min}
                max={p.max}
                step={p.step}
                value={params[p.key] ?? p.default}
                onChange={(v) => setParams((prev) => ({ ...prev, [p.key]: v }))}
              />
            ))
          )}

          <div className="divider" />
          <div className="field-label" style={{ marginBottom: 9 }}>
            ملف المخاطر
          </div>
          <Segmented<RiskKey>
            value={riskKey}
            onChange={setRiskKey}
            options={[
              { value: "conservative", label: "متحفّظ" },
              { value: "balanced", label: "متوازن" },
              { value: "aggressive", label: "هجومي" },
            ]}
          />
          <div className="muted" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.8 }}>
            استهداف تذبذب {fmtPct(RISK_PRESETS[riskKey].config.targetVol, 0)} · رافعة قصوى{" "}
            {RISK_PRESETS[riskKey].config.maxGross}x · كيلي{" "}
            {RISK_PRESETS[riskKey].config.kellyFraction}
          </div>
        </Card>

        {/* ---- Equity ---- */}
        <div style={{ gridColumn: "span 2" }}>
          <Card title="منحنى رأس المال" icon={<FlaskConical size={15} />}>
            <div className="row spread" style={{ marginBottom: 8 }}>
              <div className="kpi" style={{ fontSize: 30, fontWeight: 700 }}>
                {fmtCompact(result.equity[result.equity.length - 1]?.value ?? capital)}
              </div>
              <span className={`tag ${m.totalReturn >= 0 ? "" : "badge-fail"}`}>
                {fmtPct(m.totalReturn, 1)} إجمالي
              </span>
            </div>
            <EquityChart
              data={result.equity}
              height={260}
              color={m.cagr >= 0 ? theme.gold : theme.red}
            />
          </Card>
          <Card title="منحنى التراجع (Drawdown)" icon={<FlaskConical size={15} />} style={{ marginTop: 18 }}>
            <EquityChart data={result.drawdown} height={140} line color={theme.red} />
          </Card>
        </div>
      </div>

      {/* ---- Metrics ---- */}
      <div className="grid cols-4" style={{ marginTop: 18 }}>
        <Stat label="العائد الكلي" value={fmtPct(m.totalReturn, 1)} gold />
        <Stat label="العائد السنوي" value={fmtPct(m.cagr, 1)} tone={m.cagr >= 0 ? "pos" : "neg"} />
        <Stat label="التذبذب السنوي" value={fmtPct(m.annualVol, 1)} />
        <Stat label="أقصى تراجع" value={fmtPct(m.maxDrawdown, 1)} tone="neg" />
        <Stat label="نسبة شارب" value={fmtNum(m.sharpe, 2)} />
        <Stat label="نسبة سورتينو" value={fmtNum(m.sortino, 2)} />
        <Stat label="نسبة كالمار" value={fmtNum(m.calmar, 2)} />
        <Stat label="الأيام الرابحة" value={fmtPct(m.winRate, 0)} />
        <Stat label="عامل الربح" value={fmtNum(m.profitFactor, 2)} />
        <Stat label="أفضل يوم" value={fmtPct(m.bestDay, 1)} tone="pos" />
        <Stat label="أسوأ يوم" value={fmtPct(m.worstDay, 1)} tone="neg" />
        <Stat label="متوسط التعرّض" value={`${fmtNum(m.exposure, 2)}x`} />
      </div>

      <div className="note" style={{ marginTop: 18 }}>
        تذكير: نتائج الاختبار التاريخي لا تضمن المستقبل. الهدف من هذه الأرقام هو قياس جودة الفكرة
        وإدارة المخاطر، لا التنبؤ بأرباح. الأداء الحقيقي يعتمد على بيانات حقيقية وتنفيذ وانزلاق
        سعري وتكاليف فعلية.
      </div>
    </>
  );
}
