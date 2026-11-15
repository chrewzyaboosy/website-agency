// The Inkling humanizer pipeline: deterministic, local, algorithmic (no LLM, no network).
//
//   protect -> cliché purge -> dash/semicolon thinning -> contractions -> synonym swaps ->
//   burstiness restructuring -> opener variation -> sparse human texture -> spelling -> cleanup -> unmask
//
// Every stage is gated by `strength` and `tone`. It is always better to skip a transformation than to
// produce an awkward sentence, so each move checks its own preconditions.

import { createStore, protect } from './protect.js';
import { splitSentences, countWords, words, firstWordParts, STARTERS, PH_ONE } from './sentences.js';
import { createRng, mixSeeds } from './rng.js';
import {
  getClicheRules,
  SYNONYMS,
  CONTRACTIONS,
  HAVE_PARTICIPLES,
  EXPANSIONS,
  TONE_PACKS,
  OPENER_CUES,
  TAG_CUE,
  US_TO_UK,
  UK_TO_US,
  NAME_BLOCK,
} from './lexicon.js';
import { inflectPhrase, headVerb, PARTICIPLE_DIFFERS } from './inflect.js';
import { zipf } from './freq.js';

const TONES = ['natural', 'casual', 'professional', 'marketing', 'academic'];
const STRENGTHS = ['light', 'balanced', 'aggressive'];

const STRENGTH_CFG = {
  light: {
    tierP: [1, 0.5, 0], semicolon: 0.35, contraction: 0.6, synonym: 0.07,
    splitAt: 32, splitP: 0.7, shortSplitP: 0.1, mergeP: 0, mergeCap: 0, rhetP: 0.3,
    wordsPerAside: 0, fragments: false, targetCV: 0,
  },
  balanced: {
    tierP: [1, 1, 0.55], semicolon: 0.75, contraction: 0.9, synonym: 0.2,
    splitAt: 23, splitP: 0.9, shortSplitP: 0.6, mergeP: 0.3, mergeCap: 32, rhetP: 0.85,
    wordsPerAside: 120, fragments: true, targetCV: 0.55,
  },
  aggressive: {
    tierP: [1, 1, 1], semicolon: 1, contraction: 1, synonym: 0.33,
    splitAt: 20, splitP: 1, shortSplitP: 0.75, mergeP: 0.4, mergeCap: 36, rhetP: 1,
    wordsPerAside: 85, fragments: true, targetCV: 0.62,
  },
};

const TONE_CFG = {
  natural: { contraction: 0.9, informal: true, slang: false, aside: 1, rhet: 1, andStart: 0.25 },
  casual: { contraction: 1, informal: true, slang: true, aside: 1.3, rhet: 1, andStart: 0.35 },
  marketing: { contraction: 0.9, informal: true, slang: true, aside: 1, rhet: 1, andStart: 0.25 },
  professional: { contraction: 0.45, informal: false, slang: false, aside: 0.5, rhet: 0.55, andStart: 0 },
  academic: { contraction: 0, informal: false, slang: false, aside: 0.3, rhet: 0.2, andStart: 0 },
};

export const VERSION = '1.0.0';

// ------------------------------------------------------------------------------------------ helpers
const SUBJ_PRON = new Set(['i', 'you', 'we', 'they', 'he', 'she', 'it', 'there']);
const DEMONST = new Set(['this', 'that', 'these', 'those']);
const DETERMINERS = new Set([
  'the', 'a', 'an', 'our', 'your', 'their', 'its', 'his', 'her', 'my', 'this', 'that', 'these', 'those', 'many', 'most',
  'some', 'each', 'every', 'all', 'no', 'any', 'both', 'such', 'them', 'us', 'me', 'him', 'it', 'you', 'everyone',
]);
const AUX = new Set([
  'is', 'are', 'was', 'were', 'has', 'have', 'had', 'can', 'could', 'will', 'would', 'should', 'may', 'might', 'must',
  'does', 'do', 'did', "isn't", "aren't", "wasn't", "weren't", "don't", "doesn't", "didn't", "won't", "can't",
  "couldn't", "shouldn't", "wouldn't", "hasn't", "haven't", 'helps', 'makes', 'means', 'gives', 'lets', 'saves', 'takes',
  'needs', 'matters', 'shows', 'gets', 'keeps', 'costs', 'comes', 'goes', 'works', 'looks', 'feels', 'seems', 'wins',
  'pays', 'adds', 'cuts', 'drives', 'builds', 'creates', 'allows', 'offers', 'provides', 'becomes', 'remains', 'turns',
  'starts', 'stays', 'grows', 'tells', 'brings', 'changes', 'puts', 'runs', 'sells', 'leads', 'sounds', 'happens',
]);
const INTENSIFIERS = new Set([
  'very', 'really', 'so', 'too', 'quite', 'extremely', 'more', 'most', 'less', 'least', 'pretty', 'fairly', 'rather',
  'super', 'how', 'as', 'incredibly', 'increasingly', 'highly',
]);
const TRANSITION_STARTS = new Set([
  'also', 'additionally', 'moreover', 'furthermore', 'plus', 'however', 'still', 'so', 'and', 'but', 'then', 'next',
  'finally', 'besides', 'meanwhile', 'instead', 'similarly', 'likewise', 'consequently', 'therefore', 'thus', 'hence',
  'yet', 'or', 'now', 'indeed', 'overall', 'ultimately', 'honestly', 'look', 'truth', 'thing', 'realistically',
  'frankly', 'basically', 'because', 'which', 'translation', 'why', 'want', 'looking', 'need', 'got',
]);
const THIS_VERBS = new Set([
  'means', 'makes', 'helps', 'lets', 'allows', 'gives', 'keeps', 'saves', 'creates', 'leads', 'is', 'has', 'matters',
  'explains', 'shows', 'turns', 'puts', 'adds', 'frees', 'cuts', 'reduces', 'boosts', 'improves', 'drives', 'brings',
  'opens', 'ensures', 'enables', 'removes', 'lowers', 'raises', 'builds', 'speeds',
]);
const DOUBLE_OK = new Set(['had', 'that', 'is', 'do', 'very', 'bye', 'no', 'yes', 'so', 'ha', 'blah', 'really', 'now', 'go', 'well']);

const isPH = (w) => PH_ONE.test(w);
const lc = (s) => s.toLowerCase().replace(/’/g, "'");

