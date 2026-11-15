// Inkling UI wiring (ES module).
//
// Security notes:
//  - User-derived text is only ever written with textContent / text nodes.
//    No innerHTML, outerHTML, insertAdjacentHTML or eval anywhere.
//  - No network calls: the engine is local code (worker or main thread).

/* global __INKLING_INLINE__ */
// Set to true by build.mjs for the single-file build (no worker available there).
const INLINE_BUILD = typeof __INKLING_INLINE__ !== 'undefined' && __INKLING_INLINE__ === true;

const MAX_WORDS = 15000;
const SETTINGS_KEY = 'inkling:settings';
const THEME_KEY = 'inkling:theme';
const HUMANIZE_TIMEOUT_MS = 45000;
const MIN_BUSY_MS = 320;
const SVG_NS = 'http://www.w3.org/2000/svg';

const TONES = ['natural', 'casual', 'professional', 'marketing', 'academic'];
const STRENGTHS = ['light', 'balanced', 'aggressive'];
const SPELLINGS = ['us', 'uk'];

/* ------------------------------------------------------------------ */
/* Sample texts: deliberately full of typical AI-writing tells.        */
/* ------------------------------------------------------------------ */
const SAMPLES = [
  `In today's fast-paced digital landscape, businesses are constantly seeking innovative ways to stay ahead of the competition. Email marketing remains one of the most powerful tools in a marketer's arsenal — offering an impressive average return of $36 for every $1 spent. However, it is important to note that success requires more than just sending messages. It requires a strategic, data-driven approach.

Moreover, personalization has become a game-changer. By leveraging customer data, brands can deliver tailored content that resonates with their target audience. This not only boosts engagement but also fosters long-term loyalty. Furthermore, automation tools allow marketers to streamline their workflows, save valuable time, and focus on what truly matters.

In conclusion, embracing these strategies will empower your business to unlock its full potential. Whether you are a small startup or a large enterprise, now is the time to delve into the world of email marketing and elevate your brand to new heights.`,

  `Introducing the AuraFlow Smart Bottle — the perfect companion for your active lifestyle. Crafted from premium, BPA-free stainless steel, it keeps your drinks cold for up to 24 hours and hot for up to 12 hours. Moreover, its sleek, ergonomic design seamlessly fits into any bag, cup holder, or gym locker.

But that's not all. The built-in smart sensor tracks your hydration in real time and syncs effortlessly with the AuraFlow app, available on iOS and Android. Whether you are hiking, working, or hitting the gym, AuraFlow ensures you stay hydrated, energized, and focused throughout the day. Elevate your hydration game today for just $39.99 at auraflow.example.com.`,

  `Subject: Unlock the Power of Data-Driven Marketing

Hi Sarah,

I hope this email finds you well. I wanted to reach out to share some exciting news. Our team has just launched a comprehensive guide that delves into the key strategies top brands use to navigate the ever-evolving world of digital marketing.

In this guide, you will discover actionable insights, proven frameworks, and real-world case studies. It is designed to help marketing leaders like you streamline campaigns, maximize ROI, and drive meaningful results. Additionally, it includes a step-by-step checklist that you can implement immediately.

Do not miss this opportunity to stay ahead of the curve. Download your free copy today at https://example.com/guide and take your marketing to the next level.

Best regards,
Alex`,
];

/* Plain-English explanations for detector signals (matched loosely by id/name). */
const SIGNAL_EXPLAIN = [
  [/paragraph/i, 'How evenly sized the paragraphs are. AI tends to write blocks of almost identical length.'],
  [/sentlength|average.?sentence|avg.?sentence|mean.?sentence/i, 'How long sentences are on average. Long, evenly built sentences are typical of AI; people mix it up.'],
  [/perplex|predict|entropy|surpris|common.?word|frequen/i, 'How predictable the word choices are. AI picks the most likely next word, so its text is easy to predict. People make less obvious, but still natural, choices.'],
  [/burst|rhythm|length.?var|varian|uniform|sentence.?len|cadence/i, 'How much sentence length and shape vary. People mix long and short sentences; AI keeps them suspiciously even.'],
  [/finger|clich|phrase|buzz|vocab|tell|marker|stock/i, 'Words and phrases language models overuse, like "delve", "tapestry" or "in today\'s fast-paced world".'],
  [/dash|punct/i, 'Punctuation habits. AI leans on em dashes and very tidy, uniform punctuation.'],
  [/transition|connect|discourse|moreover|furthermore|adverb/i, 'Stiff transitions such as "Moreover", "Furthermore" and "Additionally" at the start of sentences.'],
  [/contraction/i, 'Whether the text uses contractions like "it\'s" and "don\'t". People do; AI often spells them out.'],
  [/opener|start|begin|repetit/i, 'How often sentences start the same way. Repeated openers are a classic machine pattern.'],
  [/tricolon|triad|triple|list|three/i, 'Neat groups of three ("fast, simple, and powerful") used again and again, a favorite AI padding move.'],
  [/lexic|divers|ttr|variety|unique/i, 'How varied the vocabulary is. AI text often shows an evenly polished, "rich" vocabulary that reads as machine-made.'],
  [/hedg|filler|padding|conclusion/i, 'Filler and hedging such as "it\'s worth noting" or "in conclusion".'],
  [/passive/i, 'How often sentences use the passive voice.'],
  [/question|exclam|aside|personal|voice|informal|texture/i, 'Questions, asides and personal touches: small human habits AI tends to skip.'],
];

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);

function storageGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* storage unavailable: ignore */ }
}

function countWords(text) {
  if (!text) return 0;
  const m = text.match(/\S+/g);
  return m ? m.length : 0;
}
function countChars(text) {
  let n = 0;
  // Count code points so emoji count as one character.
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0xdc00 || c > 0xdfff) n++;
  }
  return n;
}
const fmt = (n) => Number(n || 0).toLocaleString('en-US');

function randomSeed() {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return (a[0] % 2147483646) + 1;
  } catch {
    return Math.floor(Math.random() * 2147483646) + 1;
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** An error whose message is already written for the person using the page. */
function friendlyError(message) {
  const err = new Error(message);
  err.friendly = true;
  return err;
}

/** Resolve after the browser has had a chance to paint (works in background tabs too). */
function nextPaint() {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    try { requestAnimationFrame(() => setTimeout(finish, 0)); } catch { /* no rAF */ }
    setTimeout(finish, 60);
  });
}

function svgIcon(id, cls = 'icon') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', '#' + id);
  svg.appendChild(use);
  return svg;
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/* ------------------------------------------------------------------ */
/* Engine client: module worker first, main thread fallback            */
/* ------------------------------------------------------------------ */
class EngineClient {
  constructor() {
    this.mode = 'loading'; // 'worker' | 'main' | 'failed'
    this.worker = null;
    this.pending = new Map();
    this.nextId = 1;
    this.local = null;
    this.version = '';
    this.restarting = false;
    this.ready = this.init();
  }

  async init() {
    if (!INLINE_BUILD && typeof Worker !== 'undefined') {
      const ok = await this.startWorker();
      if (ok) { this.mode = 'worker'; return this.mode; }
    }
    try {
      await this.loadLocal();
      this.mode = 'main';
    } catch {
      this.mode = 'failed';
    }
    return this.mode;
  }

  startWorker() {
    return new Promise((resolve) => {
      let settled = false;
      let worker;
      let timer = 0;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!ok && worker) { try { worker.terminate(); } catch { /* ignore */ } }
        resolve(ok);
      };
      try {
        worker = new Worker(new URL('assets/worker.js', document.baseURI), { type: 'module', name: 'inkling-engine' });
      } catch {
        resolve(false);
        return;
      }
      timer = setTimeout(() => finish(false), 5000);
      worker.addEventListener('message', (event) => {
        const msg = event.data || {};
        if (msg.type === 'ready') {
          this.worker = worker;
          this.version = msg.version || '';
          finish(true);
        } else if (msg.type === 'fatal') {
          finish(false);
        } else {
          this.onReply(msg);
        }
      });
      worker.addEventListener('error', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        if (!settled) finish(false);
        else if (this.worker === worker) this.onWorkerCrash();
      });
      worker.addEventListener('messageerror', () => { if (this.worker === worker) this.onWorkerCrash(); });
    });
  }

  async loadLocal() {
    if (this.local) return this.local;
    let mod;
    try {
      mod = await import('../engine/index.js');
    } catch {
      throw friendlyError('The rewriting engine could not be loaded. Try reloading the page.');
    }
    if (typeof mod.humanize !== 'function' || typeof mod.detect !== 'function') {
      throw friendlyError('The rewriting engine is incomplete. Try reloading the page.');
    }
    this.local = mod;
    this.version = typeof mod.VERSION === 'string' ? mod.VERSION : this.version;
    return mod;
  }

  onReply(msg) {
    const job = this.pending.get(msg.id);
    if (!job) return;
    this.pending.delete(msg.id);
    clearTimeout(job.timer);
    if (msg.ok) job.resolve(msg.result);
    else job.reject(new Error(msg.error || 'Engine error'));
  }

  onWorkerCrash() {
    // Don't replay the job on the main thread: whatever crashed the worker
    // (e.g. running out of memory) would freeze the page instead.
    this.restartWorker(friendlyError('The engine stopped while processing this text. Try a shorter section.'));
  }

  async call(op, args, timeoutMs = HUMANIZE_TIMEOUT_MS) {
    await this.ready;
    if (this.mode === 'worker' && this.worker) {
      return new Promise((resolve, reject) => {
        const id = this.nextId++;
        const job = { op, args, resolve, reject, timer: 0 };
        job.timer = setTimeout(() => {
          if (!this.pending.has(id)) return;
          this.pending.delete(id);
          // A stuck worker is replaced so later requests still work.
          reject(friendlyError('This text took too long to process. Try a shorter section.'));
          this.restartWorker(friendlyError('The engine was restarted. Please try again.'));
        }, timeoutMs);
        this.pending.set(id, job);
        try {
          this.worker.postMessage({ id, op, args });
        } catch (err) {
          this.pending.delete(id);
          clearTimeout(job.timer);
          reject(err);
        }
      });
    }
    return this.runLocal(op, args);
  }

  async restartWorker(reason = friendlyError('The engine was restarted. Please try again.')) {
    if (this.restarting) return this.ready;
    this.restarting = true;
    const old = this.worker;
    this.worker = null;
    if (old) { try { old.terminate(); } catch { /* ignore */ } }
    const others = [...this.pending.values()];
    this.pending.clear();
    for (const job of others) { clearTimeout(job.timer); job.reject(reason); }
    this.mode = 'loading';
    this.ready = (async () => {
      try {
        const ok = await this.startWorker();
        if (ok) { this.mode = 'worker'; return this.mode; }
        try { await this.loadLocal(); this.mode = 'main'; } catch { this.mode = 'failed'; }
        return this.mode;
      } finally {
        this.restarting = false;
      }
    })();
    return this.ready;
  }

  async runLocal(op, args) {
    const mod = await this.loadLocal();
    await nextPaint(); // let the busy state paint before blocking work
    if (op === 'humanize') return mod.humanize(String(args.text), args.opts || {});
    if (op === 'detect') return mod.detect(String(args.text));
    if (op === 'diff') return mod.diffWords(String(args.a), String(args.b));
    throw new Error('Unknown operation: ' + op);
  }
}

