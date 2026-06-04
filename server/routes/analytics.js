const express = require('express');
const router = express.Router();
const analytics = require('../db/analytics');
const trades = require('../db/trades');
const tokens = require('../db/tokens');

// GET /api/analytics/overview
router.get('/overview', async (req, res) => {
  try {
    const [overview, todayScanned, todayPassed] = await Promise.all([
      analytics.getOverview(),
      tokens.countTokensScannedToday(),
      tokens.countTokensPassedToday(),
    ]);
    const todayLosses = trades.getTodayLosses();
    res.json({
      ...overview,
      tokens_scanned_today: todayScanned,
      tokens_passed_today: todayPassed,
      today_losses: todayLosses,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/score-breakdown
router.get('/score-breakdown', async (req, res) => {
  try {
    const data = await analytics.getScoreBreakdown();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/filter-breakdown
router.get('/filter-breakdown', async (req, res) => {
  try {
    const data = await analytics.getFilterBreakdown();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/exit-analysis
router.get('/exit-analysis', async (req, res) => {
  try {
    const data = await analytics.getExitAnalysis();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/time-analysis
router.get('/time-analysis', async (req, res) => {
  try {
    const data = await analytics.getTimeAnalysis();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/source-analysis
router.get('/source-analysis', async (req, res) => {
  try {
    const data = await analytics.getSourceAnalysis();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/moonshots
router.get('/moonshots', async (req, res) => {
  try {
    const data = await analytics.getMoonshots();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/loss-analysis
router.get('/loss-analysis', async (req, res) => {
  try {
    const data = await analytics.getLossAnalysis();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/daily-snapshots
router.get('/daily-snapshots', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const data = await trades.getDailySnapshots(parseInt(days));
    
    // Inject today's live stats so charts update in real-time
    const liveStats = await analytics.getOverview();
    const today = new Date().toISOString().split('T')[0];
    
    const liveSnapshot = {
      snapshot_date: today,
      total_trades: liveStats.total_trades,
      winning_trades: liveStats.winning_trades,
      losing_trades: liveStats.losing_trades,
      total_pnl_usd: liveStats.total_pnl_usd,
      best_trade_pnl_pct: liveStats.best_trade_pnl_pct,
      worst_trade_pnl_pct: liveStats.worst_trade_pnl_pct,
      avg_hold_time_seconds: liveStats.avg_hold_time_seconds
    };

    if (data.length > 0 && data[0].snapshot_date === today) {
      data[0] = { ...data[0], ...liveSnapshot };
    } else {
      data.unshift(liveSnapshot);
    }

    res.json(data.slice(0, parseInt(days)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
