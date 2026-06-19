import { theme } from "@/theme";

interface Props {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}

/** Tiny dependency-free SVG sparkline for cards and list rows. */
export default function Sparkline({ values, width = 140, height = 40, color = theme.gold }: Props) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const up = values[values.length - 1] >= values[0];
  const stroke = color ?? (up ? theme.green : theme.red);
  const gradId = `sg-${Math.round(min)}-${Math.round(max)}-${values.length}`;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={`0,${height} ${pts.join(" ")} ${width},${height}`}
        fill={`url(#${gradId})`}
        stroke="none"
      />
      <polyline points={pts.join(" ")} fill="none" stroke={stroke} strokeWidth="1.8" />
    </svg>
  );
}
