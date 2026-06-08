const db = require('../db/trades');
const logger = require('../utils/logger');
const { emit } = require('../websocket/liveEvents');
const axios = require('axios');
const feeCalculator = require('./feeCalculator');

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
  const deadPoolLiq = parseFloat(settings.dead_pool_liquidity_usd || 1000);
  const liqDropPctThreshold = parseFloat(settings.liquidity_drop_pct || 50);

  // Dead pool exit (liquidity completely vanished)
  if (currentLiquidity < deadPoolLiq) {
    return await closeTrade(trade, currentPrice, 'rug_pull', pnlPct, holdSeconds, currentLiquidity);
  }

  // Stop loss
  if (pnlPct <= -stopLossPct) {
    return await closeTrade(trade, currentPrice, 'stop_loss', pnlPct, holdSeconds, currentLiquidity);
  }

  // Time exit (3 hours + under 20% gain)
  if (holdHours >= timeExitHours && pnlPct < 20) {
    return await closeTrade(trade, currentPrice, 'time_exit', pnlPct, holdSeconds, currentLiquidity);
  }

  // Liquidity drop exit
  if (currentLiquidity !== undefined && trade.entry_liquidity_usd > 0) {
    const liqDrop = ((trade.entry_liquidity_usd - currentLiquidity) / trade.entry_liquidity_usd) * 100;
    if (liqDrop > liqDropPctThreshold) {
      return await closeTrade(trade, currentPrice, 'liquidity_drop', pnlPct, holdSeconds, currentLiquidity);
    }
  }

  const exitLadderEnabled = settings.exit_ladder_enabled !== 'false';
  const takeProfitPct = parseFloat(settings.take_profit_pct || 0);

  // Simple Take Profit (if set, and we reached it)
  if (takeProfitPct > 0 && pnlPct >= takeProfitPct) {
    return await closeTrade(trade, currentPrice, 'take_profit', pnlPct, holdSeconds, currentLiquidity);
  }

  // ── LADDER EXITS ─────────────────────────────────────────────
  let remainingPct = trade.remaining_position_pct || 100;
  let realizedPnl = trade.realized_pnl_usd || 0;
  let accumulatedFeesUsd = trade.fees_usd || 0;
  let feeBreakdown = trade.fee_breakdown || {};
  let ladderUpdated = false;
  const partialSells = [];

  const handlePartialSell = (levelKey, displayLevel, sellPctTarget, isHit) => {
    if (pnlPct >= displayLevel && !isHit) {
      let sellPct = remainingPct * (sellPctTarget / 100);
      if (levelKey === 'level_1' || levelKey === 'level_2' || levelKey === 'level_3') {
        sellPct = sellPctTarget; // Absolute percentage for the first 3
      }

      const originalAmount = (trade.position_size_usd * sellPct / 100);
      const grossExitValue = originalAmount * (1 + (pnlPct / 100));
      
      const feeResult = feeCalculator.calculateVirtualSell(grossExitValue, feeCalculator.DEFAULT_SOL_PRICE, false);
      
      // Update PnL: (Exit Value - Original Amount) - Exit Fees
      const netGainOnSell = (grossExitValue - originalAmount) - feeResult.exitFriction;
      
      realizedPnl += netGainOnSell;
      accumulatedFeesUsd += feeResult.exitFriction;
      
      feeBreakdown.exitGas = (feeBreakdown.exitGas || 0) + feeResult.breakdown.exitGas;
      feeBreakdown.exitSwap = (feeBreakdown.exitSwap || 0) + feeResult.breakdown.exitSwap;

      remainingPct -= sellPct;
      ladder[levelKey] = true;
      ladderUpdated = true;
      partialSells.push({ level: levelKey, pnlPct, sellPct: sellPct.toFixed(1), gainOnSell: netGainOnSell });
      logger.info(`Ladder exit ${levelKey} (+${displayLevel}%)`, { tradeId: trade.id, pnlPct: pnlPct.toFixed(2), fees: feeResult.exitFriction.toFixed(4) });
    }
  };

  if (exitLadderEnabled) {
    handlePartialSell('level_1', level1, sell1, isHit1);
    handlePartialSell('level_2', level2, sell2, isHit2);
    handlePartialSell('level_3', level3, sell3, isHit3);
    handlePartialSell('level_4', level4, sell4, isHit4);
    
    // For backward compatibility keys
    if (ladder['level_1']) ladder['200pct'] = true;
    if (ladder['level_2']) ladder['500pct'] = true;
    if (ladder['level_3']) ladder['1000pct'] = true;
    if (ladder['level_4']) ladder['3000pct'] = true;
  }

  if (ladderUpdated) {
    const updatedTrade = await db.updateTrade(trade.id, {
      exit_ladder_progress: ladder,
      realized_pnl_usd: realizedPnl,
      fees_usd: accumulatedFeesUsd,
      fee_breakdown: feeBreakdown,
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

async function closeTrade(trade, exitPrice, reason, pnlPct, holdSeconds, currentLiquidity = 0) {
  const remainingPct = trade.remaining_position_pct || 100;
  
  // Smart Market Exit Logic for Rug Pulls / Liquidity Drops
  if (reason === 'liquidity_drop' || reason === 'rug_pull') {
    const remainingValueUsd = trade.position_size_usd * (remainingPct / 100);
    const currentTheoreticalValue = remainingValueUsd * (1 + (pnlPct / 100));
    
    // If the pool is literally dead (< $100) or if our tokens are worth more than the entire pool, we can't sell.
    if (currentLiquidity < 100 || currentTheoreticalValue > currentLiquidity) {
      pnlPct = -100;
    } else {
      // We can squeeze out! Remove the -100% penalty and capture the real market PnL.
      logger.info('Smart Market Exit executed for small position', { 
        tradeId: trade.id, 
        currentValue: currentTheoreticalValue.toFixed(2), 
        liquidityLeft: currentLiquidity.toFixed(2) 
      });
    }
  }

  let realizedPnl = trade.realized_pnl_usd || 0;
  let accumulatedFeesUsd = trade.fees_usd || 0;
  let feeBreakdown = trade.fee_breakdown || {};

  const originalAmount = trade.position_size_usd * (remainingPct / 100);
  const grossExitValue = originalAmount * (1 + (pnlPct / 100));

  let finalGain = 0;
  
  if (pnlPct === -100) {
    // Rug Pull: Burn & Close
    const feeResult = feeCalculator.calculateVirtualRugPull(feeCalculator.DEFAULT_SOL_PRICE);
    finalGain = -originalAmount - feeResult.exitFriction;
    
    accumulatedFeesUsd += feeResult.exitFriction;
    feeBreakdown.exitGas = (feeBreakdown.exitGas || 0) + feeResult.breakdown.exitGas;
    feeBreakdown.exitRentRefund = (feeBreakdown.exitRentRefund || 0) + feeResult.breakdown.exitRentRefund;
    
    logger.info('Burn & Close fallback executed', { tradeId: trade.id, rentRecovered: feeResult.breakdown.exitRentRefund });
  } else {
    // Standard Sell & Close
    const feeResult = feeCalculator.calculateVirtualSell(grossExitValue, feeCalculator.DEFAULT_SOL_PRICE, true);
    finalGain = (grossExitValue - originalAmount) - feeResult.exitFriction;

    accumulatedFeesUsd += feeResult.exitFriction;
    feeBreakdown.exitGas = (feeBreakdown.exitGas || 0) + feeResult.breakdown.exitGas;
    feeBreakdown.exitSwap = (feeBreakdown.exitSwap || 0) + feeResult.breakdown.exitSwap;
    feeBreakdown.exitRentRefund = (feeBreakdown.exitRentRefund || 0) + feeResult.breakdown.exitRentRefund;
  }

  const totalPnlUsd = realizedPnl + finalGain;

  const closed = await db.closeTrade(trade.id, {
    exit_price: exitPrice,
    exit_reason: reason,
    pnl_usd: totalPnlUsd,
    pnl_pct: pnlPct,
    hold_time_seconds: holdSeconds,
    high_pnl_pct: Math.max(trade.high_pnl_pct || 0, pnlPct),
    low_pnl_pct:  Math.min(trade.low_pnl_pct  || 0, pnlPct),
    fees_usd: accumulatedFeesUsd,
    fee_breakdown: feeBreakdown,
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
