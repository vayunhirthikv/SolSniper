const { query } = require('./index');

async function getSettings() {
  const result = await query('SELECT key, value FROM settings');
  const settings = {};
  for (const row of result.rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

async function updateSettings(updates) {
  const sql = `INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value`;
  for (const [key, value] of Object.entries(updates)) {
    await query(sql, [key, String(value)]);
  }
}

module.exports = {
  getSettings,
  updateSettings
};
