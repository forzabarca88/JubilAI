/**
 * Stream text in chunks with a delay between each chunk.
 * @param {Express.Response} res
 * @param {string} text - Full text to stream
 * @param {number} chunkSize - Characters per chunk
 * @param {number} delay - Milliseconds between chunks
 * @returns {Promise<void>}
 */
function streamText(res, text, chunkSize = 3, delay = 20) {
  return new Promise(resolve => {
    let i = 0;
    const sendChunk = () => {
      if (i >= text.length) {
        resolve();
        return;
      }
      const chunk = text.slice(i, i + chunkSize);
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
      i += chunkSize;
      setTimeout(sendChunk, delay);
    };
    sendChunk();
  });
}

module.exports = { streamText };
