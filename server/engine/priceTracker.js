const dexscreener = require('../api/dexscreener');
const birdeye = require('../api/birdeye');
const db = require('../db/trades');
const settingsDb = require('../db/settings');
const exitLadder = require('./exitLadder');
const logger = require('../utils/logger');

let isRunning = false;
let settings = {};

function setSettings(s) {
  settings = s;
}

async function trackPrices() {
  if (isRunning) return;
  isRunning = true;

  try {
    const openTrades = await db.getOpenTrades();
    if (openTrades.length === 0) {
      isRunning = false;
      return;
    }

    logger.info(`Price tracking ${openTrades.length} open position(s)`);

    const addresses = openTrades.map(t => t.token_address);
    const pairs = await dexscreener.getPairsByAddresses(addresses);
    
    // Create a map for fast lookup
    const pairMap = {};
    for (const p of pairs) {
      if (p) pairMap[p.address] = p;
    }

    for (const trade of openTrades) {
      try {
        let pair = pairMap[trade.token_address];
        
        let currentPrice = 0;
        let currentLiquidity = 0;
        let currentVolume = 0;

        if (pair) {
          currentPrice = parseFloat(pair.priceUsd || '0');
          currentLiquidity = pair.liquidity?.usd || 0;
          currentVolume = pair.volume?.h24 || 0;
        } else {
          // Fallback to Birdeye if DexScreener is blocked
          const overview = await birdeye.getTokenOverview(trade.token_address);
          if (!overview) {
            logger.warn('Could not fetch price from DexScreener or Birdeye for trade', { tradeId: trade.id });
            continue;
          }
          currentPrice = parseFloat(overview.price || '0');
          currentLiquidity = overview.liquidity || 0;
          currentVolume = overview.v24hUSD || 0;
          
          // Safety delay for Birdeye API limit ONLY if we hit Birdeye
          await new Promise(r => setTimeout(r, 300));
        }

        if (currentPrice <= 0) continue;

        // Record price history
        await db.insertPriceHistory({
          token_address: trade.token_address,
          price: currentPrice,
          liquidity_usd: currentLiquidity,
          volume_usd: currentVolume,
        });

        // Run exit ladder logic
        await exitLadder.processExitLadder(trade, currentPrice, currentLiquidity, settings);

      } catch (err) {
        logger.error('Error tracking price for trade', {
          tradeId: trade.id,
          error: err.message,
        });
      }
    }

    // ── Global TP / SL Evaluation ──
    const globalTp = parseFloat(settings.global_tp_usd);
    const globalSl = parseFloat(settings.global_sl_usd);

    if (!isNaN(globalTp) || !isNaN(globalSl)) {
      const currentOpen = await db.getOpenTrades();
      if (currentOpen.length > 0) {
        const sessionStart = settings.session_start_time || '1970-01-01T00:00:00.000Z';
        let totalNetPnl = await db.getSessionClosedPnl(sessionStart);
        const tradesToClose = [];

        for (const t of currentOpen) {
          if (t.current_price) {
            const pnlPct = ((t.current_price - t.entry_price) / t.entry_price) * 100;
            const remainingPct = parseFloat(t.remaining_position_pct || 100);
            const unrealized = (t.position_size_usd * remainingPct / 100) * (pnlPct / 100);
            totalNetPnl += parseFloat(t.realized_pnl_usd || 0) + unrealized;
            
            tradesToClose.push({ trade: t, pnlPct });
          }
        }

        logger.info(`Evaluating Global TP/SL -> totalNetPnl: ${totalNetPnl}, globalTp: ${globalTp}`);
        
        try {
          require('fs').writeFileSync('debug.txt', `[${new Date().toISOString()}] totalNetPnl: ${totalNetPnl}, globalTp: ${globalTp}\n`, { flag: 'a' });
        } catch(e) {}

        let triggerReason = null;
        if (!isNaN(globalTp) && totalNetPnl >= globalTp) {
          triggerReason = 'global_tp';
          logger.info(`Session Take Profit hit: $${totalNetPnl.toFixed(2)} >= $${globalTp}`);
        } else if (!isNaN(globalSl) && totalNetPnl <= -Math.abs(globalSl)) {
          triggerReason = 'global_sl';
          logger.info(`Session Stop Loss hit: $${totalNetPnl.toFixed(2)} <= -$${Math.abs(globalSl)}`);
        }

        if (triggerReason) {
          for (const { trade, pnlPct } of tradesToClose) {
            try {
              const holdSeconds = Math.floor((Date.now() - new Date(trade.entry_time).getTime()) / 1000);
              await exitLadder.closeTrade(trade, trade.current_price, triggerReason, pnlPct, holdSeconds);
            } catch (e) {
              logger.error('Failed to close trade on global TP/SL', { tradeId: trade.id, error: e.message });
            }
          }
          
          // Reset the Session!
          logger.info(`Resetting Rolling PnL Session back to $0`);
          const nowIso = new Date().toISOString();
          await settingsDb.updateSettings({ session_start_time: nowIso });
          settings.session_start_time = nowIso;
        }
      }
    }
    // ───────────────────────────────

  } catch (err) {
    logger.error('Price tracker error', { error: err.message });
  } finally {
    isRunning = false;
  }
}

module.exports = { trackPrices, setSettings };
