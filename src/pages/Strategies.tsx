import { useMemo } from "react";
import { Link } from "react-router-dom";
import { BookMarked } from "lucide-react";
import { useApp } from "@/state/AppContext";
import { runBacktest } from "@/engine/backtest";
import { defaultParams, STRATEGIES } from "@/engine/strategies";
import { RISK_PRESETS } from "@/engine/risk";
import { Card } from "@/components/ui";
import EquityChart from "@/components/EquityChart";
import { fmtNum, fmtPct, signClass } from "@/lib/format";
import { theme } from "@/theme";

const CATEGORY_AR: Record<string, string> = {
  trend: "تتبّع اتجاه",
  momentum: "زخم",
  "mean-reversion": "ارتداد للمتوسط",
  "risk-parity": "تكافؤ مخاطر",
  volatility: "تذبذب",
};

export default function Strategies() {
  const { universe, symbols, capital } = useApp();

  const results = useMemo(
    () =>
      STRATEGIES.map((s) => ({
        strategy: s,
        result: runBacktest(universe, symbols, {
          strategyId: s.id,
          params: defaultParams(s),
          risk: RISK_PRESETS.balanced.config,
          initialEquity: capital,
        }),
      })),
    [universe, symbols, capital],
  );

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">مكتبة الاستراتيجيات</h1>
        <p className="page-sub">
          خمس استراتيجيات حقيقية مبنية على أبحاث منشورة وعلى ما تفعله أكبر الصناديق فعلاً. كلٌّ منها
          يربح في بيئة ويخسر في أخرى — وهذا بالضبط سبب دمجها معاً في محفظة واحدة (Ensemble) في
          المختبر. الأرقام نتيجة اختبار على بيانات توضيحية بإعداد مخاطر «متوازن».
        </p>
      </div>

      <div className="grid" style={{ gap: 18 }}>
        {results.map(({ strategy: s, result: r }) => (
          <Card key={s.id} gold>
            <div className="grid cols-3" style={{ gap: 20, alignItems: "center" }}>
              <div style={{ gridColumn: "span 2" }}>
                <div className="row" style={{ gap: 8, marginBottom: 10 }}>
                  <span className="tag">{CATEGORY_AR[s.category] ?? s.category}</span>
                  <span className="tag muted">
                    <BookMarked size={12} /> {s.inspiration}
                  </span>
                </div>
                <h3 style={{ margin: "0 0 6px", fontSize: 19 }}>{s.nameAr}</h3>
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
                  {s.name}
                </div>
                <p className="learn-p" style={{ marginBottom: 14 }}>
                  {s.description}
                </p>
                <div className="row" style={{ gap: 18 }}>
                  <Metric label="العائد السنوي" value={fmtPct(r.metrics.cagr, 1)} tone={signClass(r.metrics.cagr)} />
                  <Metric label="شارب" value={fmtNum(r.metrics.sharpe, 2)} />
                  <Metric label="سورتينو" value={fmtNum(r.metrics.sortino, 2)} />
                  <Metric label="أقصى تراجع" value={fmtPct(r.metrics.maxDrawdown, 1)} tone="neg" />
                  <Metric label="عامل الربح" value={fmtNum(r.metrics.profitFactor, 2)} />
                </div>
                <div className="row" style={{ gap: 8, marginTop: 14 }}>
                  {s.params.map((p) => (
                    <span key={p.key} className="tag muted">
                      {p.label}: {p.default}
                      {p.unit ? ` ${p.unit}` : ""}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <EquityChart
                  data={r.equity}
                  height={170}
                  line
                  color={r.metrics.cagr >= 0 ? theme.gold : theme.red}
                />
                <Link to="/lab" className="btn" style={{ width: "100%", textAlign: "center", marginTop: 10 }}>
                  اختبرها في المختبر ←
                </Link>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11.5, marginBottom: 3 }}>
        {label}
      </div>
      <div className={`kpi ${tone ?? ""}`} style={{ fontSize: 17, fontWeight: 700 }}>
        {value}
      </div>
    </div>
  );
}
