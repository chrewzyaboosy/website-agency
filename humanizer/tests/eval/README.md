# Real-detector evaluation harness

Checks, with real open-source AI detectors running locally on CPU, how often each kind of text gets flagged as AI:

- **raw** AI text
- **Inkling-humanized** AI text, at each strength plus the marketing tone
- **genuine human** text, which gives the false-positive baseline

We can't call GPTZero, ZeroGPT or Originality from here (they're paid and closed). Instead the harness runs the open methods those products started from (GPT-2 perplexity and burstiness, Binoculars) plus current classifiers that rank well on the RAID benchmark.

## Quick start

```bash
cd humanizer
bash tests/eval/setup.sh            # one-time: venv at /home/user/.venvs/eval, CPU torch, ~7 GB of weights in ~/.cache/huggingface
npm run eval                        # full run (~20-30 min on 4 CPU cores)
node tests/eval/run_eval.mjs --limit 6 --only fakespot,gptzero-style   # quick smoke run (~1 min)
node tests/eval/run_eval.mjs --local-only                              # engine + local detect() only, no Python
```

Flags for `run_eval.mjs`:

| Flag | What it does |
| --- | --- |
| `--limit N` | Use only the first N samples of each corpus |
| `--only a,b` | Run only these detectors |
| `--all` | Also run the detectors that were dropped at the sanity gate |
| `--strengths light,balanced` | Humanize only at these strengths |
| `--seed N` | Seed for `humanize()` (default 42) |
| `--no-marketing` | Skip the marketing-tone variant |
| `--local-only` | Skip the Python detectors |
| `--python PATH` | Use this Python instead of the venv |

Outputs go to `tests/eval/out/` (gitignored): `texts.json`, `scores.json`, `report.md`, `report.json`. `report.json` has per-item flags, lost entities and numbers.

Python CLI (each model loads once; long texts are split into sentence-aligned chunks and averaged by token count):

```bash
PY=/home/user/.venvs/eval/bin/python
$PY tests/eval/detectors.py --list                                # registered detectors, kept vs dropped
$PY tests/eval/detectors.py --in texts.json --out scores.json [--only a,b] [--all]
$PY tests/eval/detectors.py --sanity                              # gate: raw AI corpus vs human corpus (writes sanity_gate.json)
$PY tests/eval/detectors.py --calibrate                           # refit gptzero-style / binoculars rules (calibration.json)
```

Input is `[{id, group, text}]`. Output is `{meta, scores: {id: {detector: {ai_prob, flagged, extra}}}}`.

## Detectors and the sanity gate

A detector is only useful for judging Inkling if it catches raw AI text and leaves human text alone. The gate requires both of these on our corpus:

- at least 70% of raw AI samples flagged
- at least 70% of human samples passed

Detectors whose rule is fitted on the corpus are judged on leave-one-out numbers. The current verdicts are in `sanity_gate.json`.

| Detector | Model | Status |
| --- | --- | --- |
| `gptzero-style` | GPT-2-medium perplexity + burstiness, logistic rule (`calibration.json`) | kept |
| `binoculars` | Binoculars (Hans et al. 2024), observer SmolLM2-360M, performer SmolLM2-360M-Instruct | kept |
| `desklib` | desklib/ai-text-detector-v1.01 (DeBERTa-v3-large, top of RAID at release) | kept |
| `fakespot` | fakespot-ai/roberta-base-ai-text-detection-v1 (Mozilla/Fakespot, 2025) | kept |
| `chatgpt-roberta` | Hello-SimpleAI/chatgpt-detector-roberta | dropped: misses most raw AI marketing copy |
| `openai-roberta` | openai-community/roberta-base-openai-detector | dropped: GPT-2-era, misses raw AI |
| `superannotate` | SuperAnnotate/ai-detector (RoBERTa-large) | dropped: about 35% false positives on human text |
| `mage` | yaful/MAGE (Longformer) | dropped: about 32% false positives on human text |
| `binoculars-mini` | Binoculars with gpt2 / gpt2-medium | dropped: too weak, about 62% of raw AI caught |

Notes:

- **gptzero-style.** The fit is constrained to GPTZero's premise: low perplexity and low burstiness mean AI.
  - On this corpus, burstiness of prose sentences doesn't separate AI from human. Counting every line instead makes markdown bullets and headings look "bursty", which is why only prose sentences are used.
  - Because of that, the calibrated burstiness weight is pinned to 0 and the rule effectively runs on perplexity alone. Burstiness is still reported in `extra`.
- **Calibrated rules are fitted on this corpus.** If you change the corpus, re-run `--calibrate`, then `--sanity`.
- **Licenses.** These models are used for internal evaluation only and are never shipped.
  - SuperAnnotate uses the copyleft SAIPL license.
  - TrustSafeAI/RADAR was left out because its license is non-commercial.

## Corpus (`tests/corpus/`)

- **`ai.json`**: 32 samples, 174-341 words each. Written by an LLM (Claude) in the default assistant voice, with no style instructions. Covers blog posts, SEO articles, cold emails, newsletters, product descriptions, landing pages, LinkedIn posts, X threads, ad copy, case studies, press releases, About pages, FAQs, essays and explainers.
- **`human.json`**: 37 genuine human texts, 107-483 words each, pulled from the Hugging Face datasets-server rows API. Each item records its dataset, config, split and row. Sources:
  - Yelp reviews
  - Amazon reviews
  - IMDB reviews
  - CNN/DailyMail news (2007-2015)
  - Reddit (webis/tldr-17)
  - 2002-2004 blogs
  - Wikipedia
  - Amazon press releases (1996-2015)

  Rebuild it with `python3 tests/eval/fetch_human_corpus.py`, which is deterministic.
