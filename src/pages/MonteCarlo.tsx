import { useMemo, useState } from "react";
import { Dice5, Sigma, TrendingDown } from "lucide-react";
import { useApp } from "@/state/AppContext";
import { runBacktest, type EnsembleLeg } from "@/engine/backtest";
import { STRATEGIES, defaultParams, STRATEGY_MAP } from "@/engine/strategies";
import { RISK_PRESETS } from "@/engine/risk";
import { runMonteCarlo, type MCMethod } from "@/engine/montecarlo";
import { Card, Segmented, Slider, Stat } from "@/components/ui";
import { FanChart } from "@/components/viz";
import { fmtCompact, fmtPct } from "@/lib/format";
import { theme } from "@/theme";

const ENSEMBLE = "__ensemble__";

export default function MonteCarlo() {
  const { universe, symbols, capital } = useApp();
  const [strategyId, setStrategyId] = useState(ENSEMBLE);
  const [months, setMonths] = useState(12);
  const [paths, setPaths] = useState(2000);
  const [method, setMethod] = useState<MCMethod>("block");
  const [targetMult, setTargetMult] = useState(150); // % of initial

  const backtest = useMemo(() => {
    const risk = RISK_PRESETS.balanced.config;
    if (strategyId === ENSEMBLE) {
      const ens: EnsembleLeg[] = STRATEGIES.map((s) => ({ strategyId: s.id, params: defaultParams(s), weight: 1 }));
      return runBacktest(universe, symbols, { ensemble: ens, risk, initialEquity: capital });
    }
    const strat = STRATEGY_MAP[strategyId];
    return runBacktest(universe, symbols, { strategyId, params: defaultParams(strat), risk, initialEquity: capital });
  }, [universe, symbols, strategyId, capital]);

  const mc = useMemo(
    () =>
      runMonteCarlo(backtest.returns, {
        horizonDays: months * 21,
        paths,
        initialCapital: capital,
        method,
        blockSize: 10,
        target: capital * (targetMult / 100),
        ruinDrawdown: 0.5,
        seed: 12345,
      }),
    [backtest.returns, months, paths, capital, method, targetMult],
  );

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">محاكاة مونت كارلو</h1>
        <p className="page-sub">
          الاختبار التاريخي مسارٌ واحد فقط من المستقبل. هنا نولّد آلاف المسارات الممكنة من توزيع عوائد
          الاستراتيجية — فترى مروحة الاحتمالات، واحتمال بلوغ هدفك، والأهمّ: <b>احتمال الإفلاس</b>
          ومخاطر الذيل. هكذا يقيس المحترفون البقاء، لا الأماني.
        </p>
      </div>

      <div className="grid cols-3" style={{ gap: 18 }}>
        <Card title="المحاكاة" icon={<Dice5 size={15} />}>
          <div className="field-label" style={{ marginBottom: 8 }}>الاستراتيجية</div>
          <select value={strategyId} onChange={(e) => setStrategyId(e.target.value)} style={{ marginBottom: 16 }}>
            <option value={ENSEMBLE}>★ المحفظة المدمجة</option>
            {STRATEGIES.map((s) => <option key={s.id} value={s.id}>{s.nameAr}</option>)}
          </select>
          <Slider label="الأفق الزمني" unit="شهر" min={1} max={60} step={1} value={months} onChange={setMonths} />
          <Slider label="عدد المسارات" unit="" min={500} max={5000} step={500} value={paths} onChange={setPaths} />
          <Slider label="هدف رأس المال" unit="%" min={110} max={400} step={10} value={targetMult} onChange={setTargetMult} />
          <div className="field-label" style={{ margin: "6px 0 8px" }}>طريقة العيّنة</div>
          <Segmented<MCMethod>
            value={method}
            onChange={setMethod}
            options={[
              { value: "block", label: "كتل (Block)" },
              { value: "iid", label: "مستقلّ" },
              { value: "normal", label: "طبيعي" },
            ]}
          />
          <div className="muted" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.8 }}>
            «الكتل» تحافظ على تجمّع التذبذب والارتباط الزمني (الأقرب للواقع).
          </div>
        </Card>

        <div style={{ gridColumn: "span 2" }}>
          <Card title="مروحة المسارات المستقبلية" icon={<Sigma size={15} />}>
            <FanChart bands={mc.bands} samplePaths={mc.samplePaths} initial={capital} height={300} />
            <div className="row" style={{ gap: 18, marginTop: 8, justifyContent: "center", flexWrap: "wrap", fontSize: 12 }}>
              <Legend color={theme.goldBright} text="الوسيط (p50)" />
              <Legend color="rgba(212,175,55,0.4)" text="50% الوسطى (p25–p75)" />
              <Legend color="rgba(212,175,55,0.18)" text="90% (p5–p95)" />
            </div>
          </Card>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginTop: 18 }}>
        <Stat label="احتمال بلوغ الهدف" value={fmtPct(mc.probTarget, 0)} gold foot={`${fmtCompact(capital * (targetMult / 100))} خلال ${months} شهر`} />
        <Stat label="احتمال الخسارة" value={fmtPct(mc.probLoss, 0)} tone={mc.probLoss > 0.5 ? "neg" : undefined} foot="أقلّ من رأس المال" />
        <Stat label="احتمال الإفلاس" value={fmtPct(mc.probRuin, 1)} tone="neg" foot="سحب ≥ 50%" />
        <Stat label="العائد السنوي الوسيط" value={fmtPct(mc.medianCAGR, 1)} tone={mc.medianCAGR >= 0 ? "pos" : "neg"} />
      </div>

      <div className="grid cols-2" style={{ gap: 18, marginTop: 18 }}>
        <Card title="توزيع النتيجة النهائية" icon={<Sigma size={15} />}>
          <ul className="list-clean">
            <Row label="متفائل (p95)" value={fmtCompact(mc.terminal.p95)} tone="pos" />
            <Row label="جيّد (p75)" value={fmtCompact(mc.terminal.p75)} />
            <Row label="الوسيط (p50)" value={fmtCompact(mc.terminal.p50)} gold />
            <Row label="ضعيف (p25)" value={fmtCompact(mc.terminal.p25)} />
            <Row label="متشائم (p5)" value={fmtCompact(mc.terminal.p5)} tone="neg" />
          </ul>
        </Card>
        <Card title="مخاطر الذيل (Tail Risk)" icon={<TrendingDown size={15} />}>
          <ul className="list-clean">
            <Row label="VaR 95% (الخسارة المحتملة)" value={fmtPct(mc.var95, 1)} tone="neg" />
            <Row label="CVaR 95% (الخسارة في الذيل)" value={fmtPct(mc.cvar95, 1)} tone="neg" />
            <Row label="أقصى تراجع وسيط" value={fmtPct(mc.medianMaxDrawdown, 1)} tone="neg" />
          </ul>
          <div className="note" style={{ marginTop: 14, fontSize: 12.5 }}>
            CVaR يقيس متوسط الخسارة في أسوأ 5% من السيناريوهات — مقياس الكارثة الحقيقي الذي يتجاهله
            شارب.
          </div>
        </Card>
      </div>
    </>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <span className="row" style={{ gap: 6 }}>
      <span style={{ width: 16, height: 10, borderRadius: 3, background: color }} /> {text}
    </span>
  );
}

function Row({ label, value, tone, gold }: { label: string; value: string; tone?: "pos" | "neg"; gold?: boolean }) {
  return (
    <li>
      <span className="muted">{label}</span>
      <span className={`kpi ${tone ?? ""}`} style={{ fontWeight: 700, color: gold ? theme.goldBright : undefined }}>{value}</span>
    </li>
  );
}
