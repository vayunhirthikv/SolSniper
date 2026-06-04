const axios = require('axios');
const logger = require('../utils/logger');

const BASE_URL = 'https://api.rugcheck.xyz/v1';

async function getTokenReport(address) {
  try {
    const response = await axios.get(`${BASE_URL}/tokens/${address}/report`, {
      timeout: 10000,
      headers: { 'Accept': 'application/json' },
    });
    return response.data;
  } catch (err) {
    logger.error('RugCheck getTokenReport failed', { address, error: err.message });
    throw new Error(`RugCheck API error: ${err.message}`);
  }
}

function parseMintAuthority(report) {
  // mintAuthority null means renounced
  return report?.mintAuthority === null || report?.mintAuthority === undefined || report?.mintAuthority === '';
}

function parseFreezeAuthority(report) {
  return report?.freezeAuthority === null || report?.freezeAuthority === undefined || report?.freezeAuthority === '';
}

function parseLpLocked(report) {
  try {
    const markets = report?.markets || [];
    return markets.some(m => m.lp?.lpLocked || m.lp?.lpLockedPct > 0);
  } catch {
    return false;
  }
}

function parseRiskScore(report) {
  return report?.score || 0;
}

module.exports = { getTokenReport, parseMintAuthority, parseFreezeAuthority, parseLpLocked, parseRiskScore };
