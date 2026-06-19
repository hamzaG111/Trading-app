import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { buildDemoUniverse, DEMO_SYMBOLS } from "@/engine/data";
import type { Universe } from "@/engine/types";

interface AppState {
  universe: Universe;
  symbols: string[];
  /** Notional capital used across the app for projections (persisted to localStorage). */
  capital: number;
  setCapital: (v: number) => void;
}

const Ctx = createContext<AppState | null>(null);

const STORE_KEY = "aurum.capital";

export function AppProvider({ children }: { children: ReactNode }) {
  // The demo universe is generated once and shared everywhere. Replacing this
  // with a real data feed later only touches this provider.
  const universe = useMemo(() => buildDemoUniverse(1500), []);
  const symbols = useMemo(() => [...DEMO_SYMBOLS], []);

  const [capital, setCapitalState] = useState<number>(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(STORE_KEY) : null;
    return saved ? Number(saved) : 100_000;
  });

  const setCapital = (v: number) => {
    setCapitalState(v);
    try {
      localStorage.setItem(STORE_KEY, String(v));
    } catch {
      /* storage may be unavailable; ignore */
    }
  };

  const value = useMemo<AppState>(
    () => ({ universe, symbols, capital, setCapital }),
    [universe, symbols, capital],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
