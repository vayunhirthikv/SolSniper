const dexscreener = require('../api/dexscreener');
const birdeye = require('../api/birdeye');
const hardFilters = require('./hardFilters');
const softScore = require('./softScore');
const tradeManager = require('./tradeManager');
const tokenDb = require('../db/tokens');
const { emit } = require('../websocket/liveEvents');
const logger = require('../utils/logger');

// In-memory set of seen pair addresses to avoid reprocessing
const seenAddresses = new Set();
let currentSettings = {};
let isScanning = false;
let scannerPaused = false;

// ── Concurrency pool ──────────────────────────────────────────────────────────
// Process up to CONCURRENCY tokens in parallel without hammering APIs.
const CONCURRENCY = 2;

async function runPool(items, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) await fn(item).catch(() => {});
    }
  });
  await Promise.all(workers);
}

function setSettings(s) {
  currentSettings = s;
}

function pause() { scannerPaused = true; }
function resume() { scannerPaused = false; }
function getStatus() { return { running: !scannerPaused, isScanning }; }

async function initSeenAddresses() {
  try {
    const { tokens } = await tokenDb.getTokens({ page: 1, limit: 10000 });
    for (const t of tokens) {
      seenAddresses.add(t.address);
    }
    logger.info(`Loaded ${seenAddresses.size} known token addresses into memory`);
  } catch (err) {
    logger.error('Failed to init seen addresses', { error: err.message });
  }
}

async function scanCycle() {
  if (isScanning || scannerPaused) return;
  isScanning = true;

  try {
    logger.debug('Scanner: polling DexScreener and Birdeye...');
    const pairs = await dexscreener.pollNewPairs();
    const birdeyePairs = await birdeye.getNewListings();
    
    // Merge pairs, prioritizing Birdeye for net-new
    for (const bp of birdeyePairs) {
      if (!pairs.find(p => p.address === bp.address)) {
        pairs.push(bp);
      }
    }
    
    logger.debug(`Scanner: got ${pairs.length} pairs combined`);

    // Filter out already-seen tokens immediately
    const newPairs = pairs.filter(p => p.address && !seenAddresses.has(p.address));

    // Announce all new tokens at once (no delay)
    for (const pair of newPairs) {
      emit('new_token_detected', {
        address: pair.address,
        name: pair.name,
        symbol: pair.symbol,
        liquidity: pair.liquidity?.usd,
        age: pair.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 60000 : null,
      });
    }

    // Process all new tokens in parallel (up to CONCURRENCY at once)
    await runPool(newPairs, async (pair) => {
      await processToken(pair).catch(err =>
        logger.error('processToken error', { address: pair.address, error: err.message })
      );
    });

    // Active rechecks — also in parallel
    recheckPendingTokens().catch(err =>
      logger.error('Scanner recheck error', { error: err.message })
    );

  } catch (err) {
    logger.error('Scan cycle error', { error: err.message });
  } finally {
    isScanning = false;
  }
}

