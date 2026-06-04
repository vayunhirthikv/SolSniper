const { getDb } = require('./index');

function genId() {
  return require('crypto').randomUUID();
}

function upsertToken(data) {
  const db = getDb();
  const id = genId();
  const stmt = db.prepare(`
    INSERT INTO tokens (
      id, address, name, symbol, detected_at, pair_age_minutes,
      liquidity_usd, volume_usd, txn_count, unique_wallets,
      top_holder_pct, mint_renounced, freeze_disabled, honeypot_safe,
      lp_locked, pumpfun_graduated, social_twitter, social_telegram,
      social_website, hard_filter_passed, hard_filter_reject_reason,
      soft_score, soft_score_breakdown
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
  `);

  stmt.run(
    id,
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
    data.mint_renounced ? 1 : 0,
    data.freeze_disabled ? 1 : 0,
    data.honeypot_safe ? 1 : 0,
    data.lp_locked ? 1 : 0,
    data.pumpfun_graduated ? 1 : 0,
    data.social_twitter ? 1 : 0,
    data.social_telegram ? 1 : 0,
    data.social_website ? 1 : 0,
    data.hard_filter_passed ? 1 : 0,
    data.hard_filter_reject_reason || null,
    data.soft_score || 0,
    data.soft_score_breakdown ? JSON.stringify(data.soft_score_breakdown) : null
  );

  return db.prepare('SELECT * FROM tokens WHERE address = ?').get(data.address);
}

function getTokenByAddress(address) {
  return getDb().prepare('SELECT * FROM tokens WHERE address = ?').get(address);
}

function getTokens({ page = 1, limit = 50, passed, rejected, score_min } = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (passed === 'true') { conditions.push('hard_filter_passed = 1'); }
  if (rejected === 'true') { conditions.push('hard_filter_passed = 0'); }
  if (score_min) { conditions.push('soft_score >= ?'); params.push(parseInt(score_min)); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const tokens = db.prepare(`SELECT * FROM tokens ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
  const total = db.prepare(`SELECT COUNT(*) as c FROM tokens ${where}`).get(...params)?.c || 0;
  return { tokens, total };
}

function getTokenWithDetails(address) {
  const db = getDb();
  const token = db.prepare('SELECT * FROM tokens WHERE address = ?').get(address);
  if (!token) return null;

  const filter_results = db.prepare('SELECT * FROM filter_results WHERE token_id = ? ORDER BY checked_at').all(token.id);
  const price_history = db.prepare('SELECT * FROM price_history WHERE token_address = ? ORDER BY recorded_at ASC LIMIT 200').all(address);
  const trade = db.prepare('SELECT * FROM trades WHERE token_address = ? ORDER BY created_at DESC LIMIT 1').get(address);

  // Parse JSON fields
  if (token.soft_score_breakdown) {
    try { token.soft_score_breakdown = JSON.parse(token.soft_score_breakdown); } catch {}
  }
  if (trade?.exit_ladder_progress) {
    try { trade.exit_ladder_progress = JSON.parse(trade.exit_ladder_progress); } catch {}
  }

  return { ...token, filter_results, price_history, trade: trade || null };
}

function saveFilterResults(tokenId, results) {
  const db = getDb();
  const stmt = db.prepare(`INSERT OR IGNORE INTO filter_results (id, token_id, filter_name, passed, raw_value, threshold) VALUES (?,?,?,?,?,?)`);
  for (const r of results) {
    stmt.run(genId(), tokenId, r.filter_name, r.passed ? 1 : 0, r.raw_value, r.threshold);
  }
}

function countTokensScannedToday() {
  return getDb().prepare(`SELECT COUNT(*) as c FROM tokens WHERE date(created_at) = date('now')`).get()?.c || 0;
}

function countTokensPassedToday() {
  return getDb().prepare(`SELECT COUNT(*) as c FROM tokens WHERE date(created_at) = date('now') AND hard_filter_passed = 1`).get()?.c || 0;
}

function getTransientlyRejectedTokens(maxAgeMinutes) {
  const db = getDb();
  const transientReasons = ['low_liquidity', 'low_volume', 'low_txns', 'wash_trading', 'api_error'];
  const placeholders = transientReasons.map(() => '?').join(',');
  
  return db.prepare(`
    SELECT tokens.* FROM tokens 
    LEFT JOIN trades ON trades.token_address = tokens.address
    WHERE 
      (
        (hard_filter_passed = 0 AND hard_filter_reject_reason IN (${placeholders}))
        OR 
        (hard_filter_passed = 1 AND trades.id IS NULL)
      )
      AND tokens.pair_age_minutes <= ?
    ORDER BY tokens.created_at DESC
  `).all(...transientReasons, maxAgeMinutes);
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