/* ------------------------------------------------------------------ */
/* DOM references                                                      */
/* ------------------------------------------------------------------ */
const dom = {
  input: $('input'),
  inputView: $('input-view'),
  output: $('output'),
  outputEmpty: $('output-empty'),
  outputLoading: $('output-loading'),
  tone: $('tone'),
  humanize: $('humanize'),
  humanizeLabel: document.querySelector('#humanize .btn-label'),
  variant: $('variant'),
  variantTag: $('variant-tag'),
  paste: $('paste'),
  sample: $('sample'),
  clear: $('clear'),
  copy: $('copy'),
  download: $('download'),
  inCount: $('in-count'),
  outCount: $('out-count'),
  limitMsg: $('limit-msg'),
  staleMsg: $('stale-msg'),
  toggleDiff: $('toggle-diff'),
  toggleHlIn: $('toggle-hl-in'),
  toggleHlOut: $('toggle-hl-out'),
  legend: $('legend'),
  runStats: $('run-stats'),
  scoreIn: $('score-in'),
  scoreOut: $('score-out'),
  signals: $('signals'),
  signalsEmpty: $('signals-empty'),
  status: $('status'),
  toasts: $('toasts'),
  themeToggle: $('theme-toggle'),
  menuToggle: $('menu-toggle'),
  nav: $('site-nav'),
  engineVersion: $('engine-version'),
};

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */
const state = {
  seed: randomSeed(),
  variant: 0,
  output: '',
  source: null, // { text, tone, strength, spelling, seed } that produced `output`
  diff: null,
  inputDetect: null,
  inputDetectFor: null,
  outputDetect: null,
  busy: false,
  rerun: false,
  sampleIndex: -1,
  inputDetectToken: 0,
  outputRenderToken: 0,
  words: 0,
};

const engine = new EngineClient();

/* ------------------------------------------------------------------ */
/* Announcements & toasts                                              */
/* ------------------------------------------------------------------ */
let announceTimer = 0;
function announce(message) {
  clearTimeout(announceTimer);
  dom.status.textContent = '';
  announceTimer = setTimeout(() => { dom.status.textContent = message; }, 60);
}

function toast(message, { type = 'info', timeout = 4200 } = {}) {
  const node = el('div', 'toast toast-' + type);
  if (type === 'error') node.setAttribute('role', 'alert');
  node.appendChild(svgIcon(type === 'error' ? 'i-x' : type === 'success' ? 'i-check' : 'i-spark'));
  node.appendChild(el('span', 'toast-msg', message));
  const close = el('button', 'toast-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss notification');
  close.appendChild(svgIcon('i-x'));
  node.appendChild(close);

  let gone = false;
  const dismiss = () => {
    if (gone) return;
    gone = true;
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 220);
  };
  close.addEventListener('click', dismiss);
  dom.toasts.appendChild(node);
  while (dom.toasts.children.length > 3) dom.toasts.firstElementChild.remove();
  setTimeout(dismiss, timeout);
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */
function radioValue(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : '';
}
function setRadio(name, value) {
  const node = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (node) node.checked = true;
}

function currentOpts() {
  const tone = TONES.includes(dom.tone.value) ? dom.tone.value : 'natural';
  const strength = STRENGTHS.includes(radioValue('strength')) ? radioValue('strength') : 'balanced';
  const spelling = SPELLINGS.includes(radioValue('spelling')) ? radioValue('spelling') : 'us';
  return { tone, strength, spelling, seed: state.seed };
}

function saveSettings() {
  const { tone, strength, spelling } = currentOpts();
  storageSet(SETTINGS_KEY, JSON.stringify({
    tone, strength, spelling,
    showDiff: dom.toggleDiff.checked,
    highlightOutput: dom.toggleHlOut.checked,
  }));
}