async function processToken(pair) {
  const address = pair.address;
  logger.debug('Processing token', { address, name: pair.name });
  
  // Rate limit protection
  await new Promise(r => setTimeout(r, 500));

  // Check if we need to fetch the real market details from DexScreener
  let realPair = pair;
  // If it's a token profile (no pairAddress or 0 liquidity), retrieve real market data
  if (!pair.pairAddress || !pair.liquidity || pair.liquidity.usd === 0) {
    const fetched = await dexscreener.getPairByAddress(address);
    if (fetched) {
      realPair = {
        ...fetched,
        name: pair.name !== 'Unknown' ? pair.name : fetched.name,
        symbol: pair.symbol !== '???' ? pair.symbol : fetched.symbol,
        info: { ...pair.info, ...fetched.info }
      };
    } else {
      // Fallback to Birdeye for volume/liquidity if DexScreener blocks us
      const overview = await birdeye.getTokenOverview(address);
      if (overview) {
        realPair = {
          ...pair,
          liquidity: { usd: overview.liquidity || pair.liquidity.usd || 0 },
          volume: { h24: overview.v24hUSD || 0, h1: overview.v1hUSD || 0, m5: overview.v5mUSD || 0 },
          txns: { h24: { buys: overview.trade24h || 0, sells: 0 } },
          priceUsd: String(overview.price || 0)
        };
      }
    }
  }

  // Check database for existing token
  const existingToken = await tokenDb.getTokenByAddress(address);
  let cachedSecurity = null;

  if (existingToken) {
    const tradesDb = require('../db/trades');
    
    // We no longer skip tokens if they are bought. We let them process again
    // to re-evaluate their soft score, but we will skip buying them later.

    const permanentReasons = ['mint_not_renounced', 'freeze_authority_enabled', 'honeypot', 'high_sell_tax', 'too_old'];
    if (permanentReasons.includes(existingToken.hard_filter_reject_reason)) {
      seenAddresses.add(address);
      return;
    }

    // Reuse security parameters if it didn't fail with api_error
    if (existingToken.hard_filter_reject_reason !== 'api_error') {
      cachedSecurity = {
        mint_renounced: !!existingToken.mint_renounced,
        freeze_disabled: !!existingToken.freeze_disabled,
        honeypot_safe: !!existingToken.honeypot_safe,
        lp_locked: !!existingToken.lp_locked,
      };
    }
  }

  // Run hard filters
  let filterResult;
  try {
    filterResult = await hardFilters.runHardFilters(realPair, currentSettings, cachedSecurity);
  } catch (err) {
    logger.error('Hard filter crash', { address, error: err.message });
    return;
  }

  // Build base token data
  const pairCreatedAt = realPair.pairCreatedAt || Date.now();
  const ageMinutes = (Date.now() - pairCreatedAt) / 60000;
  const info = realPair.info || {};
  const hasTwitter = !!(info.socials?.find(s => s.type === 'twitter') || info.twitter);
  const hasTelegram = !!(info.socials?.find(s => s.type === 'telegram') || info.telegram);
  const hasWebsite = !!(info.websites?.length || info.website);

  const baseTokenData = {
    address,
    name: realPair.name,
    symbol: realPair.symbol,
    detected_at: existingToken ? existingToken.detected_at : new Date().toISOString(),
    pair_age_minutes: ageMinutes,
    liquidity_usd: realPair.liquidity?.usd || 0,
    volume_usd: realPair.volume?.h24 || 0,
    txn_count: (realPair.txns?.h24?.buys || 0) + (realPair.txns?.h24?.sells || 0),
    social_twitter: hasTwitter,
    social_telegram: hasTelegram,
    social_website: hasWebsite,
    ...filterResult.tokenData,
    hard_filter_passed: filterResult.passed,
    hard_filter_reject_reason: filterResult.reason,
  };

  if (!filterResult.passed) {
    // Save rejected token
    const savedToken = await tokenDb.upsertToken(baseTokenData);
    if (filterResult.details.length > 0 && savedToken) {
      await tokenDb.saveFilterResults(savedToken.id, filterResult.details);
    }

    emit('token_rejected', {
      address,
      name: realPair.name,
      reason: filterResult.reason,
      timestamp: new Date().toISOString(),
    });

    logger.debug('Token rejected', { address, reason: filterResult.reason });

    // If permanently rejected (or too old), add to seenAddresses so we don't scan it again
    const permanentReasons = ['mint_not_renounced', 'freeze_authority_enabled', 'honeypot', 'high_sell_tax', 'too_old'];
    if (permanentReasons.includes(filterResult.reason)) {
      seenAddresses.add(address);
    }
    return;
  }

  // Run soft scoring
  let scoreResult;
  try {
    scoreResult = await softScore.calculateSoftScore(realPair, { ...filterResult.tokenData, address });
  } catch (err) {
    logger.error('Soft score error', { address, error: err.message });
    return;
  }

  const minScore = parseInt(currentSettings.min_soft_score || 4);
  const fullTokenData = {
    ...baseTokenData,
    soft_score: scoreResult.score,
    soft_score_breakdown: scoreResult.breakdown,
    pumpfun_graduated: scoreResult.breakdown?.pumpfun_graduated > 0,
  };

  const savedToken = await tokenDb.upsertToken(fullTokenData);
  if (filterResult.details.length > 0 && savedToken) {
    await tokenDb.saveFilterResults(savedToken.id, filterResult.details);
  }

  emit('token_scored', {
    address,
    name: realPair.name,
    symbol: realPair.symbol,
    score: scoreResult.score,
    breakdown: scoreResult.breakdown,
    timestamp: new Date().toISOString(),
  });

  logger.info('Token scored', { address, name: realPair.name, score: scoreResult.score });

  if (scoreResult.score < minScore) {
    logger.debug('Token below min score, no trade', { address, score: scoreResult.score, minScore });
    return;
  }

  // Execute virtual buy if not already bought
  const tradesDb = require('../db/trades');
  const alreadyBought = await tradesDb.hasTradeForToken(address);
  if (!alreadyBought) {
    const trade = await tradeManager.executeBuy(
      savedToken,
      realPair,
      scoreResult.score,
      scoreResult.breakdown,
      currentSettings
    );

    if (trade) {
      logger.info('Trade opened', {
        token: realPair.name,
        score: scoreResult.score,
        position: trade.position_size_usd,
      });
    }
  } else {
    logger.debug('Token already bought, skipped executeBuy', { address });
  }
}

