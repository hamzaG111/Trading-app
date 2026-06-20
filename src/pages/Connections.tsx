import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Cpu, Link2, Plug, Server, ShieldAlert, Terminal, XCircle } from "lucide-react";
import { api, type Connection } from "@/lib/api";
import { Card, Stat } from "@/components/ui";
import { fmtCurrency } from "@/lib/format";
import { theme } from "@/theme";

export default function Connections() {
  const [conn, setConn] = useState<Connection | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setConn(await api.connection());
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    timer.current = window.setInterval(refresh, 3000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [refresh]);

  async function connect(kind: "paper" | "mt5") {
    setBusy(true);
    setError(null);
    try {
      await api.connect(kind);
      await refresh();
    } catch {
      setError(
        kind === "mt5"
          ? "تعذّر الوصول لجسر MT5. شغّل الجسر أولاً (انظر خطوات الإعداد أدناه)، ثم أعد المحاولة."
          : "تعذّر التبديل.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (online === false) return <OfflinePanel />;

  const kind = conn?.brokerKind ?? "paper";
  const bridge = conn?.bridge ?? null;
  const isMt5 = kind === "mt5";
  const live = bridge?.mode === "live";

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">الربط (Connections)</h1>
        <p className="page-sub">
          اربط النظام بحساب MetaTrader 5 الحقيقي (FundedNext وأمثالها) عبر جسر يعمل على جهازك. يبدأ
          كل شيء في المحاكاة الآمنة، وتنتقل للحساب الحقيقي حين تثق — والمفاتيح تبقى عندك ولا تُرفع
          أبداً.
        </p>
      </div>

      {/* Current backend */}
      <Card gold style={{ marginBottom: 18 }}>
        <div className="row spread" style={{ flexWrap: "wrap", gap: 16 }}>
          <div className="row" style={{ gap: 16 }}>
            <div style={{ width: 54, height: 54, borderRadius: 16, display: "grid", placeItems: "center", background: isMt5 ? "rgba(63,191,127,0.12)" : "rgba(212,175,55,0.1)", border: `1px solid ${isMt5 ? "rgba(63,191,127,0.4)" : theme.border}` }}>
              {isMt5 ? <Link2 size={24} color={theme.green} /> : <Cpu size={24} color={theme.gold} />}
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12.5 }}>وجهة التنفيذ الحالية</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                {isMt5 ? (
                  <>
                    MetaTrader 5{" "}
                    <span className={live ? "pos" : ""} style={{ fontSize: 15 }}>
                      ({live ? "حساب حقيقي" : "محاكاة"})
                    </span>
                  </>
                ) : (
                  "محاكاة داخلية (Paper)"
                )}
              </div>
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            {!isMt5 ? (
              <button className="btn btn-primary" disabled={busy} onClick={() => connect("mt5")}>
                <Plug size={16} style={{ verticalAlign: -3 }} /> اتصل بحساب MT5
              </button>
            ) : (
              <button className="btn" disabled={busy} onClick={() => connect("paper")}>
                العودة للوضع الورقي
              </button>
            )}
          </div>
        </div>
      </Card>

      {error && (
        <div className="disclaimer" style={{ marginBottom: 18 }}>
          <ShieldAlert size={15} style={{ verticalAlign: -2 }} /> {error}
        </div>
      )}

      {/* MT5 account details when connected */}
      {isMt5 && bridge && (
        <div className="grid cols-4" style={{ marginBottom: 18 }}>
          <Stat label="حالة الجسر" value={<span className="pos">متصل ✓</span>} foot={bridge.mode === "live" ? "MT5 terminal" : "محاكاة"} />
          <Stat label="الخادم (Server)" value={bridge.account.server} />
          <Stat label="الرصيد" value={fmtCurrency(bridge.account.balance, 0)} gold foot={bridge.account.currency} />
          <Stat label="حقوق الملكية (Equity)" value={fmtCurrency(bridge.account.equity, 0)} tone={bridge.account.equity >= bridge.account.balance ? "pos" : "neg"} />
        </div>
      )}
      {isMt5 && !bridge && (
        <div className="disclaimer" style={{ marginBottom: 18 }}>
          <XCircle size={15} style={{ verticalAlign: -2 }} /> الجسر غير متصل. شغّله على جهازك (خطوات
          الإعداد أدناه) ثم اضغط «اتصل بحساب MT5».
        </div>
      )}

      {/* Symbols */}
      {conn && (
        <Card title="الرموز المتداولة" icon={<Server size={15} />} style={{ marginBottom: 18 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {conn.symbols.map((s) => (
              <span key={s} className="tag">{s}</span>
            ))}
          </div>
        </Card>
      )}

      {/* Setup guide */}
      <Card title="كيف تربط حساب FundedNext (MT5)" icon={<Terminal size={15} />}>
        <ol style={{ margin: 0, paddingInlineStart: 20, lineHeight: 2.1, fontSize: 14 }}>
          <li>ثبّت برنامج <b>MetaTrader 5</b> وسجّل دخول حسابك المموّل (FundedNext) عليه.</li>
          <li>ثبّت حزمة بايثون الرسمية: <code className="mono">pip install MetaTrader5</code> (ويندوز).</li>
          <li>
            أنشئ ملف <code className="mono">bridge/.env</code> بمعلومات حسابك (لا تُرفع أبداً):
            <pre className="mono" style={preStyle}>
{`MT5_LOGIN=رقم_حسابك
MT5_PASSWORD=كلمة_السر
MT5_SERVER=اسم_خادم_FundedNext
MT5_SYMBOLS=EURUSD,XAUUSD,US30,BTCUSD`}
            </pre>
          </li>
          <li>شغّل الجسر: <code className="mono">python bridge/mt5_bridge.py</code></li>
          <li>شغّل الخادم بوضع MT5: <code className="mono">BROKER=mt5 npm run server</code> ثم اضغط «اتصل بحساب MT5» هنا.</li>
        </ol>
        <div className="note" style={{ marginTop: 14 }}>
          <CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> <b>للتجربة الآن بلا MT5:</b> شغّل
          الجسر بوضع المحاكاة <code className="mono">MT5_MOCK=1 python bridge/mt5_bridge.py</code> —
          فترى كل المنظومة تعمل على حساب وهمي قبل أي مال حقيقي.
        </div>
        <div className="disclaimer" style={{ marginTop: 14 }}>
          <ShieldAlert size={14} style={{ verticalAlign: -2 }} /> <b>تنبيه:</b> التداول الحقيقي ينطوي
          على مخاطر خسارة فعلية. راجع سياسة شركة التمويل بخصوص التداول الآلي (EA/Algo)، وابدأ دائماً
          بأحجام صغيرة. النظام يحترم حدود الخسارة، لكن لا ضمان للربح.
        </div>
      </Card>
    </>
  );
}

const preStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border-soft)",
  borderRadius: 10,
  padding: "12px 14px",
  direction: "ltr",
  overflowX: "auto",
  fontSize: 12.5,
  marginTop: 8,
};

function OfflinePanel() {
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">الربط (Connections)</h1>
        <p className="page-sub">محرّك التشغيل غير متصل. شغّله ليبدأ الربط.</p>
      </div>
      <Card title="تشغيل المحرّك" icon={<Plug size={15} />}>
        <pre className="mono" style={preStyle}>{`npm run dev:all     # الويب + المحرّك معاً`}</pre>
      </Card>
    </>
  );
}