function loadSettings() {
  let s = null;
  try { s = JSON.parse(storageGet(SETTINGS_KEY) || 'null'); } catch { s = null; }
  if (!s || typeof s !== 'object') return;
  if (TONES.includes(s.tone)) dom.tone.value = s.tone;
  if (STRENGTHS.includes(s.strength)) setRadio('strength', s.strength);
  if (SPELLINGS.includes(s.spelling)) setRadio('spelling', s.spelling);
  dom.toggleDiff.checked = s.showDiff === true;
  dom.toggleHlOut.checked = s.highlightOutput === true;
}

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */
function effectiveTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'light' || t === 'dark') return t;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch { return 'light'; }
}
function syncThemeUi() {
  const theme = effectiveTheme();
  dom.themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  if (document.documentElement.hasAttribute('data-theme')) {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.setAttribute('content', theme === 'dark' ? '#13131c' : '#fbf8f3');
    });
  }
}
function toggleTheme() {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  storageSet(THEME_KEY, next);
  syncThemeUi();
}

/* ------------------------------------------------------------------ */
/* Text annotation (diff + AI sentence highlights), DOM-only           */
/* ------------------------------------------------------------------ */
function aiClass(ai) {
  if (typeof ai !== 'number' || !Number.isFinite(ai)) return '';
  if (ai >= 0.65) return 'hl-high';
  if (ai >= 0.4) return 'hl-mid';
  return '';
}

function buildPieces(text, tokens) {
  if (!Array.isArray(tokens)) return [{ kind: 'same', text, start: 0, end: text.length }];
  const pieces = [];
  let offset = 0;
  let rebuilt = '';
  for (const t of tokens) {
    if (!t || typeof t.text !== 'string' || t.text === '') continue;
    if (t.type === 'del') {
      pieces.push({ kind: 'del', text: t.text, start: offset, end: offset });
    } else {
      pieces.push({ kind: t.type === 'add' ? 'add' : 'same', text: t.text, start: offset, end: offset + t.text.length });
      offset += t.text.length;
      rebuilt += t.text;
    }
  }
  if (rebuilt !== text) return null; // diff doesn't line up with this text: don't show it
  return pieces;
}

function buildMarks(text, sentences) {
  if (!Array.isArray(sentences)) return [];
  const marks = [];
  for (const s of sentences) {
    if (!s) continue;
    const start = Number(s.start);
    const end = Number(s.end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > text.length || end <= start) continue;
    const cls = aiClass(s.ai);
    if (!cls) continue;
    marks.push({ start, end, cls, ai: s.ai });
  }
  marks.sort((a, b) => a.start - b.start);
  // Drop overlaps so ranges are strictly increasing.
  const clean = [];
  let lastEnd = -1;
  for (const m of marks) {
    if (m.start >= lastEnd) { clean.push(m); lastEnd = m.end; }
  }
  return clean;
}

/**
 * Render `text` into `container` with optional diff tokens and sentence marks.
 * Everything is built with text nodes, so user text can never become markup.
 */
function renderAnnotated(container, text, { diff = null, sentences = null } = {}) {
  const pieces = buildPieces(text, diff) || buildPieces(text, null);
  const marks = buildMarks(text, sentences);
  const frag = document.createDocumentFragment();
  let mi = 0;
  let currentMark = null;
  let currentEl = null;

  const markEl = (m) => {
    if (currentMark !== m) {
      currentMark = m;
      currentEl = el('span', m.cls);
      currentEl.title = `Sounds ${Math.round(m.ai * 100)}% AI-like`;
      frag.appendChild(currentEl);
    }
    return currentEl;
  };
  const leaf = (kind, str) => {
    if (kind === 'add') return el('ins', null, str);
    if (kind === 'del') return el('del', null, str);
    return document.createTextNode(str);
  };

  for (const p of pieces) {
    if (p.kind === 'del') {
      const inside = currentMark && p.start > currentMark.start && p.start < currentMark.end;
      (inside ? currentEl : frag).appendChild(leaf('del', p.text));
      continue;
    }
    let pos = p.start;
    while (pos < p.end) {
      while (mi < marks.length && marks[mi].end <= pos) mi++;
      const m = marks[mi];
      let segEnd;
      let parent;
      if (m && m.start <= pos) {
        segEnd = Math.min(p.end, m.end);
        parent = markEl(m);
      } else {
        segEnd = m ? Math.min(p.end, m.start) : p.end;
        currentMark = null;
        currentEl = null;
        parent = frag;
      }
      parent.appendChild(leaf(p.kind, p.text.slice(pos - p.start, segEnd - p.start)));
      pos = segEnd;
    }
  }
  container.replaceChildren(frag);
}

/* ------------------------------------------------------------------ */
/* Score panel                                                         */
/* ------------------------------------------------------------------ */
function labelState(det) {
  const label = String(det.label || '');
  if (/human/i.test(label)) return 'human';
  if (/ai/i.test(label)) return 'ai';
  if (/mixed/i.test(label)) return 'mixed';
  const s = Number(det.score) || 0;
  return s >= 65 ? 'ai' : s >= 35 ? 'mixed' : 'human';
}