async function recheckPendingTokens() {
  try {
    const maxAge = parseFloat(currentSettings.max_pair_age_minutes || 20);
    const pendingTokens = await tokenDb.getTransientlyRejectedTokens(maxAge);

    if (pendingTokens.length === 0) return;

    logger.debug(`Scanner: rechecking ${pendingTokens.length} pending token(s)`);

    const toAgeOut = [];
    const toRecheck = [];

    for (const token of pendingTokens) {
      const ageMinutes = (Date.now() - new Date(token.detected_at).getTime()) / 60000;
      if (ageMinutes > maxAge) {
        toAgeOut.push({ token, ageMinutes });
      } else {
        toRecheck.push({ token, ageMinutes });
      }
    }

    // Age out tokens
    for (const { token, ageMinutes } of toAgeOut) {
      const address = token.address;
      const baseTokenData = {
        ...token,
        pair_age_minutes: ageMinutes,
        hard_filter_passed: 0,
        hard_filter_reject_reason: 'too_old',
      };
      await tokenDb.upsertToken(baseTokenData);
      seenAddresses.add(address);
      emit('token_rejected', {
        address,
        name: token.name,
        reason: 'too_old',
        timestamp: new Date().toISOString(),
      });
      logger.debug('Token aged out', { address });
    }

    if (toRecheck.length === 0) return;

    // Batch fetch from DexScreener
    const addresses = toRecheck.map(t => t.token.address);
    const pairs = await dexscreener.getPairsByAddresses(addresses);
    
    // Create a map for fast lookup
    const pairMap = {};
    for (const p of pairs) {
      if (p) pairMap[p.address] = p;
    }

    await runPool(toRecheck, async ({ token, ageMinutes }) => {
      const address = token.address;
      const pair = pairMap[address];
      
      if (pair) {
        await processToken({
          ...pair,
          pairCreatedAt: new Date(token.detected_at).getTime(),
        }).catch(err => logger.error('processToken error in recheck', { address, error: err.message }));
      } else {
        // Fallback: pass a stub pair to trigger processToken's Birdeye fallback
        await processToken({
          address: token.address,
          name: token.name,
          symbol: token.symbol,
          pairCreatedAt: new Date(token.detected_at).getTime(),
        }).catch(err => logger.error('processToken error in recheck (Birdeye fallback)', { address, error: err.message }));
      }
    });

  } catch (err) {
    logger.error('Error in recheckPendingTokens', { error: err.message });
  }
}

function clearSeenAddresses() {
  seenAddresses.clear();
  logger.info('Cleared seen token addresses from memory');
}

module.exports = {
  scanCycle,
  initSeenAddresses,
  setSettings,
  pause,
  resume,
  getStatus,
  processToken,
  clearSeenAddresses,
  getSettings: () => currentSettings,
};
