const { query } = require('./index');

async function getOverview() {
  const result = await query(`
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
  `);

  const r = result.rows[0];
  const closed = parseInt(r.closed_trades) || 0;
  const winRate = closed > 0 ? (parseInt(r.winning_trades) / closed) * 100 : 0;
  const expectancy = closed > 0 ? parseFloat(r.total_pnl_usd) / closed : 0;
  return { ...r, win_rate: winRate, expectancy };
}

async function getScoreBreakdown() {
  const result = await query(`
    SELECT
      CASE WHEN soft_score_at_entry >= 7 THEN '7+' ELSE CAST(soft_score_at_entry AS TEXT) END as score_bucket,
      COUNT(*) as trades,
      SUM(CASE WHEN pnl_usd > 0 THEN 1 ELSE 0 END) as wins,
      COALESCE(AVG(pnl_pct), 0) as avg_pnl_pct,
      MAX(pnl_pct) as best_pnl_pct,
      COALESCE(SUM(pnl_usd), 0) as total_pnl_usd
    FROM trades WHERE status='closed'
    GROUP BY score_bucket ORDER BY score_bucket
  `);
  return result.rows;
}

async function getFilterBreakdown() {
  const result = await query(`
    SELECT
      filter_name,
      SUM(CASE WHEN passed=FALSE THEN 1 ELSE 0 END) as rejected_count,
      COUNT(*) as total_checked,
      ROUND(100.0 * SUM(CASE WHEN passed=TRUE THEN 1 ELSE 0 END) / GREATEST(COUNT(*), 1), 2) as pass_rate
    FROM filter_results
    GROUP BY filter_name ORDER BY rejected_count DESC
  `);
  return result.rows;
}

async function getExitAnalysis() {
  const byExitReasonResult = await query(`
    SELECT exit_reason, COUNT(*) as count,
      COALESCE(AVG(pnl_pct), 0) as avg_pnl_pct,
      COALESCE(SUM(pnl_usd), 0) as total_pnl_usd
    FROM trades WHERE status='closed'
    GROUP BY exit_reason ORDER BY count DESC
  `);

  const fResult = await query(`
    SELECT
      SUM(CASE WHEN (exit_ladder_progress->>'200pct')::boolean = true THEN 1 ELSE 0 END) as reached_200,
      SUM(CASE WHEN (exit_ladder_progress->>'500pct')::boolean = true THEN 1 ELSE 0 END) as reached_500,
      SUM(CASE WHEN (exit_ladder_progress->>'1000pct')::boolean = true THEN 1 ELSE 0 END) as reached_1000,
      SUM(CASE WHEN (exit_ladder_progress->>'3000pct')::boolean = true THEN 1 ELSE 0 END) as reached_3000,
      COUNT(*) as total
    FROM trades WHERE status='closed'
  `);

  return { by_exit_reason: byExitReasonResult.rows, ladder_funnel: fResult.rows[0] };
}

async function getTimeAnalysis() {
  const byHourResult = await query(`
    SELECT EXTRACT(HOUR FROM entry_time)::INTEGER as hour,
      COUNT(*) as trades,
      COALESCE(AVG(pnl_pct), 0) as avg_pnl_pct
    FROM trades WHERE status='closed'
    GROUP BY hour ORDER BY hour
  `);

  const byDayResult = await query(`
    SELECT EXTRACT(DOW FROM entry_time)::INTEGER as dow,
      COUNT(*) as trades,
      COALESCE(AVG(pnl_pct), 0) as avg_pnl_pct
    FROM trades WHERE status='closed'
    GROUP BY dow ORDER BY dow
  `);

  return { by_hour: byHourResult.rows, by_day: byDayResult.rows };
}

async function getSourceAnalysis() {
  const result = await query(`
    SELECT
      t.pumpfun_graduated, t.lp_locked,
      CASE WHEN t.social_twitter=TRUE OR t.social_telegram=TRUE THEN 1 ELSE 0 END as has_social,
      COUNT(tr.id) as trades,
      SUM(CASE WHEN tr.pnl_usd > 0 THEN 1 ELSE 0 END) as wins,
      COALESCE(AVG(tr.pnl_pct), 0) as avg_pnl_pct
    FROM trades tr
    JOIN tokens t ON t.address = tr.token_address
    WHERE tr.status='closed'
    GROUP BY t.pumpfun_graduated, t.lp_locked, has_social
  `);
  return result.rows;
}

async function getMoonshots() {
  const result = await query(`
    SELECT tr.*, t.pumpfun_graduated, t.lp_locked, t.social_twitter, t.social_telegram
    FROM trades tr
    JOIN tokens t ON t.address = tr.token_address
    WHERE tr.pnl_pct > 1000 AND tr.status='closed'
    ORDER BY tr.pnl_pct DESC
  `);
  return result.rows;
}

async function getLossAnalysis() {
  const result = await query(`
    SELECT exit_reason, COUNT(*) as count,
      COALESCE(AVG(hold_time_seconds), 0) as avg_hold_seconds,
      COALESCE(AVG(pnl_pct), 0) as avg_pnl_pct,
      COALESCE(SUM(pnl_usd), 0) as total_pnl_usd
    FROM trades WHERE status='closed' AND pnl_usd < 0
    GROUP BY exit_reason ORDER BY count DESC
  `);
  return result.rows;
}

module.exports = {
  getOverview, getScoreBreakdown, getFilterBreakdown, getExitAnalysis,
  getTimeAnalysis, getSourceAnalysis, getMoonshots, getLossAnalysis,
};
