const axios = require('axios');
const logger = require('../utils/logger');

const BASE_URL = 'https://api.dexscreener.com';

async function getSolanaPairs() {
  try {
    const response = await axios.get(`${BASE_URL}/token-boosts/latest/v1`, {
      timeout: 10000,
    });
    return response.data || [];
  } catch (err) {
    // Fall back to the standard pairs endpoint
    try {
      const res2 = await axios.get(`${BASE_URL}/latest/dex/pairs/solana`, { timeout: 10000 });
      return res2.data?.pairs || [];
    } catch (err2) {
      logger.error('DexScreener getSolanaPairs failed', { error: err2.message });
      return [];
    }
  }
}

async function getPairByAddress(address) {
  try {
    const response = await axios.get(`${BASE_URL}/latest/dex/tokens/${address}`, {
      timeout: 8000,
    });
    const pairs = response.data?.pairs || [];
    const pair = pairs.find(p => p.chainId === 'solana') || pairs[0] || null;
    return pair ? normalizePair(pair) : null;
  } catch (err) {
    logger.error('DexScreener getPairByAddress failed', { address, error: err.message });
    return null;
  }
}

async function getNewSolanaPairs() {
  try {
    const response = await axios.get(`${BASE_URL}/token-profiles/latest/v1`, {
      timeout: 10000,
    });
    return response.data || [];
  } catch {
    return [];
  }
}

// Main polling function — returns array of pair objects
async function pollNewPairs() {
  const results = [];
  const sources = [
    `${BASE_URL}/token-boosts/latest/v1`,
    `${BASE_URL}/token-profiles/latest/v1`,
  ];

  const fetchPromises = sources.map(url => axios.get(url, { timeout: 10000 }).then(res => res.data));
  const responses = await Promise.allSettled(fetchPromises);
  
  for (const response of responses) {
    if (response.status === 'fulfilled') {
      const data = response.value;
      if (Array.isArray(data)) results.push(...data);
      else if (data?.pairs) results.push(...data.pairs);
    } else {
      logger.warn('DexScreener source failed', { error: response.reason.message });
    }
  }

  // Normalize each pair to a common structure
  return results
    .filter(p => p.chainId === 'solana' || p.url?.includes('/solana/'))
    .map(normalizePair)
    .filter(Boolean);
}

function normalizePair(pair) {
  try {
    // Handle token profile format
    if (pair.tokenAddress && !pair.pairAddress) {
      return {
        address: pair.tokenAddress,
        name: pair.description || 'Unknown',
        symbol: pair.symbol || '???',
        pairAddress: pair.tokenAddress,
        liquidity: { usd: 0 },
        volume: { h24: 0, h1: 0, m5: 0 },
        txns: { h24: { buys: 0, sells: 0 } },
        pairCreatedAt: Date.now(),
        priceUsd: '0',
        info: pair.links ? {
          twitter: pair.links.find(l => l.type === 'twitter')?.url,
          telegram: pair.links.find(l => l.type === 'telegram')?.url,
          websites: pair.links.filter(l => l.type === 'website').map(l => ({ url: l.url })),
        } : {},
        dexId: 'unknown',
        baseToken: { address: pair.tokenAddress, name: pair.description, symbol: pair.symbol },
      };
    }

    return {
      address: pair.baseToken?.address || pair.pairAddress,
      name: pair.baseToken?.name || 'Unknown',
      symbol: pair.baseToken?.symbol || '???',
      pairAddress: pair.pairAddress,
      liquidity: pair.liquidity || { usd: 0 },
      volume: pair.volume || { h24: 0, h1: 0, m5: 0 },
      txns: pair.txns || { h24: { buys: 0, sells: 0 } },
      pairCreatedAt: pair.pairCreatedAt || Date.now(),
      priceUsd: pair.priceUsd || '0',
      info: pair.info || {},
      dexId: pair.dexId,
      baseToken: pair.baseToken,
      quoteToken: pair.quoteToken,
    };
  } catch {
    return null;
  }
}

module.exports = { getSolanaPairs, getPairByAddress, pollNewPairs, normalizePair };
