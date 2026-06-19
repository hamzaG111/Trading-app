import { useState } from "react";
import { Database, Plug, Settings as Cog, Upload, Wallet } from "lucide-react";
import { useApp } from "@/state/AppContext";
import { parseCsv } from "@/engine/data";
import { Card } from "@/components/ui";
import { fmtCurrency, fmtNum } from "@/lib/format";

export default function Settings() {
  const { capital, setCapital } = useApp();
  const [imported, setImported] = useState<{
    rows: number;
    first: string;
    last: string;
    lastPrice: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const series = parseCsv(String(reader.result));
        if (series.length < 2) {
          setImportError("لم أتمكّن من قراءة شموع كافية. تأكّد من وجود أعمدة date/close.");
          setImported(null);
          return;
        }
        const fmt = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
        setImported({
          rows: series.length,
          first: fmt(series[0].time),
          last: fmt(series[series.length - 1].time),
          lastPrice: series[series.length - 1].close,
        });
        setImportError(null);
      } catch {
        setImportError("خطأ في تحليل الملف.");
        setImported(null);
      }
    };
    reader.readAsText(file);
  }

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">الإعدادات</h1>
        <p className="page-sub">رأس المال، استيراد بيانات حقيقية، وخارطة الطريق نحو الأتمتة والربط مع شركات التمويل.</p>
      </div>

      <div className="grid cols-2" style={{ gap: 18 }}>
        <Card title="رأس المال" icon={<Wallet size={15} />}>
          <p className="learn-p">يُستخدم في كل الإسقاطات والاختبارات عبر التطبيق.</p>
          <div className="field">
            <div className="field-label">
              <span>رأس المال الحالي</span>
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
          <div className="row" style={{ gap: 8 }}>
            {[5, 1000, 10_000, 100_000].map((v) => (
              <button key={v} className="btn" style={{ padding: "7px 12px" }} onClick={() => setCapital(v)}>
                {fmtCurrency(v)}
              </button>
            ))}
          </div>
        </Card>

        <Card title="استيراد بيانات حقيقية (CSV)" icon={<Database size={15} />}>
          <p className="learn-p">
            البيانات الافتراضية تركيبية للعرض فقط. استورد ملف CSV حقيقياً (أعمدة:
            date, open, high, low, close, volume) لاختبار الاستراتيجيات على سوق فعلي.
          </p>
          <label className="btn btn-primary" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <Upload size={16} /> اختر ملف CSV
            <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: "none" }} />
          </label>
          {imported && (
            <div className="note" style={{ marginTop: 14 }}>
              ✓ تم تحميل <b className="kpi">{fmtNum(imported.rows, 0)}</b> شمعة · من{" "}
              <span className="kpi">{imported.first}</span> إلى{" "}
              <span className="kpi">{imported.last}</span> · آخر سعر{" "}
              <span className="kpi">{fmtNum(imported.lastPrice, 2)}</span>
            </div>
          )}
          {importError && (
            <div className="disclaimer" style={{ marginTop: 14 }}>
              {importError}
            </div>
          )}
        </Card>
      </div>

      <Card title="الأتمتة والربط — خارطة الطريق" icon={<Plug size={15} />} style={{ marginTop: 18 }}>
        <p className="learn-p">
          محرّك AURUM «نقي»: يأخذ بيانات ويُخرج أوزاناً مستهدفة وحدود مخاطر. لتشغيله آلياً بدخل فعلي
          تُضاف طبقة تنفيذ (Execution Adapter) تترجم الأوزان إلى أوامر عبر واجهة وسيطك أو شركة
          التمويل. التسلسل الآمن والقانوني:
        </p>
        <div className="grid cols-3">
          {[
            { n: "1", t: "ورقي أولاً (Paper)", d: "شغّل النظام على حساب تجريبي شهوراً. لا مال حقيقي قبل إثبات الانضباط." },
            { n: "2", t: "ربط API", d: "اربط وسيطاً مرخّصاً أو حساب تمويل عبر مفاتيح API. لا تشارك مفاتيحك أبداً." },
            { n: "3", t: "إشراف لا تدخّل", d: "النظام ينفّذ بقواعد، وأنت تراقب وتُوقف عند الحاجة. «شبه سلبي» لا «سحري»." },
          ].map((s) => (
            <div key={s.n} className="card" style={{ padding: 16 }}>
              <div className="brand-mark" style={{ width: 30, height: 30, fontSize: 14, marginBottom: 10 }}>
                {s.n}
              </div>
              <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>{s.t}</h3>
              <p className="learn-p" style={{ margin: 0, fontSize: 12.5 }}>
                {s.d}
              </p>
            </div>
          ))}
        </div>
        <div className="divider" />
        <div className="row" style={{ gap: 10 }}>
          <Cog size={16} className="muted" />
          <span className="muted" style={{ fontSize: 13 }}>
            الإصدار {`0.1.0`} · أداة شخصية للبحث وإدارة المخاطر.
          </span>
        </div>
      </Card>

      <div className="disclaimer" style={{ marginTop: 18 }}>
        <b>إخلاء مسؤولية:</b> هذا التطبيق أداة تعليمية وبحثية لإدارة المخاطر، وليس نصيحة مالية ولا
        يَعِد بأرباح. التداول ينطوي على مخاطر خسارة حقيقية. لا توجد عوائد «مضمونة» أو «دخل سلبي بلا
        مخاطر». اختبر دائماً، خاطر بما تتحمّل خسارته، والتزم القوانين والضرائب في بلدك.
      </div>
    </>
  );
}
