const { getDb } = require('./index');
const crypto = require('crypto');

function genId() { return crypto.randomUUID(); }

function parseLadder(val) {
  if (!val) return { '200pct': false, '500pct': false, '1000pct': false, '3000pct': false };
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

function createTrade(data) {
  const db = getDb();
  const id = genId();
  db.prepare(`
    INSERT INTO trades (
      id, token_id, token_address, token_name, entry_time, entry_price,
      position_size_usd, soft_score_at_entry, current_price, exit_ladder_progress,
      realized_pnl_usd, remaining_position_pct, entry_liquidity_usd, status
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id,
    data.token_id,
    data.token_address,
    data.token_name,
    new Date().toISOString(),
    data.entry_price,
    data.position_size_usd,
    data.soft_score_at_entry,
    data.current_price || data.entry_price,
    JSON.stringify(data.exit_ladder_progress || { '200pct': false, '500pct': false, '1000pct': false, '3000pct': false }),
    data.realized_pnl_usd || 0,
    data.remaining_position_pct || 100,
    data.entry_liquidity_usd || 0,
    'open'
  );
  return parseTrade(db.prepare('SELECT * FROM trades WHERE id = ?').get(id));
}

function updateTrade(id, updates) {
  const db = getDb();
  const fields = [];
  const vals = [];
  for (const [k, v] of Object.entries(updates)) {
    fields.push(`${k} = ?`);
    vals.push(typeof v === 'object' ? JSON.stringify(v) : v);
  }
  vals.push(id);
  db.prepare(`UPDATE trades SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  return parseTrade(db.prepare('SELECT * FROM trades WHERE id = ?').get(id));
}

function closeTrade(id, { exit_price, exit_reason, pnl_usd, pnl_pct, hold_time_seconds, high_pnl_pct, low_pnl_pct }) {
  const db = getDb();
  db.prepare(`UPDATE trades SET status='closed', exit_price=?, exit_time=datetime('now'), exit_reason=?, pnl_usd=?, pnl_pct=?, hold_time_seconds=?, high_pnl_pct=?, low_pnl_pct=? WHERE id=?`)
    .run(exit_price, exit_reason, pnl_usd, pnl_pct, hold_time_seconds, high_pnl_pct ?? null, low_pnl_pct ?? null, id);
  return parseTrade(db.prepare('SELECT * FROM trades WHERE id = ?').get(id));
}

function getOpenTrades() {
  return getDb().prepare(`SELECT * FROM trades WHERE status='open' ORDER BY entry_time ASC`).all().map(parseTrade);
}

function getTrade(id) {
  return parseTrade(getDb().prepare('SELECT * FROM trades WHERE id = ?').get(id));
}

function getTrades({ page = 1, limit = 50, status, score_min, score_max, exit_reason, date_from, date_to } = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (status) { conditions.push('status = ?'); params.push(status); }
  if (score_min) { conditions.push('soft_score_at_entry >= ?'); params.push(parseInt(score_min)); }
  if (score_max) { conditions.push('soft_score_at_entry <= ?'); params.push(parseInt(score_max)); }
  if (exit_reason) { conditions.push('exit_reason = ?'); params.push(exit_reason); }
  if (date_from) { conditions.push('entry_time >= ?'); params.push(date_from); }
  if (date_to) { conditions.push('entry_time <= ?'); params.push(date_to); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const trades = db.prepare(`SELECT * FROM trades ${where} ORDER BY entry_time DESC LIMIT ? OFFSET ?`)
    .all(...params, parseInt(limit), offset).map(parseTrade);
  const total = db.prepare(`SELECT COUNT(*) as c FROM trades ${where}`).get(...params)?.c || 0;

  return { trades, total };
}

function getTodayLosses() {
  const row = getDb().prepare(`SELECT COALESCE(SUM(ABS(pnl_usd)), 0) as total FROM trades WHERE status='closed' AND date(entry_time)=date('now') AND pnl_usd < 0`).get();
  return parseFloat(row?.total || 0);
}

function getTradeStats() {
  const db = getDb();
  const r = db.prepare(`
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
  `).get();
  return r;
}

function getPriceHistory(tokenAddress, limit = 200) {
  return getDb().prepare(`SELECT * FROM price_history WHERE token_address = ? ORDER BY recorded_at ASC LIMIT ?`).all(tokenAddress, limit);
}

function insertPriceHistory(data) {
  getDb().prepare(`INSERT INTO price_history (id, token_address, price, liquidity_usd, volume_usd) VALUES (?,?,?,?,?)`)
    .run(genId(), data.token_address, data.price, data.liquidity_usd, data.volume_usd);
}

function getDailySnapshots(days = 30) {
  return getDb().prepare(`SELECT * FROM analytics_snapshots ORDER BY snapshot_date DESC LIMIT ?`).all(days);
}

function upsertDailySnapshot(data) {
  getDb().prepare(`
    INSERT INTO analytics_snapshots (id, snapshot_date, total_trades, winning_trades, losing_trades, total_pnl_usd, best_trade_pnl_pct, worst_trade_pnl_pct, avg_hold_time_seconds, tokens_scanned, tokens_passed_hard, tokens_entered)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(snapshot_date) DO UPDATE SET
      total_trades=excluded.total_trades, winning_trades=excluded.winning_trades,
      losing_trades=excluded.losing_trades, total_pnl_usd=excluded.total_pnl_usd,
      best_trade_pnl_pct=excluded.best_trade_pnl_pct, worst_trade_pnl_pct=excluded.worst_trade_pnl_pct,
      avg_hold_time_seconds=excluded.avg_hold_time_seconds, tokens_scanned=excluded.tokens_scanned,
      tokens_passed_hard=excluded.tokens_passed_hard, tokens_entered=excluded.tokens_entered
  `).run(genId(), data.snapshot_date, data.total_trades, data.winning_trades, data.losing_trades, data.total_pnl_usd, data.best_trade_pnl_pct, data.worst_trade_pnl_pct, data.avg_hold_time_seconds, data.tokens_scanned, data.tokens_passed_hard, data.tokens_entered);
}

function clearAllTrades() {
  const db = getDb();
  db.prepare('DELETE FROM trades').run();
  db.prepare('DELETE FROM price_history').run();
  db.prepare('DELETE FROM analytics_snapshots').run();
  db.prepare('DELETE FROM tokens').run();
  db.prepare('DELETE FROM filter_results').run();
}

function hasTradeForToken(tokenAddress) {
  const t = getDb().prepare('SELECT id FROM trades WHERE token_address = ?').get(tokenAddress);
  return !!t;
}

module.exports = {
  createTrade, updateTrade, closeTrade, getOpenTrades, getTrade, getTrades,
  getTodayLosses, getTradeStats, getPriceHistory, insertPriceHistory,
  getDailySnapshots, upsertDailySnapshot, clearAllTrades, hasTradeForToken,
};
