import { useMemo, useState } from "react";
import { Calculator, Sparkles, TriangleAlert } from "lucide-react";
import { Card, Slider, Stat } from "@/components/ui";
import EquityChart from "@/components/EquityChart";
import { fmtCompact, fmtCurrency, fmtNum, fmtPct } from "@/lib/format";

const SECONDS_PER_MONTH = 2_629_746;

/** Required constant return per period to grow `from` into `to` over `periods`. */
function requiredRate(from: number, to: number, periods: number): number {
  if (from <= 0 || periods <= 0) return Infinity;
  return Math.pow(to / from, 1 / periods) - 1;
}

/** Periods needed to grow `from` into `to` at `rate` per period. */
function periodsNeeded(from: number, to: number, rate: number): number {
  if (from <= 0 || rate <= 0 || to <= from) return Infinity;
  return Math.log(to / from) / Math.log(1 + rate);
}

export default function Reality() {
  const [capital, setCapital] = useState(10_000);
  const [annual, setAnnual] = useState(25); // %
  const [years, setYears] = useState(10);

  const monthlyRate = Math.pow(1 + annual / 100, 1 / 12) - 1;

  const projection = useMemo(() => {
    const months = years * 12;
    const base = Math.floor(Date.UTC(2025, 0, 1) / 1000);
    return Array.from({ length: months + 1 }, (_, i) => ({
      time: base + i * SECONDS_PER_MONTH,
      value: capital * Math.pow(1 + monthlyRate, i),
    }));
  }, [capital, monthlyRate, years]);

  const finalValue = capital * Math.pow(1 + annual / 100, years);

  // The user's stated dreams, measured against reality.
  const dailyFor5toM = requiredRate(5, 1_000_000, 21); // ~21 trading days in a month
  const annualFor1B = requiredRate(capital, 1_000_000_000, 1);
  const yearsToBillionMedallion = periodsNeeded(capital, 1_000_000_000, 0.39);
  const yearsToBillionBuffett = periodsNeeded(capital, 1_000_000_000, 0.2);
  const yearsToMillion = periodsNeeded(capital, 1_000_000, annual / 100);

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">حاسبة الواقع — رياضيات الثروة</h1>
        <p className="page-sub">
          هنا لا أبيعك حلماً، بل أُريك الحقيقة بالأرقام. التراكم (Compounding) هو الطريق الحقيقي
          للثروة — أعظم قوة في المال — لكنه يحتاج وقتاً وانضباطاً. والأرقام المستحيلة سأُريك لماذا
          هي مستحيلة، حتى لا يخدعك أحد.
        </p>
      </div>

      <div className="grid cols-3" style={{ gap: 18 }}>
        <Card title="افتراضاتك" icon={<Calculator size={15} />}>
          <div className="field">
            <div className="field-label">
              <span>رأس المال الابتدائي</span>
              <b>{fmtCurrency(capital)}</b>
            </div>
            <input
              type="number"
              value={capital}
              min={1}
              step={1000}
              onChange={(e) => setCapital(Math.max(1, Number(e.target.value)))}
            />
          </div>
          <Slider
            label="العائد السنوي المتوقّع"
            unit="%"
            min={1}
            max={66}
            step={1}
            value={annual}
            onChange={setAnnual}
          />
          <Slider label="المدّة" unit="سنة" min={1} max={40} step={1} value={years} onChange={setYears} />

          <div className="divider" />
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
            مرجعيات واقعية (اضغط للتطبيق):
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" style={{ padding: "7px 12px" }} onClick={() => setAnnual(8)}>
              8% · مؤشر السوق
            </button>
            <button className="btn" style={{ padding: "7px 12px" }} onClick={() => setAnnual(20)}>
              20% · بافيت
            </button>
            <button className="btn" style={{ padding: "7px 12px" }} onClick={() => setAnnual(39)}>
              39% · Medallion
            </button>
          </div>
          <div className="note" style={{ marginTop: 14 }}>
            39% سنوياً (صافي) هو أعلى عائد مستدام في تاريخ صناديق التحوّط (صندوق Medallion). أيّ رقم
            فوق ذلك بثبات = إشارة احتيال.
          </div>
        </Card>

        <div style={{ gridColumn: "span 2" }}>
          <Card title="نموّ رأس المال بالتراكم" icon={<Sparkles size={15} />}>
            <div className="row spread" style={{ marginBottom: 8 }}>
              <div>
                <div className="kpi" style={{ fontSize: 30, fontWeight: 700 }}>
                  {fmtCompact(finalValue)}
                </div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  بعد {years} سنة عند {annual}% سنوياً
                </div>
              </div>
              <span className="tag">
                ×{fmtNum(finalValue / capital, 1)}
              </span>
            </div>
            <EquityChart data={projection} height={250} />
          </Card>

          <div className="grid cols-3" style={{ marginTop: 18 }}>
            <Stat
              label="سنوات للوصول لمليون $"
              value={Number.isFinite(yearsToMillion) ? `${fmtNum(yearsToMillion, 1)} سنة` : "—"}
              gold
              foot={`عند ${annual}% سنوياً`}
            />
            <Stat
              label="العائد الشهري المكافئ"
              value={fmtPct(monthlyRate, 2)}
              foot="مركّب شهرياً"
            />
            <Stat
              label="إجمالي الربح"
              value={fmtPct(finalValue / capital - 1, 0)}
              tone="pos"
              foot={`على ${years} سنة`}
            />
          </div>
        </div>
      </div>

      {/* ---- Fantasy vs reality ---- */}
      <Card title="الأحلام مقابل الرياضيات" icon={<TriangleAlert size={15} />} style={{ marginTop: 18 }}>
        <div className="grid cols-3">
          <div className="disclaimer">
            <b>5$ → مليون $ في شهر</b>
            <div className="divider" style={{ margin: "10px 0" }} />
            يتطلّب عائداً يومياً ثابتاً قدره{" "}
            <b className="kpi">{fmtPct(dailyFor5toM, 0)}</b> كل يوم لمدة شهر. لا أحد ولا أيّ خوارزمية
            في التاريخ حقّقت جزءاً بسيطاً من هذا. <b>مستحيل رياضياً.</b>
          </div>
          <div className="disclaimer">
            <b>مليار $ في سنة</b>
            <div className="divider" style={{ margin: "10px 0" }} />
            من {fmtCompact(capital)} يتطلّب{" "}
            <b className="kpi">{fmtPct(annualFor1B, 0)}</b> في سنة واحدة. للمقارنة: أفضل عائد سنوي
            في التاريخ كان 39%. <b>مستحيل.</b>
          </div>
          <div className="note">
            <b>الطريق الحقيقي للمليار</b>
            <div className="divider" style={{ margin: "10px 0" }} />
            حتى بعائد Medallion الأسطوري (39%)، تحويل {fmtCompact(capital)} إلى مليار يحتاج{" "}
            <b className="kpi">~{fmtNum(yearsToBillionMedallion, 0)}</b> سنة. وبعائد بافيت (20%):{" "}
            <b className="kpi">~{fmtNum(yearsToBillionBuffett, 0)}</b> سنة. الثروة سباق طويل، لا
            قفزة.
          </div>
        </div>
        <div className="divider" />
        <p className="learn-p" style={{ margin: 0 }}>
          <b style={{ color: "var(--gold-bright)" }}>الخلاصة:</b> هذا التطبيق لن يجعلك مليارديراً في
          سنة — لأن لا شيء يستطيع ذلك دون احتيال أو حظّ نادر يضيع غالباً. لكنه يمنحك ما يملكه
          المحترفون فعلاً: استراتيجيات مثبتة، إدارة مخاطر تَحفظ رأس مالك، واحترام قواعد التمويل —
          وهي الأدوات التي تجعل التراكم ممكناً عبر السنين. هذا هو الثراء الحقيقي والمحترم.
        </p>
      </Card>
    </>
  );
}
