const express = require('express');
const router = express.Router();
const { createClient } = require('../utils/openai-client');

/** GET /api/models — Fetch available models from a given endpoint */
router.get('/models', async (req, res) => {
  const { url, apiKey } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const client = createClient(url, apiKey);
    const response = await client.models.list();
    const models = response.data.map(m => ({ id: m.id, ...m }));
    res.json({ models });
  } catch (err) {
    console.error('Error fetching models:', err.message);
    res.status(500).json({ error: 'Failed to fetch models', detail: err.message });
  }
});

module.exports = router;
