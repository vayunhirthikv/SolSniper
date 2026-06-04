const rugcheck = require('../api/rugcheck');
const goplus = require('../api/goplus');
const birdeye = require('../api/birdeye');
const solscan = require('../api/solscan');
const logger = require('../utils/logger');

/**
 * Run all 8 hard filters on a token pair from DexScreener
 * Returns { passed: bool, reason: string|null, details: [], tokenData: {} }
 */
async function runHardFilters(pair, settings, cachedSecurity = null) {
  const results = [];
  let tokenData = {};

  const address = pair.address;
  const minLiquidity = parseFloat(settings.min_liquidity_usd || 3000);
  const minVolume = parseFloat(settings.min_volume_usd || 800);
  const maxAge = parseFloat(settings.max_pair_age_minutes || 20);
  const minTxns = parseInt(settings.min_txn_count || 20);
  const minWallets = parseInt(settings.min_unique_wallets || 10);
  const maxTopHolder = parseFloat(settings.max_top_holder_pct || 60);

  // Check 1, 2 & 3: Run RugCheck + GoPlus in parallel (they're independent)
  let mintRenounced, freezeDisabled, lpLocked;
  let honeypotSafe = true;
  let honeypot = false;
  let sellTax = 0;

  if (cachedSecurity) {
    mintRenounced = cachedSecurity.mint_renounced;
    freezeDisabled = cachedSecurity.freeze_disabled;
    lpLocked = cachedSecurity.lp_locked;
    honeypotSafe = cachedSecurity.honeypot_safe;
  } else {
    // Fetch RugCheck + GoPlus simultaneously
    const [rugResult, goplusResult] = await Promise.allSettled([
      rugcheck.getTokenReport(address),
      goplus.getSolanaTokenSecurity(address),
    ]);

    // ── RugCheck ────────────────────────────────────────────────────────────
    if (rugResult.status === 'rejected') {
      logger.warn('RugCheck failed — skipping token', { address, error: rugResult.reason?.message });
      return { passed: false, reason: 'api_error', details: [], tokenData };
    }
    const rugReport = rugResult.value;
    mintRenounced = rugcheck.parseMintAuthority(rugReport);
    freezeDisabled = rugcheck.parseFreezeAuthority(rugReport);
    lpLocked = rugcheck.parseLpLocked(rugReport);

    // ── GoPlus ──────────────────────────────────────────────────────────────
    if (goplusResult.status === 'rejected') {
      logger.warn('GoPlus failed — skipping token', { address, error: goplusResult.reason?.message });
      return { passed: false, reason: 'api_error', details: results, tokenData };
    }
    const secData = goplusResult.value;
    honeypot = goplus.isHoneypot(secData);
    sellTax = goplus.getSellTax(secData);
    honeypotSafe = !honeypot && sellTax <= 15;
  }

  tokenData.mint_renounced = mintRenounced;
  tokenData.freeze_disabled = freezeDisabled;
  tokenData.lp_locked = lpLocked;
  tokenData.honeypot_safe = honeypotSafe;

  // Check 1: Mint authority
  results.push({
    filter_name: 'mint_authority',
    passed: mintRenounced,
    raw_value: mintRenounced ? 'null' : 'present',
    threshold: 'null',
  });
  if (!mintRenounced) {
    return { passed: false, reason: 'mint_not_renounced', details: results, tokenData };
  }

  // Check 2: Freeze authority
  results.push({
    filter_name: 'freeze_authority',
    passed: freezeDisabled,
    raw_value: freezeDisabled ? 'null' : 'present',
    threshold: 'null',
  });
  if (!freezeDisabled) {
    return { passed: false, reason: 'freeze_authority_enabled', details: results, tokenData };
  }

  // Check 3: Honeypot
  results.push({
    filter_name: 'honeypot',
    passed: honeypotSafe,
    raw_value: cachedSecurity ? 'cached (safe)' : `honeypot:${honeypot}, sell_tax:${sellTax}%`,
    threshold: 'not honeypot, sell_tax<=15%',
  });
  if (!honeypotSafe) {
    return {
      passed: false,
      reason: honeypot ? 'honeypot' : 'high_sell_tax',
      details: results,
      tokenData,
    };
  }

  // Check 4: Liquidity
  const liquidityUsd = pair.liquidity?.usd || 0;
  const liquidityPass = liquidityUsd >= minLiquidity;
  tokenData.liquidity_usd = liquidityUsd;

  results.push({
    filter_name: 'liquidity',
    passed: liquidityPass,
    raw_value: `$${liquidityUsd.toFixed(0)}`,
    threshold: `>=$${minLiquidity}`,
  });

  if (!liquidityPass) {
    return { passed: false, reason: 'low_liquidity', details: results, tokenData };
  }

  // Check 5: Volume + Unique Wallets (Birdeye)
  const volume24h = pair.volume?.h24 || 0;
  const volumePass = volume24h >= minVolume;
  tokenData.volume_usd = volume24h;

  results.push({
    filter_name: 'volume',
    passed: volumePass,
    raw_value: `$${volume24h.toFixed(0)}`,
    threshold: `>=$${minVolume}`,
  });

  if (!volumePass) {
    return { passed: false, reason: 'low_volume', details: results, tokenData };
  }

  // Unique wallets check (soft fail — treat as 0 if API fails)
  // Volume already computed from DexScreener data above, Birdeye is for unique wallets
  let uniqueWallets = 0;
  try {
    uniqueWallets = await birdeye.getUniqueWallets(address) || 0;
  } catch {
    uniqueWallets = 0;
  }

  tokenData.unique_wallets = uniqueWallets;
  const walletsPass = uniqueWallets >= minWallets;

  results.push({
    filter_name: 'unique_wallets',
    passed: walletsPass,
    raw_value: String(uniqueWallets),
    threshold: `>=${minWallets}`,
  });

  if (!walletsPass && uniqueWallets > 0) {
    return { passed: false, reason: 'wash_trading', details: results, tokenData };
  }

  // Check 6: Pair Age
  const pairCreatedAt = pair.pairCreatedAt || Date.now();
  const ageMinutes = (Date.now() - pairCreatedAt) / 60000;
  const agePass = ageMinutes <= maxAge;
  tokenData.pair_age_minutes = ageMinutes;

  results.push({
    filter_name: 'pair_age',
    passed: agePass,
    raw_value: `${ageMinutes.toFixed(1)} min`,
    threshold: `<=${maxAge} min`,
  });

  if (!agePass) {
    return { passed: false, reason: 'too_old', details: results, tokenData };
  }

  // Check 7: Transactions
  const txnBuys = pair.txns?.h24?.buys || 0;
  const txnSells = pair.txns?.h24?.sells || 0;
  const txnTotal = txnBuys + txnSells;
  const txnPass = txnTotal >= minTxns;
  tokenData.txn_count = txnTotal;

  results.push({
    filter_name: 'transactions',
    passed: txnPass,
    raw_value: String(txnTotal),
    threshold: `>=${minTxns}`,
  });

  if (!txnPass) {
    return { passed: false, reason: 'low_txns', details: results, tokenData };
  }

  // Check 8: Top Holder (Solscan) — soft fail
  let topHolderPct = null;
  try {
    topHolderPct = await solscan.getTopHolderPct(address);
  } catch {
    topHolderPct = null;
  }

  tokenData.top_holder_pct = topHolderPct;
  const holderPass = topHolderPct === null || topHolderPct <= maxTopHolder;

  results.push({
    filter_name: 'top_holder',
    passed: holderPass,
    raw_value: topHolderPct !== null ? `${topHolderPct.toFixed(1)}%` : 'unknown',
    threshold: `<=${maxTopHolder}%`,
  });

  if (!holderPass) {
    return { passed: false, reason: 'whale_concentration', details: results, tokenData };
  }

  return { passed: true, reason: null, details: results, tokenData };
}

module.exports = { runHardFilters };
