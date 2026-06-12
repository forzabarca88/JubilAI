const express = require('express');
const router = express.Router();
const { MOCK_MODELS } = require('../utils/mock-data');

/** GET /api/models — Return mock model list */
router.get('/models', (req, res) => {
  const { url, apiKey } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  // Simulate network delay
  setTimeout(() => {
    res.json({ models: MOCK_MODELS.map(id => ({ id })) });
  }, 200);
});

module.exports = router;
