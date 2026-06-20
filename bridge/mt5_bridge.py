#!/usr/bin/env python3
"""
AURUM ⇄ MetaTrader 5 bridge.

A tiny local HTTP service that exposes a MetaTrader 5 account (FundedNext and
other MT5 prop firms / brokers) to the AURUM autopilot. The Node engine stays
the brain; this bridge is the hands.

Two modes, chosen automatically:
  • LIVE  — when the `MetaTrader5` package is importable AND MT5_MOCK != "1".
            Talks to a running MetaTrader 5 terminal on this machine.
  • MOCK  — otherwise. A self-contained simulated account (synthetic prices,
            in-memory positions) so you can test the ENTIRE pipeline end-to-end
            with no terminal and no real money. Flip to LIVE by installing MT5,
            logging into your funded account, and adding credentials to .env.

Zero third-party dependencies in MOCK mode (pure stdlib). LIVE mode needs only
the official `MetaTrader5` pip package (Windows; or Linux via Wine).

Run:  python3 bridge/mt5_bridge.py     (reads bridge/.env if present)
"""
import json
import math
import os
import random
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

# ----------------------------------------------------------------------------
# Minimal .env loader (no python-dotenv dependency).
# ----------------------------------------------------------------------------
def load_env():
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, ".env")
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


load_env()

PORT = int(os.environ.get("MT5_BRIDGE_PORT", "8799"))
SYMBOLS = [s.strip() for s in os.environ.get(
    "MT5_SYMBOLS", "EURUSD,GBPUSD,XAUUSD,BTCUSD,US30").split(",") if s.strip()]
START_BALANCE = float(os.environ.get("MT5_BALANCE", "100000"))
SEED = int(os.environ.get("MT5_SEED", "7"))

# Per-symbol market presets used by the mock and as sane fallbacks for LIVE info.
PRESETS = {
    "EURUSD": dict(price=1.08, vol=0.07, contract=100000, vmin=0.01, vstep=0.01, digits=5),
    "GBPUSD": dict(price=1.27, vol=0.08, contract=100000, vmin=0.01, vstep=0.01, digits=5),
    "USDJPY": dict(price=150.0, vol=0.08, contract=100000, vmin=0.01, vstep=0.01, digits=3),
    "XAUUSD": dict(price=2300.0, vol=0.16, contract=100, vmin=0.01, vstep=0.01, digits=2),
    "BTCUSD": dict(price=65000.0, vol=0.6, contract=1, vmin=0.01, vstep=0.01, digits=2),
    "US30": dict(price=39000.0, vol=0.16, contract=1, vmin=0.1, vstep=0.1, digits=1),
}
DEFAULT_PRESET = dict(price=100.0, vol=0.2, contract=1, vmin=0.01, vstep=0.01, digits=2)


def preset(symbol):
    return PRESETS.get(symbol.upper(), DEFAULT_PRESET)


def sign(x):
    return (x > 0) - (x < 0)


