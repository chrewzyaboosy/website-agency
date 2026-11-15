#!/usr/bin/env node
// Inkling real-detector evaluation.
//
// Builds variants of the corpus (raw AI, Inkling-humanized at each strength, Inkling
// marketing tone, genuine human), scores every text with REAL open-source detectors
// running locally (tests/eval/detectors.py in the venv at /home/user/.venvs/eval) and
// with Inkling's own in-browser detect(), then prints/saves a comparison.
//
// Usage (from humanizer/):
//   npm run eval
//   node tests/eval/run_eval.mjs [--limit N] [--only a,b] [--all] [--strengths light,balanced]
//                                [--seed N] [--no-marketing] [--local-only] [--python PATH]
//
// Outputs: tests/eval/out/texts.json, scores.json, report.json, report.md

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const CORPUS = join(ROOT, 'tests', 'corpus');
const OUT = join(HERE, 'out');
const DEFAULT_PY = '/home/user/.venvs/eval/bin/python';
const ALL_STRENGTHS = ['light', 'balanced', 'aggressive'];

// ------------------------------------------------------------------ args
function parseArgs(argv) {
  const a = { limit: 0, only: '', all: false, strengths: ALL_STRENGTHS, seed: 42, marketing: true,
    localOnly: false, python: process.env.INKLING_EVAL_PYTHON || DEFAULT_PY };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`missing value for ${k}`);
      return argv[++i];
    };
    if (k === '--limit') a.limit = parseInt(next(), 10) || 0;
    else if (k === '--only') a.only = next();
    else if (k === '--all') a.all = true;
    else if (k === '--strengths') a.strengths = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === '--seed') a.seed = parseInt(next(), 10);
    else if (k === '--no-marketing') a.marketing = false;
    else if (k === '--local-only') a.localOnly = true;
    else if (k === '--python') a.python = next();
    else if (k === '-h' || k === '--help') {
      console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 14).join('\n'));
      process.exit(0);
    } else throw new Error(`unknown argument: ${k}`);
  }
  const bad = a.strengths.filter((s) => !ALL_STRENGTHS.includes(s));
  if (bad.length) throw new Error(`unknown strength(s): ${bad.join(',')}`);
  if (!Number.isInteger(a.seed)) throw new Error('--seed must be an integer');
  return a;
}

