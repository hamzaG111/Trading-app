// Bespoke SVG visualisations for the quant suite — built by hand so they match
// the black-&-gold language exactly: Monte-Carlo fan charts, the efficient
// frontier scatter, correlation/factor heatmaps and risk-contribution bars.
import { theme } from "@/theme";
import { fmtCompact, fmtNum, fmtPct } from "@/lib/format";

const W = 820;

// ---------------------------------------------------------------- Fan chart
export interface Band {
  step: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export function FanChart({
  bands,
  samplePaths = [],
  height = 300,
  initial,
}: {
  bands: Band[];
  samplePaths?: number[][];
  height?: number;
  initial?: number;
}) {
  if (bands.length < 2) return null;
  const padL = 8;
  const padR = 64;
  const padT = 12;
  const padB = 22;
  const n = bands.length - 1;
  let min = Infinity;
  let max = -Infinity;
  for (const b of bands) {
    min = Math.min(min, b.p5);
    max = Math.max(max, b.p95);
  }
  if (initial !== undefined) {
    min = Math.min(min, initial);
    max = Math.max(max, initial);
  }
  const range = max - min || 1;
  const x = (i: number) => padL + (i / n) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - min) / range) * (height - padT - padB);

  const ribbon = (lo: (b: Band) => number, hi: (b: Band) => number) => {
    const top = bands.map((b, i) => `${x(i).toFixed(1)},${y(hi(b)).toFixed(1)}`);
    const bot = bands.map((b, i) => `${x(i).toFixed(1)},${y(lo(b)).toFixed(1)}`).reverse();
    return `M${top.join(" L")} L${bot.join(" L")} Z`;
  };
  const line = (sel: (b: Band) => number) =>
    "M" + bands.map((b, i) => `${x(i).toFixed(1)},${y(sel(b)).toFixed(1)}`).join(" L");

  const ticks = 4;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${height}`} style={{ display: "block" }}>
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = min + (range * i) / ticks;
        const yy = y(v);
        return (
          <g key={i}>
            <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="rgba(255,255,255,0.05)" />
            <text x={W - padR + 6} y={yy + 3} fill={theme.textMuted} fontSize="10">
              {fmtCompact(v)}
            </text>
          </g>
        );
      })}
      {samplePaths.map((p, idx) => (
        <path
          key={idx}
          d={"M" + p.map((v, i) => `${x((i / (p.length - 1)) * n).toFixed(1)},${y(v).toFixed(1)}`).join(" L")}
          fill="none"
          stroke={theme.gold}
          strokeWidth="0.5"
          opacity="0.07"
        />
      ))}
      <path d={ribbon((b) => b.p5, (b) => b.p95)} fill={theme.gold} opacity="0.1" />
      <path d={ribbon((b) => b.p25, (b) => b.p75)} fill={theme.gold} opacity="0.18" />
      <path d={line((b) => b.p50)} fill="none" stroke={theme.goldBright} strokeWidth="2" />
      {initial !== undefined && (
        <line x1={padL} y1={y(initial)} x2={W - padR} y2={y(initial)} stroke={theme.textMuted} strokeDasharray="4 4" opacity="0.5" />
      )}
    </svg>
  );
}

// ----------------------------------------------------------- Frontier scatter
export interface FrontierPoint {
  vol: number;
  ret: number;
}
export interface Marker extends FrontierPoint {
  label: string;
  color: string;
}

export function FrontierChart({
  frontier,
  markers,
  height = 320,
}: {
  frontier: FrontierPoint[];
  markers: Marker[];
  height?: number;
}) {
  const pts = [...frontier, ...markers];
  if (pts.length < 2) return null;
  const padL = 46;
  const padR = 14;
  const padT = 14;
  const padB = 34;
  const vols = pts.map((p) => p.vol);
  const rets = pts.map((p) => p.ret);
  const minV = Math.min(...vols, 0);
  const maxV = Math.max(...vols) * 1.05;
  const minR = Math.min(...rets);
  const maxR = Math.max(...rets);
  const rPad = (maxR - minR) * 0.1 || 0.02;
  const x = (v: number) => padL + ((v - minV) / (maxV - minV || 1)) * (W - padL - padR);
  const y = (r: number) =>
    padT + (1 - (r - (minR - rPad)) / (maxR + rPad - (minR - rPad) || 1)) * (height - padT - padB);

  // Connect in return order (as generated): the min-variance frontier is a
  // sideways parabola, so sorting by vol would zig-zag across both branches.
  const fLine = "M" + frontier.map((p) => `${x(p.vol).toFixed(1)},${y(p.ret).toFixed(1)}`).join(" L");

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${height}`} style={{ display: "block" }}>
      {Array.from({ length: 5 }, (_, i) => {
        const r = minR - rPad + ((maxR + rPad - (minR - rPad)) * i) / 4;
        return (
          <g key={`h${i}`}>
            <line x1={padL} y1={y(r)} x2={W - padR} y2={y(r)} stroke="rgba(255,255,255,0.05)" />
            <text x={6} y={y(r) + 3} fill={theme.textMuted} fontSize="10">{fmtPct(r, 0)}</text>
          </g>
        );
      })}
      {Array.from({ length: 5 }, (_, i) => {
        const v = minV + ((maxV - minV) * i) / 4;
        return (
          <text key={`v${i}`} x={x(v)} y={height - 10} fill={theme.textMuted} fontSize="10" textAnchor="middle">{fmtPct(v, 0)}</text>
        );
      })}
      <path d={fLine} fill="none" stroke={theme.gold} strokeWidth="2" opacity="0.7" />
      {markers.map((m) => (
        <g key={m.label}>
          <circle cx={x(m.vol)} cy={y(m.ret)} r="5" fill={m.color} stroke="#0a0a0b" strokeWidth="1.5" />
          <text x={x(m.vol) + 8} y={y(m.ret) + 3} fill={theme.text} fontSize="10.5">{m.label}</text>
        </g>
      ))}
      <text x={padL} y={height - 10} fill={theme.textMuted} fontSize="10">المخاطرة (تذبذب سنوي) →</text>
    </svg>
  );
}

