import { useMemo, useState } from "react";
import { Atom, Layers3, ListFilter } from "lucide-react";
import { useApp } from "@/state/AppContext";
import { cachedCloses } from "@/engine/data";
import {
  computeFactors,
  factorPortfolio,
  DEFAULT_FACTOR_WEIGHTS,
  FACTOR_KEYS,
  FACTOR_LABELS,
  type FactorWeights,
} from "@/engine/factors";
import { Card, Slider } from "@/components/ui";
import { Heatmap, WeightBars } from "@/components/viz";
import { fmtNum } from "@/lib/format";
import { theme } from "@/theme";

export default function Research() {
  const { universe, symbols } = useApp();
  const [weights, setWeights] = useState<FactorWeights>({ ...DEFAULT_FACTOR_WEIGHTS });

  const { scores, portfolio } = useMemo(() => {
    const closes = symbols.map((s) => cachedCloses(universe[s]));
    const s = computeFactors(closes, symbols, weights);
    return { scores: s, portfolio: factorPortfolio(s) };
  }, [universe, symbols, weights]);

  const matrix = scores.map((s) => [s.momentum, s.trend, s.lowVol, s.reversal, s.quality]);
  const colLabels = FACTOR_KEYS.map((k) => FACTOR_LABELS[k].ar);
  const ranked = [...scores].sort((a, b) => b.composite - a.composite);

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">بحث العوامل (Factor Research)</h1>
        <p className="page-sub">
          العمود الفقري لعلم AQR ودِيمنشنال: فكّك كل أصل إلى تعرّضه لعوامل عائد موثّقة ومستمرة —
          الزخم، الاتجاه، التذبذب المنخفض، الارتداد، الجودة — ثم ادمجها في درجة مركّبة. كل الدرجات
          مُعيّرة عبر الأصول (z-score).
        </p>
      </div>

      <div className="grid cols-3" style={{ gap: 18 }}>
        <Card title="أوزان العوامل" icon={<ListFilter size={15} />}>
          {FACTOR_KEYS.map((k) => (
            <Slider
              key={k}
              label={FACTOR_LABELS[k].ar}
              min={0}
              max={2}
              step={0.25}
              value={weights[k]}
              onChange={(v) => setWeights((w) => ({ ...w, [k]: v }))}
            />
          ))}
          <button className="btn" style={{ width: "100%", marginTop: 6 }} onClick={() => setWeights({ ...DEFAULT_FACTOR_WEIGHTS })}>
            إعادة الضبط
          </button>
        </Card>

        <div style={{ gridColumn: "span 2" }}>
          <Card title="خريطة تعرّض الأصول للعوامل" icon={<Atom size={15} />}>
            <Heatmap matrix={matrix} rowLabels={symbols} colLabels={colLabels} format={(v) => fmtNum(v, 2)} />
            <div className="muted" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.8 }}>
              أخضر = تعرّض إيجابي للعامل، أحمر = سلبي. كل قيمة هي عدد الانحرافات المعيارية عن متوسط
              الأصول (z-score).
            </div>
          </Card>
        </div>
      </div>

      <div className="grid cols-2" style={{ gap: 18, marginTop: 18 }}>
        <Card title="الترتيب حسب الدرجة المركّبة" icon={<Layers3 size={15} />}>
          <WeightBars items={ranked.map((s) => ({ label: s.symbol, value: s.composite }))} format={(v) => fmtNum(v, 2)} />
        </Card>
        <Card title="محفظة العوامل (طويل/قصير)" icon={<Layers3 size={15} />}>
          <WeightBars items={symbols.map((s) => ({ label: s, value: portfolio[s] }))} />
          <div className="note" style={{ marginTop: 14, fontSize: 12.5 }}>
            شراء الأعلى درجةً وبيع الأدنى — محفظة محايدة للسوق تلتقط علاوة العوامل. هذا جوهر صناديق
            مثل AQR.
          </div>
        </Card>
      </div>

      <Card title="شرح العوامل" icon={<Atom size={15} />} style={{ marginTop: 18 }}>
        <div className="grid cols-3">
          {FACTOR_KEYS.map((k) => (
            <div key={k} className="card" style={{ padding: 14 }}>
              <div style={{ color: theme.goldBright, fontWeight: 700, marginBottom: 6 }}>{FACTOR_LABELS[k].ar}</div>
              <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>{FACTOR_LABELS[k].desc}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
