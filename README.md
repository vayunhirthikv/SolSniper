# SolSniper Simulation Engine

A hyper-optimized, high-frequency Solana token tracking and paper-trading simulator. SolSniper continuously scans newly launched pairs on decentralized exchanges, subjects them to rigorous security and momentum filters, and executes virtual trades based on customizable strategies.

Built to run 24/7 without risking real capital, it provides a safe environment to test and refine meme-coin sniping strategies.

---

## Key Architectural Features

### 1. Dual-API Discovery Loop & Batching
The engine continuously polls DexScreener's latest pairs and Birdeye's `new_listing` APIs. 
- **Intelligent Fallback**: Because public APIs frequently block cloud server IP addresses (like Render or AWS), SolSniper features a custom fallback pipeline. If DexScreener blocks the request or misses a brand new pump.fun token, it seamlessly falls back to Birdeye to grab the liquidity and volume data.
- **Batched Tracking**: Once a position is opened, the price tracker bundles all open trades into a single batched API request. This completely eliminates sequential delays, allowing the system to update prices and trigger stop-losses every **3 seconds**.

### 2. Multi-Stage Hard Filters
Every token must pass all configurable security and liquidity filters. It is instantly and permanently rejected if:
1. **Mint Authority**: Is NOT renounced.
2. **Freeze Authority**: Is enabled.
3. **Honeypot/Taxes**: Fails high-security buy/sell tax checks.
4. **Liquidity Threshold**: Falls below the minimum pool liquidity (Default: $\geq$ $3,000).
5. **Volume Threshold**: Falls below the 24h minimum trading volume (Default: $\geq$ $800).
6. **Pair Age**: Exceeds the maximum token pair age (Default: $\leq$ 20 minutes).
7. **Transaction Count**: Has too few 24h transactions (Default: $\geq$ 20).
8. **Top Holder Concentration**: Top 10 holders own > 60% of the supply (whale concentration).
9. **Zero Price**: If the API hasn't indexed the price yet, it is *transiently* rejected and placed in a recheck queue until the price goes live.

### 3. Soft Scoring System (0-10)
Tokens that pass hard filters are graded based on positive momentum indicators:
- **LP Locked** (+1 point)
- **Whale Safe** (+1 point if top holder has <45%)
- **Dev Wallet Check** (+1 point if dev wallet is safe & age >7 days)
- **Holder Acceleration** (+1 point if unique holder count is increasing)
- **Volume Momentum** (+1 point if 5m volume is accelerating)
- **Social Presence**: Has Twitter or Telegram (+1 point); Has Twitter AND Telegram AND Website (+2 points)
- **Pump.fun Graduation** (+2 points if the pair successfully graduated from Pump.fun to Raydium)

### 4. Dynamic Position Sizing
- **Tier-Based Sizing**: Automates entry size based on the Soft Score using 4 fully customizable tiers (e.g., Score $\geq$ 7 = larger bet size).
- **Social Bonus**: Adds a configurable dollar bonus to the position sizing if the token has both active Twitter/Telegram socials AND graduated from pump.fun.
- **Risk Halt**: Integrates a **Daily Loss Limit** that pauses virtual purchases if accumulated daily losses cross the threshold.

### 5. Smart Exit Ladder & Emergency Exits
- **Take Profit / Stop Loss**: Configurable hard Take Profit % and Stop Loss % that closes the entire trade instantly.
- **Liquidity Drop**: Auto-close position if liquidity drops $\geq$ 50% from entry (protects against rug pulls or API transition glitches).
- **Gradual Take-Profit Ladder**:
  - **Level 1**: +200% PnL $\rightarrow$ Sell 20% of original size.
  - **Level 2**: +500% PnL $\rightarrow$ Sell 20% of original size.
  - **Level 3**: +1000% PnL $\rightarrow$ Sell 20% of original size.
  - **Level 4**: +3000% PnL $\rightarrow$ Sell 50% of remaining size.

### 6. Telegram Notifications
- **Live Alerts**: Connect a Telegram bot via `@BotFather` to receive instant messages to your phone or desktop for all Trade Opens and Trade Closes.

---

##  Technology Stack

- **Backend**: Node.js, Express, Socket.io (WebSockets)
- **Frontend**: React (Vite), TailwindCSS, Recharts
- **Database**: PostgreSQL (Supabase) via `pg` pool
- **Hosting**: Backend deployed on Render, Frontend deployed on Vercel
- **Automation**: GitHub Actions (Cron Keepalive to prevent Render sleep)

---

## Setup & Deployment

### 1. Database (Supabase)
1. Create a free account on [Supabase](https://supabase.com).
2. Create a new project and grab the `Transaction` connection string.
3. The backend will automatically run migrations and build the tables on the first startup.

### 2. Environment Configuration
Create a `.env` file in the `server/` directory:
```env
PORT=3001
CLIENT_URL=http://localhost:5173
DATABASE_URL=postgresql://postgres.[YOUR-ID]:[YOUR-PASSWORD]@aws-0-REGION.pooler.supabase.com:5432/postgres
BIRDEYE_API_KEY=your_birdeye_key
SOLSCAN_API_KEY=your_solscan_key
HELIUS_API_KEY=your_helius_key
```

### 3. Local Development
1. **Start Backend**: `cd server && npm install && npm start`
2. **Start Frontend**: `cd client && npm install && npm run dev`
3. Navigate to `http://localhost:5173/dashboard` to view the live dashboard.

### 4. Production Deployment
- **Render**: Connect your GitHub repository to Render as a Web Service. Set the Build Command to `npm install` and the Start Command to `npm start`. Add your Environment Variables.
- **Vercel**: Connect your GitHub repository to Vercel. Set the Root Directory to `client/`. Add your `VITE_API_URL` to point to your new Render backend.
- **Keepalive**: To prevent Render's free tier from sleeping, edit the `.github/workflows/keepalive.yml` file with your Render backend URL. GitHub will automatically ping it every 10 minutes to keep it awake 24/7.

---

##  License
MIT. Built for strategy evaluation, research, and paper-trading simulation purposes.