function setGauge(fig, det, emptyLabel) {
  const value = fig.querySelector('.gauge-value');
  const label = fig.querySelector('.gauge-label');
  const fill = fig.querySelector('.gauge-fill');
  if (!det) {
    fig.dataset.state = 'empty';
    value.textContent = '–';
    label.textContent = emptyLabel;
    fill.style.strokeDasharray = '0 100';
    return;
  }
  const score = Math.max(0, Math.min(100, Math.round(Number(det.score) || 0)));
  fig.dataset.state = labelState(det);
  value.textContent = score + '%';
  label.textContent = det.label || '';
  // Keep a tiny visible arc at 0 so the gauge still reads as a meter.
  fill.style.strokeDasharray = `${Math.max(score, 0.5)} 100`;
}

function explainSignal(sig) {
  const key = `${sig.id || ''} ${sig.name || ''}`;
  for (const [re, text] of SIGNAL_EXPLAIN) if (re.test(key)) return text;
  return '';
}

function formatValue(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '';
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
}

function verdictChip(sig) {
  const wrap = el('span', 'sig-cell-inner');
  if (!sig) {
    wrap.appendChild(el('span', 'verdict verdict-none', '–'));
    return wrap;
  }
  const v = sig.verdict === 'human' || sig.verdict === 'ai' ? sig.verdict : 'neutral';
  const chip = el('span', 'verdict verdict-' + v);
  chip.appendChild(svgIcon(v === 'human' ? 'i-check' : v === 'ai' ? 'i-x' : 'i-minus'));
  chip.appendChild(document.createTextNode(v === 'human' ? 'Human-like' : v === 'ai' ? 'AI-like' : 'Neutral'));
  wrap.appendChild(chip);
  const val = formatValue(sig.value);
  if (val) {
    const valueEl = el('span', 'sig-value', val);
    valueEl.title = 'Raw measurement';
    wrap.appendChild(document.createTextNode(' '));
    wrap.appendChild(valueEl);
  }
  return wrap;
}

function renderSignals() {
  const before = (state.inputDetect && Array.isArray(state.inputDetect.signals)) ? state.inputDetect.signals : [];
  const after = (state.outputDetect && Array.isArray(state.outputDetect.signals)) ? state.outputDetect.signals : [];
  const order = [];
  const byId = new Map();
  const add = (list, side) => {
    list.forEach((sig, i) => {
      if (!sig || typeof sig !== 'object') return;
      const id = String(sig.id || sig.name || 'signal-' + i);
      if (!byId.has(id)) { byId.set(id, {}); order.push(id); }
      byId.get(id)[side] = sig;
    });
  };
  add(before, 'before');
  add(after, 'after');

  const frag = document.createDocumentFragment();
  for (const id of order) {
    const { before: b, after: a } = byId.get(id);
    const ref = a || b;
    const li = el('li', 'signal');
    const main = el('div', 'sig-main');
    main.appendChild(el('div', 'sig-name', String(ref.name || id)));
    const explain = explainSignal(ref);
    if (explain) main.appendChild(el('p', 'sig-explain', explain));
    const details = [];
    if (b && b.detail) details.push((a ? 'Before: ' : '') + String(b.detail));
    if (a && a.detail) details.push('After: ' + String(a.detail));
    if (details.length) main.appendChild(el('p', 'sig-detail', details.join('  ·  ')));
    li.appendChild(main);

    for (const [side, sig] of [['Before', b], ['After', a]]) {
      const cell = el('div', 'sig-cell');
      cell.appendChild(el('span', 'sig-cell-label', side));
      cell.appendChild(verdictChip(sig));
      li.appendChild(cell);
    }
    frag.appendChild(li);
  }
  dom.signals.replaceChildren(frag);
  dom.signalsEmpty.hidden = order.length > 0;
}

function renderScores() {
  const hasInput = dom.input.value.trim().length > 0;
  setGauge(dom.scoreIn, hasInput ? state.inputDetect : null, hasInput ? 'Scoring…' : 'Paste text to score');
  setGauge(dom.scoreOut, state.output ? state.outputDetect : null, state.output ? 'Scoring…' : 'Humanize to score');
  renderSignals();
}

/* ------------------------------------------------------------------ */
/* Input handling                                                      */
/* ------------------------------------------------------------------ */
let countFrame = 0;
let detectTimer = 0;

function updateInputCounters() {
  const text = dom.input.value;
  const words = countWords(text);
  state.words = words;
  dom.inCount.textContent = `${fmt(words)} ${words === 1 ? 'word' : 'words'} · ${fmt(countChars(text))} characters`;
  const over = words > MAX_WORDS;
  dom.inCount.classList.toggle('is-over', over);
  if (over) {
    dom.limitMsg.textContent = `That's ${fmt(words)} words. Inkling handles up to ${fmt(MAX_WORDS)} words at a time, so split this into smaller parts and humanize each one.`;
    dom.limitMsg.hidden = false;
  } else {
    dom.limitMsg.hidden = true;
  }
}

function markStale() {
  const stale = Boolean(state.output && state.source && state.source.text !== dom.input.value);
  dom.staleMsg.hidden = !stale;
  dom.output.classList.toggle('is-stale', stale);
}

function scheduleInputDetect(immediate = false) {
  clearTimeout(detectTimer);
  const delay = immediate ? 0 : state.words > 3000 ? 1200 : 450;
  detectTimer = setTimeout(runInputDetect, delay);
}

