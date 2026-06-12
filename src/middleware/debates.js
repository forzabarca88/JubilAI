/** In-memory store for active debates */
const debates = new Map();

/**
 * Express middleware: look up a debate by :id and attach to request.
 * Returns 404 if not found.
 */
function findDebate(req, res, next) {
  const debate = debates.get(req.params.id);
  if (!debate) return res.status(404).json({ error: 'Debate not found' });
  req.debate = debate;
  next();
}

module.exports = { debates, findDebate };
