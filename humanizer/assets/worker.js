// Inkling background worker (module worker).
// Runs the engine off the main thread so the page stays responsive on long
// texts. The engine is loaded with a guarded dynamic import so a load failure
// is reported to the page (which then falls back to the main thread) instead
// of surfacing as an uncaught error.

let engine = null;

const loading = import('../engine/index.js')
  .then((mod) => {
    engine = mod;
    self.postMessage({ type: 'ready', version: typeof mod.VERSION === 'string' ? mod.VERSION : '' });
  })
  .catch((err) => {
    self.postMessage({ type: 'fatal', error: String((err && err.message) || err) });
  });

self.addEventListener('message', async (event) => {
  const msg = event.data || {};
  const { id, op, args } = msg;
  if (typeof id !== 'number') return;
  try {
    await loading;
    if (!engine) throw new Error('The rewriting engine failed to load.');
    let result;
    if (op === 'humanize') result = engine.humanize(String(args.text), args.opts || {});
    else if (op === 'detect') result = engine.detect(String(args.text));
    else if (op === 'diff') result = engine.diffWords(String(args.a), String(args.b));
    else throw new Error('Unknown operation: ' + op);
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
});
