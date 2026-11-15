#!/usr/bin/env python3
"""Real, open-source AI-text detectors, run locally on CPU, for evaluating Inkling.

We cannot call GPTZero / ZeroGPT / Originality (paid, closed). Instead we run the
open models those products grew out of, plus modern 2024-2025 classifiers:

  gptzero-style      GPT-2-medium perplexity + burstiness (std/mean of per-sentence
                     perplexity): the method GPTZero was originally built on. Turned
                     into ai_prob with a 2-feature logistic rule fitted on the corpus
                     (see calibration.json and `--calibrate`).
  binoculars         Zero-shot Binoculars score (Hans et al., ICML 2024): log-ppl(performer) /
                     cross-ppl(observer, performer), low = AI, with the small base/instruct
                     pair SmolLM2-360M / SmolLM2-360M-Instruct. Threshold fitted on the corpus.
  binoculars-mini    Same formula with observer gpt2 / performer gpt2-medium.
  chatgpt-roberta    Hello-SimpleAI/chatgpt-detector-roberta (HC3; ChatGPT vs human).
  openai-roberta     openai-community/roberta-base-openai-detector (GPT-2 output detector).
  desklib            desklib/ai-text-detector-v1.01 (DeBERTa-v3-large, RAID leaderboard).
  fakespot           fakespot-ai/roberta-base-ai-text-detection-v1 (Mozilla/Fakespot, 2025).
  superannotate      SuperAnnotate/ai-detector (RoBERTa-large, RAID-trained, 2024).
  mage               yaful/MAGE (Longformer; "MAGE: Machine-generated text detection in
                     the wild", ACL 2024).

Every detector is loaded once. Long texts are split into sentence-aligned chunks that
fit the model and scored as the token-weighted mean of chunk probabilities.

CLI
  python detectors.py --in texts.json --out scores.json [--only a,b] [--all]
      input : [{id, group, text}, ...]
      output: {"meta": {...per-detector timing/threshold...},
               "scores": {id: {detector: {ai_prob, flagged, extra}}}}
  python detectors.py --sanity [--only a,b]     # raw AI corpus vs human corpus gate
                                                # (also writes tests/eval/sanity_gate.json)
  python detectors.py --calibrate               # refit gptzero-style / binoculars rules
  python detectors.py --list                    # registered detectors, kept vs dropped

Licenses (all used for internal evaluation only, never shipped in the product):
  gpt2/gpt2-medium MIT; SmolLM2 Apache-2.0; openai detector MIT; desklib MIT; MAGE Apache-2.0;
  fakespot Apache-2.0; SuperAnnotate SAIPL (AGPL-style copyleft: fine for internal
  eval, do NOT serve it to users without reading the license); Hello-SimpleAI: see card.
  TrustSafeAI/RADAR was considered but is non-commercial-only, so it is not included.
"""
import argparse
import json
import math
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
CORPUS = os.path.normpath(os.path.join(HERE, "..", "corpus"))
OUT_DIR = os.path.join(HERE, "out")
CALIB_PATH = os.path.join(HERE, "calibration.json")

# Detectors that passed the sanity gate on tests/corpus (raw AI flagged >= 70% AND human
# passed >= 70%; corpus-fitted rules judged on leave-one-out numbers). Numbers: sanity_gate.json.
DEFAULT_DETECTORS = ["gptzero-style", "binoculars", "desklib", "fakespot"]
# Registered but failed the gate -> excluded from defaults (still runnable with --only / --all).
DROPPED = {
    "chatgpt-roberta": "misses modern assistant marketing copy: flags ~19% of raw AI (HC3/ChatGPT-3.5 Q&A domain)",
    "openai-roberta": "GPT-2-era detector: flags ~9% of raw AI",
    "superannotate": "catches 100% of raw AI but also flags ~35% of genuine human text (news, press releases)",
    "mage": "catches 100% of raw AI but also flags ~32% of genuine human text (press releases, wiki)",
    "binoculars-mini": "GPT-2 pair too weak: ~62% of raw AI flagged (LOO); the SmolLM2 pair is used instead",
}

GATE = 0.70

_torch = None


def torch():
    global _torch
    if _torch is None:
        import torch as t
        t.set_num_threads(max(1, os.cpu_count() or 1))
        t.set_grad_enabled(False)
        _torch = t
    return _torch


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ----------------------------------------------------------------------------- text utils

