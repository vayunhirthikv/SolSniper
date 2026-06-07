const db = require('../db/trades');
const logger = require('../utils/logger');
const { emit } = require('../websocket/liveEvents');
const axios = require('axios');

/**
 * Process exit ladder logic for an open trade
 * Returns { closed: bool, partialSells: [], trade: updatedTrade }
 */
async function processExitLadder(trade, currentPrice, currentLiquidity, settings) {
  const stopLossPct = parseFloat(settings.stop_loss_pct || 65);
  const timeExitHours = parseFloat(settings.time_exit_hours || 3);

  // Load custom exit ladder settings or fall back to defaults
  const level1 = parseFloat(settings.exit_ladder_level_1 || 200);
  const sell1 = parseFloat(settings.exit_ladder_sell_1 || 20);
  const level2 = parseFloat(settings.exit_ladder_level_2 || 500);
  const sell2 = parseFloat(settings.exit_ladder_sell_2 || 20);
  const level3 = parseFloat(settings.exit_ladder_level_3 || 1000);
  const sell3 = parseFloat(settings.exit_ladder_sell_3 || 20);
  const level4 = parseFloat(settings.exit_ladder_level_4 || 3000);
  const sell4 = parseFloat(settings.exit_ladder_sell_4 || 50);

  const entryPrice = trade.entry_price;
  const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
  const holdSeconds = Math.floor((Date.now() - new Date(trade.entry_time).getTime()) / 1000);
  const holdHours = holdSeconds / 3600;

  let ladder = trade.exit_ladder_progress || {};

  // Track high and low PnL across the life of the trade
  const highPnl = Math.max(trade.high_pnl_pct || 0, pnlPct);
  const lowPnl  = Math.min(trade.low_pnl_pct  || 0, pnlPct);

  // For backward compatibility and key indexing
  const isHit1 = ladder['level_1'] || ladder['200pct'] || false;
  const isHit2 = ladder['level_2'] || ladder['500pct'] || false;
  const isHit3 = ladder['level_3'] || ladder['1000pct'] || false;
  const isHit4 = ladder['level_4'] || ladder['3000pct'] || false;

  // Update current price + high/low
  await db.updateTrade(trade.id, {
    current_price: currentPrice,
    high_pnl_pct: highPnl,
    low_pnl_pct: lowPnl,
  });

  // ── EMERGENCY EXITS ──────────────────────────────────────────
  // Dead pool exit (liquidity completely vanished)
  if (currentLiquidity < 1000) {
    return await closeTrade(trade, currentPrice, 'rug_pull', pnlPct, holdSeconds);
  }

  // Stop loss
  if (pnlPct <= -stopLossPct) {
    return await closeTrade(trade, currentPrice, 'stop_loss', pnlPct, holdSeconds);
  }

  // Time exit (3 hours + under 20% gain)
  if (holdHours >= timeExitHours && pnlPct < 20) {
    return await closeTrade(trade, currentPrice, 'time_exit', pnlPct, holdSeconds);
  }

  // Liquidity drop exit (>50% from entry)
  if (currentLiquidity !== undefined && trade.entry_liquidity_usd > 0) {
    const liqDrop = ((trade.entry_liquidity_usd - currentLiquidity) / trade.entry_liquidity_usd) * 100;
    if (liqDrop > 50) {
      return await closeTrade(trade, currentPrice, 'liquidity_drop', pnlPct, holdSeconds);
    }
  }

  const exitLadderEnabled = settings.exit_ladder_enabled !== 'false';
  const takeProfitPct = parseFloat(settings.take_profit_pct || 0);

  // Simple Take Profit (if set, and we reached it)
  if (takeProfitPct > 0 && pnlPct >= takeProfitPct) {
    // If exit ladder is enabled, check if the Take Profit is HIGHER than the highest ladder level.
    // Actually, if TP is hit, we just close the whole trade. The user can use TP instead of the ladder.
    return await closeTrade(trade, currentPrice, 'take_profit', pnlPct, holdSeconds);
  }

  // ── LADDER EXITS ─────────────────────────────────────────────
  let remainingPct = trade.remaining_position_pct || 100;
  let realizedPnl = trade.realized_pnl_usd || 0;
  let ladderUpdated = false;
  const partialSells = [];

  if (exitLadderEnabled) {
    // Level 1
    if (pnlPct >= level1 && !isHit1) {
    const sellPct = sell1;
    const sellAmount = (trade.position_size_usd * sellPct / 100);
    const gainOnSell = sellAmount * (pnlPct / 100);
    realizedPnl += gainOnSell;
    remainingPct -= sellPct;
    ladder['level_1'] = true;
    ladder['200pct'] = true; // Set both for safety
    ladderUpdated = true;
    partialSells.push({ level: 'level_1', pnlPct, sellPct, gainOnSell });
    logger.info(`Ladder exit level 1 (+${level1}%)`, { tradeId: trade.id, pnlPct: pnlPct.toFixed(2) });
  }

  // Level 2
  if (pnlPct >= level2 && !isHit2) {
    const sellPct = sell2;
    const sellAmount = (trade.position_size_usd * sellPct / 100);
    const gainOnSell = sellAmount * (pnlPct / 100);
    realizedPnl += gainOnSell;
    remainingPct -= sellPct;
    ladder['level_2'] = true;
    ladder['500pct'] = true;
    ladderUpdated = true;
    partialSells.push({ level: 'level_2', pnlPct, sellPct, gainOnSell });
    logger.info(`Ladder exit level 2 (+${level2}%)`, { tradeId: trade.id, pnlPct: pnlPct.toFixed(2) });
  }

  // Level 3
  if (pnlPct >= level3 && !isHit3) {
    const sellPct = sell3;
    const sellAmount = (trade.position_size_usd * sellPct / 100);
    const gainOnSell = sellAmount * (pnlPct / 100);
    realizedPnl += gainOnSell;
    remainingPct -= sellPct;
    ladder['level_3'] = true;
    ladder['1000pct'] = true;
    ladderUpdated = true;
    partialSells.push({ level: 'level_3', pnlPct, sellPct, gainOnSell });
    logger.info(`Ladder exit level 3 (+${level3}%)`, { tradeId: trade.id, pnlPct: pnlPct.toFixed(2) });
  }

    // Level 4
    if (pnlPct >= level4 && !isHit4) {
      const sellPct = remainingPct * (sell4 / 100); // e.g. sellPct% of what's left
      const sellAmount = (trade.position_size_usd * sellPct / 100);
      const gainOnSell = sellAmount * (pnlPct / 100);
      realizedPnl += gainOnSell;
      remainingPct -= sellPct;
      ladder['level_4'] = true;
      ladder['3000pct'] = true;
      ladderUpdated = true;
      partialSells.push({ level: 'level_4', pnlPct, sellPct: sellPct.toFixed(1), gainOnSell });
      logger.info(`Ladder exit level 4 (+${level4}%)`, { tradeId: trade.id, pnlPct: pnlPct.toFixed(2) });
    }
  }

  if (ladderUpdated) {
    const updatedTrade = await db.updateTrade(trade.id, {
      exit_ladder_progress: ladder,
      realized_pnl_usd: realizedPnl,
      remaining_position_pct: remainingPct,
    });

    // Calculate total PnL (realized + unrealized on remaining)
    const unrealizedPnl = (trade.position_size_usd * remainingPct / 100) * (pnlPct / 100);
    const totalPnl = realizedPnl + unrealizedPnl;

    emit('price_update', {
      tradeId: trade.id,
      tokenAddress: trade.token_address,
      currentPrice,
      pnlPct,
      pnlUsd: totalPnl,
      ladder,
      remainingPct,
      realizedPnl,
      partialSells,
      highPnl,
      lowPnl,
    });

    return { closed: false, partialSells, trade: updatedTrade };
  }

  // No exits triggered — just emit price update
  const unrealizedPnl = (trade.position_size_usd * remainingPct / 100) * (pnlPct / 100);
  const totalPnl = (trade.realized_pnl_usd || 0) + unrealizedPnl;

  emit('price_update', {
    tradeId: trade.id,
    tokenAddress: trade.token_address,
    currentPrice,
    pnlPct,
    pnlUsd: totalPnl,
    ladder,
    remainingPct,
    highPnl,
    lowPnl,
  });

  return { closed: false, partialSells: [], trade };
}

