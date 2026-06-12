/**
 * Set up Server-Sent Events (SSE) response headers.
 * @param {Express.Response} res
 */
function setupSSE(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
}

/**
 * Send a streaming text chunk via SSE.
 * @param {Express.Response} res
 * @param {string} content
 */
function sendChunk(res, content) {
  res.write(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`);
}

/**
 * Send a done signal via SSE with additional data.
 * @param {Express.Response} res
 * @param {Object} data - Additional fields to include
 */
function sendDone(res, data = {}) {
  res.write(`data: ${JSON.stringify({ type: 'done', ...data })}\n\n`);
}

/**
 * Send an error signal via SSE.
 * @param {Express.Response} res
 * @param {string} error
 */
function sendError(res, error) {
  res.write(`data: ${JSON.stringify({ type: 'error', error })}\n\n`);
}

module.exports = { setupSSE, sendChunk, sendDone, sendError };
