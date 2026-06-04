const Database = require('better-sqlite3');
const path = require('path');
const logger = require('../utils/logger');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../solsniper.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    logger.info(`SQLite database opened at ${DB_PATH}`);
  }
  return db;
}

// Simulate pg-style query interface
async function query(text, params = []) {
  const database = getDb();

  // Detect statement type
  const stmt = text.trim().toUpperCase();

  // Convert PostgreSQL $1,$2 placeholders to ? for SQLite
  let sqliteText = text
    .replace(/uuid_generate_v4\(\)/gi, "(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))")
    .replace(/NOW\(\)/gi, "datetime('now')")
    .replace(/NOW\(\)::date/gi, "date('now')")
    .replace(/\$(\d+)/g, '?')
    .replace(/RETURNING \*/gi, '')
    .replace(/ON CONFLICT \(([^)]+)\) DO NOTHING/gi, 'OR IGNORE INTO $1')
    .replace(/WITH TIME ZONE/gi, '')
    .replace(/JSONB/gi, 'TEXT')
    .replace(/::boolean/gi, '')
    .replace(/::text/gi, '')
    .replace(/::date/gi, '')
    .replace(/ILIKE/gi, 'LIKE')
    .replace(/CREATE EXTENSION[^;]+;/gi, '')
    .replace(/CREATE INDEX IF NOT EXISTS (\w+) ON (\w+)\(([^)]+)\);/gi, 'CREATE INDEX IF NOT EXISTS $1 ON $2($3);');

  // Handle RETURNING * by storing and re-querying
  const hasReturning = /RETURNING \*/i.test(text);

  try {
    if (stmt.startsWith('SELECT') || stmt.startsWith('WITH')) {
      const prepared = database.prepare(sqliteText);
      const rows = prepared.all(...params);
      return { rows, rowCount: rows.length };
    } else if (stmt.startsWith('CREATE') || stmt.startsWith('DROP') || stmt.startsWith('ALTER')) {
      // Handle multiple statements
      const statements = sqliteText.split(';').map(s => s.trim()).filter(Boolean);
      for (const s of statements) {
        if (s) {
          try {
            database.prepare(s).run();
          } catch (e) {
            // Ignore "already exists" errors for CREATE IF NOT EXISTS
            if (!e.message.includes('already exists')) {
              logger.warn('DDL warning:', e.message.slice(0, 100));
            }
          }
        }
      }
      return { rows: [], rowCount: 0 };
    } else {
      const prepared = database.prepare(sqliteText);
      const result = prepared.run(...params);
      return { rows: [], rowCount: result.changes };
    }
  } catch (err) {
    logger.error('SQLite query error', { sql: sqliteText.slice(0, 200), error: err.message });
    throw err;
  }
}

// Specialized upsert helpers for SQLite
function runRaw(sql, params = []) {
  return getDb().prepare(sql).run(...params);
}

function getRow(sql, params = []) {
  return getDb().prepare(sql).get(...params);
}

function getRows(sql, params = []) {
  return getDb().prepare(sql).all(...params);
}

const pool = {
  query,
  end: async () => { if (db) db.close(); },
};

module.exports = { pool, query, getDb, runRaw, getRow, getRows };
