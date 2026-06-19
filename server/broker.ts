// Execution layer. The PaperBroker simulates fills against the latest price with
// realistic costs/slippage so the autopilot can run end-to-end with no real money.
//
// To trade real money you implement the SAME `Broker` interface against your
// broker's API (e.g. Alpaca, IBKR, a prop-firm bridge). Nothing else changes —
// the autopilot only ever talks to this interface.
import type { Order, OrderSide, Position } from "./types";

export interface Broker {
  getCash(): number;
  getPositions(): Map<string, { qty: number; avgPrice: number }>;
  /** Submit a market order; returns the executed Order (or null if zero qty). */
  submit(
    symbol: string,
    side: OrderSide,
    qty: number,
    price: number,
    costRate: number,
    reason: string,
    time: number,
  ): Order | null;
  /** Total account equity given current prices. */
  equity(prices: Record<string, number>): number;
  positionsView(prices: Record<string, number>, equity: number): Position[];
}

let ORDER_SEQ = 1;

export class PaperBroker implements Broker {
  private cash: number;
  private positions = new Map<string, { qty: number; avgPrice: number }>();

  constructor(startingCash: number) {
    this.cash = startingCash;
  }

  getCash(): number {
    return this.cash;
  }

  getPositions() {
    return this.positions;
  }

  /** Restore broker state after a server restart. */
  hydrate(cash: number, positions: { symbol: string; qty: number; avgPrice: number }[]) {
    this.cash = cash;
    this.positions = new Map(positions.map((p) => [p.symbol, { qty: p.qty, avgPrice: p.avgPrice }]));
  }

  submit(
    symbol: string,
    side: OrderSide,
    qty: number,
    price: number,
    costRate: number,
    reason: string,
    time: number,
  ): Order | null {
    const signedQty = side === "buy" ? qty : -qty;
    if (Math.abs(signedQty) < 1e-9 || price <= 0) return null;

    const notional = Math.abs(signedQty) * price;
    const cost = notional * costRate;
    // Cash decreases when buying, increases when selling (shorting adds proceeds).
    this.cash -= signedQty * price;
    this.cash -= cost;

    const existing = this.positions.get(symbol) ?? { qty: 0, avgPrice: price };
    const newQty = existing.qty + signedQty;
    // Update average price only when adding in the same direction.
    let avgPrice = existing.avgPrice;
    if (existing.qty === 0 || Math.sign(existing.qty) === Math.sign(signedQty)) {
      avgPrice =
        (existing.avgPrice * Math.abs(existing.qty) + price * Math.abs(signedQty)) /
        (Math.abs(existing.qty) + Math.abs(signedQty) || 1);
    } else if (Math.sign(newQty) !== Math.sign(existing.qty) && newQty !== 0) {
      avgPrice = price; // flipped direction
    }
    if (Math.abs(newQty) < 1e-9) this.positions.delete(symbol);
    else this.positions.set(symbol, { qty: newQty, avgPrice });

    return {
      id: `O${ORDER_SEQ++}`,
      time,
      symbol,
      side,
      qty: +qty.toFixed(4),
      price: +price.toFixed(2),
      cost: +cost.toFixed(2),
      reason,
    };
  }

  equity(prices: Record<string, number>): number {
    let eq = this.cash;
    for (const [sym, pos] of this.positions) {
      eq += pos.qty * (prices[sym] ?? pos.avgPrice);
    }
    return eq;
  }

  positionsView(prices: Record<string, number>, equity: number): Position[] {
    const out: Position[] = [];
    for (const [sym, pos] of this.positions) {
      const last = prices[sym] ?? pos.avgPrice;
      const marketValue = pos.qty * last;
      out.push({
        symbol: sym,
        qty: +pos.qty.toFixed(4),
        avgPrice: +pos.avgPrice.toFixed(2),
        lastPrice: +last.toFixed(2),
        marketValue: +marketValue.toFixed(2),
        unrealizedPnl: +((last - pos.avgPrice) * pos.qty).toFixed(2),
        weight: equity !== 0 ? +(marketValue / equity).toFixed(4) : 0,
      });
    }
    return out.sort((a, b) => Math.abs(b.marketValue) - Math.abs(a.marketValue));
  }
}