// ------------------------------------------------------------------ meaning-preservation helpers
const NUM_RE = /[$€£]?\d[\d,]*(?:\.\d+)?(?:%|k|K|M|x)?/g;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s)>\]]+|\b[\w.-]+\.(?:com|io|app|org|net|co)\b(?:\/[^\s)>\]]*)?/g;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g;
const HANDLE_RE = /(?:^|\s)([@#][A-Za-z][\w]+)/g;
const STOP_CAPS = new Set(('I A An The This That These Those It Its In On At For From With By To Of And Or But If When While ' +
  'As So Our We You Your Yes No Not Do Does Did Is Are Was Were Be Here There What Why How Who Which Whether ' +
  'Each Every All Some Many Most More Just Now Then Also Plus Even Still Get Start Join Try Use Make Let Let\'s ' +
  'Subject Hi Hello Dear Best Thanks Cheers Warm Warmly Regards Headline Description Variation Key Final Ready ' +
  'Step One Two Three Four Five Six Seven Eight Nine Ten First Second Third Finally However Moreover Furthermore ' +
  'Additionally Ultimately Consider Whether Over Within After Before During Since Until Without').split(' '));

function clean(tok) {
  return tok.replace(/[.,;:!?)\]]+$/, '');
}
function multiset(arr) {
  const m = new Map();
  for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
  return m;
}
function numbers(text) {
  return (text.match(NUM_RE) || []).map(clean).filter((x) => /\d/.test(x));
}
function entities(text) {
  const out = [];
  out.push(...(text.match(URL_RE) || []).map(clean));
  out.push(...(text.match(EMAIL_RE) || []));
  for (const m of text.matchAll(HANDLE_RE)) out.push(m[1]);
  // Capitalized words that are not sentence-initial, plus ALL-CAPS acronyms. Markdown prefixes
  // (#, -, 1., 1/, **) count as line starts, and Title-Case heading lines are skipped entirely
  // (every word is capitalized there, so capitals carry no "this is a name" signal).
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/^[\s#>*\-•+]*(?:\d+[.)/:]\s*)?[*_]*/u, '');
    const ws = line.match(/[A-Za-z][\w&’'-]*/g) || [];
    const caps = ws.filter((w) => /^[A-Z]/.test(w)).length;
    if (ws.length >= 3 && caps / ws.length >= 0.6) continue;
    for (const sentence of line.split(/(?<=[.!?:])\s+/)) {
      const toks = sentence.replace(/[*_"“”()[\]]/g, ' ').split(/\s+/).filter(Boolean);
      toks.forEach((tok, i) => {
        const w = tok.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').replace(/[’']s$/, '');
        if (!w || STOP_CAPS.has(w)) return;
        if (/^[A-Z][A-Z0-9&]+$/.test(w)) out.push(w); // acronym (SEO, ROI, GHG) anywhere
        else if (i > 0 && /^[A-Z][a-z]/.test(w)) out.push(w);
      });
    }
  }
  return out;
}
function preserved(srcList, outText) {
  if (!srcList.length) return null;
  const outCounts = multiset([...numbers(outText), ...entities(outText)]);
  let kept = 0;
  const lost = [];
  for (const x of srcList) {
    const c = outCounts.get(x) || 0;
    if (c > 0 || outText.includes(x)) {
      kept++;
      if (c > 0) outCounts.set(x, c - 1);
    } else lost.push(x);
  }
  return { rate: kept / srcList.length, lost };
}
function introducedNumbers(src, out) {
  const s = multiset(numbers(src));
  const extra = [];
  for (const n of numbers(out)) {
    const c = s.get(n) || 0;
    if (c > 0) s.set(n, c - 1);
    else extra.push(n);
  }
  return extra;
}
const words = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '–');
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '–');