_SENT_END = re.compile(r"(?<=[.!?…])[\"'”’)\]]*\s+|\n+")


def sentence_spans(text):
    """(start, end) char spans of sentences / lines (headings and bullets are their own unit)."""
    spans, start = [], 0
    for m in _SENT_END.finditer(text):
        end = m.start()
        if text[start:end].strip():
            spans.append((start, end))
        start = m.end()
    if text[start:].strip():
        spans.append((start, len(text)))
    return spans


def chunk_text(tokenizer, text, max_tokens):
    """Split text into sentence-aligned substrings of <= max_tokens tokens each.

    Returns [(substring, n_tokens)]. A single over-long sentence is hard-split on tokens.
    """
    enc = tokenizer(text, add_special_tokens=False, return_offsets_mapping=True)
    offs = enc["offset_mapping"]
    n = len(offs)
    if n <= max_tokens:
        return [(text, max(n, 1))]
    # sentence-end char positions -> candidate cut points (token index after which we may cut)
    ends = {e for _, e in sentence_spans(text)}
    chunks, i = [], 0
    while i < n:
        j = min(n, i + max_tokens)
        if j < n:
            cut = None
            for k in range(j - 1, i + max_tokens // 2, -1):
                if offs[k][1] in ends:
                    cut = k + 1
                    break
            j = cut or j
        s, e = offs[i][0], offs[j - 1][1]
        piece = text[s:e].strip()
        if piece:
            chunks.append((piece, j - i))
        i = j
    return chunks


def md_plain(t):
    """Fakespot's documented clean_text() (re-implemented, not executed from the repo)."""
    t = re.sub(r"```.*?```", "", t, flags=re.S)
    t = re.sub(r"`[^`]*`", "", t)
    t = re.sub(r"!\[.*?\]\(.*?\)", "", t)
    t = re.sub(r"\[([^\]]+)\]\(.*?\)", r"\1", t)
    t = re.sub(r"(\*\*|__)(.*?)\1", r"\2", t)
    t = re.sub(r"(\*|_)(.*?)\1", r"\2", t)
    t = re.sub(r"#+ ", "", t)
    t = re.sub(r"^>.*$", "", t, flags=re.M)
    t = re.sub(r"^(\s*[-*+]|\d+\.)\s+", "", t, flags=re.M)
    t = re.sub(r"^\s*[-*_]{3,}\s*$", "", t, flags=re.M)
    t = re.sub(r"\|.*?\|", "", t)
    t = re.sub(r"<.*?>", "", t)
    import html
    t = html.unescape(t)
    for a in ("\n", "\t", "\r"):
        t = t.replace(a, " ")
    t = t.replace(" ,", ",")
    return re.sub(" +", " ", t).strip()


def sigmoid(x):
    if x >= 0:
        return 1.0 / (1.0 + math.exp(-x))
    z = math.exp(x)
    return z / (1.0 + z)


# ----------------------------------------------------------------------------- base classes

class Detector:
    name = "?"
    model_id = "?"
    threshold = 0.5
    notes = ""

    def load(self):
        raise NotImplementedError

    def score(self, texts):
        """-> list of (ai_prob: float, extra: dict)"""
        raise NotImplementedError

    def describe(self):
        return {"model": self.model_id, "threshold": self.threshold, "notes": self.notes}


class HFClassifier(Detector):
    """Sequence classifier with chunking + token-weighted mean of chunk probabilities."""
    max_tokens = 510
    batch_size = 8
    preprocess = staticmethod(lambda t: t)

    def build(self):
        from transformers import AutoModelForSequenceClassification
        return AutoModelForSequenceClassification.from_pretrained(self.model_id)

    def load(self):
        from transformers import AutoTokenizer
        self.tok = AutoTokenizer.from_pretrained(self.model_id)
        self.model = self.build().eval()

    def logits_to_prob(self, logits):
        """logits: tensor [B, C] -> list of AI probabilities."""
        raise NotImplementedError

    def forward(self, enc):
        return self.model(**enc).logits

    def score(self, texts):
        T = torch()
        pieces = []  # (text_idx, chunk_text, n_tokens)
        for i, t in enumerate(texts):
            t = self.preprocess(t) or " "
            for c, n in chunk_text(self.tok, t, self.max_tokens):
                pieces.append((i, c, n))
        order = sorted(range(len(pieces)), key=lambda k: len(pieces[k][1]))
        probs = [0.0] * len(pieces)
        for b in range(0, len(order), self.batch_size):
            idx = order[b:b + self.batch_size]
            enc = self.tok([pieces[k][1] for k in idx], padding=True, truncation=True,
                           max_length=self.max_tokens + 2, return_tensors="pt")
            enc.pop("token_type_ids", None)  # single-segment input; RoBERTa/DeBERTa default to zeros
            with T.inference_mode():
                ps = self.logits_to_prob(self.forward(enc))
            for k, p in zip(idx, ps):
                probs[k] = float(p)
        out = []
        for i in range(len(texts)):
            ws = [(probs[k], pieces[k][2]) for k in range(len(pieces)) if pieces[k][0] == i]
            tot = sum(n for _, n in ws) or 1
            p = sum(pr * n for pr, n in ws) / tot
            out.append((p, {"chunks": len(ws), "chunk_probs": [round(pr, 4) for pr, _ in ws]}))
        return out


class SoftmaxClassifier(HFClassifier):
    ai_index = 1

    def logits_to_prob(self, logits):
        return torch().softmax(logits.float(), dim=-1)[:, self.ai_index].tolist()


class ChatGPTRoberta(SoftmaxClassifier):
    name = "chatgpt-roberta"
    model_id = "Hello-SimpleAI/chatgpt-detector-roberta"
    ai_index = 1  # id2label {0: Human, 1: ChatGPT}
    notes = "HC3-trained RoBERTa-base; ChatGPT(3.5) vs human answers."


class OpenAIRoberta(SoftmaxClassifier):
    name = "openai-roberta"
    model_id = "openai-community/roberta-base-openai-detector"
    ai_index = 0  # id2label {0: Fake, 1: Real}
    notes = "OpenAI's 2019 GPT-2 output detector (RoBERTa-base)."


class Fakespot(SoftmaxClassifier):
    name = "fakespot"
    model_id = "fakespot-ai/roberta-base-ai-text-detection-v1"
    ai_index = 1  # id2label {0: Human, 1: AI}
    preprocess = staticmethod(md_plain)
    notes = "Fakespot/Mozilla RoBERTa-base (2025); markdown stripped per its model card."


class Desklib(HFClassifier):
    name = "desklib"
    model_id = "desklib/ai-text-detector-v1.01"
    max_tokens = 766  # model card uses max_len=768
    batch_size = 4
    notes = "DeBERTa-v3-large + mean pooling + linear head (custom class from the model card); RAID #1 at release."

    def build(self):
        from transformers import AutoConfig, AutoModel
        from huggingface_hub import hf_hub_download
        from safetensors.torch import load_file
        T = torch()
        cfg = AutoConfig.from_pretrained(self.model_id)

        class DesklibAIDetectionModel(T.nn.Module):
            def __init__(self):
                super().__init__()
                self.model = AutoModel.from_config(cfg)
                self.classifier = T.nn.Linear(cfg.hidden_size, 1)

            def forward(self, input_ids, attention_mask=None, **_):
                h = self.model(input_ids, attention_mask=attention_mask)[0]
                m = attention_mask.unsqueeze(-1).expand(h.size()).float()
                pooled = (h * m).sum(1) / m.sum(1).clamp(min=1e-9)
                return self.classifier(pooled)

        model = DesklibAIDetectionModel()
        sd = load_file(hf_hub_download(self.model_id, "model.safetensors"))
        missing, unexpected = model.load_state_dict(sd, strict=False)
        bad = [k for k in missing if "position_ids" not in k]
        if bad or unexpected:
            raise RuntimeError(f"desklib weight mismatch: missing={bad[:5]} unexpected={unexpected[:5]}")
        return model

    def forward(self, enc):
        return self.model(enc["input_ids"], attention_mask=enc["attention_mask"])

    def logits_to_prob(self, logits):
        return torch().sigmoid(logits.float()).view(-1).tolist()


class SuperAnnotate(HFClassifier):
    name = "superannotate"
    model_id = "SuperAnnotate/ai-detector"
    max_tokens = 510
    batch_size = 4
    notes = ("RoBERTa-large + CLS linear head (re-implemented RobertaClassifier, sigmoid of a single "
             "'GENERATED' logit); trained on RAID + 14 LLMs. License SAIPL (copyleft).")

    def build(self):
        from transformers import RobertaConfig, RobertaModel
        from huggingface_hub import hf_hub_download
        from safetensors.torch import load_file
        T = torch()
        # config.json only names the base checkpoint (FacebookAI/roberta-large); these are its dims.
        rc = RobertaConfig(vocab_size=50265, hidden_size=1024, num_hidden_layers=24, num_attention_heads=16,
                           intermediate_size=4096, max_position_embeddings=514, type_vocab_size=1,
                           layer_norm_eps=1e-5, pad_token_id=1, bos_token_id=0, eos_token_id=2)

        class RobertaClassifier(T.nn.Module):
            def __init__(self):
                super().__init__()
                self.roberta = RobertaModel(rc, add_pooling_layer=False)
                self.dropout = T.nn.Dropout(0.1)
                self.dense = T.nn.Linear(rc.hidden_size, 1)

            def forward(self, input_ids, attention_mask=None, **_):
                h = self.roberta(input_ids=input_ids, attention_mask=attention_mask)[0]
                return self.dense(self.dropout(h[:, 0, :]))

        model = RobertaClassifier()
        sd = load_file(hf_hub_download(self.model_id, "model.safetensors"))
        missing, unexpected = model.load_state_dict(sd, strict=False)
        bad = [k for k in missing if "position_ids" not in k]
        if bad or unexpected:
            raise RuntimeError(f"superannotate weight mismatch: missing={bad[:5]} unexpected={unexpected[:5]}")
        return model

    preprocess = staticmethod(lambda t: re.sub(r"[ \t]+", " ", t).strip())

    def forward(self, enc):
        return self.model(enc["input_ids"], attention_mask=enc["attention_mask"])

    def logits_to_prob(self, logits):
        return torch().sigmoid(logits.float()).view(-1).tolist()


class Mage(HFClassifier):
    name = "mage"
    model_id = "yaful/MAGE"
    max_tokens = 4094
    batch_size = 2
    # Official MAGE deployment rule: machine-generated iff logit[0] > 3.0858 (label 0 = machine).
    TH = 3.08583984375
    notes = "Longformer; ai_prob = sigmoid(logit_machine - 3.0858) so 0.5 == MAGE's published decision threshold."

    def logits_to_prob(self, logits):
        return [sigmoid(float(l0) - self.TH) for l0 in logits[:, 0].tolist()]


# ----------------------------------------------------------------------------- LM-based

_LM = {}
_LM_MEMO = {}

GPT2_MEDIUM = "openai-community/gpt2-medium"
GPT2 = "openai-community/gpt2"


def get_lm(name):
    if name not in _LM:
        from transformers import AutoModelForCausalLM, AutoTokenizer
        tok = AutoTokenizer.from_pretrained(name)
        model = AutoModelForCausalLM.from_pretrained(name, dtype=torch().float32).eval()
        _LM[name] = (tok, model)
    return _LM[name]


def lm_stats(text, performer=GPT2_MEDIUM, observer=None):
    """Per-token NLL under `performer` (+ cross-entropy of observer probs vs performer log-probs).

    The observer (base model) tokenizer and its BOS token are used, so the first real token is
    scored too. Texts longer than 1024 tokens are processed in windows that carry 256 tokens of
    context over. Memoized per (text, performer, observer).
    """
    key = (text, performer, observer)
    if key in _LM_MEMO:
        return _LM_MEMO[key]
    T = torch()
    ptok, perf = get_lm(performer)
    otok, obs = get_lm(observer) if observer else (ptok, None)
    enc = otok(text, return_offsets_mapping=True, add_special_tokens=False)
    ids, offs = enc["input_ids"], enc["offset_mapping"]
    res = {"nll": [], "xent": [], "offs": offs}
    if ids:
        bos = next(b for b in (otok.bos_token_id, ptok.bos_token_id, otok.eos_token_id) if b is not None)
        full = [bos] + ids
        W, CTX = 1024, 256
        pos = 1  # next target index in `full`
        while pos < len(full):
            start = max(0, pos - CTX) if pos > 1 else 0
            end = min(len(full), start + W)
            window = T.tensor([full[start:end]])
            lp = T.log_softmax(perf(window).logits[0].float(), dim=-1)[:-1]  # predicts full[start+1:end]
            tgt = T.tensor(full[start + 1:end])
            a, b = pos - start - 1, end - start - 1  # rows for targets pos..end-1
            res["nll"].extend((-lp.gather(1, tgt.view(-1, 1)).view(-1))[a:b].tolist())
            if obs is not None:
                po = T.softmax(obs(window).logits[0].float(), dim=-1)[:-1]
                res["xent"].extend((-(po * lp).sum(-1))[a:b].tolist())
            pos = end
    _LM_MEMO[key] = res
    return res


def ppl_features(text):
    st = lm_stats(text)
    nll, offs = st["nll"], st["offs"]
    if not nll:
        return None
    doc_ppl = math.exp(sum(nll) / len(nll))
    sent_ppl, all_ppl = [], []
    spans = sentence_spans(text)
    j = 0
    for s, e in spans:
        # a token belongs to the sentence containing its last character (GPT-2 tokens carry
        # their leading space, so their start offset sits before the sentence start)
        vals = []
        while j < len(offs) and offs[j][1] <= e:
            if offs[j][1] > s:
                vals.append(nll[j])
            j += 1
        if len(vals) >= 4:
            p = math.exp(sum(vals) / len(vals))
            all_ppl.append(p)
            if is_prose(text[s:e]):
                sent_ppl.append(p)
    return {"ppl": doc_ppl, "burstiness": _cv(sent_ppl), "burstiness_all_lines": _cv(all_ppl),
            "max_sent_ppl": max(sent_ppl) if sent_ppl else doc_ppl,
            "n_sent": len(sent_ppl), "n_tok": len(nll)}


def _cv(xs):
    if len(xs) < 2:
        return 0.0
    m = sum(xs) / len(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1)) / m


