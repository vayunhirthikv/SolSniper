const express = require('express');
const router = express.Router();
const tokenDb = require('../db/tokens');

// GET /api/tokens
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, passed, rejected, score_min } = req.query;
    const result = await tokenDb.getTokens({ page: parseInt(page), limit: parseInt(limit), passed, rejected, score_min });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tokens/:address
router.get('/:address', async (req, res) => {
  try {
    const token = await tokenDb.getTokenWithDetails(req.params.address);
    if (!token) return res.status(404).json({ error: 'Token not found' });
    res.json(token);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