// ------------------------------------------------------------------ main
async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(OUT, { recursive: true });

  let ai = JSON.parse(readFileSync(join(CORPUS, 'ai.json'), 'utf8'));
  let human = JSON.parse(readFileSync(join(CORPUS, 'human.json'), 'utf8'));
  if (args.limit > 0) {
    ai = ai.slice(0, args.limit);
    human = human.slice(0, args.limit);
  }

  let engine = null;
  try {
    engine = await import(pathToFileURL(join(ROOT, 'engine', 'index.js')).href);
  } catch (e) {
    console.warn(`! engine not importable (${e.message}); evaluating raw AI + human only.`);
  }

  // ---- build variants
  const variants = [];
  if (engine) {
    for (const s of args.strengths) variants.push({ group: `inkling-${s}`, opts: { tone: 'natural', strength: s } });
    if (args.marketing) variants.push({ group: 'inkling-marketing', opts: { tone: 'marketing', strength: 'balanced' } });
  }
  const texts = [];
  const items = {}; // id -> per-item record for report.json
  const errors = [];
  for (const x of ai) {
    const id = `raw::${x.id}`;
    texts.push({ id, group: 'raw', src: x.id, kind: x.kind, text: x.text });
    items[id] = { id, group: 'raw', src: x.id, kind: x.kind, words: words(x.text) };
  }
  const humanizeMs = {};
  for (const v of variants) {
    humanizeMs[v.group] = [];
    for (const x of ai) {
      const id = `${v.group}::${x.id}`;
      let out;
      try {
        const t0 = performance.now();
        out = engine.humanize(x.text, { ...v.opts, seed: args.seed });
        humanizeMs[v.group].push(performance.now() - t0);
        if (!out || typeof out.text !== 'string') throw new Error('humanize() returned no text');
      } catch (e) {
        errors.push({ id, error: String(e && e.message || e) });
        continue;
      }
      const numsSrc = numbers(x.text);
      const entsSrc = entities(x.text);
      const pn = preserved(numsSrc, out.text);
      const pe = preserved(entsSrc, out.text);
      texts.push({ id, group: v.group, src: x.id, kind: x.kind, text: out.text });
      items[id] = {
        id, group: v.group, src: x.id, kind: x.kind,
        words: words(out.text), word_change: words(out.text) / Math.max(1, words(x.text)) - 1,
        changes: out.changes, unchanged: out.text.trim() === x.text.trim(),
        numbers_kept: pn ? pn.rate : null, numbers_lost: pn ? pn.lost : [],
        entities_kept: pe ? pe.rate : null, entities_lost: pe ? pe.lost.slice(0, 12) : [],
        numbers_introduced: introducedNumbers(x.text, out.text),
      };
    }
  }
  for (const x of human) {
    const id = `human::${x.id}`;
    texts.push({ id, group: 'human', src: x.id, kind: x.kind, text: x.text });
    items[id] = { id, group: 'human', src: x.id, kind: x.kind, words: words(x.text) };
  }
  const groups = [...new Set(texts.map((t) => t.group))];

  // ---- local detect()
  if (engine) {
    for (const t of texts) {
      try {
        const d = engine.detect(t.text);
        items[t.id].local = { score: d.score, label: d.label };
      } catch (e) {
        errors.push({ id: t.id, error: `detect(): ${e.message}` });
      }
    }
  }

  const textsPath = join(OUT, 'texts.json');
  writeFileSync(textsPath, JSON.stringify(texts.map(({ id, group, text }) => ({ id, group, text })), null, 1));
  console.log(`wrote ${texts.length} texts (${groups.join(', ')}) -> ${textsPath}`);
  if (errors.length) console.warn(`! ${errors.length} errors, e.g. ${JSON.stringify(errors[0])}`);

  // ---- real detectors (python)
  let scores = {};
  let detMeta = {};
  const scoresPath = join(OUT, 'scores.json');
  if (!args.localOnly) {
    if (!existsSync(args.python)) {
      console.warn(`! python venv not found at ${args.python}; run tests/eval/setup.sh. Skipping real detectors.`);
    } else {
      const pyArgs = [join(HERE, 'detectors.py'), '--in', textsPath, '--out', scoresPath];
      if (args.only) pyArgs.push('--only', args.only);
      if (args.all) pyArgs.push('--all');
      console.log(`running real detectors: ${args.python} ${pyArgs.map((p) => p.replace(ROOT + '/', '')).join(' ')}`);
      const t0 = Date.now();
      const r = spawnSync(args.python, pyArgs, { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, TOKENIZERS_PARALLELISM: 'false' } });
      if (r.status !== 0) console.warn(`! detectors.py exited with status ${r.status}`);
      else console.log(`real detectors finished in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      if (existsSync(scoresPath) && r.status === 0) {
        const j = JSON.parse(readFileSync(scoresPath, 'utf8'));
        scores = j.scores || {};
        detMeta = (j.meta && j.meta.detectors) || {};
      }
    }
  }
  const detectors = Object.keys(detMeta).filter((d) => !detMeta[d].error);

  // ---- aggregate
  const byGroup = Object.fromEntries(groups.map((g) => [g, texts.filter((t) => t.group === g).map((t) => t.id)]));
  const summary = { detectors: {}, local: {}, consensus: {}, quality: {} };
  for (const d of detectors) {
    summary.detectors[d] = {};
    for (const g of groups) {
      const vals = byGroup[g].map((id) => scores[id] && scores[id][d]).filter((v) => v && v.ai_prob !== null);
      summary.detectors[d][g] = {
        mean_ai_prob: mean(vals.map((v) => v.ai_prob)),
        flagged: mean(vals.map((v) => (v.flagged ? 1 : 0))),
        n: vals.length,
      };
    }
  }
  for (const g of groups) {
    const loc = byGroup[g].map((id) => items[id].local).filter(Boolean);
    summary.local[g] = { mean_score: mean(loc.map((l) => l.score)), likely_ai: mean(loc.map((l) => (l.label === 'Likely AI' ? 1 : 0))), n: loc.length };
    // consensus across real detectors: share of texts flagged by any / by a majority
    if (detectors.length) {
      const per = byGroup[g].map((id) => detectors.map((d) => scores[id] && scores[id][d] && scores[id][d].flagged ? 1 : 0));
      summary.consensus[g] = {
        any: mean(per.map((p) => (p.some(Boolean) ? 1 : 0))),
        majority: mean(per.map((p) => (p.reduce((a, b) => a + b, 0) > detectors.length / 2 ? 1 : 0))),
        mean_flags: mean(per.map((p) => p.reduce((a, b) => a + b, 0))),
      };
      for (const id of byGroup[g]) items[id].flags = detectors.filter((d) => scores[id] && scores[id][d] && scores[id][d].flagged);
    }
    if (g.startsWith('inkling-')) {
      const it = byGroup[g].map((id) => items[id]);
      const nums = it.map((x) => x.numbers_kept).filter((x) => x !== null);
      const ents = it.map((x) => x.entities_kept).filter((x) => x !== null);
      summary.quality[g] = {
        word_change: mean(it.map((x) => x.word_change)),
        numbers_kept: mean(nums), entities_kept: mean(ents),
        numbers_introduced: it.reduce((a, x) => a + x.numbers_introduced.length, 0),
        unchanged: it.filter((x) => x.unchanged).length,
        humanize_ms: mean(humanizeMs[g] || []),
        n: it.length,
      };
    }
  }

  // ---- worst offenders: humanized texts still flagged by the most detectors
  const worst = Object.values(items)
    .filter((x) => x.group.startsWith('inkling-') && x.flags)
    .sort((a, b) => b.flags.length - a.flags.length)
    .slice(0, 8)
    .map((x) => ({ id: x.id, flags: x.flags }));

  let sanity = null;
  try { sanity = JSON.parse(readFileSync(join(HERE, 'sanity_gate.json'), 'utf8')); } catch { /* optional */ }

  // ---- print + write
  const md = renderMarkdown({ args, groups, detectors, detMeta, summary, worst, sanity, errors, engine, nAi: ai.length, nHuman: human.length });
  console.log('\n' + md);
  writeFileSync(join(OUT, 'report.md'), md);
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({
    created: new Date().toISOString(), engine_version: engine ? engine.VERSION : null, args,
    groups, detectors: detMeta, summary, worst, errors, items: Object.values(items),
  }, null, 1));
  console.log(`wrote ${join(OUT, 'report.md')} and report.json`);
}

function table(header, rows) {
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n');
}

function renderMarkdown({ args, groups, detectors, detMeta, summary, worst, sanity, errors, engine, nAi, nHuman }) {
  const out = [];
  out.push(`# Inkling detector evaluation`);
  out.push('');
  out.push(`Engine ${engine ? engine.VERSION : '(missing)'} · seed ${args.seed} · ${nAi} AI samples · ${nHuman} human samples · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`);
  out.push('');
  out.push(`Groups: **raw** = AI text as generated; **inkling-<strength>** = humanized (tone natural); ` +
    `**inkling-marketing** = tone marketing, balanced; **human** = genuine pre-2022 human writing (false-positive baseline).`);
  out.push('');
  if (detectors.length) {
    out.push(`## Flagged as AI (% of texts) — lower is better for Inkling`);
    out.push('');
    out.push(table(['detector', ...groups], detectors.map((d) => [d, ...groups.map((g) => pct(summary.detectors[d][g].flagged))])));
    out.push('');
    out.push(table(['consensus', ...groups], [
      ['flagged by ANY detector', ...groups.map((g) => pct(summary.consensus[g].any))],
      ['flagged by MAJORITY', ...groups.map((g) => pct(summary.consensus[g].majority))],
      ['mean # detectors flagging', ...groups.map((g) => (summary.consensus[g].mean_flags ?? NaN).toFixed(2))],
    ]));
    out.push('');
    out.push(`## Mean AI probability`);
    out.push('');
    out.push(table(['detector', ...groups], detectors.map((d) => [d, ...groups.map((g) => f3(summary.detectors[d][g].mean_ai_prob))])));
    out.push('');
  } else {
    out.push(`_Real detectors were not run (use the venv; see tests/eval/README.md)._`);
    out.push('');
  }
  if (engine) {
    out.push(`## Inkling's local detect() (0-100, higher = more AI-like)`);
    out.push('');
    out.push(table(['metric', ...groups], [
      ['mean score', ...groups.map((g) => (summary.local[g].mean_score ?? NaN).toFixed(1))],
      ['labelled "Likely AI"', ...groups.map((g) => pct(summary.local[g].likely_ai))],
    ]));
    out.push('');
  }
  const qg = Object.keys(summary.quality);
  if (qg.length) {
    out.push(`## Rewrite quality (crude)`);
    out.push('');
    out.push(table(['metric', ...qg], [
      ['avg word-count change', ...qg.map((g) => `${(summary.quality[g].word_change * 100).toFixed(1)}%`)],
      ['numbers preserved', ...qg.map((g) => pct(summary.quality[g].numbers_kept))],
      ['named entities/URLs preserved', ...qg.map((g) => pct(summary.quality[g].entities_kept))],
      ['numbers introduced (total)', ...qg.map((g) => String(summary.quality[g].numbers_introduced))],
      ['texts left unchanged', ...qg.map((g) => `${summary.quality[g].unchanged}/${summary.quality[g].n}`)],
      ['humanize() ms/text', ...qg.map((g) => (summary.quality[g].humanize_ms ?? NaN).toFixed(1))],
    ]));
    out.push('');
  }
  if (worst.length && detectors.length) {
    out.push(`## Hardest samples (humanized, still flagged by the most detectors)`);
    out.push('');
    for (const w of worst) out.push(`- \`${w.id}\`: ${w.flags.length}/${detectors.length} (${w.flags.join(', ') || 'none'})`);
    out.push('');
  }
  if (detectors.length) {
    out.push(`## Detectors`);
    out.push('');
    out.push(table(['detector', 'model', 'threshold', 'load s', 'ms/text'], detectors.map((d) => [
      d, detMeta[d].model, String(detMeta[d].threshold), String(detMeta[d].load_s), String(detMeta[d].ms_per_text)])));
    out.push('');
    const failed = Object.keys(detMeta).filter((d) => detMeta[d].error);
    if (failed.length) out.push(`Failed to run: ${failed.map((d) => `${d} (${detMeta[d].error.slice(0, 80)})`).join('; ')}`);
  }
  if (sanity && sanity.table) {
    out.push(`## Sanity gate (raw AI corpus vs human corpus, gate ${pct(sanity.gate)} / ${pct(sanity.gate)})`);
    out.push('');
    out.push(table(['detector', 'AI flagged', 'human passed', 'verdict'], Object.entries(sanity.table).map(([d, r]) => [
      d, r.error ? 'error' : pct(r.loo_ai_flagged ?? r.ai_flagged), r.error ? '–' : pct(r.loo_human_passed ?? r.human_passed),
      r.pass ? 'kept' : 'dropped'])));
    out.push('');
    out.push(`Detectors whose rule is fitted on the corpus (gptzero-style, binoculars) are gated on leave-one-out numbers.`);
    out.push('');
  }
  if (errors.length) {
    out.push(`## Errors (${errors.length})`);
    out.push('');
    for (const e of errors.slice(0, 10)) out.push(`- \`${e.id}\`: ${e.error}`);
    out.push('');
  }
  return out.join('\n');
}

main().catch((e) => {
  console.error(e && e.stack || e);
  process.exit(1);
});
