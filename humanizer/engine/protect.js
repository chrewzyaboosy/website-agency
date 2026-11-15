// Masking of spans that must survive humanization byte-for-byte.
// Each protected span is replaced by a private-use placeholder: U+E000, hex digits encoded as
// U+E010..U+E01F, then U+E001. Placeholders look like one opaque "word" to the rest of the engine.
// Restoration is recursive (a quoted span may itself contain a masked URL).

import { PH_START, PH_END } from './sentences.js';

const PH_GLOBAL = /\uE000([\uE010-\uE01F]+)\uE001/g;

function encode(id) {
  const hex = id.toString(16);
  let s = PH_START;
  for (const ch of hex) s += String.fromCharCode(0xe010 + parseInt(ch, 16));
  return s + PH_END;
}

function decode(body) {
  let n = 0;
  for (const ch of body) n = n * 16 + (ch.charCodeAt(0) - 0xe010);
  return n;
}

// --- protection patterns (order matters) -------------------------------------------------
const RE_PUA = /[\uE000-\uE01F]/g;
const RE_INLINE_CODE = /`[^`\n]+`/g;
const RE_HTML_TAG = /<\/?[A-Za-z][^<>\n]*>/g;
const RE_MD_LINK_TARGET = /\]\([^)\s]*\)/g;
const RE_URL = /\b(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>"'`]*[^\s<>"'`.,;:!?)\]}]/gi;
const RE_EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const RE_DOMAIN =
  /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|org|net|io|ai|co|app|dev|edu|gov|uk|us|ca|de|fr|es|it|nl|au|in|me|ly|xyz|info|biz|tv|so|gg|sh|cloud|tech|store|shop|site|online)\b(?:\/[^\s<>"'`]*[^\s<>"'`.,;:!?)\]}])?/gi;
const RE_HANDLE_TAG = /(^|[^\p{L}\p{N}_@#&/])([@#][\p{L}_][\p{L}\p{N}_]*)/gu;
const RE_QUOTE = /"[^"\n]{1,500}"|“[^”\n]{1,500}”|«[^»\n]{1,500}»/g;
const UNITS = '(?:st|nd|rd|th|k|K|M|B|bn|mn|x|X|s|am|pm|AM|PM|h|hr|hrs|min|mins|ms|px|pt|em|rem|GB|MB|KB|TB|kg|g|km|m|mi|mph|lb|lbs|oz|ft|in|cm|mm|ml|L|yo|D)';
const RE_NUMBER = new RegExp(
  `(?<![\\p{L}\\p{N}_])(?:[$€£¥₹]\\s?|[vV](?=\\d))?\\d(?:[\\d.,:/\\-–]*\\d)?(?:\\s?%|\\s?percent\\b)?(?:${UNITS}(?![\\p{L}]))?(?:\\s?(?:[$€£¥]|USD|EUR|GBP))?`,
  'gu'
);
const RE_DOTTED_ACRONYM = /\b[A-Z](?:\.[A-Z])+(?=\.)/g; // "U.S" in "U.S." (final dot left for the splitter)
const RE_ACRONYM = /(?<![\p{L}\p{N}_])[A-Z][A-Z0-9&]*[A-Z0-9](?:['’]?s)?(?![\p{L}\p{N}_])/gu;
// Capitalized word(s) in the middle of a sentence: proper nouns / brands.
const CAP_WORD = "[A-Z][\\p{L}\\p{M}'’]*(?:-[\\p{L}]+)*";
const RE_MIDCAP = new RegExp(
  `(?<=[\\p{Ll}\\p{N},;)%\\uE001'’]\\s{1,3})(?!I(?:['’][a-z]+)?(?![\\p{L}]))${CAP_WORD}(?:\\s(?:of|the|de|van|von|and|&)?\\s?${CAP_WORD})*`,
  'gu'
);

/**
 * Create a protection context shared by all lines of one document.
 */
export function createStore() {
  const items = [];
  const raw = new Set(); // ids whose content is literal (user-supplied private-use chars)
  const properNouns = new Set();
  const add = (s) => {
    items.push(s);
    return encode(items.length - 1);
  };
  const addRaw = (s) => {
    raw.add(items.length);
    return add(s);
  };
  const resolveId = (id, depth) => {
    const v = items[id];
    if (v === undefined) return '';
    if (raw.has(id) || depth > 8 || v.indexOf(PH_START) === -1) return v;
    return v.replace(PH_GLOBAL, (m, body) => resolveId(decode(body), depth + 1));
  };
  const get = (ph) => {
    const m = /^\uE000([\uE010-\uE01F]+)\uE001$/.exec(ph);
    if (!m) return undefined;
    return items[decode(m[1])];
  };
  /** Fully resolve a placeholder (recursively) to its original text. */
  const resolve = (ph) => {
    const m = /^\uE000([\uE010-\uE01F]+)\uE001$/.exec(ph);
    return m ? resolveId(decode(m[1]), 0) : ph;
  };
  /** Restore every placeholder in a text. Single pass at the top level, so restored text is never re-read. */
  const unmask = (text) => (text.indexOf(PH_START) === -1 ? text : text.replace(PH_GLOBAL, (m, body) => resolveId(decode(body), 0)));
  return { items, add, addRaw, get, resolve, unmask, properNouns };
}

/**
 * Mask protected spans in one line (or any single-line chunk) of text.
 * @param {string} text
 * @param {ReturnType<typeof createStore>} store
 * @param {{maskCaps?: boolean}} [opt]
 */
export function protect(text, store, opt = {}) {
  const add = store.add;
  let t = text;
  t = t.replace(RE_PUA, store.addRaw);
  t = t.replace(RE_INLINE_CODE, add);
  t = t.replace(RE_HTML_TAG, add);
  t = t.replace(RE_MD_LINK_TARGET, (m) => ']' + add(m.slice(1)));
  t = t.replace(RE_URL, add);
  t = t.replace(RE_EMAIL, add);
  t = t.replace(RE_DOMAIN, add);
  t = t.replace(RE_HANDLE_TAG, (m, pre, h) => pre + add(h));
  // Quotes: keep sentence-final punctuation inside a quote visible to the sentence splitter
  // ("Go now." -> mask `"Go now` and leave `."`). Restoration is still byte-exact.
  t = t.replace(RE_QUOTE, (m) => {
    const tail = m.match(/[.!?…]+["”»]$/);
    if (tail && tail[0].length < m.length - 1) return add(m.slice(0, -tail[0].length)) + tail[0];
    return add(m);
  });
  t = t.replace(RE_NUMBER, add);
  t = t.replace(RE_DOTTED_ACRONYM, add);
  t = t.replace(RE_ACRONYM, add);
  if (opt.maskCaps !== false) {
    t = t.replace(RE_MIDCAP, (m) => {
      for (const w of m.split(/\s+/)) if (/^[A-Z]/.test(w)) store.properNouns.add(w.toLowerCase().replace(/['’]s$/, ''));
      return add(m);
    });
  }
  return t;
}

/** One-shot helper: mask a whole string, returning masked text and an unmask function. */
export function maskText(text) {
  const store = createStore();
  const masked = String(text)
    .split('\n')
    .map((line) => protect(line, store))
    .join('\n');
  return { masked, store, unmask: store.unmask };
}
