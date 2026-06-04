const express = require('express');
const router = express.Router();
const { getDb } = require('../db/index');
const scanner = require('../engine/scanner');
const priceTracker = require('../engine/priceTracker');
const crypto = require('crypto');
const axios = require('axios');

function loadSettings() {
  const rows = getDb().prepare('SELECT key, value FROM settings ORDER BY key').all();
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

// GET /api/settings
router.get('/', (req, res) => {
  try {
    res.json(loadSettings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings
router.put('/', (req, res) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Body must be an object of key-value pairs' });
    }

    const db = getDb();
    const stmt = db.prepare(`INSERT INTO settings (id, key, value) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`);
    for (const [key, value] of Object.entries(updates)) {
      stmt.run(crypto.randomUUID(), key, String(value));
    }

    const settings = loadSettings();
    scanner.setSettings(settings);
    priceTracker.setSettings(settings);

    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/scanner-status
router.get('/scanner-status', (req, res) => {
  res.json(scanner.getStatus());
});

// POST /api/settings/scanner/pause
router.post('/scanner/pause', (req, res) => {
  scanner.pause();
  res.json({ paused: true });
});

// POST /api/settings/scanner/resume
router.post('/scanner/resume', (req, res) => {
  scanner.resume();
  res.json({ paused: false });
});

const DEFAULTS = {
  min_liquidity_usd: '3000',
  min_volume_usd: '800',
  max_pair_age_minutes: '20',
  min_txn_count: '20',
  min_unique_wallets: '10',
  max_top_holder_pct: '60',
  min_soft_score: '4',
  pos_tier1_score: '4',
  pos_tier1_size: '0.75',
  pos_tier2_score: '5',
  pos_tier2_size: '1.25',
  pos_tier3_score: '6',
  pos_tier3_size: '2.00',
  pos_tier4_score: '7',
  pos_tier4_size: '2.50',
  daily_loss_limit_usd: '40',
  global_tp_usd: '',
  global_sl_usd: '',
  stop_loss_pct: '65',
  take_profit_pct: '',
  time_exit_hours: '3',
  pumpfun_social_bonus: '0.50',
  exit_ladder_enabled: 'true',
  telegram_bot_token: '',
  telegram_chat_id: '',
  exit_ladder_level_1: '200',
  exit_ladder_sell_1: '20',
  exit_ladder_level_2: '500',
  exit_ladder_sell_2: '20',
  exit_ladder_level_3: '1000',
  exit_ladder_sell_3: '20',
  exit_ladder_level_4: '3000',
  exit_ladder_sell_4: '50',
};

// POST /api/settings/reset
router.post('/reset', (req, res) => {
  try {
    const db = getDb();
    // Delete all settings first so that we completely revert to defaults without leftovers
    db.prepare('DELETE FROM settings').run();
    const stmt = db.prepare(`INSERT INTO settings (id, key, value) VALUES (?,?,?)`);
    for (const [key, value] of Object.entries(DEFAULTS)) {
      stmt.run(crypto.randomUUID(), key, String(value));
    }
    const settings = loadSettings();
    scanner.setSettings(settings);
    priceTracker.setSettings(settings);
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/test-telegram
router.post('/test-telegram', async (req, res) => {
  try {
    const { token, chatId } = req.body;
    if (!token || !chatId) {
      return res.status(400).json({ error: 'Token and Chat ID are required' });
    }
    
    const msg = `👋 *Hello from SolSniper!* 👋\n\nIf you are reading this, your Telegram connection is configured correctly and you will receive live trade alerts here!`;
    
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: msg,
      parse_mode: 'Markdown'
    });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.description || err.message });
  }
});

module.exports = router;
