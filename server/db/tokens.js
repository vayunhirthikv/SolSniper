const { query } = require('./index');

async function upsertToken(data) {
  const result = await query(`
    INSERT INTO tokens (
      address, name, symbol, detected_at, pair_age_minutes,
      liquidity_usd, volume_usd, txn_count, unique_wallets,
      top_holder_pct, mint_renounced, freeze_disabled, honeypot_safe,
      lp_locked, pumpfun_graduated, social_twitter, social_telegram,
      social_website, hard_filter_passed, hard_filter_reject_reason,
      soft_score, soft_score_breakdown
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
    )
    ON CONFLICT(address) DO UPDATE SET
      name = excluded.name,
      symbol = excluded.symbol,
      pair_age_minutes = excluded.pair_age_minutes,
      liquidity_usd = excluded.liquidity_usd,
      volume_usd = excluded.volume_usd,
      txn_count = excluded.txn_count,
      unique_wallets = excluded.unique_wallets,
      top_holder_pct = excluded.top_holder_pct,
      hard_filter_passed = excluded.hard_filter_passed,
      hard_filter_reject_reason = excluded.hard_filter_reject_reason,
      soft_score = excluded.soft_score,
      soft_score_breakdown = excluded.soft_score_breakdown
    RETURNING *
  `, [
    data.address,
    data.name,
    data.symbol,
    data.detected_at ? new Date(data.detected_at).toISOString() : new Date().toISOString(),
    data.pair_age_minutes,
    data.liquidity_usd,
    data.volume_usd,
    data.txn_count,
    data.unique_wallets,
    data.top_holder_pct,
    data.mint_renounced ? true : false,
    data.freeze_disabled ? true : false,
    data.honeypot_safe ? true : false,
    data.lp_locked ? true : false,
    data.pumpfun_graduated ? true : false,
    data.social_twitter ? true : false,
    data.social_telegram ? true : false,
    data.social_website ? true : false,
    data.hard_filter_passed ? true : false,
    data.hard_filter_reject_reason || null,
    data.soft_score || 0,
    data.soft_score_breakdown || null
  ]);

  return result.rows[0];
}

async function getTokenByAddress(address) {
  const result = await query('SELECT * FROM tokens WHERE address = $1', [address]);
  return result.rows[0];
}

async function getTokens({ page = 1, limit = 50, passed, rejected, score_min } = {}) {
  const conditions = [];
  const params = [];

  if (passed === 'true') { conditions.push('hard_filter_passed = TRUE'); }
  if (rejected === 'true') { conditions.push('hard_filter_passed = FALSE'); }
  if (score_min) { 
    params.push(parseInt(score_min));
    conditions.push(`soft_score >= $${params.length}`); 
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (parseInt(page) - 1) * parseInt(limit);

  params.push(parseInt(limit));
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const result = await query(`SELECT * FROM tokens ${where} ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`, params);
  
  // Create a separate params array for count query
  const countParams = params.slice(0, params.length - 2);
  const countResult = await query(`SELECT COUNT(*) as c FROM tokens ${where}`, countParams);
  
  return { tokens: result.rows, total: parseInt(countResult.rows[0]?.c || 0) };
}

async function getTokenWithDetails(address) {
  const tokenResult = await query('SELECT * FROM tokens WHERE address = $1', [address]);
  const token = tokenResult.rows[0];
  if (!token) return null;

  const filterResults = await query('SELECT * FROM filter_results WHERE token_id = $1 ORDER BY checked_at', [token.id]);
  const priceHistory = await query('SELECT * FROM price_history WHERE token_address = $1 ORDER BY recorded_at ASC LIMIT 200', [address]);
  const tradeResult = await query('SELECT * FROM trades WHERE token_address = $1 ORDER BY created_at DESC LIMIT 1', [address]);
  
  const trade = tradeResult.rows[0];

  return { ...token, filter_results: filterResults.rows, price_history: priceHistory.rows, trade: trade || null };
}

async function saveFilterResults(tokenId, results) {
  const sql = `INSERT INTO filter_results (token_id, filter_name, passed, raw_value, threshold) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`;
  for (const r of results) {
    await query(sql, [tokenId, r.filter_name, r.passed ? true : false, r.raw_value, r.threshold]);
  }
}

async function countTokensScannedToday() {
  const result = await query(`SELECT COUNT(*) as c FROM tokens WHERE DATE(created_at) = CURRENT_DATE`);
  return parseInt(result.rows[0]?.c || 0);
}

async function countTokensPassedToday() {
  const result = await query(`SELECT COUNT(*) as c FROM tokens WHERE DATE(created_at) = CURRENT_DATE AND hard_filter_passed = TRUE`);
  return parseInt(result.rows[0]?.c || 0);
}

async function getTransientlyRejectedTokens(maxAgeMinutes) {
  const transientReasons = ['low_liquidity', 'low_volume', 'low_txns', 'wash_trading', 'api_error'];
  const placeholders = transientReasons.map((_, i) => `$${i + 1}`).join(',');
  const params = [...transientReasons, maxAgeMinutes];
  
  const result = await query(`
    SELECT tokens.* FROM tokens 
    LEFT JOIN trades ON trades.token_address = tokens.address
    WHERE 
      (
        (hard_filter_passed = FALSE AND hard_filter_reject_reason IN (${placeholders}))
        OR 
        (hard_filter_passed = TRUE AND trades.id IS NULL)
        OR
        (trades.status = 'open')
      )
      AND tokens.pair_age_minutes <= $${params.length}
    ORDER BY tokens.created_at DESC
  `, params);
  
  return result.rows;
}

module.exports = {
  upsertToken,
  getTokenByAddress,
  getTokens,
  getTokenWithDetails,
  saveFilterResults,
  countTokensScannedToday,
  countTokensPassedToday,
  getTransientlyRejectedTokens,
};