_MD_LINE = re.compile(r"^\s*(#|[-*+•>]|\d+[.)/]\s|\d\uFE0F?\u20E3|[\u2600-\u27BF\U0001F300-\U0001FAFF])")


def is_prose(seg):
    """A real sentence: >= 4 words, ends in . ! ? and is not a markdown heading / bullet / numbered item.

    Headings, bullets and 2-word fragments have wildly varying GPT-2 perplexity (brand names,
    emoji) which would make *formatting* look like "burstiness". GPTZero's notion of burstiness
    is about variation between sentences of prose, so only prose sentences count.
    """
    seg = seg.strip()
    return (len(seg.split()) >= 4 and not _MD_LINE.match(seg)
            and re.search(r"[.!?…][\"'”’)\]]*$", seg) is not None)


def load_calibration():
    try:
        with open(CALIB_PATH) as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


class GPTZeroStyle(Detector):
    name = "gptzero-style"
    model_id = GPT2_MEDIUM
    notes = ("GPT-2-medium document perplexity + burstiness (std/mean of per-sentence perplexity). "
             "ai_prob = sigmoid(w1*z(log ppl) + w2*z(burstiness) + b), fitted by logistic regression on "
             "corpus raw-AI vs human (calibration.json). Low perplexity + low burstiness => AI.")

    def load(self):
        get_lm(GPT2_MEDIUM)
        self.cal = load_calibration().get(self.name)

    @staticmethod
    def features(f):
        return [math.log(f["ppl"]), f["burstiness"]]

    def score(self, texts):
        out = []
        for t in texts:
            f = ppl_features(t)
            if f is None:
                out.append((0.0, {"empty": True}))
                continue
            p = apply_logistic(self.cal, self.features(f)) if self.cal else float("nan")
            out.append((p, {k: (round(v, 4) if isinstance(v, float) else v) for k, v in f.items()}))
        return out


