# Inkling: private AI humanizer for marketers

Inkling turns AI-written copy (ChatGPT, Claude, Gemini, Copilot and others) into
natural, human-sounding text that is built to read as human to AI detectors such
as GPTZero, ZeroGPT, Originality.ai and RoBERTa-based classifiers. It keeps your
facts, numbers, names, links and formatting intact.

Everything runs **100% locally in the browser**. There is no server-side
processing, no AI model and no network call, so your text never leaves the
device.

---

## Quick start

Requirements: Node.js 18 or newer. There are no dependencies to install.

```bash
cd humanizer
npm start
```

Then open the URL it prints, normally <http://127.0.0.1:4173/>. If 4173 is
busy, the server picks the next free port and prints that URL instead. Use
`PORT=8080 npm start` to choose a port.

### Single-file version

```bash
npm run build
```

This writes **`dist/inkling.html`**, one self-contained HTML file with the CSS,
the UI and the engine all inlined. Double-click it to open it straight from
disk (`file://`). It works offline and can be emailed or shared as an
attachment. The build uses [esbuild](https://esbuild.github.io/): a locally
installed copy if there is one, otherwise `npx --yes esbuild@0.24.0`, which npm
downloads once and caches.

### Tests and evaluation

| Command          | What it does                                                    |
| ---------------- | --------------------------------------------------------------- |
| `npm test`       | Unit tests for the engine (`node --test tests/`)                |
| `npm run eval`   | Detector evaluation harness (`tests/eval/run_eval.mjs`)         |
| `npm run e2e`    | Browser end-to-end test of the website (`tests/e2e.mjs`)        |
| `npm run build`  | Builds `dist/inkling.html`                                      |

---

## Project structure

```
humanizer/
├── index.html          Landing page + the humanizer tool (strict CSP, no inline code)
├── assets/
│   ├── app.css         All styles: design tokens, light/dark themes, responsive layout
│   ├── app.js          UI wiring (ES module). Talks to the engine via a worker or directly
│   ├── worker.js       Module Web Worker that runs the engine off the main thread
│   ├── theme-init.js   Tiny render-blocking script that applies a saved theme before paint
│   └── favicon.svg
├── engine/             The humanizer engine: pure ES modules, zero dependencies
│   └── index.js        exports humanize(), detect(), diffWords(), VERSION
├── tests/              Unit tests, evaluation harness and corpus, browser e2e test
├── serve.mjs           Zero-dependency static dev server (127.0.0.1 only)
├── build.mjs           Single-file build -> dist/inkling.html
└── package.json
```

### Engine API

```js
import { humanize, detect, diffWords, VERSION } from './engine/index.js';

humanize(text, { tone, strength, seed, spelling });
// tone: 'natural' | 'casual' | 'professional' | 'marketing' | 'academic'
// strength: 'light' | 'balanced' | 'aggressive'
// seed: integer. Same text + options + seed gives the same output.
// spelling: 'us' | 'uk'
// -> { text, changes, stats: { inputWords, outputWords, sentencesIn, sentencesOut, ms } }

detect(text);
// -> { score 0-100, label, signals: [{ id, name, value, verdict, detail }],
//      sentences: [{ text, start, end, ai 0-1 }] }

diffWords(a, b);
// -> [{ type: 'same' | 'add' | 'del', text }]  (word level, whitespace preserved)
```

The engine runs unchanged in modern browsers and in Node 18+.

---

## How Inkling beats AI detectors

Detectors don't understand meaning. They measure statistical patterns, and LLM
text has a very recognisable statistical shape. That's also why "ask ChatGPT
to make it sound human" rarely works: the rewrite is just more LLM output with
the same shape.

Inkling uses a **deterministic, algorithmic engine instead of another model**,
and changes exactly the patterns detectors look at:

1. **Perplexity (predictability).** LLMs choose the most probable next word
   again and again, so their text is unusually easy to predict. Inkling swaps
   in plausible but less predictable word choices and varies sentence openers,
   which raises perplexity while keeping the wording natural.
2. **Burstiness (rhythm).** Human writing mixes long and short sentences;
   LLM writing is evenly paced. Inkling splits, merges and restructures
   sentences to create real variation in length and structure: a long one,
   then a short one. Like that.
3. **AI fingerprints.** Stock phrases and habits ("delve into", "a rich
   tapestry", "in today's fast-paced world", "it's important to note",
   "Moreover/Furthermore", "not only… but also", em-dash chains, padding in
   groups of three) are detected and rewritten or removed.
4. **Human texture.** Contractions, the occasional aside and rhetorical moves
   such as "The result? X." are added where they fit the chosen tone.
5. **Preservation.** Numbers, prices, dates, names, URLs, emails, hashtags,
   markdown and paragraph breaks are protected before any rewriting, so facts
   don't drift.

Because the engine is seeded, results are reproducible. **New variant** simply
changes the seed to produce a different, equally valid rewrite.

The **AI score** shown in the app is a transparent local estimate built from
the same families of signals (with a per-sentence breakdown). It is not a copy
of any commercial detector, which use private models and change often. The UI
says this plainly.

---

## The website

- **Tool above the fold:** two panes (input and output), tone selector,
  strength (Light / Balanced / Aggressive), US/UK spelling, **New variant**,
  **Humanize** (Ctrl/Cmd + Enter), Paste, Sample (three realistic AI-written
  marketing samples), Clear, Copy, Download `.txt`, live word and character
  counters and a 15,000-word limit with a friendly message.
- **AI score panel:** before/after gauges plus an expandable list of signals
  with plain-English explanations.
- **Show changes:** word-level diff of the output (additions and removals).
- **Highlight AI sentences:** per-sentence highlighting in either pane.
- Landing sections: how it works, use cases, comparison with rewriting in
  ChatGPT, pricing, FAQ and footer with a responsible-use note.
- Light and dark themes (follows the OS; the manual toggle is remembered),
  responsive down to 320px, visible focus states, reduced-motion support and
  `aria-live` announcements.
- Settings (tone, strength, spelling, view toggles) are remembered in
  `localStorage`. **Text is never stored.**

### Responsiveness

`humanize`, `detect` and `diffWords` run in a module Web Worker
(`assets/worker.js`). If the worker can't start (old browser, or the
single-file build opened from disk), the app falls back to the main thread and
yields to the browser first so the loading state still paints. A stuck job is
timed out and the worker is restarted.

