const { query } = require('./index');
const logger = require('../utils/logger');

async function runMigrations() {
  logger.info('Running PostgreSQL migrations...');

  try {
    // Ensure the uuid extension is enabled
    await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    await query(`
      CREATE TABLE IF NOT EXISTS tokens (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        address TEXT UNIQUE NOT NULL,
        name TEXT,
        symbol TEXT,
        detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        pair_age_minutes DOUBLE PRECISION,
        liquidity_usd DOUBLE PRECISION,
        volume_usd DOUBLE PRECISION,
        txn_count INTEGER,
        unique_wallets INTEGER,
        top_holder_pct DOUBLE PRECISION,
        mint_renounced BOOLEAN,
        freeze_disabled BOOLEAN,
        honeypot_safe BOOLEAN,
        lp_locked BOOLEAN,
        pumpfun_graduated BOOLEAN,
        social_twitter BOOLEAN,
        social_telegram BOOLEAN,
        social_website BOOLEAN,
        hard_filter_passed BOOLEAN DEFAULT FALSE,
        hard_filter_reject_reason TEXT,
        soft_score INTEGER DEFAULT 0,
        soft_score_breakdown JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS trades (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        token_id UUID,
        token_address TEXT NOT NULL,
        token_name TEXT,
        entry_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        entry_price DOUBLE PRECISION NOT NULL,
        position_size_usd DOUBLE PRECISION NOT NULL,
        soft_score_at_entry INTEGER,
        current_price DOUBLE PRECISION,
        exit_price DOUBLE PRECISION,
        exit_time TIMESTAMP WITH TIME ZONE,
        exit_reason TEXT,
        pnl_usd DOUBLE PRECISION DEFAULT 0,
        pnl_pct DOUBLE PRECISION DEFAULT 0,
        high_pnl_pct DOUBLE PRECISION DEFAULT 0,
        low_pnl_pct DOUBLE PRECISION DEFAULT 0,
        hold_time_seconds INTEGER,
        exit_ladder_progress JSONB DEFAULT '{"200pct":false,"500pct":false,"1000pct":false,"3000pct":false}'::jsonb,
        realized_pnl_usd DOUBLE PRECISION DEFAULT 0,
        remaining_position_pct DOUBLE PRECISION DEFAULT 100,
        entry_liquidity_usd DOUBLE PRECISION,
        status TEXT DEFAULT 'open',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS filter_results (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        token_id UUID,
        filter_name TEXT,
        passed BOOLEAN,
        raw_value TEXT,
        threshold TEXT,
        checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS price_history (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        token_address TEXT NOT NULL,
        price DOUBLE PRECISION,
        liquidity_usd DOUBLE PRECISION,
        volume_usd DOUBLE PRECISION,
        recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS analytics_snapshots (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        snapshot_date DATE UNIQUE,
        total_trades INTEGER DEFAULT 0,
        winning_trades INTEGER DEFAULT 0,
        losing_trades INTEGER DEFAULT 0,
        total_pnl_usd DOUBLE PRECISION DEFAULT 0,
        best_trade_pnl_pct DOUBLE PRECISION,
        worst_trade_pnl_pct DOUBLE PRECISION,
        avg_hold_time_seconds INTEGER,
        tokens_scanned INTEGER DEFAULT 0,
        tokens_passed_hard INTEGER DEFAULT 0,
        tokens_entered INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS settings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_tokens_address ON tokens(address);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_tokens_created ON tokens(created_at);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_trades_token ON trades(token_address);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_trades_entry ON trades(entry_time);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_filter_results_token ON filter_results(token_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_price_history_address ON price_history(token_address);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_price_history_recorded ON price_history(recorded_at);`);

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

    const insertSettingSql = `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`;
    for (const [key, value] of defaults) {
      await query(insertSettingSql, [key, value]);
    }

    logger.info('PostgreSQL migrations completed ✓');
  } catch (err) {
    logger.error('PostgreSQL migration failed', { error: err.message });
    throw err;
  }
}

module.exports = { runMigrations };