// ----------------------------------------------------------------- Heatmap
export function Heatmap({
  matrix,
  rowLabels,
  colLabels,
  format = (v: number) => fmtNum(v, 2),
}: {
  matrix: number[][];
  rowLabels: string[];
  colLabels: string[];
  format?: (v: number) => string;
}) {
  const m = matrix[0]?.length ?? 0;
  // Diverging red→green scale, symmetric around 0 and normalised to the data.
  const amax = Math.max(1e-6, ...matrix.flat().map((v) => Math.abs(v)));
  const color = (v: number) => {
    const t = Math.max(-1, Math.min(1, v / amax));
    if (t >= 0) {
      const a = 0.12 + 0.6 * t;
      return `rgba(63, 191, 127, ${a.toFixed(3)})`;
    }
    const a = 0.12 + 0.6 * -t;
    return `rgba(229, 72, 77, ${a.toFixed(3)})`;
  };
  return (
    <div className="ltr" style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 11.5, margin: "0 auto" }}>
        <thead>
          <tr>
            <th />
            {colLabels.map((c) => (
              <th key={c} style={{ padding: "4px 6px", color: theme.textMuted, fontWeight: 600 }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={rowLabels[i]}>
              <td style={{ padding: "4px 8px", color: theme.textMuted, fontWeight: 600, whiteSpace: "nowrap" }}>{rowLabels[i]}</td>
              {row.slice(0, m).map((v, j) => (
                <td
                  key={j}
                  style={{
                    background: color(v),
                    color: "#fff",
                    textAlign: "center",
                    padding: "8px 10px",
                    minWidth: 46,
                    fontVariantNumeric: "tabular-nums",
                    borderRadius: 4,
                  }}
                >
                  {format(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// -------------------------------------------------------------- Weight bars
export function WeightBars({
  items,
  format = (v: number) => fmtPct(v, 1),
}: {
  items: { label: string; value: number; sub?: string }[];
  format?: (v: number) => string;
}) {
  const max = Math.max(1e-6, ...items.map((it) => Math.abs(it.value)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {items.map((it) => {
        const w = (Math.abs(it.value) / max) * 50; // half-width percent
        const pos = it.value >= 0;
        return (
          <div key={it.label} className="row" style={{ gap: 10, alignItems: "center" }}>
            <div style={{ width: 70, fontSize: 12.5, fontWeight: 600, textAlign: "start" }}>{it.label}</div>
            <div style={{ flex: 1, position: "relative", height: 18, background: "var(--panel)", borderRadius: 6 }}>
              <div style={{ position: "absolute", insetInlineStart: "50%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.12)" }} />
              <div
                style={{
                  position: "absolute",
                  top: 2,
                  bottom: 2,
                  insetInlineStart: pos ? "50%" : `${50 - w}%`,
                  width: `${w}%`,
                  background: pos ? "var(--gold-grad)" : theme.red,
                  borderRadius: 4,
                }}
              />
            </div>
            <div className="kpi" style={{ width: 64, textAlign: "end", fontSize: 12.5, fontWeight: 700, color: pos ? theme.goldBright : theme.red }}>
              {format(it.value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
