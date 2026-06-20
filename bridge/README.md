# AURUM ⇄ MetaTrader 5 bridge

A tiny local HTTP service that lets the AURUM autopilot trade a **MetaTrader 5**
account — including funded/prop accounts like **FundedNext** — while keeping the
Node engine as the brain.

- **MOCK mode** (default when `MetaTrader5` isn't installed, or `MT5_MOCK=1`): a
  self-contained simulated account. Test the entire pipeline with no terminal and
  no real money.
- **LIVE mode**: talks to a running MetaTrader 5 terminal on your machine.

Pure Python standard library in MOCK mode (zero installs). LIVE mode needs only
the official `MetaTrader5` package.

## Quick test (no MetaTrader needed)

```bash
MT5_MOCK=1 python3 bridge/mt5_bridge.py
# then, in the app server:  BROKER=mt5 npm run server
# and press "اتصل بحساب MT5" on the Connect page
```

## Going live with FundedNext (or any MT5 broker)

1. Install **MetaTrader 5** and log into your funded account (Windows).
2. Install the package: `pip install -r bridge/requirements.txt`
3. Copy `bridge/.env.example` → `bridge/.env` and fill in:
   ```
   MT5_MOCK=0
   MT5_LOGIN=<your account number>
   MT5_PASSWORD=<your password>
   MT5_SERVER=<your FundedNext server name>
   MT5_SYMBOLS=EURUSD,XAUUSD,US30,BTCUSD
   ```
4. Keep MetaTrader 5 open, then run: `python bridge/mt5_bridge.py`
5. Start the server in MT5 mode: `BROKER=mt5 npm run server` and click
   **اتصل بحساب MT5** in the app.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | mode (mock/live), connected, symbols, account |
| GET | `/account` | balance, equity, currency, server |
| GET | `/positions` | open positions (netted per symbol) |
| GET | `/symbol?symbol=` | bid/ask, contract size, volume min/step |
| GET | `/seed?symbol=&count=` | historical bars (indicator warm-up) |
| GET | `/next?symbol=` | the next/latest bar |
| POST | `/order` | `{symbol, side, volume}` market order |

## ⚠️ Safety

- `bridge/.env` is gitignored — never commit credentials.
- Real trading risks real losses. There is **no guaranteed profit**.
- Check your prop firm's policy on automated trading (EAs/algos) before going live.
- Start in MOCK, then a small live size. The autopilot's kill-switches and
  prop-firm guard reduce — but do not eliminate — risk.
