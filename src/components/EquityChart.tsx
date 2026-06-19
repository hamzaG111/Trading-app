import { useEffect, useRef } from "react";
import {
  ColorType,
  createChart,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { theme } from "@/theme";

export interface PriceLineDef {
  price: number;
  color: string;
  title: string;
  dashed?: boolean;
}

interface Props {
  data: { time: number; value: number }[];
  color?: string;
  height?: number;
  priceLines?: PriceLineDef[];
  /** Render as a flat line (no area fill). */
  line?: boolean;
}

/** Equity / value curve built on lightweight-charts, themed black & gold. */
export default function EquityChart({
  data,
  color = theme.gold,
  height = 300,
  priceLines = [],
  line = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // Area and Line series share the setData / price-line API we use, so we store
  // them under one type and cast on creation to keep the call sites simple.
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);

  // Create the chart once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      height,
      width: el.clientWidth,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: theme.textMuted,
        fontFamily: "inherit",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.06)" },
      timeScale: { borderColor: "rgba(255,255,255,0.06)", timeVisible: false },
      crosshair: {
        vertLine: { color: theme.goldDeep, labelBackgroundColor: theme.goldDeep },
        horzLine: { color: theme.goldDeep, labelBackgroundColor: theme.goldDeep },
      },
      handleScale: false,
      handleScroll: false,
    });
    chartRef.current = chart;

    const series = line
      ? chart.addLineSeries({ color, lineWidth: 2, priceLineVisible: false })
      : chart.addAreaSeries({
          lineColor: color,
          topColor: hexToRgba(color, 0.4),
          bottomColor: hexToRgba(color, 0.02),
          lineWidth: 2,
          priceLineVisible: false,
        });
    seriesRef.current = series as unknown as ISeriesApi<"Line">;

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth });
      chart.timeScale().fitContent();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      linesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push data + price lines whenever they change.
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    series.setData(
      data.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
    );

    for (const pl of linesRef.current) series.removePriceLine(pl);
    linesRef.current = priceLines.map((def) =>
      series.createPriceLine({
        price: def.price,
        color: def.color,
        lineWidth: 1,
        lineStyle: def.dashed ? LineStyle.Dashed : LineStyle.Solid,
        axisLabelVisible: true,
        title: def.title,
      }),
    );

    chart.timeScale().fitContent();
  }, [data, priceLines]);

  return <div ref={containerRef} style={{ width: "100%" }} />;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
