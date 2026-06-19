import { useMemo } from "react";
import { Activity, Compass, Radar, Waves } from "lucide-react";
import { useApp } from "@/state/AppContext";
import { cachedCloses } from "@/engine/data";
import { aggregateRegime, analyzeRegime } from "@/engine/regime";
import { STRATEGY_MAP } from "@/engine/strategies";
import { Card, Stat } from "@/components/ui";
import { WeightBars } from "@/components/viz";
import { fmtNum, fmtPct } from "@/lib/format";
import { theme } from "@/theme";

const REGIME_COLOR: Record<string, string> = {
  trending: theme.green,
  "mean-reverting": theme.blue,
  choppy: theme.gold,
  crisis: theme.red,
};

export default function Regime() {
  const { universe, symbols } = useApp();

  const { agg, perAsset } = useMemo(() => {
    const closes = symbols.map((s) => cachedCloses(universe[s]));
    return {
      agg: aggregateRegime(closes),
      perAsset: symbols.map((s, i) => ({ symbol: s, r: analyzeRegime(closes[i]) })),
    };
  }, [universe, symbols]);

  const color = REGIME_COLOR[agg.regimeKey];
  const recItems = Object.entries(agg.recommended)
    .map(([id, w]) => ({ label: STRATEGY_MAP[id]?.nameAr ?? id, value: w }))
    .sort((a, b) => b.value - a.value);

  // Hurst gauge position (0..1).
  const hurstPct = Math.round(agg.hurst * 100);

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">كاشف حالة السوق (Regime)</h1>
        <p className="page-sub">
          لا استراتيجية تربح في كل الأحوال. نقيس «حالة» السوق علمياً — أُسّ هيرست (الذاكرة)، حالة
          التذبذب، وقوّة الاتجاه — ثم نوصي بمزيج الاستراتيجيات الذي يناسب هذه الحالة. هذا هو التكيّف
          الذي يميّز الأنظمة العظيمة.
        </p>
      </div>

      <Card gold style={{ marginBottom: 18 }}>
        <div className="row spread" style={{ flexWrap: "wrap", gap: 16 }}>
          <div className="row" style={{ gap: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, display: "grid", placeItems: "center", background: `${color}22`, border: `1px solid ${color}55` }}>
              <Radar size={26} color={color} />
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12.5 }}>الحالة الحالية للسوق</div>
              <div style={{ fontSize: 26, fontWeight: 800, color }}>{agg.regimeAr}</div>
            </div>
          </div>
          <div style={{ maxWidth: 460 }} className="muted">{agg.descAr}</div>
        </div>
      </Card>

      <div className="grid cols-4" style={{ marginBottom: 18 }}>
        <Stat label="أُسّ هيرست" value={fmtNum(agg.hurst, 2)} gold foot={agg.hurst > 0.55 ? "ذاكرة/اتجاه" : agg.hurst < 0.45 ? "ارتداد" : "عشوائي"} />
        <Stat label="التذبذب السنوي" value={fmtPct(agg.annualVol, 1)} foot={agg.volState === "high" ? "مرتفع" : agg.volState === "low" ? "منخفض" : "طبيعي"} tone={agg.volState === "high" ? "neg" : undefined} />
        <Stat label="قوّة الاتجاه" value={fmtNum(agg.trendScore, 2)} tone={agg.trendScore >= 0 ? "pos" : "neg"} foot="−1 هبوط · +1 صعود" />
        <Stat label="حالة التذبذب" value={agg.volState === "high" ? "مرتفعة" : agg.volState === "low" ? "منخفضة" : "طبيعية"} />
      </div>

      <div className="grid cols-2" style={{ gap: 18 }}>
        <Card title="مقياس هيرست (الذاكرة)" icon={<Waves size={15} />}>
          <div style={{ position: "relative", height: 14, borderRadius: 8, background: "linear-gradient(90deg, #5b8def, #8a8a8a, #3fbf7f)", marginTop: 10 }}>
            <div style={{ position: "absolute", insetInlineStart: `${hurstPct}%`, top: -6, transform: "translateX(-50%)", width: 4, height: 26, background: "#fff", borderRadius: 3, boxShadow: "0 0 8px rgba(0,0,0,0.6)" }} />
          </div>
          <div className="row spread" style={{ fontSize: 11.5, marginTop: 8 }} >
            <span style={{ color: theme.blue }}>0.0 ارتداد للمتوسط</span>
            <span className="muted">0.5 عشوائي</span>
            <span style={{ color: theme.green }}>1.0 اتجاه قوي</span>
          </div>
          <div className="divider" />
          <p className="learn-p" style={{ margin: 0, fontSize: 13 }}>
            أُسّ هيرست يقيس «ذاكرة» السلسلة الزمنية: فوق 0.5 تعني أن الاتجاهات تستمر (مناسب لتتبّع
            الاتجاه)، وتحت 0.5 تعني أن الأسعار ترتدّ (مناسب للارتداد للمتوسط).
          </p>
        </Card>

        <Card title="المزيج الموصى به لهذه الحالة" icon={<Compass size={15} />}>
          <WeightBars items={recItems} />
          <div className="note" style={{ marginTop: 14, fontSize: 12.5 }}>
            توصية آلية مبنية على الحالة المكتشفة. يمكنك تطبيقها يدوياً في مختبر الاختبار أو الطيار
            الآلي بضبط أوزان المحفظة المدمجة.
          </div>
        </Card>
      </div>

      <Card title="حالة كل سوق على حدة" icon={<Activity size={15} />} style={{ marginTop: 18 }}>
        <div className="ltr" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ color: theme.textMuted }}>
                <th style={cell}>Market</th>
                <th style={cell}>Regime</th>
                <th style={cell}>Hurst</th>
                <th style={cell}>Vol</th>
                <th style={cell}>Trend</th>
              </tr>
            </thead>
            <tbody>
              {perAsset.map(({ symbol, r }) => (
                <tr key={symbol} style={{ borderTop: "1px solid var(--border-soft)" }}>
                  <td style={{ ...cell, fontWeight: 700 }}>{symbol}</td>
                  <td style={cell}>
                    <span className="tag" style={{ color: REGIME_COLOR[r.regimeKey], borderColor: `${REGIME_COLOR[r.regimeKey]}55` }}>{r.regimeAr}</span>
                  </td>
                  <td style={cell} className="kpi">{fmtNum(r.hurst, 2)}</td>
                  <td style={cell} className="kpi">{fmtPct(r.annualVol, 0)}</td>
                  <td style={{ ...cell }} className={`kpi ${r.trendScore >= 0 ? "pos" : "neg"}`}>{fmtNum(r.trendScore, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

const cell: React.CSSProperties = { padding: "10px 8px", textAlign: "left" };
