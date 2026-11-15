// Explainable, local AI-likelihood estimator.
//
// It does NOT reproduce GPTZero / ZeroGPT / Originality (those run large neural models). It measures the
// stylometric signals those tools are known to react to and combines them with a logistic model:
//
//   score = 100 * sigmoid( BIAS + sum_i WEIGHT_i * f_i )
//
// where each f_i is a centred, clipped feature (positive = more AI-like). Weights were fitted with a
// small L2-regularised logistic regression on a calibration set of 16 typical ChatGPT/Claude marketing
// texts and 16 human texts (reviews, news, blogs, forum posts, emails, and short quotes of pre-2020 web
// essays by Paul Graham and Joel Spolsky), then rounded and sanity-checked by hand. See WEIGHTS below
// and tests/detect.test.mjs for the calibration checks (AI > 70, human < 35).

import { splitSentences, words, countWords } from './sentences.js';
import { getClicheRules, AI_CONSTRUCTIONS } from './lexicon.js';
import { zipf } from './freq.js';

// ---------------------------------------------------------------------------- feature definitions
// Each feature is standardised with the calibration-set mean/stdev (f = clip((raw - mu) / sd, -3, 3)) and
// weighted. Positive weight * positive f => more AI-like.
//
//   feature        raw measurement                                   mu      sd     weight   why
//   aiPhrases      log(1 + tier-weighted AI-cliché hits per 100 w)   0.88    1.03   +1.29    strongest single tell
//   emDash         em/en dashes per 100 words (capped at 3)          0.22    0.71   +0.75    modern chat models overuse them
//   tricolons      "X, Y, and Z" lists per sentence                  0.16    0.16   +0.65    rule-of-three padding
//   perplexity     mean unigram surprisal (7.5 - Zipf, OOV = 5.5)    1.90    0.28   +0.67    polished mid-frequency vocabulary
//     + surprisal variation across sentences                        0.32    0.14   -0.41    humans spike (names, slang, specifics)
//     + out-of-vocabulary rate                                      0.06    0.05   -0.15
//   sentLength     mean words per sentence                           14.9    2.7    +0.50    AI prose sits around 17-20
//   informality    log(1 + human-texture markers per 100 words)      0.83    0.87   -0.48    questions, asides, first person, "!"
//   burstiness     coefficient of variation of sentence length       0.38    0.17   -0.30    humans mix very short and long
//   contractions   contractions per 100 words                        2.7     2.5    -0.12    humans contract (weak on its own)
//   paragraphs     CV of paragraph lengths (>= 3 paragraphs only)    0.35    0.15   -0.20    prior, not fitted (AI paragraphs are uniform)
//   openers        opener repetition + stock transition openers      0.11    0.13    0.00    reported only (fit was not significant)
//   lexDiversity   MTLD                                              115     30      0.00    reported only (fit was not significant)
//   bias                                                                                +0.05
//
// Weights come from an L2-regularised (lambda = 0.04) logistic regression on 20 AI and 20 human calibration
// texts (standardised features, 5000 gradient steps). Result on the calibration set: AI 71-100 (mean ~92),
// human 0-24 (mean ~8). Re-fit when the lexicon changes, since aiPhrases depends on it.
const FEATURES = {
  aiPhrases: { name: 'AI-cliché density', mu: 0.88, sd: 1.03, w: 1.29 },
  emDash: { name: 'Em-dash rate', mu: 0.22, sd: 0.71, w: 0.75 },
  tricolons: { name: '"X, Y, and Z" lists', mu: 0.16, sd: 0.16, w: 0.65 },
  perplexity: { name: 'Vocabulary predictability (word-frequency perplexity proxy)', mu: 1.9, sd: 0.28, w: 0.67 },
  sentLength: { name: 'Average sentence length', mu: 14.9, sd: 2.7, w: 0.5 },
  informality: { name: 'Human texture (questions, asides, first person)', mu: 0.83, sd: 0.87, w: -0.48 },
  burstiness: { name: 'Sentence-length burstiness', mu: 0.38, sd: 0.17, w: -0.3 },
  contractions: { name: 'Contraction rate', mu: 2.7, sd: 2.5, w: -0.12 },
  paragraphs: { name: 'Paragraph uniformity', mu: 0.35, sd: 0.15, w: -0.2 },
  openers: { name: 'Sentence-opener repetition', mu: 0.11, sd: 0.13, w: 0 },
  lexDiversity: { name: 'Lexical diversity (MTLD)', mu: 115, sd: 30, w: 0 },
};
const SURPRISAL_VAR = { mu: 0.32, sd: 0.14, w: -0.41 };
const OOV = { mu: 0.06, sd: 0.05, w: -0.15 };

