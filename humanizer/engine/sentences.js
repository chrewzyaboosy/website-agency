// Sentence segmentation and word tokenization.
// Works on raw text and on masked text (protected spans replaced by private-use placeholders,
// see protect.js). A placeholder behaves like a single opaque word.

export const PH_START = '\uE000';
export const PH_END = '\uE001';
export const PH_RE = /\uE000[\uE010-\uE01F]+\uE001/g;
export const PH_ONE = /^\uE000[\uE010-\uE01F]+\uE001$/;

const WC = '\\p{L}\\p{N}\\p{M}\\uE000-\\uE01F';
/** A "word": letters/digits/placeholder chars, allowing inner apostrophes and hyphens. */
export const WORD_RE = new RegExp(`[${WC}](?:[${WC}'’\\-]*[${WC}])?`, 'gu');

export function words(text) {
  return String(text).match(WORD_RE) || [];
}

export function countWords(text) {
  const m = String(text).match(WORD_RE);
  return m ? m.length : 0;
}

// Abbreviations that never end a sentence (lowercase, without final dot).
const NEVER_END = new Set([
  'mr', 'mrs', 'ms', 'mx', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'v', 'e.g', 'i.e', 'eg', 'ie', 'cf', 'fig', 'figs',
  'approx', 'mt', 'gen', 'col', 'lt', 'sgt', 'capt', 'rev', 'hon', 'ph.d', 'dept', 'est', 'ref', 'refs', 'vol',
  'pp', 'p', 'ch', 'sec', 'para', 'art', 'gov', 'pres', 'supt', 'messrs', 'mme', 'mlle', 'ft', 'mins', 'hrs',
]);
// Abbreviations that may end a sentence: split only when a typical sentence starter follows.
const MAY_END = new Set([
  'etc', 'inc', 'ltd', 'co', 'corp', 'llc', 'plc', 'al', 'a.m', 'p.m', 'am', 'pm', 'u.s', 'u.k', 'e.u', 'u.n',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'no', 'misc', 'ave',
  'blvd', 'rd', 'bros', 'dept', 'univ', 'assn', 'u.s.a',
]);
// Words that typically begin a sentence (used to disambiguate MAY_END abbreviations).
export const STARTERS = new Set([
  'the', 'this', 'that', 'these', 'those', 'it', 'its', 'we', 'our', 'you', 'your', 'they', 'their', 'there', 'he',
  'his', 'she', 'her', 'i', 'in', 'on', 'at', 'for', 'but', 'and', 'so', 'yet', 'or', 'if', 'when', 'while', 'as',
  'after', 'before', 'once', 'because', 'since', 'a', 'an', 'all', 'most', 'many', 'some', 'every', 'each', 'no',
  'not', 'now', 'today', 'here', 'what', 'why', 'how', 'who', 'where', 'which', 'one', 'my', 'more', 'still',
  'also', 'then', 'however', 'with', 'by', 'from', 'to', 'just', 'even', 'only', 'both', 'such', 'other', 'another',
  'let', 'let\'s', 'do', 'don\'t', 'please', 'think', 'imagine', 'consider', 'start', 'take', 'make', 'try', 'use',
]);

const CLOSERS = `"'”’)\\]*_»`;
const TERM_RE = new RegExp(`[.!?…]+[${CLOSERS}]*(?=\\s|$)|\\n+`, 'g');

function isLowerLetter(ch) {
  return ch !== undefined && ch.toLowerCase() === ch && ch.toUpperCase() !== ch;
}

/**
 * Decide whether the terminal punctuation found at [idx, idx+len) ends a sentence.
 * @param {string} text
 * @param {number} idx  index of first punctuation char
 * @param {string} punct the matched cluster
 * @param {number} endIdx index right after cluster
 * @param {(ph:string)=>string} [resolve] maps a placeholder to its original text
 */
export function isBoundary(text, idx, punct, endIdx, resolve) {
  // next non-space char
  let j = endIdx;
  while (j < text.length && (text[j] === ' ' || text[j] === '\t' || text[j] === ' ')) j++;
  if (j >= text.length) return true;
  const next = text[j];
  if (next === '\n') return true;
  // skip opening markup to find the first letter of the next sentence
  let k = j;
  while (k < text.length && `"'“‘([*_¿¡`.includes(text[k])) k++;
  const nextLetter = text[k];
  if (isLowerLetter(nextLetter)) return false;

  const core = punct.replace(new RegExp(`[${CLOSERS}]+$`), '');
  if (/[!?]/.test(core)) return true;
  if (core.length >= 2 || core === '…') {
    // ellipsis followed by a non-lowercase char: treat as boundary
    return true;
  }
  // single period: check the word before it
  let s = idx;
  while (s > 0 && !/\s/.test(text[s - 1])) s--;
  let prev = text.slice(s, idx).replace(/^[("'“‘\[*_]+/, '');
  if (prev.endsWith(PH_END) && resolve) {
    const m = prev.match(/\uE000[\uE010-\uE01F]+\uE001$/);
    if (m) {
      const orig = resolve(m[0]);
      if (orig && /^(?:[A-Za-z]\.)+[A-Za-z]$/.test(orig)) prev = orig;
      else return true;
    }
  }
  if (!prev) return true;
  const lower = prev.toLowerCase();
  if (/^[A-Z]$/.test(prev)) return false; // initial: "J. Smith"
  if (NEVER_END.has(lower)) return false;
  if (lower === 'no') {
    // "No. 5" vs "The answer was no. Then..."
    return !(/[0-9\uE000]/.test(nextLetter || ''));
  }
  if (MAY_END.has(lower) || /^(?:[a-z]\.)+[a-z]$/.test(lower)) {
    const nw = text.slice(k).match(/^[A-Za-z']+/);
    return !!(nw && STARTERS.has(nw[0].toLowerCase()));
  }
  return true;
}

/**
 * Split text into sentences.
 * @returns {Array<{text:string,start:number,end:number}>}
 */
export function splitSentences(text, opts = {}) {
  const t = String(text);
  const out = [];
  const resolve = opts.resolve;
  let start = 0;
  const push = (s, e) => {
    while (s < e && /\s/.test(t[s])) s++;
    while (e > s && /\s/.test(t[e - 1])) e--;
    if (e > s) out.push({ text: t.slice(s, e), start: s, end: e });
  };
  TERM_RE.lastIndex = 0;
  let m;
  while ((m = TERM_RE.exec(t))) {
    const endIdx = m.index + m[0].length;
    if (m[0][0] === '\n') {
      push(start, m.index);
      start = endIdx;
      continue;
    }
    if (isBoundary(t, m.index, m[0], endIdx, resolve)) {
      push(start, endIdx);
      start = endIdx;
    }
  }
  push(start, t.length);
  return out;
}

/** Convenience: just the sentence strings. */
export function sentenceTexts(text, opts) {
  return splitSentences(text, opts).map((s) => s.text);
}

/** Return [prefix, firstWord, rest] where prefix is leading markup/quotes. */
export function firstWordParts(sentence) {
  const m = sentence.match(/^([\s*_"“'‘(\[¿¡]*)([\p{L}\p{N}\uE000-\uE01F][\p{L}\p{N}\p{M}\uE000-\uE01F'’\-]*)/u);
  if (!m) return null;
  return [m[1], m[2], sentence.slice(m[0].length)];
}

export function firstWord(sentence) {
  const p = firstWordParts(sentence);
  return p ? p[1] : '';
}
