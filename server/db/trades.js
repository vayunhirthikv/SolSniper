const { query } = require('./index');

function parseLadder(val) {
  if (!val) return { '200pct': false, '500pct': false, '1000pct': false, '3000pct': false };
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return { '200pct': false, '500pct': false, '1000pct': false, '3000pct': false }; }
}

function parseTrade(t) {
  if (!t) return null;
  return {
    ...t,
    exit_ladder_progress: parseLadder(t.exit_ladder_progress),
    mint_renounced: Boolean(t.mint_renounced),
    hard_filter_passed: Boolean(t.hard_filter_passed),
  };
}

async function createTrade(data) {
  const result = await query(`
    INSERT INTO trades (
      token_id, token_address, token_name, entry_price,
      position_size_usd, soft_score_at_entry, current_price, exit_ladder_progress,
      realized_pnl_usd, remaining_position_pct, entry_liquidity_usd, status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *
  `, [
    data.token_id,
    data.token_address,
    data.token_name,
    data.entry_price,
    data.position_size_usd,
    data.soft_score_at_entry,
    data.current_price || data.entry_price,
    data.exit_ladder_progress || { '200pct': false, '500pct': false, '1000pct': false, '3000pct': false },
    data.realized_pnl_usd || 0,
    data.remaining_position_pct || 100,
    data.entry_liquidity_usd || 0,
    'open'
  ]);
  return parseTrade(result.rows[0]);
}

async function updateTrade(id, updates) {
  const fields = [];
  const vals = [];
  let paramIdx = 1;
  for (const [k, v] of Object.entries(updates)) {
    fields.push(`${k} = $${paramIdx++}`);
    vals.push(v);
  }
  vals.push(id);
  const result = await query(`UPDATE trades SET ${fields.join(', ')} WHERE id = $${paramIdx} RETURNING *`, vals);
  return parseTrade(result.rows[0]);
}

async function closeTrade(id, { exit_price, exit_reason, pnl_usd, pnl_pct, hold_time_seconds, high_pnl_pct, low_pnl_pct }) {
  const result = await query(`UPDATE trades SET status='closed', exit_price=$1, exit_time=NOW(), exit_reason=$2, pnl_usd=$3, pnl_pct=$4, hold_time_seconds=$5, high_pnl_pct=$6, low_pnl_pct=$7 WHERE id=$8 RETURNING *`,
    [exit_price, exit_reason, pnl_usd, pnl_pct, hold_time_seconds, high_pnl_pct ?? null, low_pnl_pct ?? null, id]
  );
  return parseTrade(result.rows[0]);
}

async function getOpenTrades() {
  const result = await query(`SELECT * FROM trades WHERE status='open' ORDER BY entry_time ASC`);
  return result.rows.map(parseTrade);
}

async function getTrade(id) {
  const result = await query('SELECT * FROM trades WHERE id = $1', [id]);
  return parseTrade(result.rows[0]);
}