class Binoculars(Detector):
    """Binoculars (Hans et al., ICML 2024), following the reference implementation:
    B = mean NLL under the performer / mean cross-entropy(observer probs, performer log-probs).
    Low B => AI. ai_prob = sigmoid(w*z(B) + b) with w < 0, fitted on the corpus (calibration.json).
    The paper uses Falcon-7B / Falcon-7B-instruct; we use a small base/instruct pair for CPU."""
    name = "binoculars"
    observer = "HuggingFaceTB/SmolLM2-360M"
    performer = "HuggingFaceTB/SmolLM2-360M-Instruct"
    notes = ("Zero-shot Binoculars score with SmolLM2-360M (observer, base) / SmolLM2-360M-Instruct "
             "(performer). Threshold fitted on the corpus (calibration.json). Apache-2.0.")

    @property
    def model_id(self):
        return f"{self.observer} / {self.performer}"

    def load(self):
        get_lm(self.performer)
        get_lm(self.observer)
        self.cal = load_calibration().get(self.name)

    def raw(self, text):
        st = lm_stats(text, self.performer, self.observer)
        if not st["nll"]:
            return None
        return (sum(st["nll"]) / len(st["nll"])) / (sum(st["xent"]) / len(st["xent"]))

    def score(self, texts):
        out = []
        for t in texts:
            b = self.raw(t)
            if b is None:
                out.append((0.0, {"empty": True}))
                continue
            p = apply_logistic(self.cal, [b]) if self.cal else float("nan")
            out.append((p, {"binoculars": round(b, 4)}))
        return out


