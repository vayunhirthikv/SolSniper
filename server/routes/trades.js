const express = require('express');
const router = express.Router();
const db = require('../db/trades');

// GET /api/trades
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, status, score_min, score_max, exit_reason, date_from, date_to } = req.query;
    const result = await db.getTrades({
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      score_min,
      score_max,
      exit_reason,
      date_from,
      date_to,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trades/stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await db.getTradeStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trades/:id
router.get('/:id', async (req, res) => {
  try {
    const trade = await db.getTrade(req.params.id);
    if (!trade) return res.status(404).json({ error: 'Trade not found' });

    const priceHistory = await db.getPriceHistory(trade.token_address);
    res.json({ ...trade, price_history: priceHistory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trades/reset
router.post('/reset', async (req, res) => {
  try {
    const scanner = require('../engine/scanner');
    await db.clearAllTrades();
    scanner.clearSeenAddresses();
    res.json({ success: true, message: 'All trades and scanned tokens cleared successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
