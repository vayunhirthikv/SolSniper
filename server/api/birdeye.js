const axios = require('axios');
const logger = require('../utils/logger');

const BASE_URL = 'https://public-api.birdeye.so';

async function getTokenTradeData(address) {
  try {
    const response = await axios.get(`${BASE_URL}/defi/v2/tokens/trade-data/single`, {
      params: { address },
      headers: {
        'X-API-KEY': process.env.BIRDEYE_API_KEY || '037286e490514c348a59e39e4441dadc',
        'Accept': 'application/json',
        'x-chain': 'solana',
      },
      timeout: 10000,
    });
    return response.data?.data;
  } catch (err) {
    logger.warn('Birdeye getTokenTradeData failed', { address, error: err.message });
    return null;
  }
}

async function getTokenOverview(address) {
  try {
    const response = await axios.get(`${BASE_URL}/defi/token_overview`, {
      params: { address },
      headers: {
        'X-API-KEY': process.env.BIRDEYE_API_KEY || '037286e490514c348a59e39e4441dadc',
        'Accept': 'application/json',
        'x-chain': 'solana',
      },
      timeout: 10000,
    });
    return response.data?.data;
  } catch (err) {
    logger.warn('Birdeye getTokenOverview failed', { address, error: err.message });
    return null;
  }
}

async function getUniqueWallets(address) {
  const data = await getTokenTradeData(address);
  if (!data) return null;
  return data.uniqueWallet24h || data.unique_wallet_24h || 0;
}

async function checkVolumeAcceleration(address) {
  try {
    // Compare last 5min volume vs previous 5min (using m5 data)
    const overview = await getTokenOverview(address);
    if (!overview) return false;
    // Rough acceleration check via recent vs older volume
    return (overview.v5mUSD || 0) > (overview.v5m2hUSD || 0) / 24;
  } catch {
    return false;
  }
}

async function getNewListings() {
  try {
    const response = await axios.get(`${BASE_URL}/defi/v2/tokens/new_listing?limit=20`, {
      headers: {
        'X-API-KEY': process.env.BIRDEYE_API_KEY || '037286e490514c348a59e39e4441dadc',
        'Accept': 'application/json',
        'x-chain': 'solana',
      },
      timeout: 10000,
    });
    const items = response.data?.data?.items || [];
    return items.map(item => ({
      address: item.address,
      name: item.name || 'Unknown',
      symbol: item.symbol || '???',
      pairAddress: item.address, // Approximation
      liquidity: { usd: item.liquidity || 0 },
      volume: { h24: 0, h1: 0, m5: 0 },
      txns: { h24: { buys: 0, sells: 0 } },
      pairCreatedAt: new Date(item.liquidityAddedAt + 'Z').getTime() || Date.now(),
      priceUsd: '0',
      info: {},
      dexId: item.source || 'unknown',
      baseToken: { address: item.address, name: item.name, symbol: item.symbol }
    }));
  } catch (err) {
    logger.warn('Birdeye getNewListings failed', { error: err.message });
    return [];
  }
}

module.exports = { getTokenTradeData, getTokenOverview, getUniqueWallets, checkVolumeAcceleration, getNewListings };
