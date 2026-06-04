const axios = require('axios');
const logger = require('../utils/logger');

const BASE_URL = 'https://pro-api.solscan.io/v2.0';
const FALLBACK_URL = 'https://public-api.solscan.io';

// Rate limit: 1s between calls
let lastCallTime = 0;

async function rateLimit() {
  const now = Date.now();
  const wait = 1000 - (now - lastCallTime);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCallTime = Date.now();
}

async function getTokenHolders(address) {
  await rateLimit();
  try {
    const headers = {
      'Accept': 'application/json',
    };
    if (process.env.SOLSCAN_API_KEY) {
      headers['token'] = process.env.SOLSCAN_API_KEY;
    }

    const response = await axios.get(`${BASE_URL}/token/holders`, {
      params: { address, page: 1, page_size: 20 },
      headers,
      timeout: 12000,
    });

    return response.data?.data?.items || response.data?.data || [];
  } catch (err) {
    // Try fallback
    try {
      const res2 = await axios.get(`${FALLBACK_URL}/token/holders`, {
        params: { tokenAddress: address, limit: 20 },
        timeout: 10000,
      });
      return res2.data?.data || [];
    } catch {
      logger.warn('Solscan getTokenHolders failed', { address, error: err.message });
      return null;
    }
  }
}

async function getTopHolderPct(address) {
  const holders = await getTokenHolders(address);
  if (!holders || holders.length === 0) return null;

  // Return top holder percentage
  const top = holders[0];
  if (top.percent) return parseFloat(top.percent) * 100;
  if (top.amount && top.total) return (top.amount / top.total) * 100;
  return null;
}

async function getTokenMeta(address) {
  try {
    const headers = process.env.SOLSCAN_API_KEY ? { 'token': process.env.SOLSCAN_API_KEY } : {};
    const response = await axios.get(`${BASE_URL}/token/meta`, {
      params: { address },
      headers,
      timeout: 10000,
    });
    return response.data?.data;
  } catch (err) {
    logger.warn('Solscan getTokenMeta failed', { address, error: err.message });
    return null;
  }
}

module.exports = { getTokenHolders, getTopHolderPct, getTokenMeta };
