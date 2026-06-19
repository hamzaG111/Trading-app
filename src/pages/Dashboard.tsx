import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowUpRight, Gauge, ShieldCheck, TrendingUp } from "lucide-react";
import { useApp } from "@/state/AppContext";
import { runBacktest, type EnsembleLeg } from "@/engine/backtest";
import { defaultParams, STRATEGIES, STRATEGY_MAP } from "@/engine/strategies";
import { RISK_PRESETS } from "@/engine/risk";
import { Card, Stat } from "@/components/ui";
import EquityChart from "@/components/EquityChart";
import Sparkline from "@/components/Sparkline";
import { fmtCompact, fmtNum, fmtPct, signClass } from "@/lib/format";
import { theme } from "@/theme";

/** The flagship multi-strategy book: uncorrelated sleeves netted into one curve. */
const FLAGSHIP: EnsembleLeg[] = [
  { strategyId: "risk-parity", params: defaultParams(STRATEGY_MAP["risk-parity"]), weight: 0.45 },
  { strategyId: "ts-momentum", params: defaultParams(STRATEGY_MAP["ts-momentum"]), weight: 0.3 },
  { strategyId: "xs-momentum", params: defaultParams(STRATEGY_MAP["xs-momentum"]), weight: 0.25 },
];

export default function Dashboard() {
  const { universe, symbols, capital } = useApp();

  const result = useMemo(
    () =>
      runBacktest(universe, symbols, {
        ensemble: FLAGSHIP,
        risk: RISK_PRESETS.balanced.config,
        initialEquity: capital,
      }),
    [universe, symbols, capital],
  );

  const m = result.metrics;
  const years = result.returns.length / 252;

  return (
    <>
      <div className="hero" style={{ marginBottom: 24 }}>
        <h1>
          <span className="grad">AURUM</span> — نظامك الكمّي الخاص
        </h1>
        <p>
          محرّك يجمع علم أعظم صناديق التحوّط: تتبّع الاتجاه (Man AHL، Winton)، تكافؤ المخاطر
          (Bridgewater)، والزخم (AQR) — فوقها طبقة إدارة مخاطر صارمة ومحرّك يحترم قواعد شركات
          التمويل. الأرقام أدناه ناتجة عن اختبار حقيقي على البيانات، بلا وعود وهمية.
        </p>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 18 }}>
        <Stat
          label="العائد الكلي (Backtest)"
          value={fmtPct(m.totalReturn, 1)}
          gold
          foot={`على مدى ~${fmtNum(years, 1)} سنة`}
        />
        <Stat
          label="العائد السنوي المركّب"
          value={fmtPct(m.cagr, 1)}
          tone={m.cagr >= 0 ? "pos" : "neg"}
          foot="CAGR"
        />
        <Stat label="نسبة شارب" value={fmtNum(m.sharpe, 2)} foot="عائد لكل وحدة مخاطرة" />
        <Stat
          label="أقصى تراجع"
          value={fmtPct(m.maxDrawdown, 1)}
          tone="neg"
          foot="Max Drawdown"
        />
      </div>

      <div className="grid cols-3" style={{ marginBottom: 18 }}>
        <div style={{ gridColumn: "span 2" }}>
          <Card title="منحنى رأس المال — المحفظة الرئيسية" icon={<Activity size={15} />}>
            <div className="row spread" style={{ marginBottom: 8 }}>
              <div className="kpi" style={{ fontSize: 28, fontWeight: 700 }}>
                {fmtCompact(result.equity[result.equity.length - 1]?.value ?? capital)}
              </div>
              <span className={`tag ${m.totalReturn >= 0 ? "" : "badge-fail"}`}>
                <ArrowUpRight size={13} /> {fmtPct(m.totalReturn, 1)}
              </span>
            </div>
            <EquityChart data={result.equity} height={300} />
          </Card>
        </div>
        <Card title="مؤشرات النظام" icon={<Gauge size={15} />}>
          <ul className="list-clean">
            <li>
              <span className="muted">نسبة سورتينو</span>
              <b className="kpi">{fmtNum(m.sortino, 2)}</b>
            </li>
            <li>
              <span className="muted">نسبة كالمار</span>
              <b className="kpi">{fmtNum(m.calmar, 2)}</b>
            </li>
            <li>
              <span className="muted">التذبذب السنوي</span>
              <b className="kpi">{fmtPct(m.annualVol, 1)}</b>
            </li>
            <li>
              <span className="muted">نسبة الأيام الرابحة</span>
              <b className="kpi">{fmtPct(m.winRate, 0)}</b>
            </li>
            <li>
              <span className="muted">عامل الربح</span>
              <b className="kpi">{fmtNum(m.profitFactor, 2)}</b>
            </li>
            <li>
              <span className="muted">متوسط التعرّض</span>
              <b className="kpi">{fmtNum(m.exposure, 2)}x</b>
            </li>
          </ul>
          <Link to="/lab" className="btn btn-primary" style={{ width: "100%", marginTop: 14, textAlign: "center" }}>
            افتح مختبر الاختبار
          </Link>
        </Card>
      </div>

      <Card title="الاستراتيجيات في النظام" icon={<TrendingUp size={15} />} style={{ marginBottom: 18 }}>
        <div className="grid cols-3">
          {STRATEGIES.map((s) => {
            const r = runBacktest(universe, symbols, {
              strategyId: s.id,
              params: defaultParams(s),
              risk: RISK_PRESETS.balanced.config,
              initialEquity: capital,
            });
            const eqVals = r.equity.map((e) => e.value);
            return (
              <Link
                key={s.id}
                to="/strategies"
                className="card"
                style={{ padding: 16, display: "block" }}
              >
                <div className="row spread" style={{ marginBottom: 6 }}>
                  <b style={{ fontSize: 14.5 }}>{s.nameAr}</b>
                  <span className={`kpi ${signClass(r.metrics.cagr)}`} style={{ fontWeight: 700 }}>
                    {fmtPct(r.metrics.cagr, 1)}
                  </span>
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginBottom: 10 }}>
                  {s.inspiration}
                </div>
                <Sparkline
                  values={eqVals}
                  width={260}
                  height={44}
                  color={r.metrics.cagr >= 0 ? theme.gold : theme.red}
                />
                <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                  شارب {fmtNum(r.metrics.sharpe, 2)} · تراجع {fmtPct(r.metrics.maxDrawdown, 0)}
                </div>
              </Link>
            );
          })}
        </div>
      </Card>

      <Card title="ميزة شركات التمويل" icon={<ShieldCheck size={15} />}>
        <p className="learn-p">
          النظام يفهم قواعد شركات مثل FundedNext (حدّ الخسارة اليومي، حدّ السحب الكلي، هدف الربح،
          الحدّ الأدنى لأيام التداول) ويحجّم المراكز تلقائياً حتى لا يكسر أي قاعدة. جرّب محاكاة
          تحدٍّ كامل وشاهد كيف يحترم النظام الحدود.
        </p>
        <Link to="/prop" className="btn">
          محاكاة تحدّي شركة تمويل ←
        </Link>
      </Card>
    </>
  );
}
