const express = require('express');
const { registerBatchOnChain } = require('./stellar');
const { verifySignature } = require('./src/middleware/auth');

// Inline require of the compiled/ts-node batcher. Using require with ts-node
// registration, or the plain JS equivalent below if TS is not bootstrapped.
let EventBatcher;
try {
  require('ts-node/register');
  ({ EventBatcher } = require('./src/queue/batcher'));
} catch {
  // Fallback: inline minimal batcher so the server still boots without ts-node
  EventBatcher = class {
    constructor(flush) { this.flush = flush; this.queue = []; this.timer = null; }
    enqueue(id) {
      this.queue.push(id);
      if (!this.timer) this.timer = setTimeout(() => this._drain(), 5000);
      if (this.queue.length >= 50) this._drain();
    }
    _drain() {
      clearTimeout(this.timer); this.timer = null;
      if (!this.queue.length) return;
      const batch = this.queue.splice(0);
      this.flush(batch).catch(e => console.error('[batcher] flush error:', e));
    }
  };
}

const batcher = new EventBatcher(registerBatchOnChain);

const app = express();
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.post('/github-webhook', verifySignature, async (req, res) => {
  const { action, pull_request: pr } = req.body;

  if (action !== 'closed' || !pr?.merged) {
    return res.status(200).json({ skipped: true });
  }

  const hasLabel = pr.labels?.some(l => l.name === 'wave-contribution');
  if (!hasLabel) {
    return res.status(200).json({ skipped: true, reason: 'no wave-contribution label' });
  }

  const start = Date.now();
  console.log(`[webhook] PR #${pr.number} merged with wave-contribution label`);
  try {
    await registerTaskOnChain(pr.number);
    vero_events_processed_total.inc();
  } catch (error) {
    // We can increment an error counter or track failure if needed, but currently let's just rethrow or return 500.
    // The problem statement requires tracking processed events and latency.
    throw error;
  } finally {
    const durationSec = (Date.now() - start) / 1000;
    queue_latency_seconds.observe(durationSec);
  }
   batcher.enqueue(pr.number);
   res.status(200).json({ ok: true, pr: pr.number, status: 'queued' });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
}

module.exports = app;