async function runInputDetect() {
  const text = dom.input.value;
  const token = ++state.inputDetectToken;
  if (!text.trim()) {
    state.inputDetect = null;
    state.inputDetectFor = null;
    renderScores();
    return;
  }
  if (countWords(text) > MAX_WORDS) {
    state.inputDetect = null;
    state.inputDetectFor = null;
    renderScores();
    return;
  }
  try {
    const det = await engine.call('detect', { text }, 20000);
    if (token !== state.inputDetectToken) return; // a newer request superseded this one
    state.inputDetect = det && typeof det === 'object' ? det : null;
    state.inputDetectFor = text;
    renderScores();
    if (!dom.inputView.hidden) renderInputView();
  } catch (err) {
    if (token !== state.inputDetectToken) return;
    state.inputDetect = null;
    renderScores();
  }
}

function onInputChanged() {
  if (!countFrame) {
    countFrame = requestAnimationFrame(() => {
      countFrame = 0;
      updateInputCounters();
      markStale();
    });
  }
  scheduleInputDetect();
}

function setInputText(text) {
  dom.input.value = text;
  updateInputCounters();
  markStale();
  scheduleInputDetect(true);
  if (!dom.inputView.hidden) renderInputView();
}

function showTextarea(focus = false) {
  dom.toggleHlIn.checked = false;
  dom.inputView.hidden = true;
  dom.input.hidden = false;
  updateLegend();
  if (focus) dom.input.focus();
}

async function renderInputView() {
  const text = dom.input.value;
  if (!text.trim()) { showTextarea(); return; }
  if (!state.inputDetect || state.inputDetectFor !== text) {
    await runInputDetect();
    if (!dom.toggleHlIn.checked) return;
    if (!state.inputDetect || state.inputDetectFor !== dom.input.value) { showTextarea(); return; }
  }
  renderAnnotated(dom.inputView, dom.input.value, { sentences: state.inputDetect.sentences });
  dom.input.hidden = true;
  dom.inputView.hidden = false;
  updateLegend();
}

/* ------------------------------------------------------------------ */
/* Output rendering                                                    */
/* ------------------------------------------------------------------ */
function updateOutputCounters() {
  const text = state.output;
  const words = countWords(text);
  dom.outCount.textContent = `${fmt(words)} ${words === 1 ? 'word' : 'words'} · ${fmt(countChars(text))} characters`;
}

function updateLegend() {
  const showAi = (dom.toggleHlIn.checked && !dom.inputView.hidden) || (dom.toggleHlOut.checked && Boolean(state.output));
  const showDiff = dom.toggleDiff.checked && Boolean(state.output);
  dom.legend.hidden = !(showAi || showDiff);
  dom.legend.querySelectorAll('.legend-item').forEach((item) => {
    const isDiff = item.classList.contains('legend-diff');
    item.hidden = isDiff ? !showDiff : !showAi;
  });
}

async function getDiff() {
  if (state.diff && state.diff.output === state.output) return state.diff.tokens;
  const forOutput = state.output;
  const tokens = await engine.call('diff', { a: state.source.text, b: forOutput }, 30000);
  if (!Array.isArray(tokens)) throw new Error('Unexpected diff result');
  state.diff = { output: forOutput, tokens };
  return tokens;
}

async function renderOutput() {
  const token = ++state.outputRenderToken;
  const text = state.output;
  dom.outputEmpty.hidden = Boolean(text);
  updateOutputCounters();
  updateLegend();
  if (!text) { dom.output.textContent = ''; return; }

  const wantDiff = dom.toggleDiff.checked && state.source;
  const wantHl = dom.toggleHlOut.checked;
  if (!wantDiff && !wantHl) { dom.output.textContent = text; return; }

  let diff = null;
  if (wantDiff) {
    try {
      dom.output.setAttribute('aria-busy', 'true');
      diff = await getDiff();
    } catch (err) {
      if (token !== state.outputRenderToken) return;
      toast('Could not show changes for this text.', { type: 'error' });
      dom.toggleDiff.checked = false;
      saveSettings();
      diff = null;
    } finally {
      if (token === state.outputRenderToken) dom.output.setAttribute('aria-busy', 'false');
    }
  }
  if (token !== state.outputRenderToken) return;
  const sentences = wantHl && state.outputDetect ? state.outputDetect.sentences : null;
  renderAnnotated(dom.output, text, { diff, sentences });
}

/* ------------------------------------------------------------------ */
/* Humanize                                                            */
/* ------------------------------------------------------------------ */
function setBusy(busy) {
  state.busy = busy;
  dom.humanize.classList.toggle('is-busy', busy);
  dom.humanize.setAttribute('aria-disabled', busy ? 'true' : 'false');
  dom.humanizeLabel.textContent = busy ? 'Humanizing…' : 'Humanize';
  dom.output.setAttribute('aria-busy', busy ? 'true' : 'false');
  dom.outputLoading.hidden = !busy;
  if (busy) dom.outputEmpty.hidden = true;
  else dom.outputEmpty.hidden = Boolean(state.output);
  const hasOut = Boolean(state.output);
  dom.variant.disabled = busy || !hasOut;
  dom.copy.disabled = busy || !hasOut;
  dom.download.disabled = busy || !hasOut;
}