# ============================================================================
# MOCK engine — a complete simulated MT5 account (no terminal needed).
# ============================================================================
class MockEngine:
    mode = "mock"

    def __init__(self):
        self.rng = random.Random(SEED)
        self.balance = START_BALANCE
        self.positions = {}  # symbol -> {"volume": float, "avg": float}
        self.price = {s: preset(s)["price"] for s in SYMBOLS}
        self.variance = {s: (preset(s)["vol"] ** 2) for s in SYMBOLS}
        self.regime = {s: 0 for s in SYMBOLS}
        self.regime_left = {s: 0 for s in SYMBOLS}
        self.t = int(time.time())
        # Pre-roll a history buffer per symbol so /seed has data.
        self.history = {s: [] for s in SYMBOLS}
        for s in SYMBOLS:
            p = preset(s)["price"]
            self.price[s] = p
            for _ in range(400):
                bar = self._step(s)
                self.history[s].append(bar)

    def _gauss(self):
        return self.rng.gauss(0, 1)

    def _step(self, symbol):
        pr = preset(symbol)
        if self.regime_left[symbol] <= 0:
            r = self.rng.random()
            self.regime[symbol] = 1 if r < 0.44 else (-1 if r < 0.72 else 0)
            self.regime_left[symbol] = 45 + int(self.rng.random() * 110)
        self.regime_left[symbol] -= 1
        long_var = pr["vol"] ** 2
        shock = self._gauss()
        self.variance[symbol] = 0.95 * self.variance[symbol] + 0.05 * long_var + 0.012 * long_var * shock * shock
        sigma = math.sqrt(max(self.variance[symbol], 1e-10))
        dt = 1 / 252
        drift = 0.05 + self.regime[symbol] * 0.3
        z = self._gauss()
        prev = self.price[symbol]
        close = prev * math.exp((drift - 0.5 * sigma * sigma) * dt + sigma * math.sqrt(dt) * z)
        self.price[symbol] = close
        self.t += 60
        intraday = abs(self._gauss()) * sigma * math.sqrt(dt) * prev * 0.5
        d = pr["digits"]
        return {
            "time": self.t,
            "open": round(prev, d),
            "high": round(max(prev, close) + intraday, d),
            "low": round(min(prev, close) - intraday, d),
            "close": round(close, d),
            "volume": int(1_000_000 * (0.6 + self.rng.random())),
        }

    def seed(self, symbol, count):
        hist = self.history.get(symbol, [])
        return hist[-count:]

    def next(self, symbol):
        bar = self._step(symbol)
        self.history.setdefault(symbol, []).append(bar)
        self.history[symbol] = self.history[symbol][-600:]
        return bar

    def symbol_info(self, symbol):
        pr = preset(symbol)
        p = self.price.get(symbol, pr["price"])
        spread = p * 0.00005
        return {
            "symbol": symbol, "bid": round(p - spread, pr["digits"]),
            "ask": round(p + spread, pr["digits"]), "price": p,
            "contractSize": pr["contract"], "volumeMin": pr["vmin"],
            "volumeStep": pr["vstep"], "digits": pr["digits"],
        }

    def floating_pnl(self):
        pnl = 0.0
        for s, pos in self.positions.items():
            pr = preset(s)
            pnl += pos["volume"] * (self.price.get(s, pos["avg"]) - pos["avg"]) * pr["contract"]
        return pnl

    def account(self):
        eq = self.balance + self.floating_pnl()
        return {"login": 0, "server": "AURUM-Mock", "currency": "USD",
                "balance": round(self.balance, 2), "equity": round(eq, 2), "mode": "mock"}

    def positions_list(self):
        out = []
        for s, pos in self.positions.items():
            if abs(pos["volume"]) < 1e-9:
                continue
            out.append({"symbol": s, "volume": round(pos["volume"], 4),
                        "avgPrice": round(pos["avg"], preset(s)["digits"]),
                        "price": self.price.get(s, pos["avg"])})
        return out

    def order(self, symbol, side, volume):
        if symbol not in self.price:
            self.price[symbol] = preset(symbol)["price"]
        p = self.price[symbol]
        contract = preset(symbol)["contract"]
        signed = volume if side == "buy" else -volume
        if abs(signed) < 1e-9:
            return {"ok": False, "error": "zero volume"}
        pos = self.positions.get(symbol, {"volume": 0.0, "avg": p})
        # Realize P/L on the portion that closes an opposite position.
        if pos["volume"] != 0 and sign(pos["volume"]) != sign(signed):
            closing = min(abs(signed), abs(pos["volume"]))
            self.balance += closing * (p - pos["avg"]) * contract * sign(pos["volume"])
        new_vol = pos["volume"] + signed
        if pos["volume"] == 0 or sign(pos["volume"]) == sign(signed):
            denom = abs(pos["volume"]) + abs(signed)
            avg = (pos["avg"] * abs(pos["volume"]) + p * abs(signed)) / denom if denom else p
        elif sign(new_vol) != sign(pos["volume"]) and new_vol != 0:
            avg = p
        else:
            avg = pos["avg"]
        if abs(new_vol) < 1e-9:
            self.positions.pop(symbol, None)
        else:
            self.positions[symbol] = {"volume": new_vol, "avg": avg}
        return {"ok": True, "symbol": symbol, "side": side, "volume": volume,
                "price": round(p, preset(symbol)["digits"]), "retcode": 10009}


