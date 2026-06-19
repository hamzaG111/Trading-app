import type { ReactNode } from "react";

export function Card({
  title,
  icon,
  children,
  gold,
  style,
}: {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  gold?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`card${gold ? " gold" : ""}`} style={style}>
      {title && (
        <div className="card-title">
          {icon}
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  foot,
  gold,
  tone,
}: {
  label: string;
  value: ReactNode;
  foot?: ReactNode;
  gold?: boolean;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value${gold ? " gold" : ""} ${tone ?? ""}`}>{value}</div>
      {foot && <div className="stat-foot">{foot}</div>}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        <b>
          {value}
          {unit ? ` ${unit}` : ""}
        </b>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          className={value === o.value ? "active" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function MetricRow({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <li>
      <span className="muted">{label}</span>
      <span className={`kpi ${tone ?? ""}`} style={{ fontWeight: 600 }}>
        {value}
      </span>
    </li>
  );
}
