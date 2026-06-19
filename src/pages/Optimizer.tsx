import { useMemo, useState } from "react";
import { Boxes, GitBranch, Grid3x3, Scale } from "lucide-react";
import { useApp } from "@/state/AppContext";
import { cachedCloses } from "@/engine/data";
import { covarianceMatrix, optimizeUniverse, returnsMatrix, type AllocatorResult } from "@/engine/optimize";
import { shrinkCovariance } from "@/engine/linalg";
import { Card, Slider, Stat } from "@/components/ui";
import { FrontierChart, Heatmap, WeightBars, type Marker } from "@/components/viz";
import { fmtNum, fmtPct } from "@/lib/format";
import { theme } from "@/theme";

const COLORS: Record<string, string> = {
  equal: "#8a8a8a",
  "inv-var": "#5b8def",
  erc: theme.gold,
  "min-var": "#3fbf7f",
  "max-sharpe": theme.goldBright,
  hrp: "#c879e8",
};

export default function Optimizer() {
  const { universe, symbols } = useApp();
  const [lookback, setLookback] = useState(1000);
  const [shrink, setShrink] = useState(25);
  const [selected, setSelected] = useState("hrp");

  const data = useMemo(() => {
    const closes = symbols.map((s) => {
      const c = cachedCloses(universe[s]);
      return c.slice(Math.max(0, c.length - lookback - 1));
    });
    const rets = returnsMatrix(closes);
    const cov = shrinkCovariance(covarianceMatrix(rets), shrink / 100);
    const mu = rets.map((r) => r.reduce((a, b) => a + b, 0) / (r.length || 1));
    return optimizeUniverse(cov, mu);
  }, [universe, symbols, lookback, shrink]);

  const sel = data.allocators.find((a) => a.id === selected) ?? data.allocators[0];

  const markers: Marker[] = data.allocators.map((a) => ({
    vol: a.vol,
    ret: a.ret,
    label: a.nameAr,
    color: COLORS[a.id] ?? theme.gold,
  }));

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">مُحسّن المحافظ (Portfolio Optimizer)</h1>
        <p className="page-sub">
          نفس العلم الذي يدير تريليونات: من ماركويتز والحدّ الكفء، إلى تكافؤ المخاطر الحقيقي (ERC)،
          إلى <b>HRP</b> — طريقة التجميع الهرمي بالتعلّم الآلي (López de Prado) التي تتفوّق خارج
          العيّنة لأنها لا تعكس مصفوفة تغاير صاخبة. قارِن المُخصِّصات على نفس البيانات.
        </p>
      </div>

      <div className="grid cols-3" style={{ gap: 18 }}>
        <Card title="المعطيات" icon={<Scale size={15} />}>
          <Slider label="نافذة التقدير" unit="يوم" min={252} max={1400} step={42} value={lookback} onChange={setLookback} />
          <Slider label="انكماش التغاير (Shrinkage)" unit="%" min={0} max={80} step={5} value={shrink} onChange={setShrink} />
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.8, marginTop: 6 }}>
            الانكماش يقلّل ضوضاء التقدير — يدفع المصفوفة نحو هدف ثابت الارتباط، فتصبح الأوزان أكثر
            استقراراً خارج العيّنة.
          </div>
          <div className="divider" />
          <div className="field-label" style={{ marginBottom: 9 }}>المُخصِّص المعروض</div>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {data.allocators.map((a) => (
              <option key={a.id} value={a.id}>{a.nameAr} — {a.name}</option>
            ))}
          </select>
          <div className="note" style={{ marginTop: 14, fontSize: 12.5 }}>
            {sel.blurb}
          </div>
        </Card>

        <div style={{ gridColumn: "span 2" }}>
          <Card title="الحدّ الكفء ومواقع المُخصِّصات" icon={<GitBranch size={15} />}>
            <FrontierChart frontier={data.frontier} markers={markers} height={320} />
            <div className="row" style={{ gap: 14, marginTop: 8, flexWrap: "wrap" }}>
              {data.allocators.map((a) => (
                <span key={a.id} className="row" style={{ gap: 6, fontSize: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[a.id] }} />
                  {a.nameAr}
                </span>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginTop: 18 }}>
        <Stat label="العائد المتوقّع" value={fmtPct(sel.ret, 1)} gold foot={sel.nameAr} />
        <Stat label="التذبذب" value={fmtPct(sel.vol, 1)} />
        <Stat label="نسبة شارب" value={fmtNum(sel.sharpe, 2)} tone="pos" />
        <Stat label="نسبة التنويع" value={fmtNum(sel.diversification, 2)} foot="أعلى = أفضل" />
      </div>

      <div className="grid cols-2" style={{ gap: 18, marginTop: 18 }}>
        <Card title={`أوزان ${sel.nameAr}`} icon={<Boxes size={15} />}>
          <WeightBars items={symbols.map((s, i) => ({ label: s, value: sel.weights[i] }))} />
          <div className="divider" />
          <div className="card-title" style={{ marginBottom: 12 }}>مساهمة المخاطرة لكل أصل</div>
          <WeightBars items={symbols.map((s, i) => ({ label: s, value: sel.riskContrib[i] }))} />
        </Card>

        <Card title="مصفوفة الارتباط" icon={<Grid3x3 size={15} />}>
          <Heatmap matrix={data.corr} rowLabels={symbols} colLabels={symbols} />
          <div className="muted" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.8 }}>
            الأخضر = ارتباط موجب، الأحمر = سالب. التنويع الحقيقي يأتي من أصول منخفضة/سالبة الارتباط —
            «الغداء المجاني الوحيد» في الاستثمار.
          </div>
        </Card>
      </div>

      <Card title="مقارنة كل المُخصِّصات" icon={<Scale size={15} />} style={{ marginTop: 18 }}>
        <div className="ltr" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ color: theme.textMuted }}>
                <th style={cell}>Allocator</th>
                <th style={cell}>Return</th>
                <th style={cell}>Vol</th>
                <th style={cell}>Sharpe</th>
                <th style={cell}>Diversification</th>
              </tr>
            </thead>
            <tbody>
              {data.allocators.map((a: AllocatorResult) => (
                <tr key={a.id} style={{ borderTop: "1px solid var(--border-soft)", cursor: "pointer", background: a.id === selected ? "rgba(212,175,55,0.06)" : "transparent" }} onClick={() => setSelected(a.id)}>
                  <td style={{ ...cell, fontWeight: 700 }}>
                    <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: COLORS[a.id], marginInlineEnd: 8 }} />
                    {a.nameAr}
                  </td>
                  <td style={cell} className="kpi">{fmtPct(a.ret, 1)}</td>
                  <td style={cell} className="kpi">{fmtPct(a.vol, 1)}</td>
                  <td style={cell} className="kpi">{fmtNum(a.sharpe, 2)}</td>
                  <td style={cell} className="kpi">{fmtNum(a.diversification, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="note" style={{ marginTop: 18 }}>
        العوائد المتوقّعة مقدّرة من المتوسط التاريخي — أكثر إحصاء غير موثوق. لهذا تتفوّق طرق المخاطرة
        (ERC، HRP، أدنى تباين) التي لا تعتمد على توقّع العائد. الأرقام للبحث لا للوعد.
      </div>
    </>
  );
}

const cell: React.CSSProperties = { padding: "10px 8px", textAlign: "left" };
