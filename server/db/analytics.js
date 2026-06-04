const { getDb } = require('./index');

function getOverview() {
  const db = getDb();
  const r = db.prepare(`
    SELECT
      COALESCE(SUM(pnl_usd), 0) as total_pnl_usd,
      COUNT(*) as total_trades,
      SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) as open_trades,
      SUM(CASE WHEN status='closed' AND pnl_usd > 0 THEN 1 ELSE 0 END) as winning_trades,
      SUM(CASE WHEN status='closed' AND pnl_usd < 0 THEN 1 ELSE 0 END) as losing_trades,
      SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) as closed_trades,
      COALESCE(AVG(CASE WHEN status='closed' THEN pnl_pct END), 0) as avg_pnl_pct,
      MAX(pnl_pct) as best_trade_pnl_pct,
      MIN(CASE WHEN status='closed' THEN pnl_pct END) as worst_trade_pnl_pct,
      COALESCE(AVG(CASE WHEN status='closed' THEN hold_time_seconds END), 0) as avg_hold_time_seconds
    FROM trades
  `).get();

  const closed = parseInt(r.closed_trades) || 0;
  const winRate = closed > 0 ? (parseInt(r.winning_trades) / closed) * 100 : 0;
  const expectancy = closed > 0 ? parseFloat(r.total_pnl_usd) / closed : 0;
  return { ...r, win_rate: winRate, expectancy };
}

function getScoreBreakdown() {
  return getDb().prepare(`
    SELECT
      CASE WHEN soft_score_at_entry >= 7 THEN '7+' ELSE CAST(soft_score_at_entry AS TEXT) END as score_bucket,
      COUNT(*) as trades,
      SUM(CASE WHEN pnl_usd > 0 THEN 1 ELSE 0 END) as wins,
      COALESCE(AVG(pnl_pct), 0) as avg_pnl_pct,
      MAX(pnl_pct) as best_pnl_pct,
      COALESCE(SUM(pnl_usd), 0) as total_pnl_usd
    FROM trades WHERE status='closed'
    GROUP BY score_bucket ORDER BY score_bucket
  `).all();
}

function getFilterBreakdown() {
  return getDb().prepare(`
    SELECT
      filter_name,
      SUM(CASE WHEN passed=0 THEN 1 ELSE 0 END) as rejected_count,
      COUNT(*) as total_checked,
      ROUND(100.0 * SUM(CASE WHEN passed=1 THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 2) as pass_rate
    FROM filter_results
    GROUP BY filter_name ORDER BY rejected_count DESC
  `).all();
}

function getExitAnalysis() {
  const db = getDb();
  const byExitReason = db.prepare(`
    SELECT exit_reason, COUNT(*) as count,
      COALESCE(AVG(pnl_pct), 0) as avg_pnl_pct,
      COALESCE(SUM(pnl_usd), 0) as total_pnl_usd
    FROM trades WHERE status='closed'
    GROUP BY exit_reason ORDER BY count DESC
  `).all();

  const f = db.prepare(`
    SELECT
      SUM(CASE WHEN json_extract(exit_ladder_progress,'$.200pct')=1 THEN 1 ELSE 0 END) as reached_200,
      SUM(CASE WHEN json_extract(exit_ladder_progress,'$.500pct')=1 THEN 1 ELSE 0 END) as reached_500,
      SUM(CASE WHEN json_extract(exit_ladder_progress,'$.1000pct')=1 THEN 1 ELSE 0 END) as reached_1000,
      SUM(CASE WHEN json_extract(exit_ladder_progress,'$.3000pct')=1 THEN 1 ELSE 0 END) as reached_3000,
      COUNT(*) as total
    FROM trades WHERE status='closed'
  `).get();

  return { by_exit_reason: byExitReason, ladder_funnel: f };
}

function getTimeAnalysis() {
  const db = getDb();
  const byHour = db.prepare(`
    SELECT CAST(strftime('%H', entry_time) AS INTEGER) as hour,
      COUNT(*) as trades,
      COALESCE(AVG(pnl_pct), 0) as avg_pnl_pct
    FROM trades WHERE status='closed'
    GROUP BY hour ORDER BY hour
  `).all();

  const byDay = db.prepare(`
    SELECT CAST(strftime('%w', entry_time) AS INTEGER) as dow,
      COUNT(*) as trades,
      COALESCE(AVG(pnl_pct), 0) as avg_pnl_pct
    FROM trades WHERE status='closed'
    GROUP BY dow ORDER BY dow
  `).all();

  return { by_hour: byHour, by_day: byDay };
}

function getSourceAnalysis() {
  return getDb().prepare(`
    SELECT
      t.pumpfun_graduated, t.lp_locked,
      CASE WHEN t.social_twitter=1 OR t.social_telegram=1 THEN 1 ELSE 0 END as has_social,
      COUNT(tr.id) as trades,
      SUM(CASE WHEN tr.pnl_usd > 0 THEN 1 ELSE 0 END) as wins,
      COALESCE(AVG(tr.pnl_pct), 0) as avg_pnl_pct
    FROM trades tr
    JOIN tokens t ON t.address = tr.token_address
    WHERE tr.status='closed'
    GROUP BY t.pumpfun_graduated, t.lp_locked, has_social
  `).all();
}

function getMoonshots() {
  return getDb().prepare(`
    SELECT tr.*, t.pumpfun_graduated, t.lp_locked, t.social_twitter, t.social_telegram
    FROM trades tr
    JOIN tokens t ON t.address = tr.token_address
    WHERE tr.pnl_pct > 1000 AND tr.status='closed'
    ORDER BY tr.pnl_pct DESC
  `).all();
}

function getLossAnalysis() {
  return getDb().prepare(`
    SELECT exit_reason, COUNT(*) as count,
      COALESCE(AVG(hold_time_seconds), 0) as avg_hold_seconds,
      COALESCE(AVG(pnl_pct), 0) as avg_pnl_pct,
      COALESCE(SUM(pnl_usd), 0) as total_pnl_usd
    FROM trades WHERE status='closed' AND pnl_usd < 0
    GROUP BY exit_reason ORDER BY count DESC
  `).all();
}

module.exports = {
  getOverview, getScoreBreakdown, getFilterBreakdown, getExitAnalysis,
  getTimeAnalysis, getSourceAnalysis, getMoonshots, getLossAnalysis,
};
