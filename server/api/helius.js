const axios = require('axios');
const logger = require('../utils/logger');

const BASE_URL = 'https://api.helius.xyz/v0';

async function getTokenMetadata(address) {
  try {
    if (!process.env.HELIUS_API_KEY) return null;

    const response = await axios.post(
      `${BASE_URL}/token-metadata?api-key=${process.env.HELIUS_API_KEY}`,
      { mintAccounts: [address] },
      { timeout: 10000, headers: { 'Content-Type': 'application/json' } }
    );

    return response.data?.[0] || null;
  } catch (err) {
    logger.warn('Helius getTokenMetadata failed', { address, error: err.message });
    return null;
  }
}

async function getAddressTransactions(address, limit = 50) {
  try {
    if (!process.env.HELIUS_API_KEY) return [];

    const response = await axios.get(
      `${BASE_URL}/addresses/${address}/transactions`,
      {
        params: { 'api-key': process.env.HELIUS_API_KEY, limit },
        timeout: 12000,
      }
    );

    return response.data || [];
  } catch (err) {
    logger.warn('Helius getAddressTransactions failed', { address, error: err.message });
    return [];
  }
}

// Check dev wallet characteristics
// Returns { devWalletPct, devWalletAgeDays } or null
async function getDevWalletInfo(tokenAddress) {
  try {
    const meta = await getTokenMetadata(tokenAddress);
    if (!meta) return null;

    const updateAuthority = meta.onChainMetadata?.metadata?.updateAuthority;
    if (!updateAuthority) return null;

    // Get first transaction of dev wallet to estimate age
    const txns = await getAddressTransactions(updateAuthority, 10);
    if (!txns || txns.length === 0) return null;

    const oldest = txns[txns.length - 1];
    const ageDays = oldest?.timestamp
      ? (Date.now() / 1000 - oldest.timestamp) / 86400
      : 0;

    return {
      devWallet: updateAuthority,
      devWalletAgeDays: Math.round(ageDays),
    };
  } catch (err) {
    logger.warn('Helius getDevWalletInfo failed', { tokenAddress, error: err.message });
    return null;
  }
}

module.exports = { getTokenMetadata, getAddressTransactions, getDevWalletInfo };