class BinocularsMini(Binoculars):
    name = "binoculars-mini"
    observer = GPT2
    performer = GPT2_MEDIUM
    notes = "Binoculars with the GPT-2 pair (gpt2 observer / gpt2-medium performer, shared tokenizer)."


REGISTRY = {c.name: c for c in [GPTZeroStyle, Binoculars, BinocularsMini, ChatGPTRoberta, OpenAIRoberta,
                                Desklib, Fakespot, SuperAnnotate, Mage]}


# ----------------------------------------------------------------------------- calibration

def fit_logistic(X, y, l2=1e-2, iters=50):
    """Tiny L2 logistic regression (Newton). Standardizes features. Returns dict."""
    import numpy as np
    X = np.asarray(X, float)
    y = np.asarray(y, float)
    mean, std = X.mean(0), X.std(0) + 1e-9
    Z = (X - mean) / std
    A = np.hstack([Z, np.ones((len(Z), 1))])
    w = np.zeros(A.shape[1])
    R = np.eye(A.shape[1]) * l2
    R[-1, -1] = 0
    for _ in range(iters):
        p = 1 / (1 + np.exp(-A @ w))
        g = A.T @ (p - y) + R @ w
        H = A.T @ (A * (p * (1 - p))[:, None]) + R
        step = np.linalg.solve(H, g)
        w -= step
        if np.abs(step).max() < 1e-8:
            break
    return {"mean": mean.tolist(), "std": std.tolist(), "w": w[:-1].tolist(), "b": float(w[-1])}


