const axios = require('axios');
const logger = require('../utils/logger');

const BASE_URL = 'https://api.gopluslabs.io/api/v1';

// Rate limit: 500ms between calls
let lastCallTime = 0;

async function rateLimit() {
  const now = Date.now();
  const wait = 500 - (now - lastCallTime);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCallTime = Date.now();
}

async function getSolanaTokenSecurity(address) {
  await rateLimit();
  try {
    const params = { contract_addresses: address };
    if (process.env.GOPLUS_API_KEY) {
      params.api_key = process.env.GOPLUS_API_KEY;
    }

    const response = await axios.get(`${BASE_URL}/solana/token_security`, {
      params,
      timeout: 12000,
      headers: { 'Accept': 'application/json' },
    });

    const data = response.data?.result?.[address.toLowerCase()] || 
                 response.data?.result?.[address] ||
                 Object.values(response.data?.result || {})[0];
    return data;
  } catch (err) {
    logger.error('GoPlus getSolanaTokenSecurity failed', { address, error: err.message });
    throw new Error(`GoPlus API error: ${err.message}`);
  }
}

function isHoneypot(securityData) {
  if (!securityData) return false;
  return securityData.is_honeypot === '1' || securityData.cannot_sell === '1';
}

function getSellTax(securityData) {
  if (!securityData) return 0;
  return parseFloat(securityData.sell_tax || '0');
}

module.exports = { getSolanaTokenSecurity, isHoneypot, getSellTax };