async function getTrades({ page = 1, limit = 50, status, score_min, score_max, exit_reason, date_from, date_to } = {}) {
  const conditions = [];
  const params = [];

  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
  if (score_min) { params.push(parseInt(score_min)); conditions.push(`soft_score_at_entry >= $${params.length}`); }
  if (score_max) { params.push(parseInt(score_max)); conditions.push(`soft_score_at_entry <= $${params.length}`); }
  if (exit_reason) { params.push(exit_reason); conditions.push(`exit_reason = $${params.length}`); }
  if (date_from) { params.push(date_from); conditions.push(`entry_time >= $${params.length}`); }
  if (date_to) { params.push(date_to); conditions.push(`entry_time <= $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (parseInt(page) - 1) * parseInt(limit);

  params.push(parseInt(limit));
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const result = await query(`SELECT * FROM trades ${where} ORDER BY entry_time DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`, params);
  
  const countParams = params.slice(0, params.length - 2);
  const countResult = await query(`SELECT COUNT(*) as c FROM trades ${where}`, countParams);

  return { trades: result.rows.map(parseTrade), total: parseInt(countResult.rows[0]?.c || 0) };
}

async function getTodayLosses() {
  const result = await query(`
    SELECT COALESCE(SUM(pnl_usd), 0) as total 
    FROM trades 
    WHERE status='closed' AND pnl_usd < 0 AND exit_time >= CURRENT_DATE
  `);
  return parseFloat(result.rows[0]?.total || 0);
}

async function getSessionClosedPnl(startTime) {
  const result = await query(`
    SELECT COALESCE(SUM(pnl_usd), 0) as total 
    FROM trades 
    WHERE status='closed' AND exit_time >= $1
  `, [new Date(startTime).toISOString()]);
  return parseFloat(result.rows[0]?.total || 0);
}

async function getTradeStats() {
  const result = await query(`
    SELECT
      COUNT(*) as total_trades,
      SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) as open_trades,
      SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) as closed_trades,
      SUM(CASE WHEN pnl_usd > 0 THEN 1 ELSE 0 END) as winning_trades,
      SUM(CASE WHEN pnl_usd < 0 THEN 1 ELSE 0 END) as losing_trades,
      COALESCE(SUM(pnl_usd), 0) as total_pnl_usd,
      COALESCE(AVG(pnl_pct), 0) as avg_pnl_pct,
      MAX(pnl_pct) as best_trade_pnl_pct,
      MIN(pnl_pct) as worst_trade_pnl_pct,
      COALESCE(AVG(hold_time_seconds), 0) as avg_hold_time_seconds
    FROM trades
  `);
  return result.rows[0];
}

async function getPriceHistory(tokenAddress, limit = 200) {
  const result = await query(`SELECT * FROM price_history WHERE token_address = $1 ORDER BY recorded_at ASC LIMIT $2`, [tokenAddress, limit]);
  return result.rows;
}

async function insertPriceHistory(data) {
  await query(`INSERT INTO price_history (token_address, price, liquidity_usd, volume_usd) VALUES ($1,$2,$3,$4)`,
    [data.token_address, data.price, data.liquidity_usd, data.volume_usd]);
}

async function getDailySnapshots(days = 30) {
  const result = await query(`SELECT * FROM analytics_snapshots ORDER BY snapshot_date DESC LIMIT $1`, [days]);
  return result.rows;
}

async function upsertDailySnapshot(data) {
  await query(`
    INSERT INTO analytics_snapshots (snapshot_date, total_trades, winning_trades, losing_trades, total_pnl_usd, best_trade_pnl_pct, worst_trade_pnl_pct, avg_hold_time_seconds, tokens_scanned, tokens_passed_hard, tokens_entered)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT(snapshot_date) DO UPDATE SET
      total_trades=excluded.total_trades, winning_trades=excluded.winning_trades,
      losing_trades=excluded.losing_trades, total_pnl_usd=excluded.total_pnl_usd,
      best_trade_pnl_pct=excluded.best_trade_pnl_pct, worst_trade_pnl_pct=excluded.worst_trade_pnl_pct,
      avg_hold_time_seconds=excluded.avg_hold_time_seconds, tokens_scanned=excluded.tokens_scanned,
      tokens_passed_hard=excluded.tokens_passed_hard, tokens_entered=excluded.tokens_entered
  `, [data.snapshot_date, data.total_trades, data.winning_trades, data.losing_trades, data.total_pnl_usd, data.best_trade_pnl_pct, data.worst_trade_pnl_pct, data.avg_hold_time_seconds, data.tokens_scanned, data.tokens_passed_hard, data.tokens_entered]);
}

async function clearAllTrades() {
  await query('DELETE FROM trades');
  await query('DELETE FROM price_history');
  await query('DELETE FROM analytics_snapshots');
  await query('DELETE FROM tokens');
  await query('DELETE FROM filter_results');
}

async function hasTradeForToken(tokenAddress) {
  const result = await query('SELECT id FROM trades WHERE token_address = $1', [tokenAddress]);
  return result.rows.length > 0;
}

module.exports = {
  createTrade, updateTrade, closeTrade, getOpenTrades, getTrade, getTrades,
  getTodayLosses, getSessionClosedPnl, getTradeStats, getPriceHistory, insertPriceHistory,
  getDailySnapshots, upsertDailySnapshot, clearAllTrades, hasTradeForToken,
};