def apply_logistic(c, x):
    z = [(xi - m) / s for xi, m, s in zip(x, c["mean"], c["std"])]
    return sigmoid(sum(w * zi for w, zi in zip(c["w"], z)) + c["b"])


def fit_gptzero(X, y):
    """GPTZero premise: LOW perplexity and LOW burstiness => AI, so both weights must be <= 0.

    If the unconstrained fit gives burstiness a positive (AI-ward) weight, that is noise relative
    to the method (it would *reward* monotone text), so we refit on perplexity alone and pin the
    burstiness weight to 0. Same for perplexity (never happens in practice).
    """
    c = fit_logistic(X, y)
    if c["w"][1] > 0:
        c1 = fit_logistic([[x[0]] for x in X], y)
        c = {"mean": [c1["mean"][0], c["mean"][1]], "std": [c1["std"][0], c["std"][1]],
             "w": [c1["w"][0], 0.0], "b": c1["b"], "burstiness_weight_pinned": True}
    return c


def loo_accuracy(X, y, fit=fit_logistic):
    """Leave-one-out predictions so the sanity gate for fitted detectors is out-of-sample."""
    preds = []
    for i in range(len(X)):
        c = fit([x for j, x in enumerate(X) if j != i], [v for j, v in enumerate(y) if j != i])
        preds.append(apply_logistic(c, X[i]))
    return preds


def load_corpus():
    with open(os.path.join(CORPUS, "ai.json")) as f:
        ai = json.load(f)
    with open(os.path.join(CORPUS, "human.json")) as f:
        hu = json.load(f)
    items = [{"id": x["id"], "group": "ai", "text": x["text"]} for x in ai]
    items += [{"id": x["id"], "group": "human", "text": x["text"]} for x in hu]
    return items


def _gate_rates(pred, y):
    ai_hit = sum(1 for p, v in zip(pred, y) if v == 1 and p >= 0.5) / sum(y)
    hu_ok = sum(1 for p, v in zip(pred, y) if v == 0 and p < 0.5) / (len(y) - sum(y))
    return {"ai_flagged": round(ai_hit, 4), "human_passed": round(hu_ok, 4)}


