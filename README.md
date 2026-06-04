# SolSniper — Solana Memecoin Sniper Simulator

> **⚠ SIMULATION ONLY** — No real wallets, no real execution, no real SOL involved. All trades are virtual paper-trades. This project runs entirely locally for strategy verification and educational simulation.

SolSniper is a premium, real-time paper-trading dashboard designed to simulate and analyze a high-frequency Solana memecoin sniper strategy. The backend polls DexScreener, runs a multi-stage security filter + scoring engine, executes virtual buys, tracks price updates in real time, and manages profit-taking/emergency exits dynamically.

---

##  Tech Stack

- **Frontend**: React (Vite) + Vanilla CSS (Aesthetic Flat Dark UI) + Recharts + Socket.io Client
- **Backend**: Node.js + Express + Socket.io Server
- **Database**: SQLite (`solsniper.db` via `better-sqlite3` with Write-Ahead Logging active)
- **Scheduling**: Lightweight async jobs (`node-cron` for daily metrics rollup, `setInterval` poll loops)
- **Data Integrations**: DexScreener, RugCheck, GoPlus, Birdeye, Solscan, Telegram API

---

##  Core Features

###  1. Live Token Feed & Scanning
- **Continuous Discovery**: Polls DexScreener's new pairs API constantly (high concurrency support up to 10 parallel scans).
- **In-Memory Cache**: Deduplicates seen addresses in memory and database lists to prevent reprocessing.
- **Pause/Resume**: Users can instantly pause the scanner from the Dashboard to analyze current trades.

###  2. Multi-Stage Hard Filters (8 Checks)
Every token must pass all 8 configurable filters or it is rejected:
1. **Mint Authority**: Must be renounced (verified via RugCheck API).
2. **Freeze Authority**: Must be disabled (verified via RugCheck API).
3. **Honeypot Check**: High-security buy/sell tax checks (verified via GoPlus API; max sell tax $\leq$ 15%).
4. **Liquidity Threshold**: Configurable minimum pool liquidity (Default: $\geq$ $3,000).
5. **Volume Threshold**: Configurable 24h minimum trading volume (Default: $\geq$ $800).
6. **Pair Age**: Configurable maximum token pair age (Default: $\leq$ 20 minutes).
7. **Transaction Count**: Configurable minimum 24h transactions (Default: $\geq$ 20).
8. **Top Holder Concentration**: Configurable maximum top 10 holders percentage (Default: $\leq$ 60% of supply via Solscan API).

###  3. Soft Scoring System (0-10)
Tokens that pass hard filters are scored based on positive indicators:
- **LP Locked** (+1 point)
- **Whale Safe** (+1 point if top holder has <45%)
- **Dev Wallet Check** (+1 point if dev wallet is safe & age >7 days)
- **Holder Acceleration** (+1 point if unique holder count is increasing)
- **Volume Momentum** (+1 point if 5m volume is accelerating)
- **Social Presence**: Has Twitter or Telegram (+1 point); Has Twitter AND Telegram AND Website (+2 points)
- **Pump.fun Graduation** (+2 points if pair graduated from Pump.fun bonding curve to Raydium)

###  4. Dynamic Position Sizing
- **Tier-Based Sizing**: Automates entry size based on the Soft Score using 4 fully customizable tiers (e.g., Tier 1 for Score $\geq$ 4 = $0.75; Tier 4 for Score $\geq$ 7 = $2.50).
- **Social Bonus**: Adds a configurable bonus (Default: +$0.50) to position sizing if the token has both active Twitter/Telegram socials AND graduated from pump.fun.
- **Risk Halt**: Integrates a **Daily Loss Limit** that pauses virtual purchases if accumulated daily losses cross the threshold (Default: $40).

###  5. Smart Exit Ladder & Exit Rules
- **Take Profit**: Configurable hard Take Profit % that closes the entire trade instantly.
- **Stop Loss**: Configurable hard Stop Loss % (Default: close position if price drops $\geq$ 65% from entry).
- **Time Exit**: Auto-close position after a set amount of hours if current profit is < 20% (Default: 3 hours).
- **Liquidity Drop**: Auto-close position if liquidity drops $\geq$ 50% from entry.
- **Gradual Take-Profit Ladder** (Can be toggled on/off):
  - **Level 1**: +200% PnL $\rightarrow$ Sell 20% of original size.
  - **Level 2**: +500% PnL $\rightarrow$ Sell 20% of original size.
  - **Level 3**: +1000% PnL $\rightarrow$ Sell 20% of original size.
  - **Level 4**: +3000% PnL $\rightarrow$ Sell 50% of remaining size.

