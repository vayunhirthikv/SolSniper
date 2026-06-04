const birdeye = require('../api/birdeye');
const helius = require('../api/helius');
const logger = require('../utils/logger');

/**
 * Calculate soft score 0-10 for a token that passed hard filters
 * Returns { score, breakdown }
 */
async function calculateSoftScore(pair, tokenData) {
  const breakdown = {};
  let score = 0;

  const address = pair.address || tokenData.address;

  // +1 if lp_locked
  breakdown.lp_locked = tokenData.lp_locked ? 1 : 0;
  score += breakdown.lp_locked;

  // +1 if top_wallet_pct < 45
  const topHolderPct = tokenData.top_holder_pct;
  breakdown.top_wallet_low = (topHolderPct !== null && topHolderPct < 45) ? 1 : 0;
  score += breakdown.top_wallet_low;

  // +1 if dev wallet pct < 8 AND dev wallet age > 7 days
  breakdown.dev_wallet_safe = 0;
  try {
    const devInfo = await helius.getDevWalletInfo(address);
    if (devInfo && devInfo.devWalletAgeDays > 7) {
      breakdown.dev_wallet_safe = 1;
      score += 1;
    }
  } catch {
    logger.warn('Helius dev wallet check failed, scoring 0', { address });
  }

  // +1 if holder count increasing (Birdeye)
  breakdown.holder_growth = 0;
  try {
    const tradeData = await birdeye.getTokenTradeData(address);
    if (tradeData) {
      // Use unique wallets trend as proxy
      const w24h = tradeData.uniqueWallet24h || 0;
      const w4h = tradeData.uniqueWallet4h || 0;
      if (w4h > 0 && w24h > 0 && (w4h / (w24h / 6)) > 1.2) {
        breakdown.holder_growth = 1;
        score += 1;
      }
    }
  } catch {
    logger.warn('Birdeye holder growth check failed', { address });
  }

  // +1 if volume acceleration (last 5min > prev 5min)
  breakdown.volume_acceleration = 0;
  try {
    const acc = await birdeye.checkVolumeAcceleration(address);
    if (acc) {
      breakdown.volume_acceleration = 1;
      score += 1;
    }
  } catch {
    logger.warn('Birdeye volume acceleration check failed', { address });
  }

  // Social scoring from DexScreener pair info
  const info = pair.info || {};
  const hasTwitter = !!(info.socials?.find(s => s.type === 'twitter') || info.twitter || tokenData.social_twitter);
  const hasTelegram = !!(info.socials?.find(s => s.type === 'telegram') || info.telegram || tokenData.social_telegram);
  const hasWebsite = !!(info.websites?.length || info.website || tokenData.social_website);

  // +2 if twitter AND telegram AND website, +1 if just twitter OR telegram
  if (hasTwitter && hasTelegram && hasWebsite) {
    breakdown.social = 2;
    score += 2;
  } else if (hasTwitter || hasTelegram) {
    breakdown.social = 1;
    score += 1;
  } else {
    breakdown.social = 0;
  }

  // +2 if pumpfun_graduated
  // Detect: dexId is 'raydium' and pair originated from pump.fun pattern
  const isPumpfunGrad = detectPumpfunGraduated(pair, tokenData);
  tokenData.pumpfun_graduated = isPumpfunGrad;

  breakdown.pumpfun_graduated = isPumpfunGrad ? 2 : 0;
  score += breakdown.pumpfun_graduated;

  return {
    score: Math.min(score, 10),
    breakdown: {
      ...breakdown,
      social_twitter: hasTwitter,
      social_telegram: hasTelegram,
      social_website: hasWebsite,
    },
  };
}

function detectPumpfunGraduated(pair, tokenData) {
  // Pump.fun graduates move to Raydium
  const isRaydium = (pair.dexId || '').toLowerCase().includes('raydium');
  // Additional signals: pair name or URL contains pump
  const isPumpUrl = (pair.url || '').toLowerCase().includes('pump');
  const isPumpLabel = (pair.labels || []).includes('pump.fun');
  return isRaydium && (isPumpUrl || isPumpLabel || tokenData.pumpfun_graduated);
}

module.exports = { calculateSoftScore };
