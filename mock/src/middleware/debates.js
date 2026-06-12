/** In-memory store for mock debates */
const debates = new Map();

function findDebate(req, res, next) {
  const debate = debates.get(req.params.id);
  if (!debate) return res.status(404).json({ error: 'Debate not found' });
  req.debate = debate;
  next();
}

module.exports = { debates, findDebate };