###  6. Telegram Notifications
- **Live Alerts**: Connect a Telegram bot via `@BotFather` to receive instant messages to your phone or desktop.
- **Trade Opened**: Pings you with Token Name, Address, Score, Entry Price, and Position Size.
- **Trade Closed**: Pings you with the Token Name, Exit Reason, Total PnL (USD & %), and Hold Time.
- **Test Connection**: Built-in UI button to send a test ping to ensure your Chat ID is correct.

###  7. Full Settings Control
- **Real-Time Editor**: Adjust all thresholds, sizing, and exit rules instantly.
- **Restore Defaults**: Easily revert the entire strategy back to the factory defaults.
- **Purge Simulation**: Clear all trades, price histories, daily snapshots, scanned tokens, and filter cache, resetting the application to a blank state.

---

##  Quick Start (Windows Setup)

### 1. Prerequisites
Ensure you have [Node.js (18 or higher)](https://nodejs.org/) installed.

### 2. Configuration (.env)
1. Navigate to the `server` directory.
2. Duplicate `.env.example` and name it `.env`.
3. Populate with API keys to allow security integrations to load real token parameters (RugCheck, GoPlus, and DexScreener function without keys):
   ```env
   PORT=3001
   CLIENT_URL=http://localhost:5173
   DB_PATH=../solsniper.db
   BIRDEYE_API_KEY=your_birdeye_key
   SOLSCAN_API_KEY=your_solscan_key
   HELIUS_API_KEY=your_helius_key
   ```

### 3. Launch App
Simply double-click the **`start.bat`** file in the root project folder.
This script will open two terminal windows:
- **Backend Server** starting on `http://localhost:3001`
- **Vite React Client** starting on `http://localhost:5173`

*Open your browser and navigate to `http://localhost:5173/dashboard` to view the live dashboard.*

---

##  UI Design Architecture

The client incorporates a premium, high-contrast flat-dark dashboard style:
- **Color Palette**: Dark theme (`#080810`), border trims (`#1a1a2e`), profit green (`#00ff88`), and loss red (`#ff4444`).
- **Telemetry Visualizer Status Indicators**: At the top bar, the circular green dots are replaced with live **3-bar signal equalizer graphs** that actively bounce when the scanner and Socket connection are running.
- **Real-Time Progress Fill**: Today's loss progression is shown directly at the top layout. Updates instantly when settings are edited or a trade closes.
- **Live Charts**: Beautiful Recharts integration for Cumulative P&L and Daily Win/Loss ratios.
- **High/Low Watermarks**: Open and Closed positions display the highest and lowest PnL% reached during the lifetime of the trade.

---

##  Directory Structure

```text
SolSniper/
├── start.bat               # Launcher script for Windows
├── solsniper.db            # Local SQLite database (created on first run)
├── server/                 # Express Backend Server
│   ├── api/                # DexScreener, RugCheck, and security API clients
│   ├── db/                 # Database initialization, migration, and trade queries
│   ├── engine/             # Scanning filters, soft scoring, exits, and tracker
│   ├── routes/             # REST endpoints (trades, tokens, analytics, settings)
│   ├── scheduler/          # Cron jobs and polling intervals
│   ├── websocket/          # Socket.io notification emitter
│   └── index.js            # Express entry bootstrap file
└── client/                 # Vite React Client
    ├── src/
    │   ├── components/     # Layouts (Topbar, Sidebar) and dashboard widgets
    │   ├── context/        # Strategy configuration state context
    │   ├── hooks/          # useSocket, useTrades hooks
    │   ├── pages/          # Dashboard, Scanner, Trades, Settings panels
    │   ├── utils/          # Formatter libraries
    │   ├── index.css       # Design tokens, visualizer animations, and reset CSS
    │   └── App.jsx         # Client routing
    └── package.json
```

---

##  Live WebSocket API

Clients receive live broadcasts for UI synchronizations:

| Event Name | Direction | Description |
|:---|:---|:---|
| `new_token_detected` | Server $\rightarrow$ Client | Emitted when scanner finds a new pool on DexScreener |
| `token_rejected` | Server $\rightarrow$ Client | Emitted when token fails any of the 8 hard filters |
| `token_scored` | Server $\rightarrow$ Client | Emitted on filter success with score and breakdown details |
| `trade_opened` | Server $\rightarrow$ Client | Emitted when virtual buy order is executed |
| `price_update` | Server $\rightarrow$ Client | Emitted on tracker price changes (contains calculated PnL) |
| `trade_closed` | Server $\rightarrow$ Client | Emitted when stop-loss, time limit, or ladder sells exit |
| `daily_stats_update` | Server $\rightarrow$ Client | Emitted periodically containing day's rolled metrics |

---

##  License
MIT. Built for strategy evaluation, research, and paper-trading simulation purposes.
