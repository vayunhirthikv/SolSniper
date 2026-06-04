const cron = require('node-cron');
const db = require('../db/trades');
const tokenDb = require('../db/tokens');
const analyticsDb = require('../db/analytics');
const priceTracker = require('../engine/priceTracker');
const scanner = require('../engine/scanner');
const { emit } = require('../websocket/liveEvents');
const logger = require('../utils/logger');

let priceTrackerInterval = null;
let scannerInterval = null;

function startJobs(settings) {
  // Price tracker — every 10 seconds (real-time virtual trades monitor)
  priceTrackerInterval = setInterval(async () => {
    try {
      await priceTracker.trackPrices();
    } catch (err) {
      logger.error('Price tracker job error', { error: err.message });
    }
  }, 10 * 1000);

  // Scanner — every 10 seconds
  scannerInterval = setInterval(async () => {
    try {
      await scanner.scanCycle();
    } catch (err) {
      logger.error('Scanner job error', { error: err.message });
    }
  }, 10 * 1000);

  // Daily stats update — every 5 minutes (broadcast to clients)
  setInterval(async () => {
    try {
      const stats = await analyticsDb.getOverview();
      const todayScanned = await tokenDb.countTokensScannedToday();
      const todayPassed = await tokenDb.countTokensPassedToday();
      const todayLosses = db.getTodayLosses();
      emit('daily_stats_update', {
        ...stats,
        tokens_scanned_today: todayScanned,
        tokens_passed_today: todayPassed,
        today_losses: todayLosses,
      });
    } catch (err) {
      logger.error('Daily stats broadcast error', { error: err.message });
    }
  }, 5 * 60 * 1000);

  // Daily snapshot — midnight UTC via cron
  cron.schedule('0 0 * * *', async () => {
    try {
      logger.info('Running midnight daily snapshot job...');
      const today = new Date().toISOString().split('T')[0];
      const stats = await analyticsDb.getOverview();
      const todayScanned = await tokenDb.countTokensScannedToday();
      const todayPassed = await tokenDb.countTokensPassedToday();

      await db.upsertDailySnapshot({
        snapshot_date: today,
        total_trades: parseInt(stats.total_trades),
        winning_trades: parseInt(stats.winning_trades),
        losing_trades: parseInt(stats.losing_trades),
        total_pnl_usd: parseFloat(stats.total_pnl_usd),
        best_trade_pnl_pct: parseFloat(stats.best_trade_pnl_pct || 0),
        worst_trade_pnl_pct: parseFloat(stats.worst_trade_pnl_pct || 0),
        avg_hold_time_seconds: parseInt(stats.avg_hold_time_seconds || 0),
        tokens_scanned: todayScanned,
        tokens_passed_hard: todayPassed,
        tokens_entered: parseInt(stats.total_trades),
      });

      logger.info('Daily snapshot saved', { date: today });
    } catch (err) {
      logger.error('Midnight cron error', { error: err.message });
    }
  });

  logger.info('All scheduled jobs started');
}

function stopJobs() {
  if (priceTrackerInterval) clearInterval(priceTrackerInterval);
  if (scannerInterval) clearInterval(scannerInterval);
}

module.exports = { startJobs, stopJobs };
