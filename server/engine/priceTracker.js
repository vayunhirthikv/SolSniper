const dexscreener = require('../api/dexscreener');
const db = require('../db/trades');
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

    for (const trade of openTrades) {
      try {
        const pair = await dexscreener.getPairByAddress(trade.token_address);
        if (!pair) {
          logger.warn('Could not fetch price for trade', { tradeId: trade.id });
          continue;
        }

        const currentPrice = parseFloat(pair.priceUsd || '0');
        const currentLiquidity = pair.liquidity?.usd || 0;

        if (currentPrice <= 0) continue;

        // Record price history
        await db.insertPriceHistory({
          token_address: trade.token_address,
          price: currentPrice,
          liquidity_usd: currentLiquidity,
          volume_usd: pair.volume?.h24 || 0,
        });

        // Run exit ladder logic
        await exitLadder.processExitLadder(trade, currentPrice, currentLiquidity, settings);

      } catch (err) {
        logger.error('Error tracking price for trade', {
          tradeId: trade.id,
          error: err.message,
        });
      }

      // Small delay between tokens to avoid rate limits
      await new Promise(r => setTimeout(r, 300));
    }

    // ── Global TP / SL Evaluation ──
    const globalTp = parseFloat(settings.global_tp_usd);
    const globalSl = parseFloat(settings.global_sl_usd);

    if (!isNaN(globalTp) || !isNaN(globalSl)) {
      const currentOpen = await db.getOpenTrades();
      if (currentOpen.length > 0) {
        let totalNetPnl = 0;
        const tradesToClose = [];

        for (const t of currentOpen) {
          if (t.current_price) {
            const pnlPct = ((t.current_price - t.entry_price) / t.entry_price) * 100;
            const remainingPct = t.remaining_position_pct || 100;
            const unrealized = (t.position_size_usd * remainingPct / 100) * (pnlPct / 100);
            totalNetPnl += (t.realized_pnl_usd || 0) + unrealized;
            
            tradesToClose.push({ trade: t, pnlPct });
          }
        }

        let triggerReason = null;
        if (!isNaN(globalTp) && totalNetPnl >= globalTp) {
          triggerReason = 'global_tp';
          logger.info(`Global Take Profit hit: $${totalNetPnl.toFixed(2)} >= $${globalTp}`);
        } else if (!isNaN(globalSl) && totalNetPnl <= -Math.abs(globalSl)) {
          triggerReason = 'global_sl';
          logger.info(`Global Stop Loss hit: $${totalNetPnl.toFixed(2)} <= -$${Math.abs(globalSl)}`);
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