function renderRunStats(res, scoreBefore, scoreAfter) {
  const s = res && res.stats ? res.stats : {};
  const frag = document.createDocumentFragment();
  const part = (labelText, value) => {
    frag.appendChild(document.createTextNode(labelText));
    frag.appendChild(el('b', null, value));
  };
  part('Words ', `${fmt(s.inputWords)} → ${fmt(s.outputWords)}`);
  frag.appendChild(document.createTextNode('  ·  '));
  part('Sentences ', `${fmt(s.sentencesIn)} → ${fmt(s.sentencesOut)}`);
  frag.appendChild(document.createTextNode('  ·  '));
  part('Edits ', fmt(res.changes));
  if (typeof s.ms === 'number') {
    frag.appendChild(document.createTextNode('  ·  '));
    part('Time ', `${Math.max(1, Math.round(s.ms))} ms`);
  }
  if (scoreBefore != null && scoreAfter != null) {
    frag.appendChild(document.createTextNode('  ·  '));
    part('AI score ', `${scoreBefore}% → ${scoreAfter}%`);
  }
  dom.runStats.replaceChildren(frag);
  dom.runStats.hidden = false;
}

async function humanize({ fromVariant = false } = {}) {
  if (state.busy) return; // ignore repeat clicks; setting changes queue a rerun instead
  const text = dom.input.value;
  if (!text.trim()) {
    toast('Paste or type some text first, or try the Sample button.');
    showTextarea(true);
    return;
  }
  const words = countWords(text);
  if (words > MAX_WORDS) {
    toast(`Inkling handles up to ${fmt(MAX_WORDS)} words per run. Split your text and try again.`, { type: 'error' });
    return;
  }

  const opts = currentOpts();
  setBusy(true);
  announce('Humanizing your text…');
  const started = performance.now();
  try {
    const res = await engine.call('humanize', { text, opts });
    if (!res || typeof res.text !== 'string') throw friendlyError('The engine returned an unexpected result. Please try again.');
    const elapsed = performance.now() - started;
    if (elapsed < MIN_BUSY_MS) await sleep(MIN_BUSY_MS - elapsed);

    state.output = res.text;
    state.source = { text, ...opts };
    state.diff = null;
    state.outputDetect = null;
    if (!fromVariant || state.variant === 0) state.variant = Math.max(1, state.variant);
    dom.variantTag.textContent = `Variant ${state.variant}`;
    dom.variantTag.hidden = false;
    markStale();
    setBusy(false);
    renderScores();
    await renderOutput();

    // Score the output (and the input if it's not scored yet).
    let det = null;
    try { det = await engine.call('detect', { text: res.text }, 20000); } catch { det = null; }
    if (state.output === res.text) state.outputDetect = det && typeof det === 'object' ? det : null;
    if (!state.inputDetect || state.inputDetectFor !== text) await runInputDetect();
    renderScores();
    if (dom.toggleHlOut.checked) await renderOutput();

    const before = state.inputDetect ? Math.round(state.inputDetect.score) : null;
    const after = state.outputDetect ? Math.round(state.outputDetect.score) : null;
    renderRunStats(res, before, after);

    let msg = `Done. ${fmt(countWords(res.text))} words ready`;
    if (before != null && after != null) msg += `. AI score went from ${before}% to ${after}%, ${state.outputDetect.label || ''}`;
    if (res.text === text) msg = 'Done. This text already reads naturally, so very little was changed';
    announce(msg + '.');
  } catch (err) {
    setBusy(false);
    renderOutput();
    const message = err && err.friendly ? err.message
      : `Something went wrong while rewriting${err && err.message ? ` (${err.message})` : ''}. Please try again.`;
    toast(message, { type: 'error', timeout: 6000 });
    announce('Rewrite failed.');
  } finally {
    if (state.busy) setBusy(false);
    if (state.rerun) {
      state.rerun = false;
      humanize();
    }
  }
}

function newVariant() {
  if (!dom.input.value.trim()) return;
  state.seed = randomSeed();
  state.variant += 1;
  humanize({ fromVariant: true });
}

/* ------------------------------------------------------------------ */
/* Clipboard & download                                                */
/* ------------------------------------------------------------------ */
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to execCommand */ }
  const active = document.activeElement;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.className = 'visually-hidden';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  if (active && typeof active.focus === 'function') active.focus();
  return ok;
}

let copyResetTimer = 0;
async function onCopy() {
  if (!state.output) return;
  const ok = await copyText(state.output);
  if (ok) {
    const label = dom.copy.querySelector('span');
    label.textContent = 'Copied';
    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => { label.textContent = 'Copy'; }, 1600);
    toast('Copied to your clipboard.', { type: 'success', timeout: 2200 });
  } else {
    toast('Copy was blocked by your browser. Select the text and press Ctrl+C instead.', { type: 'error' });
  }
}

