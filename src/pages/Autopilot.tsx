import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  CircleDot,
  Gauge,
  ListOrdered,
  Pause,
  Play,
  Power,
  RotateCcw,
  ShieldAlert,
  Terminal,
  Wallet,
} from "lucide-react";
import { api, type Meta, type Snapshot } from "@/lib/api";
import { Card, Segmented, Stat } from "@/components/ui";
import EquityChart from "@/components/EquityChart";
import { fmtCompact, fmtCurrency, fmtNum, fmtPct } from "@/lib/format";
import { theme } from "@/theme";

const SPEEDS = [
  { value: "3000", label: "هادئ" },
  { value: "1500", label: "عادي" },
  { value: "700", label: "سريع" },
];

export default function Autopilot() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api.status();
      setSnap(s);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    api.meta().then(setMeta).catch(() => undefined);
    refresh();
    timer.current = window.setInterval(refresh, 1500);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [refresh]);

  async function act(fn: () => Promise<Snapshot>) {
    setBusy(true);
    try {
      setSnap(await fn());
      setOnline(true);
    } catch {
      setOnline(false);
    } finally {
      setBusy(false);
    }
  }

  if (online === false) return <OfflinePanel />;
  if (!snap) return <Loading />;

  const running = snap.state === "running";
  const halted = snap.state === "halted";
  const ks = snap.config.killSwitch;
  const dailyBudget = snap.dayStartEquity * ks.maxDailyLoss;
  const dailyUsed = snap.todayPnl < 0 ? Math.min(1, -snap.todayPnl / (dailyBudget || 1)) : 0;
  const ddUsed = Math.min(1, Math.abs(snap.drawdown) / (ks.maxDrawdown || 1));

  return (
    <>
      <div className="page-head">
        <div className="row spread">
          <div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>
              الطيار الآلي (Autopilot)
            </h1>
            <p className="page-sub" style={{ marginBottom: 0 }}>
              النظام يتداول وحده بقواعد صارمة — يولّد الإشارات، يوازن المراكز، ويطبّق مفاتيح إيقاف
              طارئة. أنت تُشرف فقط.
            </p>
          </div>
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <span className="tag" style={{ fontSize: 12 }}>{snap.engineMode}</span>
            <StatusPill state={snap.state} mode={snap.mode} />
          </div>
        </div>
      </div>

      {halted && snap.haltReason && (
        <div className="disclaimer" style={{ marginBottom: 18 }}>
          <ShieldAlert size={15} style={{ verticalAlign: -2 }} /> <b>تم الإيقاف الطارئ:</b>{" "}
          {snap.haltReason} — راجع الإعدادات ثم اضغط «تشغيل» للاستئناف أو «تصفير» لحساب جديد.
        </div>
      )}

      {/* Controls */}
      <Card style={{ marginBottom: 18 }}>
        <div className="row spread" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 10 }}>
            {running ? (
              <button className="btn" disabled={busy} onClick={() => act(api.stop)}>
                <Pause size={16} style={{ verticalAlign: -3 }} /> إيقاف مؤقّت
              </button>
            ) : (
              <button className="btn btn-primary" disabled={busy} onClick={() => act(api.start)}>
                <Play size={16} style={{ verticalAlign: -3 }} /> تشغيل
              </button>
            )}
            <button
              className="btn"
              disabled={busy}
              onClick={() => {
                if (confirm("تصفير الحساب وبدء جلسة جديدة؟")) act(() => api.reset({}));
              }}
            >
              <RotateCcw size={16} style={{ verticalAlign: -3 }} /> تصفير
            </button>
          </div>
          <div className="row" style={{ gap: 18 }}>
            <span className="muted" style={{ fontSize: 13 }}>
              <CircleDot size={13} style={{ verticalAlign: -2, color: running ? theme.green : theme.textMuted }} />{" "}
              دورة #{snap.bar}
            </span>
            <Segmented
              value={String(snap.config.intervalMs)}
              onChange={(v) => act(() => api.config({ intervalMs: Number(v) }))}
              options={SPEEDS}
            />
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid cols-4" style={{ marginBottom: 18 }}>
        <Stat label="رأس المال الحالي" value={fmtCompact(snap.equity)} gold foot={`نقد ${fmtCompact(snap.cash)}`} />
        <Stat
          label="إجمالي الربح/الخسارة"
          value={fmtCurrency(snap.totalPnl, 0)}
          tone={snap.totalPnl >= 0 ? "pos" : "neg"}
          foot={fmtPct(snap.equity / snap.config.initialEquity - 1, 2)}
        />
        <Stat
          label="ربح اليوم"
          value={fmtCurrency(snap.todayPnl, 0)}
          tone={snap.todayPnl >= 0 ? "pos" : "neg"}
        />
        <Stat label="السحب الحالي" value={fmtPct(snap.drawdown, 2)} tone="neg" foot={`الذروة ${fmtCompact(snap.peakEquity)}`} />
      </div>

      <div className="grid cols-3" style={{ gap: 18 }}>
        {/* Equity + positions */}
        <div style={{ gridColumn: "span 2" }}>
          <Card title="رأس المال حياً" icon={<Activity size={15} />}>
            <EquityChart
              data={snap.equityCurve}
              height={250}
              color={halted ? theme.red : theme.gold}
            />
          </Card>

          <Card title={`المراكز المفتوحة (${snap.positions.length})`} icon={<Wallet size={15} />} style={{ marginTop: 18 }}>
            {snap.positions.length === 0 ? (
              <div className="muted" style={{ fontSize: 13.5, padding: "6px 0" }}>
                لا مراكز مفتوحة حالياً.
              </div>
            ) : (
              <div className="ltr" style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                  <thead>
                    <tr style={{ color: "var(--text-muted)", textAlign: "right" }}>
                      <th style={th}>Symbol</th>
                      <th style={th}>Side</th>
                      <th style={th}>Qty</th>
                      <th style={th}>Weight</th>
                      <th style={th}>Last</th>
                      <th style={th}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.positions.map((p) => (
                      <tr key={p.symbol} style={{ borderTop: "1px solid var(--border-soft)" }}>
                        <td style={{ ...td, fontWeight: 700 }}>{p.symbol}</td>
                        <td style={td}>
                          <span className={p.qty >= 0 ? "pos" : "neg"}>{p.qty >= 0 ? "LONG" : "SHORT"}</span>
                        </td>
                        <td style={td}>{fmtNum(Math.abs(p.qty), 1)}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{fmtPct(p.weight, 1)}</td>
                        <td style={td}>{fmtNum(p.lastPrice, 2)}</td>
                        <td style={td}>{fmtCompact(p.marketValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Right column: engine config, guardrails, logs */}
        <div>
          <Card title="إعداد المحرّك" icon={<Gauge size={15} />}>
            <div className="field-label" style={{ marginBottom: 8 }}>
              الاستراتيجية
            </div>
            <select
              value={snap.config.strategyId}
              onChange={(e) => act(() => api.config({ strategyId: e.target.value }))}
              style={{ marginBottom: 16 }}
            >
              {meta?.strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nameAr}
                </option>
              ))}
            </select>
            <div className="field-label" style={{ marginBottom: 8 }}>
              ملف المخاطر
            </div>
            <Segmented
              value={snap.config.riskPreset}
              onChange={(v) => act(() => api.config({ riskPreset: v }))}
              options={[
                { value: "conservative", label: "متحفّظ" },
                { value: "balanced", label: "متوازن" },
                { value: "aggressive", label: "هجومي" },
              ]}
            />
            <div className="divider" />
            <div className="field-label" style={{ marginBottom: 8 }}>نموذج المخاطر (المحرّك)</div>
            <Segmented
              value={snap.config.engine?.riskModel ?? "none"}
              onChange={(v) => act(() => api.config({ riskModel: v }))}
              options={[
                { value: "hrp", label: "HRP" },
                { value: "erc", label: "ERC" },
                { value: "min-var", label: "أدنى تباين" },
                { value: "none", label: "إيقاف" },
              ]}
            />
            <div className="row spread" style={{ marginTop: 12 }}>
              <span className="muted" style={{ fontSize: 13 }}>تكيّف الحالة (Regime)</span>
              <button
                className={`btn${snap.config.engine?.regimeAdaptive ? " btn-primary" : ""}`}
                style={{ padding: "6px 14px" }}
                onClick={() => act(() => api.config({ regimeAdaptive: !snap.config.engine?.regimeAdaptive }))}
              >
                {snap.config.engine?.regimeAdaptive ? "مُفعّل" : "مطفأ"}
              </button>
            </div>
            <div className="divider" />
            <GuardBar label="حدّ الخسارة اليومي" used={dailyUsed} limit={fmtPct(ks.maxDailyLoss, 0)} />
            <GuardBar label="مفتاح إيقاف السحب" used={ddUsed} limit={fmtPct(ks.maxDrawdown, 0)} />
          </Card>

          <Card title="الأوامر الأخيرة" icon={<ListOrdered size={15} />} style={{ marginTop: 18 }}>
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {snap.orders.length === 0 ? (
                <div className="muted" style={{ fontSize: 13 }}>لا أوامر بعد.</div>
              ) : (
                snap.orders.slice(0, 12).map((o) => (
                  <div key={o.id} className="row spread" style={{ padding: "7px 0", borderBottom: "1px solid var(--border-soft)" }}>
                    <span style={{ fontSize: 13 }}>
                      <span className={o.side === "buy" ? "pos" : "neg"} style={{ fontWeight: 700 }}>
                        {o.side === "buy" ? "شراء" : "بيع"}
                      </span>{" "}
                      {fmtNum(o.qty, 1)} {o.symbol}
                    </span>
                    <span className="muted kpi" style={{ fontSize: 12.5 }}>@ {fmtNum(o.price, 2)}</span>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card title="سجلّ النشاط" icon={<Terminal size={15} />} style={{ marginTop: 18 }}>
            <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 12.5, lineHeight: 1.9 }}>
              {snap.decisions.slice(0, 14).map((d, i) => (
                <div key={i} className="row" style={{ gap: 8 }}>
                  <span style={{ color: logColor(d.level), fontWeight: 700 }}>•</span>
                  <span className={d.level === "halt" ? "neg" : ""}>{d.message}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="note" style={{ marginTop: 18 }}>
        <b>وضع ورقي (Paper):</b> هذا تنفيذ محاكى بأموال افتراضية لتراقب سلوك النظام بأمان. لا أرباح
        مضمونة ولا «دخل سحري». للتداول بمال حقيقي، تُربط طبقة تنفيذ بوسيط مرخّص (صفحة الحسابات) —
        وتبدأ دائماً بمبالغ صغيرة تتحمّل خسارتها.
      </div>
    </>
  );
}

const th: React.CSSProperties = { padding: "0 0 8px", fontWeight: 600, textAlign: "right" };
const td: React.CSSProperties = { padding: "9px 0", textAlign: "right" };

function StatusPill({ state, mode }: { state: string; mode: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    running: { label: "يعمل", cls: "badge-pass" },
    halted: { label: "موقوف طارئ", cls: "badge-fail" },
    idle: { label: "متوقّف", cls: "" },
  };
  const s = map[state] ?? map.idle;
  return (
    <div className="row" style={{ gap: 8 }}>
      <span className="tag muted">{mode === "paper" ? "ورقي" : "حقيقي"}</span>
      <span className={`tag ${s.cls}`} style={{ fontSize: 13, padding: "7px 14px" }}>
        <CircleDot size={12} /> {s.label}
      </span>
    </div>
  );
}

function GuardBar({ label, used, limit }: { label: string; used: number; limit: string }) {
  const pct = Math.round(used * 100);
  const danger = used > 0.7;
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="field-label">
        <span>{label}</span>
        <b className={danger ? "neg" : ""}>
          {pct}% <span className="muted">/ {limit}</span>
        </b>
      </div>
      <div style={{ height: 7, borderRadius: 5, background: "var(--panel)", overflow: "hidden" }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: danger ? theme.red : "var(--gold-grad)",
            transition: "width .4s ease",
          }}
        />
      </div>
    </div>
  );
}

function logColor(level: string): string {
  return level === "halt"
    ? theme.red
    : level === "trade"
      ? theme.gold
      : level === "warn"
        ? "#e0a23d"
        : theme.textMuted;
}

function Loading() {
  return (
    <div className="page-head">
      <h1 className="page-title">الطيار الآلي</h1>
      <p className="page-sub">جارٍ الاتصال بالمحرّك…</p>
    </div>
  );
}

function OfflinePanel() {
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">الطيار الآلي (Autopilot)</h1>
        <p className="page-sub">محرّك التشغيل الآلي غير متصل. شغّله ليبدأ التداول الذاتي.</p>
      </div>
      <Card title="تشغيل المحرّك" icon={<Power size={15} />}>
        <p className="learn-p">
          الطيار الآلي خدمة تعمل على مدار الساعة (خادم Node)، منفصلة عن المتصفّح، لتستمر بالتداول
          حتى وأنت نائم. لتشغيلها، نفّذ في الطرفية:
        </p>
        <pre
          className="mono"
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border-soft)",
            borderRadius: 12,
            padding: "14px 16px",
            direction: "ltr",
            overflowX: "auto",
            fontSize: 13.5,
          }}
        >
{`# الطريقة الأسهل — الويب + المحرّك معاً:
npm run dev:all

# أو المحرّك وحده في طرفية منفصلة:
npm run server`}
        </pre>
        <div className="note">
          بعد التشغيل، ستظهر هذه الصفحة حيّة تلقائياً. المحرّك يعمل في الوضع الورقي افتراضياً (بلا
          مال حقيقي).
        </div>
      </Card>
    </>
  );
}