# ============================================================================
# LIVE engine — talks to a running MetaTrader 5 terminal.
# ============================================================================
class Mt5Engine:
    mode = "live"

    def __init__(self):
        import MetaTrader5 as mt5  # noqa
        self.mt5 = mt5
        login = os.environ.get("MT5_LOGIN")
        password = os.environ.get("MT5_PASSWORD")
        server = os.environ.get("MT5_SERVER")
        path = os.environ.get("MT5_TERMINAL_PATH")  # optional
        kwargs = {}
        if path:
            kwargs["path"] = path
        if login and password and server:
            ok = mt5.initialize(login=int(login), password=password, server=server, **kwargs)
        else:
            ok = mt5.initialize(**kwargs)
        if not ok:
            raise RuntimeError(f"MT5 initialize failed: {mt5.last_error()}")
        for s in SYMBOLS:
            mt5.symbol_select(s, True)

    def _tf(self):
        return self.mt5.TIMEFRAME_M1

    def _bar(self, r):
        return {"time": int(r["time"]), "open": float(r["open"]), "high": float(r["high"]),
                "low": float(r["low"]), "close": float(r["close"]), "volume": int(r["tick_volume"])}

    def seed(self, symbol, count):
        rates = self.mt5.copy_rates_from_pos(symbol, self._tf(), 0, count)
        return [self._bar(r) for r in rates] if rates is not None else []

    def next(self, symbol):
        rates = self.mt5.copy_rates_from_pos(symbol, self._tf(), 0, 1)
        if rates is None or len(rates) == 0:
            info = self.symbol_info(symbol)
            t = int(time.time())
            return {"time": t, "open": info["price"], "high": info["price"],
                    "low": info["price"], "close": info["price"], "volume": 0}
        return self._bar(rates[-1])

    def symbol_info(self, symbol):
        info = self.mt5.symbol_info(symbol)
        tick = self.mt5.symbol_info_tick(symbol)
        price = float(tick.ask) if tick else (float(info.ask) if info else preset(symbol)["price"])
        return {
            "symbol": symbol,
            "bid": float(tick.bid) if tick else price,
            "ask": float(tick.ask) if tick else price,
            "price": price,
            "contractSize": float(info.trade_contract_size) if info else preset(symbol)["contract"],
            "volumeMin": float(info.volume_min) if info else 0.01,
            "volumeStep": float(info.volume_step) if info else 0.01,
            "digits": int(info.digits) if info else 5,
        }

    def account(self):
        a = self.mt5.account_info()
        return {"login": a.login, "server": a.server, "currency": a.currency,
                "balance": float(a.balance), "equity": float(a.equity), "mode": "live"}

    def positions_list(self):
        out = []
        positions = self.mt5.positions_get() or []
        # Net per symbol (buy positions positive, sell negative).
        agg = {}
        for p in positions:
            v = float(p.volume) * (1 if p.type == self.mt5.ORDER_TYPE_BUY else -1)
            cur = agg.get(p.symbol, {"volume": 0.0, "notional": 0.0})
            cur["volume"] += v
            cur["notional"] += v * float(p.price_open)
            agg[p.symbol] = cur
        for s, a in agg.items():
            if abs(a["volume"]) < 1e-9:
                continue
            out.append({"symbol": s, "volume": a["volume"],
                        "avgPrice": a["notional"] / a["volume"] if a["volume"] else 0.0,
                        "price": self.symbol_info(s)["price"]})
        return out

    def order(self, symbol, side, volume):
        mt5 = self.mt5
        info = mt5.symbol_info(symbol)
        tick = mt5.symbol_info_tick(symbol)
        if info is None or tick is None:
            return {"ok": False, "error": "symbol not available"}
        order_type = mt5.ORDER_TYPE_BUY if side == "buy" else mt5.ORDER_TYPE_SELL
        price = tick.ask if side == "buy" else tick.bid
        req = {
            "action": mt5.TRADE_ACTION_DEAL, "symbol": symbol, "volume": float(volume),
            "type": order_type, "price": float(price), "deviation": 20,
            "magic": 770077, "comment": "AURUM", "type_filling": mt5.ORDER_FILLING_IOC,
            "type_time": mt5.ORDER_TIME_GTC,
        }
        res = mt5.order_send(req)
        ok = res is not None and res.retcode == mt5.TRADE_RETCODE_DONE
        return {"ok": ok, "symbol": symbol, "side": side, "volume": float(volume),
                "price": float(price), "retcode": int(res.retcode) if res else -1}


# ============================================================================
# HTTP server
# ============================================================================
def build_engine():
    if os.environ.get("MT5_MOCK", "0") != "1":
        try:
            return Mt5Engine()
        except Exception as e:  # noqa
            print(f"  ⚠ LIVE MT5 unavailable ({e}); falling back to MOCK mode.")
    return MockEngine()


ENGINE = build_engine()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # quiet

    def _send(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        sym = (q.get("symbol", [None])[0])
        try:
            if u.path == "/health":
                self._send({"ok": True, "mode": ENGINE.mode, "connected": True,
                            "symbols": SYMBOLS, "account": ENGINE.account()})
            elif u.path == "/account":
                self._send(ENGINE.account())
            elif u.path == "/positions":
                self._send(ENGINE.positions_list())
            elif u.path == "/symbol" and sym:
                self._send(ENGINE.symbol_info(sym))
            elif u.path == "/seed" and sym:
                count = int(q.get("count", ["300"])[0])
                self._send({"symbol": sym, "bars": ENGINE.seed(sym, count)})
            elif u.path == "/next" and sym:
                self._send({"symbol": sym, "bar": ENGINE.next(sym)})
            else:
                self._send({"error": "not found"}, 404)
        except Exception as e:  # noqa
            self._send({"error": str(e)}, 500)

    def do_POST(self):
        u = urlparse(self.path)
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
        except Exception:
            body = {}
        try:
            if u.path == "/order":
                res = ENGINE.order(body["symbol"], body["side"], float(body["volume"]))
                self._send(res, 200 if res.get("ok") else 400)
            else:
                self._send({"error": "not found"}, 404)
        except Exception as e:  # noqa
            self._send({"error": str(e)}, 500)


def main():
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    acct = ENGINE.account()
    print(f"\n  ◆ AURUM MT5 bridge — mode: {ENGINE.mode.upper()}")
    print(f"  ◆ http://127.0.0.1:{PORT}  |  symbols: {', '.join(SYMBOLS)}")
    print(f"  ◆ account: {acct['server']} balance {acct['balance']} {acct['currency']}\n")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        srv.shutdown()


if __name__ == "__main__":
    main()