### Security

- Strict Content-Security-Policy, both as a `<meta>` tag and as an HTTP header
  from `serve.mjs`: `default-src 'self'; script-src 'self'; style-src 'self'; ...`
  with no inline scripts or styles. The single-file build replaces it with a
  policy that allows only its own inline blocks via sha256 hashes and blocks
  all network access (`default-src 'none'`).
- User text is only ever rendered with `textContent` / text nodes. There is no
  `innerHTML`, `eval` or dynamic code anywhere.
- `serve.mjs` binds to 127.0.0.1 only, serves GET/HEAD only, rejects null bytes
  and malformed encodings (400), blocks path traversal and symlink escapes
  (resolve + prefix check + realpath), never serves dotfiles, and sends
  `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`,
  `Permissions-Policy` and `Cache-Control: no-store`.

### Stable selectors (for automated tests)

| Element                | Selector                                   |
| ---------------------- | ------------------------------------------ |
| Input textarea         | `#input`                                   |
| Output text            | `#output` (read text with `textContent`)   |
| Humanize button        | `#humanize` (has class `is-busy` while working) |
| Tone                   | `#tone` (`<select>`)                       |
| Strength / spelling    | `input[name="strength"]`, `input[name="spelling"]` |
| Buttons                | `#variant`, `#paste`, `#sample`, `#clear`, `#copy`, `#download` |
| Toggles                | `#toggle-diff`, `#toggle-hl-in`, `#toggle-hl-out` |
| Scores                 | `#score-in`, `#score-out` (`.gauge-value`, `.gauge-label`, `data-state`) |
| Signals list           | `#signals li`                              |
| Counters / messages    | `#in-count`, `#out-count`, `#limit-msg`, `#stale-msg`, `#run-stats` |
| Live status / toasts   | `#status`, `#toasts`                       |
| Theme toggle           | `#theme-toggle` (sets `data-theme` on `<html>`) |

Every interactive element also has a matching `data-testid`.

### Before launch

- Prices on the pricing section are **placeholders** (marked in `index.html`).
- The contact address `hello@inkling.example` is a **placeholder**.

---

## Responsible use

Inkling is meant for polishing marketing and business copy that you own or are
allowed to edit. Do not use it to violate academic integrity rules, employer or
client policies on AI use, or platform disclosure requirements. No detector,
and no humanizer, is perfect: always read the result and fact-check claims
before publishing.

## Deep mode (AI rewrite + engine)

The local engine alone cannot beat modern detectors: word swaps leave the AI's sentence structure intact. Deep mode fixes that:

1. **Claude recomposes the text** with a prompt tuned against real detectors (`engine/rewrite.js`): re-orders information, bans reused 4-word phrases from the draft, removes hype and AI tells, keeps every fact.
2. **Guards**: numbers/URLs/handles/quotes must survive and 4-word overlap with the draft must stay under 25%, otherwise it retries once with feedback.
3. **Engine post-pass** (no inserted asides) strips leftover tells and varies rhythm.

Measured on a blind 10-sample marketing set (local detectors: desklib, fakespot, GPT-2 perplexity/burstiness, binoculars): majority-of-detectors flag rate **100% → 0%**; GPTZero-style detector **80% → 0%**. desklib alone still flags most rewrites (it also flags most genuine human press releases).

Run with your key (never sent to the browser):

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start      # optional: INKLING_MODEL, INKLING_RATE_LIMIT (per IP per minute)
```

Without a key the UI disables Deep mode and runs Fast (local-only). Inside claude.ai (artifact build `dist/inkling-artifact.html`) Deep mode uses the viewer's own Claude account.