function capFirst(s) {
  const m = s.match(/^([\s*_"“'‘(\[¿¡]*)(\p{Ll})/u);
  if (!m) return s;
  // don't touch camelCase words like iPhone / eBay
  const after = s.slice(m[0].length);
  if (/^\p{Lu}/u.test(after)) return s;
  return m[1] + m[2].toUpperCase() + after;
}

function wc(s) {
  return countWords(s);
}

function cv(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  if (!mean) return 0;
  const v = arr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / arr.length;
  return Math.sqrt(v) / mean;
}

function balanced(s) {
  const count = (re) => (s.match(re) || []).length;
  if (count(/\(/g) !== count(/\)/g)) return false;
  if (count(/\[/g) !== count(/\]/g)) return false;
  if (count(/\*\*/g) % 2) return false;
  if (count(/(?<![*\w])\*(?![*\s])|(?<![*\s])\*(?![*\w])/g) % 2) return false;
  return true;
}

function terminal(s) {
  const m = s.match(/([.!?…]+)(["'”’)\]*_]*)$/);
  return m ? m[1] : '';
}

function stripTerminal(s) {
  return s.replace(/[.!?…]+(["'”’)\]*_]*)$/, '$1');
}

function isSentenceStart(str, offset) {
  let i = offset - 1;
  while (i >= 0 && /[\s*_"“'‘(\[]/.test(str[i])) {
    if (str[i] === '\n') return true;
    i--;
  }
  if (i < 0) return true;
  return /[.!?…:]/.test(str[i]) && /\s/.test(str[i + 1] || ' ');
}

function matchCase(src, rep) {
  if (!rep) return rep;
  if (/^[A-Z]/.test(src) && !/^[A-Z]{2}/.test(src)) return rep[0].toUpperCase() + rep.slice(1);
  if (/^[A-Z]{2,}/.test(src) && src === src.toUpperCase() && src.length > 3) return rep.toUpperCase();
  return rep;
}

function aposStyle(text) {
  const curly = (text.match(/’/g) || []).length;
  const straight = (text.match(/'/g) || []).length;
  return curly > straight ? '’' : "'";
}

// ------------------------------------------------------------------------------------------ context
function makeCtx(text, opts) {
  const tone = TONES.includes(opts.tone) ? opts.tone : 'natural';
  const strength = STRENGTHS.includes(opts.strength) ? opts.strength : 'balanced';
  const spelling = opts.spelling === 'uk' ? 'uk' : 'us';
  const seed = Number.isFinite(opts.seed) ? Math.trunc(opts.seed) : 0;
  return {
    tone,
    strength,
    spelling,
    seed,
    cfg: STRENGTH_CFG[strength],
    t: TONE_CFG[tone],
    pack: TONE_PACKS[tone],
    apos: aposStyle(text),
    changes: 0,
    used: new Set(), // texture phrases already used
    altUse: new Map(), // replacement -> count (spreads choices)
    asideBudget: 0,
    sinceAside: 99,
    store: null,
    rng: null,
  };
}

function toneOK(alt, ctx) {
  if (alt.startsWith('~')) return ctx.t.slang;
  if (alt.startsWith('^')) return ctx.t.informal;
  return true;
}
function cleanAlt(alt) {
  return alt.replace(/^[~^]/, '');
}
function fixApos(s, ctx) {
  return ctx.apos === '’' ? s.replace(/'/g, '’') : s;
}

function pickAlt(cands, ctx) {
  // prefer the least used alternatives so a long text doesn't repeat one replacement
  let best = Infinity;
  for (const c of cands) best = Math.min(best, ctx.altUse.get(c) || 0);
  const pool = cands.filter((c) => (ctx.altUse.get(c) || 0) === best);
  const choice = ctx.rng.pick(pool);
  ctx.altUse.set(choice, (ctx.altUse.get(choice) || 0) + 1);
  return choice;
}

// Lower-case the first word of a sentence when it is safe (not a name / acronym / brand).
function canLower(word, ctx) {
  const lw = lc(word);
  if (STARTERS.has(lw)) return true;
  if (NAME_BLOCK.has(lw) || ctx.store.properNouns.has(lw)) return false;
  return zipf(lw) >= 3.6;
}
function lowerFirst(sent, ctx) {
  const p = firstWordParts(sent);
  if (!p) return null;
  const [pre, w, rest] = p;
  if (isPH(w) || /^\uE000/.test(w)) return sent;
  if (w === 'I' || /^I['’]/.test(w)) return sent;
  if (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)) return sent;
  if (/\p{Lu}/u.test(w.slice(1))) return sent;
  if (!/^\p{Lu}/u.test(w)) return sent;
  if (!canLower(w, ctx)) return null;
  return pre + w[0].toLowerCase() + w.slice(1) + rest;
}

// ------------------------------------------------------------------------------------------ b. clichés
function purgeCliches(s, ctx, light) {
  const tierP = ctx.cfg.tierP;
  for (const rule of getClicheRules()) {
    const pRule = light && rule.tier === 3 ? 0 : tierP[rule.tier - 1];
    if (!pRule) continue;
    rule.re.lastIndex = 0;
    if (!rule.re.test(s)) continue;
    rule.re.lastIndex = 0;
    s = s.replace(rule.re, (...args) => {
      const m = args[0];
      const str = args[args.length - 1];
      const offset = args[args.length - 2];
      const groups = args.slice(1, -2);
      if (m.includes('\uE000')) return m;
      if (!ctx.rng.chance(pRule)) return m;
      const atStart = isSentenceStart(str, offset);
      if (rule.startOnly && !atStart) return m;
      let form = null;
      let extra = groups;
      if (rule.isVerb) {
        form = rule.formOf.get(String(groups[0]).toLowerCase().replace(/’/g, "'")) || 'b';
        extra = groups.slice(1);
      }
      const cands = [];
      for (const raw of rule.alts) {
        if (!toneOK(raw, ctx)) continue;
        let alt = cleanAlt(raw);
        if (rule.isVerb) {
          const bar = alt.indexOf('|');
          if (bar >= 0) {
            if (!alt.slice(bar + 1).includes(form)) continue;
            alt = alt.slice(0, bar);
          }
          if (form === 'd' && PARTICIPLE_DIFFERS.has(headVerb(alt))) continue;
        }
        if (alt === '' && !atStart && !rule.delMid) continue;
        // don't introduce a word that is already right next to the match ("improve X, improve Y")
        const around = (str.slice(Math.max(0, offset - 70), offset) + ' ' + str.slice(offset + m.length, offset + m.length + 70)).toLowerCase();
        const clash = alt
          .toLowerCase()
          .split(/[^a-z]+/)
          .filter((w) => w.length >= 4 && !/^(that|with|your|this|than|more|most|from|into)$/.test(w))
          .some((w) => new RegExp(`\\b${w.replace(/ly$/, '')}(?:ly)?\\b`).test(around));
        if (clash) continue;
        cands.push(alt);
      }
      if (!cands.length) return m;
      let alt = pickAlt(cands, ctx);
      if (rule.isVerb && alt) alt = inflectPhrase(alt, form);
      alt = alt.replace(/\{(\d)\}/g, (_, n) => extra[Number(n) - 1] || '');
      alt = fixApos(alt, ctx);
      ctx.changes++;
      if (alt === '') return '';
      if (isTitleCase(m)) return toTitleCase(alt);
      return matchCase(m, alt);
    });
  }
  return s;
}

const SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'of', 'in', 'up', 'as', 'with', 'out']);
function isTitleCase(m) {
  const ws = m.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  if (ws.length < 2) return false;
  const big = ws.filter((w) => !SMALL_WORDS.has(w.toLowerCase()));
  return big.length >= 2 && big.every((w) => /^[A-Z]/.test(w));
}
function toTitleCase(s) {
  return s
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w.replace(/(^|-)([a-z])/g, (x, d, c) => d + c.toUpperCase())))
    .join(' ');
}

// "It not only saves time, but also cuts costs" -> "It saves time and cuts costs"
const NOT_ONLY_INV = new RegExp(
  "\\bNot only (is|are|was|were|does|do|did|can|will|has|have|could|would|should) " +
  "((?:the|our|your|their|this|that|its|his|her|my|these|those) [a-z]+|it|this|that|they|we|you|he|she|[a-z]+) " +
  "([^,.;!?\\uE000]{2,100}?),? but (?:(it|this|that|they|we|you|he|she) )?" +
  "(?:(is|are|was|were|can|will|does|do|did|has|have|['’]s|['’]re) )?(also )?([^.;!?]{2,160})",
  'g'
);

function fixNotOnly(s, ctx) {
  let out = s.replace(NOT_ONLY_INV, (m, aux, subj, rest, subj2, aux2, also, tail) => {
    let first;
    if (/^(does|do|did)$/.test(aux)) {
      const mm = rest.match(/^([a-z]+)(.*)$/);
      if (!mm) return m;
      // "does it save" -> "it saves"; "did it save" keeps the (grammatical) emphatic "it did save"
      if (aux === 'did') first = `${capFirst(subj)} did ${rest}`;
      else first = `${capFirst(subj)} ${inflectPhrase(mm[1], aux === 'does' ? 's' : 'b')}${mm[2]}`;
    } else first = `${capFirst(subj)} ${aux} ${rest}`;
    ctx.changes++;
    const a2 = aux2 ? (/^['’]/.test(aux2) ? aux2 : ' ' + aux2) : '';
    const second = subj2 ? `${subj2}${a2} ${also ? 'also ' : ''}${tail}` : `${also ? 'also ' : ''}${tail}`;
    return `${first}, and ${second}`;
  });
  out = out.replace(/\bnot only ([^,.;!?]{2,100}?),? but (?:(it|they|we|you|he|she|this|that) )?also\b/gi, (m, a, subj) => {
    ctx.changes++;
    return subj ? `${a}, and ${subj} also` : `${a} and`;
  });
  return out;
}

// "It's not just a tool, it's a partner." -> "It's a tool, but it's also a partner."
function fixNotJust(s, ctx) {
  return s.replace(
    /\b(It|This|That|it|this|that)(?:['’]s not| is not| isn['’]t) just (about )?([^,;.!?—–\uE000]{2,80}?)\s*(?:,|;|—|–|\.)\s*(?:it|this|that|It|This|That)(?:['’]s| is) (?:also )?(about )?([^.;!?]{2,140})([.!?])/g,
    (m, subj, about1, x, about2, y, p) => {
      ctx.changes++;
      const a = ctx.apos;
      const S = subj[0].toUpperCase() + subj.slice(1).toLowerCase();
      const sub2 = subj.toLowerCase();
      const ab1 = about1 || about2 ? 'about ' : '';
      if (ctx.t.informal && ctx.rng.chance(0.5)) {
        return `${S}${a}s ${ab1}${x}, sure. But ${sub2}${a}s also ${about2 || about1 ? 'about ' : ''}${y}${p}`;
      }
      return `${S}${a}s ${ab1}${x}, but ${sub2}${a}s also ${about2 || about1 ? 'about ' : ''}${y}${p}`;
    }
  );
}

// "Great design isn't just about looks, it's about solving problems." -> "Great design is about looks, but it's also about solving problems."
const NOT_JUST_NP = /^([A-Z][a-z]+(?: [a-z]+){0,3}) (is|are)(?: not|n['’]t) just (about )?([^,;.!?—–]{2,80}?)\s*(?:,|;|—|–)\s*(it|they)(?:['’]s|['’]re| is| are) (?:also )?(about )?([^.;!?]{2,140})([.!?])/;
function fixNotJustNP(s, ctx) {
  return s.replace(NOT_JUST_NP, (m, subj, be, ab1, x, pron, ab2, y, p) => {
    ctx.changes++;
    const a = ctx.apos;
    const pr = pron.toLowerCase() === 'it' ? `it${a}s` : `they${a}re`;
    return `${subj} ${be} ${ab1 || ''}${x}, but ${pr} also ${ab2 || ''}${y}${p}`;
  });
}

// ------------------------------------------------------------------------------------------ c. dashes
const DASH_SPLIT = /\s*(?:—|--|\s–\s)\s*/;
const INDEP_START = /^(?:it|this|that|they|we|you|i|he|she|there|these|those|and|but|so|which|our|your|their|the)\b/i;

// "quote" — Ann Handley  ->  "quote" - Ann Handley   (attribution keeps a plain hyphen, never an em dash)
const ATTRIBUTION = /(\uE001|["”’)])\s*(?:—|–|--)\s*((?:[A-Z][\p{L}.'’-]*|\uE000[\uE010-\uE01F]+\uE001)(?:\s+(?:[A-Z][\p{L}.'’-]*|\uE000[\uE010-\uE01F]+\uE001)){0,3}[,.]?)\s*$/u;
function fixAttribution(s, ctx) {
  if (!ATTRIBUTION.test(s)) return s;
  ctx.changes++;
  return s.replace(ATTRIBUTION, '$1 - $2');
}

function processDashes(s, ctx) {
  if (!/—|--|\s–\s/.test(s)) return s;
  s = fixAttribution(s, ctx);
  if (!/—|--|\s–\s/.test(s)) return s;
  // leading attribution dash ("— Jane Doe")
  s = s.replace(/^(\s*)(?:—|--)\s*/, '$1- ');
  const sents = splitSentences(s, { resolve: ctx.store.resolve });
  if (!sents.length) return s;
  const out = [];
  for (const { text } of sents) out.push(fixDashSentence(text, ctx));
  return out.join(' ');
}

function fixDashSentence(t, ctx) {
  if (!/—|--|\s–\s/.test(t)) return t;
  const parts = t.split(DASH_SPLIT);
  if (parts.length < 2) return t;
  ctx.changes += parts.length - 1;
  if (parts.length === 3 && parts[1] && wc(parts[1]) <= 14 && parts[2]) {
    const [a, b, c] = parts;
    const cStartsPunct = /^[,.;:!?]/.test(c);
    if (!/,/.test(b) && ctx.rng.chance(0.5) && !/[,;:]$/.test(a)) return `${a}, ${b}${cStartsPunct ? '' : ','} ${c}`.replace(/,\s*([.!?;:])/g, '$1');
    return `${a} (${b})${cStartsPunct ? '' : ' '}${c}`;
  }
  if (parts.length === 2) {
    const [a, b] = parts;
    if (!a) return capFirst(b);
    if (!b) return a;
    const bw = wc(b);
    const aw = wc(a);
    // "The result—more sales." -> "The result? More sales."
    if (aw <= 4 && /^(the|our|your|my|one)\b/i.test(a) && bw >= 1 && bw <= 10 && !/[,;:]$/.test(a)) {
      return `${a}? ${capFirst(b)}`;
    }
    if (((bw >= 5 && INDEP_START.test(b)) || (bw >= 2 && /^(?:it|that|they|we|you|there)['’](?:s|re|ll)\b/i.test(b))) && aw >= 4 && !/^which\b/i.test(b) && !/[,;:]$/.test(a)) {
      const next = /^and\b/i.test(b) && !ctx.t.informal ? b.replace(/^and\s+/i, '') : b;
      return `${a}. ${capFirst(next)}`;
    }
    if (/,/.test(b) && bw <= 14) return `${a}: ${b}`;
    if (/[,;:]$/.test(a)) return `${a} ${b}`;
    return `${a}, ${b}`;
  }
  // many dashes: commas
  return parts.reduce((acc, p, i) => (i === 0 ? p : acc.replace(/[,;:]$/, '') + ', ' + p), '');
}

const CAP_MARK = '\uE002'; // "capitalise the next letter" marker, resolved in cleanup()

function thinSemicolons(s, ctx) {
  if (!s.includes(';')) return s;
  return s.replace(/([^;]{8,}?);\s+(?=([^;]+))/g, (m, left, right) => {
    if (wc(left) < 4 || wc(right) < 4) return m;
    // keep semicolons that separate comma-containing list items
    if ((left.match(/,/g) || []).length >= 2) return m;
    if (!ctx.rng.chance(ctx.cfg.semicolon)) return m;
    ctx.changes++;
    return left + '. ' + CAP_MARK;
  });
}

// ------------------------------------------------------------------------------------------ d. contractions
let CONTRACTION_RES = null;
function contractionRules() {
  if (CONTRACTION_RES) return CONTRACTION_RES;
  CONTRACTION_RES = CONTRACTIONS.map(([a, b]) => [
    new RegExp(`(?<![\\w'’-])${a.replace(/ /g, '\\s+')}(?![\\w'’-])`, 'gi'),
    b,
  ]);
  CONTRACTION_RES.push([
    new RegExp(`(?<![\\w'’-])(I|you|we|they)\\s+have\\s+(?=(?:${HAVE_PARTICIPLES})\\b)`, 'gi'),
    "$1've ",
  ]);
  return CONTRACTION_RES;
}

function contract(s, ctx) {
  const p = Math.min(1, ctx.cfg.contraction * ctx.t.contraction);
  if (p <= 0) return s;
  for (const [re, rep] of contractionRules()) {
    re.lastIndex = 0;
    if (!re.test(s)) continue;
    re.lastIndex = 0;
    s = s.replace(re, (...args) => {
      const m = args[0];
      const str = args[args.length - 1];
      const offset = args[args.length - 2];
      const after = str.slice(offset + m.length);
      const isHave = rep.includes('$1');
      if (!isHave && !/^\s+[\p{L}\uE000]/u.test(after)) return m;
      const before = str.slice(Math.max(0, offset - 14), offset);
      if (/^it\s+is$/i.test(m) && /\b(what|whatever|who|wherever|however|where|how)\s+$/i.test(before)) return m;
      if (/^(that|there|here|what|who|where)\s/i.test(m) && /\b(is|was|it)\s+$/i.test(before)) return m;
      // "It is not X but Y" style emphasis and questions ("Is it ...") are fine; skip after modal "be"
      if (!ctx.rng.chance(p)) return m;
      ctx.changes++;
      let out = isHave ? m.replace(/^(\S+)\s+have\s+$/i, (x, w) => `${w}'ve `) : rep;
      if (!isHave) out = matchCase(m, out);
      if (/^i\b/i.test(m)) out = 'I' + out.slice(1);
      return fixApos(out, ctx);
    });
  }
  return s;
}

// Serial (Oxford) comma: chat models almost always use it; plenty of human writers (and AP style) don't.
// "email, SMS, and push" -> "email, SMS and push" (informal tones, about half the time).
function thinOxfordCommas(s, ctx) {
  if (!ctx.t.informal || ctx.strength === 'light') return s;
  return s.replace(/(\b[\w'’\uE000-\uE01F-]+(?: [\w'’\uE000-\uE01F-]+){0,3}, [\w'’\uE000-\uE01F-]+(?: [\w'’\uE000-\uE01F-]+){0,4}), (and|or) (?=[\w\uE000])/g, (m, list, conj) => {
    if (!ctx.rng.chance(0.7)) return m;
    ctx.changes++;
    return `${list} ${conj} `;
  });
}

// Optional commas after short sentence openers ("Today, we..." -> "Today we..."). Casual human writing drops
// them all the time; chat models almost never do. Informal tones only.
const INTRO_COMMA = /(^|[.!?]["'”’)]*\s+)(Today|Now|Also|Plus|Still|So|Then|Yet|Right now|These days|Lately|Sometimes|Often|Usually|Instead|Honestly|In practice|Realistically|In short|Below|Here|When done right|Over time|In the end|On top of that|Even so|That said|Of course|At first|Last year|This year|Next|Again|Basically|Frankly|Truth is|Thing is|Look|In fact|Sure enough),\s/g;
function thinIntroCommas(s, ctx) {
  if (!ctx.t.informal || ctx.strength === 'light') return s;
  const p = ctx.tone === 'casual' ? 0.8 : 0.6;
  return s.replace(INTRO_COMMA, (m, pre, word) => {
    if (!ctx.rng.chance(p)) return m;
    ctx.changes++;
    return `${pre}${word} `;
  });
}

// Academic register: expand every contraction ("it's" -> "it is").
function expandContractions(s, ctx) {
  return s.replace(/\b([A-Za-z]+)['’](t|s|re|ll|ve|m|d)\b/g, (m, a, b, offset, str) => {
    const key = (a + "'" + b).toLowerCase();
    const rep = EXPANSIONS[key];
    if (!rep) return m;
    // "'s" can be possessive or "has": only expand the pronoun forms listed in EXPANSIONS
    ctx.changes++;
    return /^[A-Z]/.test(m) ? rep[0].toUpperCase() + rep.slice(1) : rep;
  });
}

// ------------------------------------------------------------------------------------------ e. synonyms
// Prefer conversational alternatives: weight each candidate by how common it is relative to the original,
// so fancy words tend to become plainer ones (human copy is plainer than chatbot copy).
function pickPlain(cands, original, ctx) {
  const z0 = zipf(original) || 3;
  const weights = cands.map((c) => {
    const head = c.split(' ')[0];
    const z = zipf(head) || 2.5;
    const used = ctx.altUse.get(c) || 0;
    return Math.max(0.15, 1 + (z - z0) * 0.6) / (1 + used);
  });
  const choice = ctx.rng.weighted(cands, weights);
  ctx.altUse.set(choice, (ctx.altUse.get(choice) || 0) + 1);
  return choice;
}
const TOKEN_RE = /[A-Za-z][A-Za-z'’]*(?:-[A-Za-z]+)*/g;

function swapSynonyms(s, ctx, pScale = 1) {
  const p = ctx.cfg.synonym * pScale;
  if (p <= 0) return s;
  const toks = [...s.matchAll(TOKEN_RE)];
  if (!toks.length) return s;
  let out = '';
  let last = 0;
  let lastSwap = -10;
  const sentenceWords = new Set(toks.map((t) => t[0].toLowerCase()));
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const w = t[0];
    if (w.includes('-') || /['’]/.test(w)) continue;
    const lw = w.toLowerCase();
    const entry = SYNONYMS.get(lw);
    if (!entry) continue;
    const capital = w[0] !== lw[0];
    if (capital && (w.slice(1) !== lw.slice(1) || !isSentenceStart(s, t.index))) continue;
    const before = s[t.index - 1];
    const after = s[t.index + w.length];
    if (before === '-' || after === '-' || before === '\uE001' || after === '\uE000') continue;
    const prevTok = i > 0 && /^\s+$/.test(s.slice(toks[i - 1].index + toks[i - 1][0].length, t.index)) ? toks[i - 1][0].toLowerCase() : '';
    const nextGap = i + 1 < toks.length ? s.slice(t.index + w.length, toks[i + 1].index) : '';
    const nextTok = i + 1 < toks.length && /^\s+$/.test(nextGap) ? toks[i + 1][0].toLowerCase() : '';
    if (nextTok && entry.notBefore.has(nextTok)) continue;
    if (prevTok && entry.notAfter.has(prevTok)) continue;
    if (entry.nd && nextTok && DETERMINERS.has(nextTok)) continue;
    if (INTENSIFIERS.has(prevTok) && !lw.endsWith('ly')) continue;
    // provide/offer + "with" later in the clause changes the frame
    if (entry.notBefore.has('with')) {
      const ahead = s.slice(t.index + w.length, t.index + w.length + 60);
      if (/\bwith\b/i.test(ahead.split(/[,.;!?]/)[0])) continue;
    }
    if (i - lastSwap < 2) continue;
    if (!ctx.rng.chance(p)) continue;
    const cands = entry.alts.filter((a) => toneOK(a, ctx)).map(cleanAlt).filter((a) => !sentenceWords.has(a.split(' ')[0]));
    if (!cands.length) continue;
    let alt = pickPlain(cands, lw, ctx);
    if (capital) alt = alt[0].toUpperCase() + alt.slice(1);
    out += s.slice(last, t.index) + alt;
    last = t.index + w.length;
    lastSwap = i;
    ctx.changes++;
  }
  return out + s.slice(last);
}

// ------------------------------------------------------------------------------------------ f. burstiness
function looksIndependent(clause) {
  const ws = words(clause).map(lc);
  if (ws.length < 3) return false;
  const w0 = ws[0];
  if (SUBJ_PRON.has(w0) || /^(i|you|we|they|he|she|it|there|that)'(s|re|ll|ve|d|m)$/.test(w0)) return true;
  if (DEMONST.has(w0) || DETERMINERS.has(w0) || isPH(w0) || /^[a-z]+s$/.test(w0)) {
    for (let i = 1; i < Math.min(ws.length, 7); i++) {
      if (AUX.has(ws[i]) || /'(s|re|ll|ve|d)$/.test(ws[i])) return true;
    }
  }
  return false;
}

function listLike(left) {
  const tail = left.slice(-70);
  const lastComma = tail.lastIndexOf(',');
  if (lastComma < 0) return false;
  return wc(tail.slice(lastComma + 1)) <= 4;
}

function splitCandidates(s, ctx) {
  const cands = [];
  const t = terminal(s) || '.';
  const body = stripTerminal(s);
  const add = (idx, len, build) => {
    const L = body.slice(0, idx).trim();
    const R = body.slice(idx + len).trim();
    if (!L || !R) return;
    if (!balanced(L) || !balanced(R)) return;
    const res = build(L, R);
    if (!res) return;
    const parts = res.map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) return;
    cands.push({ parts, lw: wc(parts[0]), rw: wc(parts.slice(1).join(' ')) });
  };
  const finish = (R) => R.replace(/[,;:]$/, '') + t;
  const minL = 5;
  let m;
  const re = /, (and|but|yet|so) (?=\S)|; (?=\S)|, which (means|makes|helps|allows|lets|gives|keeps|saves|creates|leads|is|has|matters|explains|shows|turns|puts|adds|frees|cuts|reduces|boosts|improves|drives|brings|opens|involves|includes|offers|requires|uses|works|combines|comes|features|runs|costs|takes)\b|, because (?=\S)|, (making(?! sure)|allowing|enabling|letting|helping|giving|meaning) (?=\S)|, (resulting in|leading to) (?=\S)|, which is why (?=\S)|, (perfect|ideal|great|perfectly suited) for (?=\S)|, (ensuring|guaranteeing) (?!that\b)(?=\S)/g;
  while ((m = re.exec(body))) {
    const idx = m.index;
    const len = m[0].length;
    const k = m[0];
    add(idx, len, (L, R) => {
      if (wc(L) < minL) return null;
      const rw = wc(R);
      if (/^, (and|so) /.test(k)) {
        if (!looksIndependent(R) || listLike(L) || rw < 3) return null;
        if (k.startsWith(', and') && ctx.t.andStart && ctx.rng.chance(ctx.t.andStart)) return [L + '.', 'And ' + finish(R)];
        if (k.startsWith(', so')) return [L + '.', 'So ' + finish(R)];
        return [L + '.', capFirst(finish(R))];
      }
      if (/^, (but|yet) /.test(k)) {
        if (rw < 3) return null;
        return [L + '.', (k.includes('but') ? 'But ' : 'Yet ') + finish(R)];
      }
      if (k.startsWith(';')) {
        if (rw < 4 || wc(L) < 4) return null;
        return [L + '.', capFirst(finish(R))];
      }
      if (k.startsWith(', which is why')) return [L + '.', fixApos("That's why ", ctx) + finish(R)];
      if (k.startsWith(', which ')) {
        const verb = m[2];
        if (NOUN_WHICH.has(verb)) return [L + '.', 'It ' + verb + ' ' + finish(R)];
        if (verb === 'is') return [L + '.', (ctx.t.contraction > 0.4 ? fixApos("That's", ctx) : 'That is') + ' ' + finish(R)];
        return [L + '.', 'That ' + verb + ' ' + finish(R)];
      }
      if (k.startsWith(', because')) {
        if (rw < 3) return null;
        const lead = ctx.t.contraction > 0.4 ? fixApos("That's because ", ctx) : 'This is because ';
        return [L + '.', lead + finish(R)];
      }
      if (m[3]) {
        const g = m[3];
        if (g === 'making') return [L + '.', 'That makes ' + finish(R)];
        if (g === 'helping') return [L + '.', 'That helps ' + finish(R)];
        if (g === 'giving') return [L + '.', 'That gives ' + finish(R)];
        if (g === 'meaning') return [L + '.', 'That means ' + finish(R.replace(/^that\s+/i, ''))];
        if (g === 'letting') return [L + '.', 'That lets ' + finish(R)];
        // allowing / enabling X to Y -> That lets X Y
        const mm = R.match(/^((?:[^\s,]+\s){0,4}?[^\s,]+) to (\S.*)$/);
        if (mm && !/^(for|us|it)$/i.test(mm[1])) return [L + '.', 'That lets ' + mm[1] + ' ' + finish(mm[2])];
        if (/^for\b/i.test(R)) return [L + '.', 'That allows ' + finish(R)];
        return null;
      }
      if (m[4]) {
        if (rw <= 8 && ctx.t.rhet >= 0.5) return [L + '.', 'The result?', capFirst(finish(R))];
        return [L + '.', (m[4] === 'leading to' ? 'That leads to ' : 'The result is ') + finish(R)];
      }
      if (m[5]) {
        const it = ctx.t.contraction > 0.4 ? fixApos("It's ", ctx) : 'It is ';
        return [L + '.', it + m[5] + ' for ' + finish(R)];
      }
      if (m[6]) return [L + '.', 'That guarantees ' + finish(R)];
      return null;
    });
  }
  return cands;
}

// Content-true rhetorical moves that create a very short sentence.
function rhetorical(s, ctx) {
  const t = terminal(s);
  if (t !== '.' && t !== '!') return null;
  let m;
  // The result is X. -> The result? X.
  m = s.match(/^(The|Our|Your|My|Their|One) ((?:[a-z]+ ){0,2}?(?:result|outcome|answer|goal|key|secret|truth|problem|catch|difference|takeaway|lesson|part|news|upshot|line|challenge|trick|question|reason|downside|upside|point|aim|benefit|kicker|twist|fix|solution|payoff|advantage|priority|focus|risk|bonus|win|mistake|rule)) (?:is|was)(?: simply| this)?(?::| that)? (.+)$/);
  if (m && wc(m[2]) <= 3) {
    const rest = m[3];
    const fw = words(rest)[0] || '';
    if (wc(rest) >= 2 && !/(ed|ing)$/i.test(fw) && !/^(not|also|that|to be|being|now)\b/i.test(rest) && !/^(simple|clear|obvious|easy|important)\.?$/i.test(stripTerminal(rest))) {
      return [`${m[1]} ${m[2]}?`, capFirst(rest)];
    }
  }
  // This means (that) X. -> Which means X. / Translation: X. / That means X.
  m = s.match(/^This means (?:that )?(.+)$/);
  if (m && wc(m[1]) >= 2) {
    const x = m[1];
    if (ctx.tone === 'academic') return null;
    if (ctx.tone === 'professional') return [`That means ${x}`];
    const opts = ['Which means ' + x];
    if (ctx.t.slang) opts.push('Translation: ' + x);
    if (looksIndependent(x)) opts.push('So ' + x);
    return [ctx.rng.pick(opts)];
  }
  // X is important because Y. -> Why does X matter? Y.
  m = s.match(/^([^,;:?!]{2,60}?) (is|are) (?:so |really |especially |particularly |incredibly )?(important|crucial|essential|vital|key|critical) because (.+)$/);
  if (m && wc(m[1]) <= 8 && wc(m[4]) >= 3) {
    const x = lowerFirst(m[1], ctx);
    if (x) return [`Why ${m[2] === 'is' ? 'does' : 'do'} ${x} matter?`, capFirst(m[4])];
  }
  m = s.match(/^([^,;:?!]{2,60}?) (matters|matter) because (.+)$/);
  if (m && wc(m[1]) <= 8 && wc(m[3]) >= 3) {
    const x = lowerFirst(m[1], ctx);
    if (x) return [`Why ${m[2] === 'matters' ? 'does' : 'do'} ${x} matter?`, capFirst(m[3])];
  }
  // By doing X, businesses can Y. -> Businesses can Y. How? By doing X.
  m = s.match(/^By ((?:[a-z]+ly )?[a-z]+ing\b[^.;:!?]{3,160}?), (you|we|they|businesses|brands|companies|teams|marketers|organizations|leaders|creators|founders|retailers|users|people|everyone|anyone|it|this|the [a-z]+(?: [a-z]+)?) (can|will|could|should|may) ([^.;:!?]{3,160})\.$/);
  if (m && wc(m[1]) >= 2) {
    const subj = m[2];
    const main = `${capFirst(subj)} ${m[3]} ${m[4]}.`;
    if (ctx.t.informal && ctx.t.rhet >= 0.5) return [main, 'How?', `By ${m[1]}.`];
    if (ctx.tone !== 'academic') return [`${capFirst(subj)} ${m[3]} ${m[4]} by ${m[1]}.`];
  }
  // To X, it's essential to Y. -> Want to X? Y.
  m = s.match(/^To ([a-z][^,;:!?]{3,70}), (?:(?:it['’]s|it is) (?:essential|important|crucial|key|vital|critical|wise|smart|helpful|best|a good idea)|it pays|it helps) to ([a-z][^;:!?]{3,200})$/);
  if (m && ctx.t.informal && wc(m[2]) >= 3) return [`Want to ${m[1]}?`, capFirst(m[2])];
  m = s.match(/^To ([a-z][^,;:!?]{3,70}), (you(?:['’]ll| will)? (?:need|have|should|must|want)|start|begin|focus|make sure|try|consider) ([^;:!?]{3,200})$/);
  if (m && ctx.t.informal && wc(m[3]) >= 2) return [`Want to ${m[1]}?`, capFirst(`${m[2]} ${m[3]}`)];
  // Companies can cut X, improve Y, and even lower Z. -> Companies can cut X and improve Y. They can even lower Z.
  m = s.match(/^((?:[^,]*, )?)((?:you|we|they|[a-z]+s|the [a-z]+s|[A-Z][a-z]+s)) (can|could|will|should|must|may|might|often|also) ([a-z]+ [^,;:!?]{3,70}), ([a-z]+ [^,;:!?]{3,70}),? and ((?:even |also |then |finally )?[a-z]+ [^,;:!?]{3,90})\.$/);
  if (m && !/\b(and|or)\b/.test(m[4] + ' ' + m[5]) && !/(ss)$/.test(m[2])) {
    const subj = m[2].toLowerCase();
    const pron = subj === 'you' ? 'You' : subj === 'we' ? 'We' : 'They';
    const lead = m[1] ? m[1] + m[2] : capFirst(m[2]);
    const item3 = m[6];
    const also = /^(even|also|then|finally) /.test(item3) ? '' : 'also ';
    return [`${lead} ${m[3]} ${m[4]} and ${m[5]}.`, `${pron} ${m[3]} ${also}${item3}.`];
  }
  // While X, Y. -> X. But Y.   (contrast kept, two shorter sentences)
  m = s.match(/^(While|Although|Though|Even though) ([^;:!?]{8,160}?), (it|they|we|you|he|she|this|that|there|the [a-z]+|[a-z]+s) ([^;:!?]{6,200})$/);
  if (m && looksIndependent(m[2]) && wc(m[2]) >= 4 && wc(m[4]) >= 3) {
    const X = capFirst(m[2].replace(/,\s*$/, ''));
    return [`${X}.`, `But ${m[3]} ${m[4]}`];
  }
  // As consumers grow pickier, brands must adapt. -> Consumers grow pickier. So brands must adapt.
  m = s.match(/^As ([^,;:!?]{8,120}?\b(?:becomes?|grows?|gets?|increases?|evolves?|continues?|rises?|changes?|shifts?|expands?|more|increasingly|less)\b[^,;:!?]{0,60}), (it|they|we|you|this|the [a-z]+(?: [a-z]+)?|[a-z]+s|businesses|brands|companies|teams|marketers) ((?:must|need|should|can|will|have to|are|is)\b[^;:!?]{4,200})$/);
  if (m && /^(?:the|our|your|their|its|more|most|many|consumers|customers|buyers|users|people|markets?|technology|competition|[a-z]+s)\b/i.test(m[1]) && ctx.tone !== 'academic') {
    // "consumers become more discerning" -> "consumers are becoming more discerning"
    const X = m[1]
      .replace(/\b(becomes|grows|gets|evolves|changes|shifts|rises)\b/, (v) => 'is ' + inflectPhrase(v.slice(0, -1), 'g'))
      .replace(/\b(become|grow|get|evolve|change|shift|rise)\b/, (v) => 'are ' + inflectPhrase(v, 'g'));
    return [`${capFirst(X)}.`, `So ${m[2]} ${m[3]}`];
  }
  // Made from X, it offers Y. -> It's made from X. And it offers Y.
  m = s.match(/^(Made|Built|Designed|Crafted|Created|Developed|Engineered|Packed|Loaded|Powered|Backed|Trusted|Loved|Used) ([a-z][^,;:!?]{3,80}), (it|they) ([a-z][^;:!?]{3,200})$/);
  if (m && wc(m[4]) >= 3) {
    const be = m[3] === 'it' ? (ctx.t.contraction > 0.4 ? fixApos("It's", ctx) : 'It is') : ctx.t.contraction > 0.4 ? fixApos("They're", ctx) : 'They are';
    const second = ctx.t.informal ? `And ${m[3]} ${m[4]}` : `${capFirst(m[3])} also ${m[4]}`;
    return [`${be} ${m[1].toLowerCase()} ${m[2]}.`, second];
  }
  if (ctx.t.informal) {
    // If you want to X, Y. -> Want to X? Y.
    m = s.match(/^If you(?: really)? want to ([^,;]{3,80}), (.+)$/);
    if (m && wc(m[1]) <= 12 && wc(m[2]) >= 3) return [`Want to ${m[1]}?`, capFirst(m[2])];
    m = s.match(/^If you(?:['’]re| are) looking (to|for) ([^,;]{3,80}), (.+)$/);
    if (m && wc(m[2]) <= 12 && wc(m[3]) >= 3) return [`Looking ${m[1]} ${m[2]}?`, capFirst(m[3])];
    m = s.match(/^If you need ([^,;]{3,60}), (.+)$/);
    if (m && wc(m[1]) <= 10 && wc(m[2]) >= 3) return [`Need ${m[1]}?`, capFirst(m[2])];
    m = s.match(/^If you have (any )?questions, (.+)$/);
    if (m && wc(m[2]) >= 2) return [ctx.t.slang ? 'Got questions?' : 'Questions?', capFirst(m[2])];
    m = s.match(/^Many ([a-z]+(?: [a-z]+)?) struggle (with|to) (.+)\.$/);
    if (m && wc(m[3]) >= 2 && wc(m[3]) <= 14) {
      return [`Struggling ${m[2]} ${m[3]}?`, `So are lots of ${m[1]}.`];
    }
  }
  return null;
}

function canMerge(a, b, ctx) {
  if (terminal(a.t) !== '.' || !/[.!]$/.test(terminal(b.t) || '')) return null;
  if (/[.!?…]["'”’)\]*_]+$/.test(a.t)) return null; // closing quote/bracket after the period: keep it intact
  if (a.group && a.group === b.group) return null; // don't undo a split
  if (a.noMerge || b.noMerge) return null;
  const aw = wc(a.t);
  const bw = wc(b.t);
  if (aw < 4 || bw < 4 || aw + bw > ctx.cfg.mergeCap) return null;
  if (/:\s*$/.test(a.t) || /, and /.test(a.t) && /, and /.test(b.t)) return null;
  if (!balanced(a.t) || !balanced(b.t)) return null;
  const p = firstWordParts(b.t);
  if (!p || p[0]) return null;
  const w = p[1];
  const rest = p[2];
  const A = stripTerminal(a.t);
  const second = (rest.match(/^\s+([A-Za-z']+)/) || [])[1] || '';
  if (w === 'This' && THIS_VERBS.has(second.toLowerCase())) return `${A}, which${rest}`;
  if (['It', 'They', 'We', 'You', 'He', 'She'].includes(w) && !/, and /.test(A)) {
    if (/^\s+(?:also|too)\b/.test(rest)) return null;
    return `${A}, and ${w.toLowerCase()}${rest}`;
  }
  if (w === 'But') return `${A}, but${rest}`;
  if (w === 'So' && !/^\s*,/.test(rest)) return `${A}, so${rest}`;
  if (w === 'And') return `${A}, and${rest}`;
  if ((w === 'Also' || w === 'Plus') && /^,\s/.test(rest)) {
    const r = rest.replace(/^,\s+/, '');
    const low = lowerFirst(r, ctx);
    if (low) return `${A}, and ${low}`;
  }
  if (/^That['’]s why$/.test(w + (rest.match(/^\s+why\b/) ? ' why' : '')) || (/^That['’]s$/.test(w) && /^\s+why\b/.test(rest))) {
    return `${A}, which is why${rest.replace(/^\s+why/, '')}`;
  }
  // "X. The app has three tiers." -> "X, and the app has three tiers."
  if (!/, and /.test(A) && !/\band\b/i.test(b.t.slice(0, 30)) && looksIndependent(b.t) && aw + bw <= ctx.cfg.mergeCap - 4) {
    const lw = lc(w);
    if (DETERMINERS.has(lw) || isPH(w)) {
      const low = lowerFirst(b.t, ctx);
      if (low) return `${A}, and ${stripTerminal(low)}${terminal(b.t)}`;
    }
  }
  return null;
}

function restructure(sents, ctx) {
  const cfg = ctx.cfg;
  let gid = 1;
  let list = sents.map((t) => ({ t, group: 0 }));
  const words0 = list.reduce((a, s) => a + wc(s.t), 0);
  // budget of rhetorical moves: ~1 per 90 words
  const rhetBudget = Math.max(1, Math.round(words0 / 70));

  // 1. rhetorical moves: find every sentence that admits one, then use the budget on a random subset
  const moves = list.map((s) => rhetorical(s.t, ctx));
  const candidates = ctx.rng.shuffle(moves.map((r, i) => (r ? i : -1)).filter((i) => i >= 0));
  const chosen = new Set();
  for (const i of candidates) {
    if (chosen.size >= rhetBudget) break;
    if (chosen.has(i - 1) || chosen.has(i + 1)) continue; // never two moves in a row
    if (ctx.rng.chance(cfg.rhetP * ctx.t.rhet)) chosen.add(i);
  }
  const out1 = [];
  list.forEach((s, i) => {
    if (chosen.has(i)) {
      ctx.changes++;
      const g = gid++;
      for (const x of moves[i]) out1.push({ t: x, group: g, noMerge: true, moved: true });
    } else out1.push(s);
  });
  list = out1;

  // 2. split long sentences; occasionally split medium ones that leave a short piece
  const out2 = [];
  for (const s of list) {
    const n = wc(s.t);
    if (!s.noMerge && n >= 12) {
      const cands = splitCandidates(s.t, ctx);
      if (cands.length) {
        let chosen = null;
        if (n >= cfg.splitAt && ctx.rng.chance(cfg.splitP)) {
          // prefer a split close to the middle, with some randomness
          const scored = cands.map((c) => ({ c, d: Math.abs(c.lw - c.rw) + ctx.rng.next() * 6 }));
          scored.sort((x, y) => x.d - y.d);
          chosen = scored[0].c;
        } else if (n >= 14 && ctx.rng.chance(cfg.shortSplitP)) {
          const shorty = cands.filter((c) => c.rw <= 8 || c.lw <= 8);
          if (shorty.length) chosen = ctx.rng.pick(shorty);
        }
        if (chosen) {
          ctx.changes++;
          const g = gid++;
          for (const part of chosen.parts) out2.push({ t: part, group: g });
          continue;
        }
      }
    }
    out2.push(s);
  }
  list = out2;

  // 3. merge adjacent sentences into a longer one (raises length variance)
  if (cfg.mergeP > 0 && list.length >= 2) {
    const out3 = [];
    const lens = list.map((x) => wc(x.t));
    let i = 0;
    while (i < list.length) {
      const a = list[i];
      const b = list[i + 1];
      if (b) {
        // local variation in a window around the pair (keeps this linear on long inputs)
        const localCV = cv(lens.slice(Math.max(0, i - 4), i + 6));
        const pBoost = localCV < cfg.targetCV ? 1 : 0.5;
        const merged = ctx.rng.chance(cfg.mergeP * pBoost) ? canMerge(a, b, ctx) : null;
        if (merged) {
          ctx.changes++;
          out3.push({ t: merged, group: 0, noMerge: true });
          i += 2;
          continue;
        }
      }
      out3.push(a);
      i++;
    }
    list = out3;
  }

  // 4. still too uniform? one more pass of short splits
  if (cfg.targetCV && list.length >= 3 && cv(list.map((x) => wc(x.t))) < cfg.targetCV) {
    const out4 = [];
    let extra = Math.max(1, Math.round(list.length / 4));
    for (const s of list) {
      if (extra > 0 && !s.noMerge && wc(s.t) >= 14) {
        const cands = splitCandidates(s.t, ctx).filter((c) => c.rw <= 9 || c.lw <= 9);
        if (cands.length) {
          extra--;
          ctx.changes++;
          const g = gid++;
          for (const part of ctx.rng.pick(cands).parts) out4.push({ t: part, group: g, noMerge: true });
          continue;
        }
      }
      out4.push(s);
    }
    list = out4;
  }
  ctx.moved = new Set(list.filter((x) => x.moved).map((x) => x.t));
  return list.map((x) => x.t);
}

// ------------------------------------------------------------------------------------------ g. openers
const NOUN_WHICH = new Set(['involves', 'includes', 'offers', 'requires', 'uses', 'works', 'combines', 'comes', 'features', 'runs', 'costs', 'takes']);
const DROPPABLE = /^(Also|Additionally|Moreover|Furthermore|Plus|In addition|Besides|Similarly|Likewise),\s+/;

function varyOpeners(sents, ctx, prevFirst) {
  let prev = prevFirst || '';
  return sents.map((s, i) => {
    const fw = lc(words(s)[0] || '');
    let out = s;
    if (fw && fw === prev && !isPH(fw)) {
      if (DROPPABLE.test(s)) {
        const rest = s.replace(DROPPABLE, '');
        const low = capFirst(rest);
        out = low;
        ctx.changes++;
      } else if (fw === 'this' && /^This\s+[a-z]/.test(s)) {
        out = s.replace(/^This/, 'That');
        ctx.changes++;
      } else if (fw === 'however' || fw === 'but') {
        out = s.replace(/^(However|But),?\s+/, (m) => (m.startsWith('But') ? 'Still, ' : 'But '));
        ctx.changes++;
      }
    }
    prev = lc(words(out)[0] || '');
    return out;
  });
}

// ------------------------------------------------------------------------------------------ h. texture
const SUBORDINATE_START = new Set([
  'as', 'when', 'if', 'while', 'because', 'although', 'though', 'since', 'after', 'before', 'once', 'whether', 'from',
  'by', 'with', 'in', 'on', 'for', 'to', 'at', 'unless', 'until', 'whatever', 'whenever', 'wherever', 'despite',
  'without', 'through', 'during', 'instead', 'rather', 'thanks', 'unlike', 'like', 'made', 'available', 'designed',
  'built', 'crafted', 'introducing', 'here', 'there', 'what', 'why', 'how', 'who', 'where', 'which', 'please', 'thank',
  'thanks', 'hi', 'hello', 'dear', 'best', 'regards', 'cheers',
]);

// Sentences that may take an opener start with a plain subject, never with "I" or a subordinate clause.
const OPENER_SUBJECTS = new Set([
  'the', 'these', 'those', 'it', 'its', "it's", 'they', "they're", 'you', "you're", 'your', 'we', "we're",
  'our', 'their', 'most', 'many', 'some', 'every', 'each', 'all', 'no', 'nobody', 'everyone', 'people', 'companies',
  'businesses', 'brands', 'teams', 'customers', 'marketers', 'buyers', 'users', 'readers', 'a', 'an', 'good', 'great',
  'bad', 'consistency', 'content', 'email', 'data', 'quality', 'success', 'growth', 'nothing', 'none', 'one',
]);

function addTexture(sents, ctx) {
  const pack = ctx.pack;
  if (!pack || ctx.cfg.wordsPerAside <= 0) return sents;
  const out = [];
  let lastTextured = -2;
  for (let i = 0; i < sents.length; i++) {
    const s = sents[i];
    const n = wc(s);
    ctx.sinceAside += n;
    const fw = lc(words(s)[0] || '');
    const eligible =
      ctx.asideBudget >= 1 &&
      ctx.sinceAside >= ctx.cfg.wordsPerAside * 0.6 &&
      i - lastTextured > 1 &&
      i > 0 &&
      terminal(s) === '.' &&
      n >= 7 &&
      n <= 28 &&
      !TRANSITION_STARTS.has(fw) &&
      !(ctx.moved && ctx.moved.has(s)) &&
      !SUBORDINATE_START.has(fw) &&
      !/^[\s*_"“'‘(\[]/.test(s) &&
      !/^[^,]{0,25},/.test(s);
    if (eligible && ctx.rng.chance(0.55)) {
      const kinds = [];
      // cues must appear in the main clause (first ~12 words, before the first comma)
      const mainClause = words(s.split(/[,;:]/)[0]).slice(0, 12).join(' ');
      const subjectOK = OPENER_SUBJECTS.has(fw) || isPH(words(s)[0] || '');
      const freeOpeners = subjectOK
        ? pack.openers.filter((o) => !ctx.used.has(o) && (!OPENER_CUES[o] || OPENER_CUES[o].test(mainClause)))
        : [];
      const freeFrags = ctx.cfg.fragments ? pack.fragments.filter((o) => !ctx.used.has(o)) : [];
      const freeTags = pack.endTags.filter((o) => !ctx.used.has(o));
      if (freeOpeners.length) kinds.push('opener', 'opener');
      if (freeFrags.length && subjectOK && (OPENER_CUES["Here's the thing: "].test(mainClause) || /\byou\b/i.test(mainClause))) kinds.push('fragment');
      if (freeTags.length && n <= 12 && !/,/.test(s) && /[a-z0-9]\.$/.test(s) && subjectOK && TAG_CUE.test(s)) kinds.push('tag');
      const kind = ctx.rng.pick(kinds);
      if (kind === 'opener') {
        const low = lowerFirst(s, ctx);
        if (low) {
          const o = ctx.rng.pick(freeOpeners);
          ctx.used.add(o);
          out.push(fixApos(o, ctx) + low);
          ctx.asideBudget--;
          ctx.sinceAside = 0;
          lastTextured = i;
          ctx.changes++;
          continue;
        }
      } else if (kind === 'fragment') {
        const f = ctx.rng.pick(freeFrags);
        ctx.used.add(f);
        out.push(fixApos(f, ctx));
        out.push(s);
        ctx.asideBudget--;
        ctx.sinceAside = 0;
        lastTextured = i;
        ctx.changes++;
        continue;
      } else if (kind === 'tag') {
        const tag = ctx.rng.pick(freeTags);
        ctx.used.add(tag);
        out.push(stripTerminal(s) + fixApos(tag, ctx) + '.');
        ctx.asideBudget--;
        ctx.sinceAside = 0;
        lastTextured = i;
        ctx.changes++;
        continue;
      }
    }
    out.push(s);
  }
  return out;
}

// ------------------------------------------------------------------------------------------ i. spelling
function applySpelling(s, ctx) {
  const table = ctx.spelling === 'uk' ? US_TO_UK : UK_TO_US;
  return s.replace(/[A-Za-z]+/g, (w, offset, str) => {
    if (str[offset - 1] === '-' && /[A-Za-z]/.test(str[offset - 2] || '')) return w;
    const lw = w.toLowerCase();
    const rep = table.get(lw);
    if (!rep) return w;
    ctx.changes++;
    if (w === w.toUpperCase() && w.length > 1) return rep.toUpperCase();
    if (w[0] !== lw[0]) return rep[0].toUpperCase() + rep.slice(1);
    return rep;
  });
}

// ------------------------------------------------------------------------------------------ j. cleanup
const A_EXC = /^(uni(?:que|t|ted|ty|versal|versit|verse|form|on|corn|fied|fy|son|cycle|lateral)|use|usu|usa|usag|uti|ure|uro|eu|ewe|ubiq|ukulele|ufo|ute|uter)/;
const AN_EXC = /^(hour|honest|honor|honour|heir|herb)/;

function needsAn(word) {
  const w = word.toLowerCase();
  if (AN_EXC.test(w)) return true;
  if (/^one($|-)/.test(w) || /^once\b/.test(w)) return false;
  if (A_EXC.test(w)) return false;
  return /^[aeiou]/.test(w);
}

function fixArticles(s) {
  return s.replace(/(^|[^\p{L}\p{N}'’\-])(a|an|A|An)(\s+)([A-Za-z][A-Za-z'’-]*)/gu, (m, pre, art, sp, w, offset, str) => {
    if (/^[A-Z]/.test(art) && !isSentenceStart(str, offset + pre.length)) return m;
    if (w.length > 1 && w === w.toUpperCase()) return m; // acronym spelled out
    const an = needsAn(w);
    const isAn = art.toLowerCase() === 'an';
    if (an === isAn) return m;
    const fixed = an ? (art[0] === 'A' ? 'An' : 'an') : art[0] === 'A' ? 'A' : 'a';
    return pre + fixed + sp + w;
  });
}

const NEVER_CAP_AFTER = /(?:^|\s)(?:e\.g|i\.e|etc|vs|mr|mrs|ms|dr|prof|st|approx|cf|al|inc|ltd|co|no|jr|sr|fig)\.$/i;

function capitalizeSentences(s, ctx) {
  let out = capFirst(s);
  out = out.replace(/([.!?…]["'”’)\]*_]*\s+)([\s*_"“'‘(\[]*)(\p{Ll})/gu, (m, a, b, c, offset, str) => {
    const before = str.slice(Math.max(0, offset - 12), offset + 1);
    if (NEVER_CAP_AFTER.test(before)) return m;
    // dotted acronym placeholder (U.S.)
    const phm = str.slice(0, offset).match(/\uE000[\uE010-\uE01F]+\uE001$/);
    if (phm && ctx && /^(?:[A-Za-z]\.)+[A-Za-z]$/.test(ctx.store.resolve(phm[0]))) return m;
    if (/\p{Lu}/u.test(str[offset + m.length] || '')) return m; // camelCase
    return a + b + c.toUpperCase();
  });
  return out;
}

function cleanup(s, ctx, light) {
  if (s.includes(CAP_MARK)) {
    s = s.replace(/\uE002\s*([\s*_"“'‘(\[]*)(\p{Ll})/gu, (m, pre, c) => pre + c.toUpperCase());
    s = s.replace(/\uE002/g, '');
  }
  s = s.replace(/[ \t ]{2,}/g, ' ');
  s = s.replace(/ +([,.;:!?%)\]])/g, '$1');
  s = s.replace(/([(\[]) +/g, '$1');
  s = s.replace(/,(?:\s*,)+/g, ',');
  s = s.replace(/[,;:]\s*([.!?])/g, '$1');
  s = s.replace(/([.!?])\s*,/g, '$1');
  s = s.replace(/(?<![.\w])\.\.(?!\.)/g, '.');
  s = s.replace(/([!?])\.(?!\.)/g, '$1');
  s = s.replace(/^\s*[,;:]\s*/, '');
  s = s.replace(/([.!?]["'”’)\]*_]*\s+)[,;:]\s*/g, '$1');
  s = s.replace(/\(\s*\)/g, '');
  s = s.replace(/,\s*\)/g, ')');
  s = s.replace(/\b([A-Za-z]+)(\s+)\1\b/g, (m, w) => (DOUBLE_OK.has(w.toLowerCase()) ? m : w));
  s = s.replace(/\b([A-Z][a-z]+)\s+(\1)\b/gi, (m, a, b) => (a.toLowerCase() === b.toLowerCase() && !DOUBLE_OK.has(a.toLowerCase()) ? a : m));
  s = fixArticles(s);
  if (!light) s = capitalizeSentences(s, ctx);
  else s = s.replace(/([.!?]\s+)(\p{Ll})/gu, (m, a, c, offset, str) => (NEVER_CAP_AFTER.test(str.slice(Math.max(0, offset - 12), offset + 1)) ? m : a + c.toUpperCase()));
  return s;
}

// ------------------------------------------------------------------------------------------ line pipeline
function processProse(content, ctx, prevFirst) {
  let s = content;
  s = fixNotOnly(s, ctx);
  s = fixNotJust(s, ctx);
  if (/n['’]t just|not just/.test(s)) s = splitSentences(s, { resolve: ctx.store.resolve }).map((x) => fixNotJustNP(x.text, ctx)).join(' ');
  s = purgeCliches(s, ctx, false);
  s = processDashes(s, ctx);
  s = thinSemicolons(s, ctx);
  s = cleanup(s, ctx, false);
  s = contract(s, ctx);
  s = swapSynonyms(s, ctx);
  let sents = splitSentences(s, { resolve: ctx.store.resolve }).map((x) => x.text);
  if (ctx.cfg.splitP > 0) sents = restructure(sents, ctx);
  sents = sents.map((x) => capFirst(x));
  sents = varyOpeners(sents, ctx, prevFirst);
  sents = addTexture(sents, ctx);
  s = sents.join(' ');
  s = thinOxfordCommas(s, ctx);
  s = thinIntroCommas(s, ctx);
  if (ctx.t.contraction === 0) s = expandContractions(s, ctx);
  s = applySpelling(s, ctx);
  s = cleanup(s, ctx, false);
  return s;
}

function processLight(content, ctx) {
  const wasCap = /^[\s*_"“'‘(\[]*\p{Lu}/u.test(content);
  let s = content;
  s = purgeCliches(s, ctx, true);
  s = fixAttribution(s, ctx);
  if (/—|--|\s–\s/.test(s)) {
    s = s.replace(/\s*(?:—|--|\s–\s)\s*/g, (m, off, str) => {
      ctx.changes++;
      const before = str.slice(0, off);
      return /[:,;]$/.test(before) ? ' ' : off <= 40 && !/[.:]/.test(before) && /\*\*$/.test(before.trim()) ? ' ' : ': ';
    });
    // only one colon per item; extra ones become commas
    let seen = 0;
    s = s.replace(/: /g, (m) => (seen++ ? ', ' : m));
  }
  s = contract(s, ctx);
  s = swapSynonyms(s, ctx, 0.5);
  if (ctx.t.contraction === 0) s = expandContractions(s, ctx);
  s = applySpelling(s, ctx);
  s = cleanup(s, ctx, true);
  if (wasCap) s = capFirst(s);
  else s = s.replace(/^([\s*_"“'‘(\[]*)(\p{Lu})(?!\p{Lu})/u, (m, a, c) => a + c.toLowerCase());
  return s;
}

// Markdown-aware line classification on the ORIGINAL text.
function classify(lines) {
  const kinds = new Array(lines.length);
  let inFence = false;
  let fenceMark = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*(```+|~~~+)/);
    if (inFence) {
      kinds[i] = { kind: 'code' };
      if (fence && fence[1][0] === fenceMark[0] && fence[1].length >= fenceMark.length) inFence = false;
      continue;
    }
    if (fence) {
      inFence = true;
      fenceMark = fence[1];
      kinds[i] = { kind: 'code' };
      continue;
    }
    if (/^\s*$/.test(line)) { kinds[i] = { kind: 'blank' }; continue; }
    let m;
    if ((m = line.match(/^(\s{0,3}#{1,6}\s+)(.*?)(\s*#*\s*)$/))) { kinds[i] = { kind: 'light', prefix: m[1], content: m[2], suffix: m[3], titleLike: true }; continue; }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { kinds[i] = { kind: 'code' }; continue; }
    if (/^\s*\|.*\|\s*$/.test(line) || (line.match(/\|/g) || []).length >= 2) { kinds[i] = { kind: 'code' }; continue; }
    if ((m = line.match(/^(\s*(?:[-*+•▪◦]|\d{1,3}[.)]|[a-zA-Z][.)])\s+(?:\[[ xX]\]\s+)?)(.*)$/))) {
      const content = m[2];
      // long list items that are full paragraphs still only get light edits (structure is the author's)
      kinds[i] = { kind: 'light', prefix: m[1], content, suffix: '' };
      continue;
    }
    if ((m = line.match(/^(\s*>+\s?)(.*)$/))) { kinds[i] = { kind: 'light', prefix: m[1], content: m[2], suffix: '' }; continue; }
    if (/^( {4,}|\t)/.test(line) && (i === 0 || kinds[i - 1].kind === 'blank' || kinds[i - 1].kind === 'code')) { kinds[i] = { kind: 'code' }; continue; }
    if (/^\s*<\/?[a-zA-Z][^>]*>\s*$/.test(line)) { kinds[i] = { kind: 'code' }; continue; }
    if ((m = line.match(/^(\s*(?:Subject|Re|To|From|CC|BCC|Date|Title|Headline|Caption|CTA|Hook|Tagline|P\.S\.|PS)\s*:\s*)(.*)$/i))) {
      kinds[i] = { kind: 'light', prefix: m[1], content: m[2], suffix: '', titleLike: true };
      continue;
    }
    const lead = line.match(/^(\s*)(.*?)(\s*)$/);
    kinds[i] = { kind: 'prose', prefix: lead[1], content: lead[2], suffix: lead[3] };
  }
  return kinds;
}

/**
 * Humanize AI-written text.
 * @param {string} text
 * @param {{tone?:string,strength?:string,seed?:number,spelling?:'us'|'uk'}} [opts]
 */
export function humanize(text, opts = {}) {
  const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const input = typeof text === 'string' ? text : text == null ? '' : String(text);
  const o = opts && typeof opts === 'object' ? opts : {};
  const statsBase = (out) => {
    const t1 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    return {
      inputWords: countWords(input),
      outputWords: countWords(out),
      sentencesIn: splitSentences(input).length,
      sentencesOut: splitSentences(out).length,
      ms: Math.round((t1 - t0) * 10) / 10,
    };
  };
  if (!input.trim()) return { text: input, changes: 0, stats: statsBase(input) };

  let ctx;
  let result;
  try {
    ctx = makeCtx(input, o);
    const crlf = input.includes('\r\n');
    const src = crlf ? input.replace(/\r\n/g, '\n') : input;
    const lines = src.split('\n');
    const kinds = classify(lines);
    const store = createStore();
    ctx.store = store;
    // mask every non-code line first so proper nouns seen anywhere are known when lower-casing
    const masked = kinds.map((k) =>
      k.kind === 'prose' || k.kind === 'light' ? protect(k.content, store, { maskCaps: !(k.kind === 'light' && k.titleLike) }) : null
    );
    const totalWords = countWords(src);
    ctx.asideBudget = ctx.cfg.wordsPerAside > 0 && totalWords >= 40 ? Math.max(ctx.t.aside >= 0.5 ? 1 : 0, Math.round((totalWords / ctx.cfg.wordsPerAside) * ctx.t.aside)) : 0;
    const out = [];
    let prevFirst = '';
    for (let i = 0; i < lines.length; i++) {
      const k = kinds[i];
      if (k.kind === 'prose' || k.kind === 'light') {
        const m = masked[i];
        if (!m.replace(/\uE000[\uE010-\uE01F]+\uE001/g, '').trim() || !/[A-Za-z]/.test(m.replace(/\uE000[\uE010-\uE01F]+\uE001/g, ''))) {
          out.push(lines[i]);
          continue;
        }
        ctx.rng = createRng(mixSeeds(ctx.seed, ctx.tone, ctx.strength, i, m));
        let res = k.kind === 'prose' ? processProse(m, ctx, prevFirst) : processLight(m, ctx);
        if (k.kind === 'prose') {
          const ss = splitSentences(res, { resolve: store.resolve });
          prevFirst = ss.length ? lc(words(ss[ss.length - 1].text)[0] || '') : '';
        }
        res = store.unmask(res);
        out.push(k.prefix + res + k.suffix);
      } else {
        out.push(lines[i]);
        if (k.kind !== 'blank') prevFirst = '';
      }
    }
    result = out.join('\n');
    if (crlf) result = result.replace(/\n/g, '\r\n');
  } catch (err) {
    // Never throw on user input: fall back to the original text.
    return { text: input, changes: 0, stats: statsBase(input), error: String(err && err.message ? err.message : err) };
  }
  return { text: result, changes: ctx.changes, stats: statsBase(result) };
}