// Logistic weights exported for transparency / UI tooltips.
export const WEIGHTS = Object.fromEntries([
  ['bias', 0.05],
  ...Object.entries(FEATURES).map(([k, v]) => [k, v.w]),
  ['surprisalVariation', SURPRISAL_VAR.w],
  ['oovRate', OOV.w],
]);

// ---------------------------------------------------------------------------- helpers
const CONTRACTION_RE = /\b[A-Za-z]+(?:['’](?:s|re|ve|ll|d|m|t))\b|\b(?:can['’]t|won['’]t|don['’]t|isn['’]t|aren['’]t|doesn['’]t|didn['’]t|wasn['’]t|weren['’]t|haven['’]t|hasn['’]t|couldn['’]t|shouldn['’]t|wouldn['’]t)\b/gi;
const POSSESSIVE_LIKE = /^(?:[A-Z][a-z]+|[a-z]+)['’]s$/;
const TRICOLON_RE = /\b[\w'’-]+(?: [\w'’-]+){0,3}, [\w'’-]+(?: [\w'’-]+){0,3},? (?:and|or) [\w'’-]+/g;
const INFORMAL_RE = /\b(?:I|I'm|I've|I'd|I'll|me|my|mine|lol|gonna|wanna|kinda|sorta|yeah|yep|nope|ok|okay|honestly|basically|actually|stuff|guess|dunno|totally|super|pretty|weird|crazy|awesome|tbh|btw|anyway|though)\b|[?!]|\(|\.\.\.|…/gi;
const TRANSITION_OPENERS = /^(?:however|moreover|furthermore|additionally|ultimately|overall|consequently|therefore|thus|hence|in conclusion|in summary|in addition|importantly|notably|whether|by|with|from|as a result|in today['’]s)\b/i;

function mean(a) {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
}
function stdev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length);
}
function coefVar(a) {
  const m = mean(a);
  return m ? stdev(a) / m : 0;
}
function clip(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}
function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

function mtldPass(tokens) {
  const threshold = 0.72;
  let factors = 0;
  let types = new Set();
  let count = 0;
  for (const t of tokens) {
    count++;
    types.add(t);
    if (types.size / count <= threshold) {
      factors++;
      types = new Set();
      count = 0;
    }
  }
  if (count > 0) {
    const ttr = types.size / count;
    factors += (1 - ttr) / (1 - threshold);
  }
  return factors > 0 ? tokens.length / factors : tokens.length;
}

/** Measure of Textual Lexical Diversity (McCarthy & Jarvis 2010), averaged forward/backward. */
export function mtld(tokens) {
  if (tokens.length < 10) return 75;
  return (mtldPass(tokens) + mtldPass(tokens.slice().reverse())) / 2;
}

function isProseLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (/^(#{1,6}\s|[-*+•]\s|\d{1,3}[.)]\s|>|\||```)/.test(t)) return false;
  if (/^#\w/.test(t) && !/\s\w+\s/.test(t.replace(/#\w+/g, ''))) return false; // hashtag line
  return true;
}

function wordSurprisal(w) {
  const z = zipf(w);
  // unknown words (names, rare words, slang, typos) are treated as fairly surprising
  return z > 0 ? Math.max(0, 7.5 - z) : 5.5;
}

// ---------------------------------------------------------------------------- feature extraction
let RULES = null;

/** Raw measurements used by detect(); exported for tests and calibration. */
export function measure(text) {
  const t = String(text);
  const lines = t.split('\n');
  const paragraphs = [];
  let cur = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (cur.length) paragraphs.push(cur.join(' '));
      cur = [];
    } else if (isProseLine(line)) cur.push(line.trim());
  }
  if (cur.length) paragraphs.push(cur.join(' '));
  const prose = paragraphs.join('\n');
  const allSents = splitSentences(t);
  const proseSents = splitSentences(prose).filter((s) => countWords(s.text) >= 3);
  const lens = proseSents.map((s) => countWords(s.text));
  const nWords = Math.max(1, countWords(t));
  const toks = words(prose).map((w) => w.toLowerCase().replace(/’/g, "'"));
  const alpha = toks.filter((w) => /^[a-z']+$/.test(w));

  // AI phrases (weighted by tier)
  if (!RULES) RULES = getClicheRules();
  let phraseScore = 0;
  const phraseHits = [];
  for (const r of RULES) {
    r.re.lastIndex = 0;
    const m = t.match(r.re);
    if (m) {
      const w = r.tier === 1 ? 1 : r.tier === 2 ? 0.6 : 0.3;
      phraseScore += m.length * w;
      if (phraseHits.length < 12) phraseHits.push(m[0]);
    }
  }
  for (const re of AI_CONSTRUCTIONS) {
    re.lastIndex = 0;
    const m = t.match(re);
    if (m) {
      phraseScore += m.length * 0.8;
      if (phraseHits.length < 12) phraseHits.push(m[0].slice(0, 40));
    }
  }

  const emDashes = (t.match(/—|–(?=\s)|\s–|\s--\s/g) || []).length;
  const contractions = (prose.match(CONTRACTION_RE) || []).filter((c) => !POSSESSIVE_LIKE.test(c) || /^(it|that|there|here|what|who|where|he|she|let)['’]s$/i.test(c)).length;

  // opener repetition: share of sentences whose first word was used by one of the previous 3 sentences
  let rep = 0;
  let transitionStarts = 0;
  const firsts = proseSents.map((s) => (words(s.text)[0] || '').toLowerCase());
  for (let i = 0; i < firsts.length; i++) {
    if (TRANSITION_OPENERS.test(proseSents[i].text)) transitionStarts++;
    for (let k = Math.max(0, i - 3); k < i; k++) if (firsts[k] && firsts[k] === firsts[i]) { rep++; break; }
  }

  const paraLens = paragraphs.map((p) => countWords(p)).filter((n) => n > 0);
  const tricolons = (prose.match(TRICOLON_RE) || []).length;

  // perplexity proxy: average word predictability + how much it varies sentence to sentence
  const sentSurprisal = proseSents.map((s) => {
    const ws = words(s.text).filter((w) => /^[A-Za-z'’]+$/.test(w));
    return ws.length ? mean(ws.map(wordSurprisal)) : 0;
  });
  const meanSurprisal = mean(alpha.map(wordSurprisal));
  const surprisalVar = stdev(sentSurprisal);
  const oov = alpha.length ? alpha.filter((w) => zipf(w) === 0).length / alpha.length : 0;

  const informal = (prose.match(INFORMAL_RE) || []).length;

  return {
    words: nWords,
    sentences: allSents.length,
    proseSentences: proseSents.length,
    sentenceLengths: lens,
    cv: coefVar(lens),
    avgLen: mean(lens),
    phraseScore,
    phraseHits,
    phrasePer100: (phraseScore / nWords) * 100,
    emDashPer100: (emDashes / nWords) * 100,
    contractionsPer100: (contractions / Math.max(1, alpha.length)) * 100,
    mtld: mtld(alpha),
    openerRep: firsts.length ? (rep + transitionStarts * 0.5) / firsts.length : 0,
    paragraphs: paraLens.length,
    paragraphCV: coefVar(paraLens),
    tricolonPerSentence: proseSents.length ? tricolons / proseSents.length : 0,
    meanSurprisal,
    surprisalVar,
    oovRate: oov,
    informalPer100: (informal / nWords) * 100,
    sentenceSpans: allSents,
  };
}

function z(raw, def) {
  return clip((raw - def.mu) / def.sd, -3, 3);
}

function featureValues(m) {
  const n = m.proseSentences;
  const conf = Math.min(1, n / 4); // shrink sentence statistics for very short texts
  const raw = {
    aiPhrases: m.phrasePer100,
    emDash: m.emDashPer100,
    burstiness: m.cv,
    sentLength: m.avgLen,
    tricolons: m.tricolonPerSentence,
    perplexity: m.meanSurprisal,
    informality: m.informalPer100,
    contractions: m.contractionsPer100,
    openers: m.openerRep,
    lexDiversity: m.mtld,
    paragraphs: m.paragraphCV,
  };
  const contrib = {};
  contrib.aiPhrases = FEATURES.aiPhrases.w * z(Math.log1p(raw.aiPhrases), FEATURES.aiPhrases);
  contrib.emDash = FEATURES.emDash.w * z(Math.min(3, raw.emDash), FEATURES.emDash);
  contrib.burstiness = FEATURES.burstiness.w * z(raw.burstiness, FEATURES.burstiness) * conf;
  contrib.sentLength = FEATURES.sentLength.w * z(raw.sentLength, FEATURES.sentLength) * conf;
  contrib.tricolons = FEATURES.tricolons.w * z(raw.tricolons, FEATURES.tricolons);
  contrib.perplexity =
    FEATURES.perplexity.w * z(raw.perplexity, FEATURES.perplexity) +
    SURPRISAL_VAR.w * z(m.surprisalVar, SURPRISAL_VAR) * conf +
    OOV.w * z(m.oovRate, OOV);
  contrib.informality = FEATURES.informality.w * z(Math.log1p(raw.informality), FEATURES.informality);
  contrib.contractions = FEATURES.contractions.w * z(raw.contractions, FEATURES.contractions);
  contrib.openers = FEATURES.openers.w * z(raw.openers, FEATURES.openers) * conf;
  contrib.lexDiversity = FEATURES.lexDiversity.w * z(raw.lexDiversity, FEATURES.lexDiversity);
  contrib.paragraphs = m.paragraphs >= 3 ? FEATURES.paragraphs.w * z(raw.paragraphs, FEATURES.paragraphs) : 0;
  return { raw, contrib };
}

// Zero-weight (reported-only) signals still get a verdict from their documented direction.
function displayContribution(id, raw) {
  if (id === 'openers') return 0.3 * z(raw, FEATURES.openers);
  if (id === 'lexDiversity') return 0;
  return 0;
}

function verdictOf(c) {
  return c > 0.15 ? 'ai' : c < -0.15 ? 'human' : 'neutral';
}

function describe(k, raw) {
  const v = Number.isFinite(raw) ? raw : 0;
  switch (k) {
    case 'burstiness':
      return `Sentence-length variation (CV) is ${v.toFixed(2)}; human writing is usually above 0.5.`;
    case 'aiPhrases':
      return `${v.toFixed(1)} AI-typical phrases per 100 words.`;
    case 'emDash':
      return `${v.toFixed(2)} em dashes per 100 words.`;
    case 'contractions':
      return `${v.toFixed(1)} contractions per 100 words.`;
    case 'lexDiversity':
      return `MTLD lexical diversity of ${Math.round(v)}.`;
    case 'openers':
      return `${Math.round(v * 100)}% of sentences reuse a recent opener or start with a stock transition.`;
    case 'sentLength':
      return `Average sentence is ${v.toFixed(1)} words long.`;
    case 'paragraphs':
      return `Paragraph-length variation (CV) is ${v.toFixed(2)}.`;
    case 'tricolons':
      return `${v.toFixed(2)} "X, Y, and Z" lists per sentence.`;
    case 'perplexity':
      return `Average word surprisal ${v.toFixed(2)} (word-frequency table). Uniform, polished mid-frequency vocabulary reads as machine-written; casual human text is mostly common words with occasional rare spikes.`;
    case 'informality':
      return `${v.toFixed(1)} human-texture markers per 100 words (questions, asides, first person).`;
    default:
      return '';
  }
}

// Per-sentence score: local features blended with the document-level evidence.
function sentenceScore(s, zDoc) {
  const text = s.text;
  const n = countWords(text);
  let z = 0;
  let hits = 0;
  for (const r of RULES) {
    r.re.lastIndex = 0;
    if (r.re.test(text)) hits += r.tier === 1 ? 1 : r.tier === 2 ? 0.6 : 0.3;
  }
  z += 1.1 * Math.min(3, hits);
  if (/—|\s–\s|\s--\s/.test(text)) z += 0.6;
  if (CONTRACTION_RE.test(text)) z -= 0.5;
  CONTRACTION_RE.lastIndex = 0;
  if (n >= 14 && n <= 30) z += 0.35;
  else if (n <= 6) z -= 0.6;
  if (TRANSITION_OPENERS.test(text)) z += 0.5;
  if (TRICOLON_RE.test(text)) z += 0.4;
  TRICOLON_RE.lastIndex = 0;
  if (/[?!]|\(/.test(text)) z -= 0.3;
  return sigmoid(0.55 * zDoc + z - 0.3);
}

/**
 * Estimate how AI-like a text is.
 * @param {string} text
 */
export function detect(text) {
  const t = typeof text === 'string' ? text : text == null ? '' : String(text);
  if (!t.trim() || countWords(t) < 3) {
    return { score: 0, label: 'Likely human', signals: [], sentences: [] };
  }
  const m = measure(t);
  const { raw, contrib } = featureValues(m);
  let z = WEIGHTS.bias;
  for (const k of Object.keys(FEATURES)) z += contrib[k];
  // very short texts carry little evidence: pull toward the middle
  const evidence = Math.min(1, m.words / 60);
  z *= 0.4 + 0.6 * evidence;
  const score = Math.round(100 * sigmoid(z));
  const label = score >= 65 ? 'Likely AI' : score >= 35 ? 'Mixed' : 'Likely human';
  const signals = Object.entries(FEATURES).map(([id, def]) => ({
    id,
    name: def.name,
    value: Math.round((Number.isFinite(raw[id]) ? raw[id] : 0) * 100) / 100,
    verdict: verdictOf(contrib[id] || displayContribution(id, raw[id])),
    detail: describe(id, raw[id]),
  }));
  const sentences = m.sentenceSpans.map((s) => ({
    text: s.text,
    start: s.start,
    end: s.end,
    ai: Math.round(sentenceScore(s, z) * 100) / 100,
  }));
  return { score, label, signals, sentences };
}