async function closeTrade(trade, exitPrice, reason, pnlPct, holdSeconds) {
  // If the pool was rug pulled or liquidity dropped, force a -100% loss (can't sell)
  if (reason === 'liquidity_drop' || reason === 'rug_pull') {
    pnlPct = -100;
  }

  const remainingPct = trade.remaining_position_pct || 100;
  const realizedPnl = trade.realized_pnl_usd || 0;

  // Final sell of remaining position
  const remainingValue = trade.position_size_usd * remainingPct / 100;
  const finalGain = remainingValue * (pnlPct / 100);
  const totalPnlUsd = realizedPnl + finalGain;

  const closed = await db.closeTrade(trade.id, {
    exit_price: exitPrice,
    exit_reason: reason,
    pnl_usd: totalPnlUsd,
    pnl_pct: pnlPct,
    hold_time_seconds: holdSeconds,
    high_pnl_pct: Math.max(trade.high_pnl_pct || 0, pnlPct),
    low_pnl_pct:  Math.min(trade.low_pnl_pct  || 0, pnlPct),
  });

  logger.info('Trade closed', {
    tradeId: trade.id,
    token: trade.token_name,
    reason,
    pnlPct: pnlPct.toFixed(2),
    pnlUsd: totalPnlUsd.toFixed(4),
    holdSeconds,
  });

  emit('trade_closed', {
    trade: closed,
    reason,
    pnlPct,
    pnlUsd: totalPnlUsd,
  });

  const settings = require('./scanner').getSettings(); // Fetch current settings to check for TG
  if (settings && settings.telegram_bot_token && settings.telegram_chat_id) {
    try {
      const msg = `🛑 *Trade Closed* 🛑\n\n` +
                  `Token: ${trade.token_name}\n` +
                  `Reason: ${reason.replace('_', ' ')}\n` +
                  `PnL: ${totalPnlUsd >= 0 ? '+' : ''}$${totalPnlUsd.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)\n` +
                  `Hold Time: ${Math.floor(holdSeconds / 60)}m`;
                  
      axios.post(`https://api.telegram.org/bot${settings.telegram_bot_token}/sendMessage`, {
        chat_id: settings.telegram_chat_id,
        text: msg,
        parse_mode: 'Markdown'
      }).catch(err => {
        logger.error('Failed to send Telegram close alert', { error: err.message });
      });
    } catch (e) {
      logger.error('Failed to format Telegram close alert', { error: e.message });
    }
  }

  return { closed: true, partialSells: [], trade: closed };
}

module.exports = { processExitLadder, closeTrade };