function onDownload() {
  if (!state.output) return;
  try {
    const blob = new Blob([state.output], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    a.href = url;
    a.download = `inkling-${stamp}-v${state.variant || 1}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Downloaded as a .txt file.', { type: 'success', timeout: 2200 });
  } catch {
    toast('Download failed. Use Copy instead.', { type: 'error' });
  }
}

async function onPaste() {
  try {
    if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') throw new Error('unsupported');
    const text = await navigator.clipboard.readText();
    if (!text) { toast('Your clipboard is empty.'); return; }
    showTextarea();
    setInputText(text);
    announce(`Pasted ${fmt(countWords(text))} words.`);
  } catch {
    toast('Your browser blocked clipboard access. Click the text box and press Ctrl+V (Cmd+V on Mac).');
    showTextarea(true);
  }
}

function onSample() {
  state.sampleIndex = (state.sampleIndex + 1) % SAMPLES.length;
  setInputText(SAMPLES[state.sampleIndex]);
  announce(`Loaded sample ${state.sampleIndex + 1} of ${SAMPLES.length}. Press Humanize to rewrite it.`);
}

function onClear() {
  showTextarea();
  dom.input.value = '';
  state.output = '';
  state.source = null;
  state.diff = null;
  state.inputDetect = null;
  state.inputDetectFor = null;
  state.outputDetect = null;
  state.variant = 0;
  state.inputDetectToken++;
  dom.variantTag.hidden = true;
  dom.runStats.hidden = true;
  updateInputCounters();
  markStale();
  setBusy(false);
  renderOutput();
  renderScores();
  dom.input.focus();
  announce('Cleared.');
}

/* ------------------------------------------------------------------ */
/* Header: mobile menu                                                 */
/* ------------------------------------------------------------------ */
function setMenu(open) {
  dom.nav.classList.toggle('is-open', open);
  dom.menuToggle.setAttribute('aria-expanded', String(open));
  dom.menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}

/* ------------------------------------------------------------------ */
/* Wire up                                                             */
/* ------------------------------------------------------------------ */
function init() {
  loadSettings();
  syncThemeUi();

  // Platform-appropriate shortcut hint.
  const isMac = /Mac|iPhone|iPad|iPod/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '');
  if (isMac) document.querySelectorAll('kbd[data-mod]').forEach((k) => { k.textContent = '⌘'; });
  dom.humanize.setAttribute('aria-keyshortcuts', isMac ? 'Meta+Enter' : 'Control+Enter');

  dom.input.addEventListener('input', onInputChanged);
  dom.humanize.addEventListener('click', () => humanize());
  dom.variant.addEventListener('click', newVariant);
  dom.copy.addEventListener('click', onCopy);
  dom.download.addEventListener('click', onDownload);
  dom.paste.addEventListener('click', onPaste);
  dom.sample.addEventListener('click', onSample);
  dom.clear.addEventListener('click', onClear);

  const onSettingChange = () => {
    saveSettings();
    if (state.output && !state.busy && dom.input.value.trim()) humanize();
    else if (state.busy) state.rerun = true;
  };
  dom.tone.addEventListener('change', onSettingChange);
  document.querySelectorAll('input[name="strength"], input[name="spelling"]').forEach((r) => r.addEventListener('change', onSettingChange));

  dom.toggleDiff.addEventListener('change', () => { saveSettings(); renderOutput(); });
  dom.toggleHlOut.addEventListener('change', () => { saveSettings(); renderOutput(); });
  dom.toggleHlIn.addEventListener('change', () => {
    if (dom.toggleHlIn.checked) {
      if (!dom.input.value.trim()) {
        dom.toggleHlIn.checked = false;
        toast('Add some text first, then turn on highlighting.');
        return;
      }
      renderInputView();
    } else {
      showTextarea();
    }
  });
  // The highlighted view is read-only: clicking it (or pressing Enter) returns to editing.
  dom.inputView.addEventListener('click', () => {
    const sel = window.getSelection && window.getSelection();
    if (sel && String(sel).length > 0) return; // let people select text
    showTextarea(true);
  });
  dom.inputView.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showTextarea(true); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.altKey) {
      e.preventDefault();
      humanize();
    } else if (e.key === 'Escape' && dom.nav.classList.contains('is-open')) {
      setMenu(false);
      dom.menuToggle.focus();
    }
  });

  dom.themeToggle.addEventListener('click', toggleTheme);
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeUi);
  } catch { /* old browsers */ }

  dom.menuToggle.addEventListener('click', () => setMenu(!dom.nav.classList.contains('is-open')));
  dom.nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('click', (e) => {
    if (dom.nav.classList.contains('is-open') && !e.target.closest('#site-nav') && !e.target.closest('#menu-toggle')) setMenu(false);
  });

  window.addEventListener('unhandledrejection', (e) => {
    e.preventDefault();
    toast('Something unexpected happened. Please try again.', { type: 'error' });
  });

  // Initial render (the browser may have restored text into the textarea).
  updateInputCounters();
  renderOutput();
  renderScores();
  setBusy(false);
  if (dom.input.value.trim()) scheduleInputDetect(true);

  engine.ready.then((mode) => {
    if (mode === 'failed') {
      dom.engineVersion.textContent = 'Engine unavailable';
      toast('The rewriting engine could not be loaded. Try reloading the page.', { type: 'error', timeout: 8000 });
      return;
    }
    const where = mode === 'worker' ? 'background thread' : 'this page';
    dom.engineVersion.textContent = `Engine ${engine.version ? 'v' + engine.version : ''} · running locally in ${where}`.replace('Engine  ', 'Engine ');
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
