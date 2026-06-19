// Number / currency / percentage formatting helpers (always rendered LTR).

export function fmtCurrency(v: number, max = 0): string {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: max,
    minimumFractionDigits: max,
  });
}

/** Compact currency for very large numbers: $1.2M, $3.4B, $5.0T. */
export function fmtCompact(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function fmtPct(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtNum(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return v > 0 ? "∞" : "—";
  return v.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export function signClass(v: number): string {
  return v > 0 ? "pos" : v < 0 ? "neg" : "";
}
