const { getDb } = require('./index');
const logger = require('../utils/logger');

function uuid() {
  return "lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))";
}

async function runMigrations() {
  logger.info('Running SQLite migrations...');
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
      address TEXT UNIQUE NOT NULL,
      name TEXT,
      symbol TEXT,
      detected_at TEXT DEFAULT (datetime('now')),
      pair_age_minutes REAL,
      liquidity_usd REAL,
      volume_usd REAL,
      txn_count INTEGER,
      unique_wallets INTEGER,
      top_holder_pct REAL,
      mint_renounced INTEGER,
      freeze_disabled INTEGER,
      honeypot_safe INTEGER,
      lp_locked INTEGER,
      pumpfun_graduated INTEGER,
      social_twitter INTEGER,
      social_telegram INTEGER,
      social_website INTEGER,
      hard_filter_passed INTEGER DEFAULT 0,
      hard_filter_reject_reason TEXT,
      soft_score INTEGER DEFAULT 0,
      soft_score_breakdown TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
      token_id TEXT,
      token_address TEXT NOT NULL,
      token_name TEXT,
      entry_time TEXT DEFAULT (datetime('now')),
      entry_price REAL NOT NULL,
      position_size_usd REAL NOT NULL,
      soft_score_at_entry INTEGER,
      current_price REAL,
      exit_price REAL,
      exit_time TEXT,
      exit_reason TEXT,
      pnl_usd REAL DEFAULT 0,
      pnl_pct REAL DEFAULT 0,
      hold_time_seconds INTEGER,
      exit_ladder_progress TEXT DEFAULT '{"200pct":false,"500pct":false,"1000pct":false,"3000pct":false}',
      realized_pnl_usd REAL DEFAULT 0,
      remaining_position_pct REAL DEFAULT 100,
      entry_liquidity_usd REAL,
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS filter_results (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
      token_id TEXT,
      filter_name TEXT,
      passed INTEGER,
      raw_value TEXT,
      threshold TEXT,
      checked_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
      token_address TEXT NOT NULL,
      price REAL,
      liquidity_usd REAL,
      volume_usd REAL,
      recorded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS analytics_snapshots (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
      snapshot_date TEXT UNIQUE,
      total_trades INTEGER DEFAULT 0,
      winning_trades INTEGER DEFAULT 0,
      losing_trades INTEGER DEFAULT 0,
      total_pnl_usd REAL DEFAULT 0,
      best_trade_pnl_pct REAL,
      worst_trade_pnl_pct REAL,
      avg_hold_time_seconds INTEGER,
      tokens_scanned INTEGER DEFAULT 0,
      tokens_passed_hard INTEGER DEFAULT 0,
      tokens_entered INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tokens_address ON tokens(address);
    CREATE INDEX IF NOT EXISTS idx_tokens_created ON tokens(created_at);
    CREATE INDEX IF NOT EXISTS idx_trades_token ON trades(token_address);
    CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
    CREATE INDEX IF NOT EXISTS idx_trades_entry ON trades(entry_time);
    CREATE INDEX IF NOT EXISTS idx_filter_results_token ON filter_results(token_id);
    CREATE INDEX IF NOT EXISTS idx_price_history_address ON price_history(token_address);
    CREATE INDEX IF NOT EXISTS idx_price_history_recorded ON price_history(recorded_at);
  `);

  // Insert default settings
  const defaults = [
    ['min_liquidity_usd', '3000'],
    ['min_volume_usd', '800'],
    ['max_pair_age_minutes', '20'],
    ['min_txn_count', '20'],
    ['min_unique_wallets', '10'],
    ['max_top_holder_pct', '60'],
    ['min_soft_score', '4'],
    ['position_size_score_4', '0.75'],
    ['position_size_score_5', '1.25'],
    ['position_size_score_6', '2.00'],
    ['position_size_score_7plus', '2.50'],
    ['daily_loss_limit_usd', '40'],
    ['stop_loss_pct', '65'],
    ['time_exit_hours', '3'],
    ['pumpfun_social_bonus', '0.50'],
    ['exit_ladder_level_1', '200'],
    ['exit_ladder_sell_1', '20'],
    ['exit_ladder_level_2', '500'],
    ['exit_ladder_sell_2', '20'],
    ['exit_ladder_level_3', '1000'],
    ['exit_ladder_sell_3', '20'],
    ['exit_ladder_level_4', '3000'],
    ['exit_ladder_sell_4', '50'],
  ];

  const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (id, key, value) VALUES (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))), ?, ?)`);
  for (const [key, value] of defaults) {
    insertSetting.run(key, value);
  }

  // ── Column migrations (safe on existing DBs) ──────────────────────────────
  const colMigrations = [
    `ALTER TABLE trades ADD COLUMN high_pnl_pct REAL DEFAULT 0`,
    `ALTER TABLE trades ADD COLUMN low_pnl_pct  REAL DEFAULT 0`,
  ];
  for (const sql of colMigrations) {
    try { db.exec(sql); } catch (e) {
      if (!e.message.includes('duplicate column')) {
        logger.warn('Column migration warning:', e.message.slice(0, 100));
      }
    }
  }

  logger.info('SQLite migrations completed ✓');
}

module.exports = { runMigrations };
