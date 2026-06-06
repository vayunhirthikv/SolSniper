const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
  max: 5, // Prevent exceeding Supabase 15 connection limit
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle PostgreSQL client', { error: err.message });
  process.exit(-1);
});

// Execute a query using the pool
async function query(text, params = []) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    logger.error('PostgreSQL query error', { sql: text.slice(0, 200), error: err.message });
    throw err;
  }
}

// Helpers previously used by SQLite
async function runRaw(sql, params = []) {
  return query(sql, params);
}

async function getRow(sql, params = []) {
  const result = await query(sql, params);
  return result.rows[0];
}

async function getRows(sql, params = []) {
  const result = await query(sql, params);
  return result.rows;
}

module.exports = { pool, query, runRaw, getRow, getRows };