def calibrate():
    """Fit the corpus-calibrated rules. LOO-CV rates are stored for an honest sanity gate."""
    items = load_corpus()
    y = [1 if it["group"] == "ai" else 0 for it in items]
    t0 = time.time()
    feats = [ppl_features(it["text"]) for it in items]
    fits = {"gptzero-style": ([GPTZeroStyle.features(f) for f in feats], fit_gptzero,
                              ["log(ppl_gpt2_medium)", "burstiness=std/mean(prose sentence ppl)"])}
    for cls in (Binoculars, BinocularsMini):
        d = cls()
        fits[cls.name] = ([[d.raw(it["text"])] for it in items], fit_logistic, [f"binoculars_score ({d.model_id})"])
    cal = {
        "_doc": ("Logistic rules fitted on tests/corpus (label 1 = raw AI, 0 = human). Features are "
                 "standardized with mean/std; ai_prob = sigmoid(sum(w*z) + b). loo = leave-one-out "
                 "gate rates. Regenerate with: python tests/eval/detectors.py --calibrate"),
        "fit_on": {"ai": sum(y), "human": len(y) - sum(y)},
        "created": time.strftime("%Y-%m-%d"),
    }
    for name, (X, fit, fnames) in fits.items():
        c = fit(X, y)
        c["features"] = fnames
        c["in_sample"] = _gate_rates([apply_logistic(c, x) for x in X], y)
        c["loo"] = _gate_rates(loo_accuracy(X, y, fit), y)
        for g in (1, 0):
            col = sorted(x[0] if len(x) == 1 else x for x, v in zip(X, y) if v == g)
            c["median_" + ("ai" if g else "human")] = col[len(col) // 2]
        cal[name] = c
        log(f"[calibrate] {name}: w={['%.3f' % w for w in c['w']]} b={c['b']:.3f} in-sample={c['in_sample']} LOO={c['loo']}")
    for g in (1, 0):
        sel = [f for f, v in zip(feats, y) if v == g]
        log(f"[calibrate] {'AI   ' if g else 'HUMAN'} median gpt2-medium ppl={sorted(f['ppl'] for f in sel)[len(sel)//2]:.1f} "
            f"median burstiness={sorted(f['burstiness'] for f in sel)[len(sel)//2]:.3f}")
    with open(CALIB_PATH, "w") as f:
        json.dump(cal, f, indent=2)
        f.write("\n")
    log(f"[calibrate] wrote {CALIB_PATH} in {time.time() - t0:.1f}s")
    return cal


# ----------------------------------------------------------------------------- runner

def run(items, names):
    meta = {"created": time.strftime("%Y-%m-%dT%H:%M:%S"), "threads": None, "detectors": {}}
    scores = {it["id"]: {} for it in items}
    texts = [it["text"] if isinstance(it.get("text"), str) else "" for it in items]
    for name in names:
        det = REGISTRY[name]()
        info = det.describe()
        try:
            t0 = time.time()
            det.load()
            t1 = time.time()
            res = det.score(texts)
            t2 = time.time()
        except Exception as e:  # keep going: one broken model must not sink the run
            log(f"[{name}] FAILED: {e!r}")
            info["error"] = repr(e)
            meta["detectors"][name] = info
            continue
        info.update(load_s=round(t1 - t0, 2), score_s=round(t2 - t1, 2), n=len(texts),
                    ms_per_text=round(1000 * (t2 - t1) / max(1, len(texts)), 1))
        thr = getattr(det, "threshold", 0.5)
        for it, (p, extra) in zip(items, res):
            ok = isinstance(p, float) and not math.isnan(p)
            scores[it["id"]][name] = {"ai_prob": round(p, 4) if ok else None,
                                      "flagged": bool(ok and p >= thr), "extra": extra}
        meta["detectors"][name] = info
        log(f"[{name}] load {t1 - t0:.1f}s, score {t2 - t1:.1f}s ({info['ms_per_text']} ms/text)")
        # free memory between big models (LM models are shared, keep them)
        del det
    meta["threads"] = torch().get_num_threads()
    meta["torch"] = torch().__version__
    return {"meta": meta, "scores": scores}


def sanity(names, out_path):
    items = load_corpus()
    result = run(items, names)
    groups = {it["id"]: it["group"] for it in items}
    cal = load_calibration()
    table = {}
    log("")
    log(f"{'detector':18s} {'AI flagged':>11s} {'human passed':>13s} {'meanP(ai)':>10s} {'meanP(hu)':>10s} "
        f"{'s/text':>7s}  gate")
    for name in names:
        info = result["meta"]["detectors"].get(name, {})
        if "error" in info:
            table[name] = {"error": info["error"], "pass": False}
            log(f"{name:18s} ERROR {info['error'][:80]}")
            continue
        vals = [(groups[i], s[name]) for i, s in result["scores"].items() if name in s]
        ai = [v for g, v in vals if g == "ai" and v["ai_prob"] is not None]
        hu = [v for g, v in vals if g == "human" and v["ai_prob"] is not None]
        ai_flag = sum(v["flagged"] for v in ai) / max(1, len(ai))
        hu_pass = sum(not v["flagged"] for v in hu) / max(1, len(hu))
        row = {"ai_flagged": round(ai_flag, 4), "human_passed": round(hu_pass, 4),
               "mean_ai_prob_ai": round(sum(v["ai_prob"] for v in ai) / max(1, len(ai)), 4),
               "mean_ai_prob_human": round(sum(v["ai_prob"] for v in hu) / max(1, len(hu)), 4),
               "n_ai": len(ai), "n_human": len(hu),
               "load_s": info.get("load_s"), "score_s": info.get("score_s"),
               "s_per_text": round(info.get("score_s", 0) / max(1, info.get("n", 1)), 3)}
        if name in cal and "loo" in cal[name]:
            row["loo_ai_flagged"] = cal[name]["loo"]["ai_flagged"]
            row["loo_human_passed"] = cal[name]["loo"]["human_passed"]
            row["note"] = "rule fitted on this corpus; in-sample numbers shown, LOO-CV numbers in loo_*"
        g_ai = row.get("loo_ai_flagged", ai_flag)
        g_hu = row.get("loo_human_passed", hu_pass)
        row["pass"] = bool(g_ai >= GATE and g_hu >= GATE)
        table[name] = row
        extra = f" (LOO {g_ai:.0%}/{g_hu:.0%})" if "loo_ai_flagged" in row else ""
        log(f"{name:18s} {ai_flag:>10.0%} {hu_pass:>13.0%} {row['mean_ai_prob_ai']:>10.3f} "
            f"{row['mean_ai_prob_human']:>10.3f} {row['s_per_text']:>7.2f}  "
            f"{'PASS' if row['pass'] else 'FAIL'}{extra}")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump({"gate": GATE, "table": table, "meta": result["meta"], "scores": result["scores"]}, f, indent=1)
    # compact, committed copy of the gate verdicts (run_eval.mjs prints it in report.md)
    gate_path = os.path.join(HERE, "sanity_gate.json")
    try:
        with open(gate_path) as f:
            prev = json.load(f).get("table", {})
    except (FileNotFoundError, ValueError):
        prev = {}
    prev.update(table)
    with open(gate_path, "w") as f:
        json.dump({"gate": GATE, "corpus": {"ai": sum(1 for g in groups.values() if g == "ai"),
                                            "human": sum(1 for g in groups.values() if g == "human")},
                   "created": time.strftime("%Y-%m-%d"), "table": prev}, f, indent=2)
        f.write("\n")
    log(f"\nwrote {out_path} and {gate_path}")
    return table


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--in", dest="inp")
    ap.add_argument("--out")
    ap.add_argument("--only", help="comma-separated detector names")
    ap.add_argument("--all", action="store_true", help="include detectors that failed the sanity gate")
    ap.add_argument("--sanity", action="store_true", help="score raw AI corpus vs human corpus and apply the gate")
    ap.add_argument("--calibrate", action="store_true", help="refit gptzero-style and binoculars-mini rules")
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()

    if a.list:
        for n, c in REGISTRY.items():
            tag = "default" if n in DEFAULT_DETECTORS else f"dropped: {DROPPED.get(n, '')}"
            print(f"{n:18s} {c().model_id}  [{tag}]")
        return
    if a.only:
        names = [n.strip() for n in a.only.split(",") if n.strip()]
        unknown = [n for n in names if n not in REGISTRY]
        if unknown:
            ap.error(f"unknown detector(s): {unknown}; known: {list(REGISTRY)}")
    else:
        names = list(REGISTRY) if (a.all or a.sanity) else list(DEFAULT_DETECTORS)

    if a.calibrate:
        calibrate()
        if not (a.sanity or a.inp):
            return
    if a.sanity:
        sanity(names, a.out or os.path.join(OUT_DIR, "sanity.json"))
        return
    if not a.inp or not a.out:
        ap.error("--in and --out are required (or use --sanity / --calibrate / --list)")
    with open(a.inp) as f:
        items = json.load(f)
    result = run(items, names)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w") as f:
        json.dump(result, f)
    log(f"wrote {a.out}")


if __name__ == "__main__":
    main()
