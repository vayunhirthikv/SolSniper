const db = require('../db/trades');
const logger = require('../utils/logger');
const { emit } = require('../websocket/liveEvents');
const axios = require('axios');

/**
 * Execute a virtual buy for a token
 */
async function executeBuy(token, pair, score, breakdown, settings) {
  // Check daily loss limit
  const todayLosses = await db.getTodayLosses();
  const dailyLimit = parseFloat(settings.daily_loss_limit_usd || 40);

  if (todayLosses >= dailyLimit) {
    logger.warn('Daily loss limit reached — skipping buy', {
      todayLosses,
      limit: dailyLimit,
    });
    emit('daily_limit_reached', { losses: todayLosses, limit: dailyLimit });
    return null;
  }

  // Determine position size
  let positionSize = getPositionSize(score, settings);

  // Bonus for pumpfun + strong social
  const hasSocial = breakdown.social_twitter && breakdown.social_telegram;
  if (token.pumpfun_graduated && hasSocial) {
    positionSize += parseFloat(settings.pumpfun_social_bonus || 0.50);
  }

  const entryPrice = parseFloat(pair.priceUsd || '0');

  if (entryPrice <= 0) {
    logger.warn('Invalid entry price, skipping buy', { address: token.address, entryPrice });
    return null;
  }

  const trade = await db.createTrade({
    token_id: token.id,
    token_address: token.address,
    token_name: token.name,
    entry_price: entryPrice,
    position_size_usd: positionSize,
    soft_score_at_entry: score,
    current_price: entryPrice,
    entry_liquidity_usd: pair.liquidity?.usd || 0,
    exit_ladder_progress: {
      '200pct': false,
      '500pct': false,
      '1000pct': false,
      '3000pct': false,
    },
    realized_pnl_usd: 0,
    remaining_position_pct: 100,
  });

  logger.info('Virtual buy executed', {
    token: token.name,
    address: token.address,
    score,
    positionSize,
    entryPrice,
    tradeId: trade.id,
  });

  emit('trade_opened', {
    trade,
    token: { name: token.name, symbol: token.symbol, address: token.address },
    score,
    positionSize,
    entryPrice,
  });

  if (settings.telegram_bot_token && settings.telegram_chat_id) {
    try {
      const msg = `🚨 *New Trade Opened* 🚨\n\n` +
                  `Token: ${token.name} (${token.symbol})\n` +
                  `Address: \`${token.address}\`\n` +
                  `Score: ${score}\n` +
                  `Entry Price: $${entryPrice.toFixed(6)}\n` +
                  `Position Size: $${positionSize.toFixed(2)}`;
                  
      axios.post(`https://api.telegram.org/bot${settings.telegram_bot_token}/sendMessage`, {
        chat_id: settings.telegram_chat_id,
        text: msg,
        parse_mode: 'Markdown'
      }).catch(err => {
        logger.error('Failed to send Telegram alert', { error: err.message });
      });
    } catch (e) {
      logger.error('Failed to format Telegram alert', { error: e.message });
    }
  }

  return trade;
}

function getPositionSize(score, settings) {
  const tiers = [
    { s: parseFloat(settings.pos_tier4_score || 7), size: parseFloat(settings.pos_tier4_size || settings.position_size_score_7plus || 2.50) },
    { s: parseFloat(settings.pos_tier3_score || 6), size: parseFloat(settings.pos_tier3_size || settings.position_size_score_6 || 2.00) },
    { s: parseFloat(settings.pos_tier2_score || 5), size: parseFloat(settings.pos_tier2_size || settings.position_size_score_5 || 1.25) },
    { s: parseFloat(settings.pos_tier1_score || 4), size: parseFloat(settings.pos_tier1_size || settings.position_size_score_4 || 0.75) },
  ].sort((a, b) => b.s - a.s); // sort highest score first

  for (const tier of tiers) {
    if (score >= tier.s) return tier.size;
  }
  
  // fallback if score is lower than tier1
  return tiers[tiers.length - 1].size; 
}

module.exports = { executeBuy, getPositionSize };
