#!/usr/bin/env python3
"""Build tests/corpus/human.json from GENUINE human-written public datasets.

Uses only the Python standard library and the public HuggingFace datasets-server
rows API (https://datasets-server.huggingface.co/rows). Every item records the
source dataset, config, split and row index so it can be re-verified.

All sources are pre-2022 (before ChatGPT) except Wikipedia, whose articles are
overwhelmingly human-written and edited over many years.

Usage:
    python3 tests/eval/fetch_human_corpus.py            # writes tests/corpus/human.json
    python3 tests/eval/fetch_human_corpus.py --dry-run  # print stats only

Deterministic: fixed offsets, first N rows that pass the filters are taken.
"""
import argparse
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "corpus", "human.json"))
API = "https://datasets-server.huggingface.co/rows"

MIN_WORDS = 100
MAX_WORDS = 500
TRUNC_TARGET = 420  # long docs (news, wiki, press) are cut at a sentence boundary near this


def fetch_rows(dataset, config, split, offset, length=100):
    q = urllib.parse.urlencode(
        {"dataset": dataset, "config": config, "split": split, "offset": offset, "length": length}
    )
    url = f"{API}?{q}"
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "inkling-eval/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)["rows"]
        except Exception as e:  # network hiccup / 5xx: back off and retry
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"failed to fetch {url}: {last}")


def clean(text):
    text = html.unescape(text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\\n", "\n")
    text = re.sub(r"[ \t ]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def words(text):
    return len(text.split())


def truncate_sentences(text, target=TRUNC_TARGET):
    """Cut text at the last sentence end before `target` words (keeps >= MIN_WORDS)."""
    if words(text) <= target:
        return text
    out, count = [], 0
    for sent in re.split(r"(?:(?<=[.!?])|(?<=[.!?][\"')\]]))\s+", text):
        w = words(sent)
        if count + w > target and count >= MIN_WORDS:
            break
        out.append(sent)
        count += w
    return " ".join(out).strip()


def cnn_clean(t):
    # Drop the "By . Name . PUBLISHED: ..." Daily Mail boilerplate and "(CNN) --" datelines.
    t = re.sub(r"^.*?\(CNN\)\s*(--)?\s*", "", t, count=1, flags=re.S)
    t = re.sub(r"^By \. .*?\. (PUBLISHED|UPDATED):.*?\d{4} \. (\| \. (UPDATED):.*?\d{4} \. )?", "", t)
    t = re.sub(r"\s+\.\s+", ". ", t)
    return t


def reddit_clean(t):
    t = re.sub(r"\[([^\]]*)\]\(\s*\)?", r"\1", t)  # links whose URL was stripped by the dataset
    return t


def blog_clean(t):
    t = re.sub(r"urlLink", "", t)
    return t


def amazon_pr_clean(t):
    # Keep the release body but drop the "About Amazon.com" boilerplate tail and forward-looking-statement legalese.
    t = re.split(r"\bAbout Amazon(\.com)?\b|Forward-Looking Statements", t)[0]
    return t


SOURCES = [
    # name, dataset, config, split, offsets, take, text getter, extra filter, cleaner, truncate?, kind
    dict(kind="yelp-review", dataset="Yelp/yelp_review_full", config="yelp_review_full", split="train",
         offsets=[1000, 5000, 40000, 150000, 400000], take=5, get=lambda r: r["text"]),
    dict(kind="amazon-review", dataset="fancyzhx/amazon_polarity", config="amazon_polarity", split="train",
         offsets=[20000, 120000, 700000, 1900000, 3000000], take=4, get=lambda r: (r["title"].strip().rstrip(".") + ". " + r["content"]) if r.get("title") else r["content"]),
    dict(kind="movie-review", dataset="stanfordnlp/imdb", config="plain_text", split="train",
         offsets=[3000, 11000, 19000], take=3, get=lambda r: r["text"].replace("<br /><br />", "\n\n").replace("<br />", " ")),
    dict(kind="news", dataset="abisee/cnn_dailymail", config="3.0.0", split="train",
         offsets=[2000, 9000, 40000, 120000, 250000], take=5, get=lambda r: r["article"], clean=cnn_clean, truncate=True),
    dict(kind="reddit", dataset="webis/tldr-17", config="default", split="train",
         offsets=[500, 4000, 15000, 90000, 400000, 1500000], take=5, get=lambda r: r["body"], clean=reddit_clean),
    dict(kind="blog", dataset="tasksource/blog_authorship_corpus", config="default", split="train",
         offsets=[300, 2000, 9000, 60000, 200000, 500000], take=5, get=lambda r: r["text"], clean=blog_clean,
         keep=lambda r: True),
    dict(kind="encyclopedia", dataset="wikimedia/wikipedia", config="20231101.en", split="train",
         offsets=[3000, 60000, 400000, 2000000], take=4, get=lambda r: r["text"], truncate=True),
    dict(kind="press-release", dataset="greenpau/amz-press-release", config="default", split="train",
         offsets=[0, 200, 600, 1000, 1500, 2000, 2500], take=6, get=lambda r: r["parsed_body_txt"], clean=amazon_pr_clean, truncate=True,
         keep=lambda r: str(r.get("parsed_year", "9999")).isdigit() and int(r["parsed_year"]) <= 2019),
]


# Keep the corpus workplace-appropriate (it is shown in marketing reports).
BLOCK = re.compile(r"\b(sex|sexual|virgin|porn|rape|nsfw|fuck\w*|abortion)\b", re.I)


def looks_ok(text):
    if not (MIN_WORDS <= words(text) <= MAX_WORDS):
        return False
    if BLOCK.search(text):
        return False
    letters = sum(c.isalpha() for c in text)
    if letters < 0.6 * len(text):  # tables, code, lists of numbers
        return False
    if text.count("http") > 3:
        return False
    return True


def build():
    items = []
    for src in SOURCES:
        got = 0
        # Spread picks across offsets so one source is not five reviews of the same business/book.
        per_offset = max(1, -(-src["take"] // len(src["offsets"])))
        for off in src["offsets"]:
            if got >= src["take"]:
                break
            rows = fetch_rows(src["dataset"], src["config"], src["split"], off)
            here = 0
            for row in rows:
                if got >= src["take"] or here >= per_offset:
                    break
                r = row["row"]
                if not src.get("keep", lambda _r: True)(r):
                    continue
                raw = src["get"](r) or ""
                t = clean(src.get("clean", lambda x: x)(raw))
                if src.get("truncate"):
                    t = truncate_sentences(t)
                if not looks_ok(t):
                    continue
                got += 1
                here += 1
                items.append({
                    "id": f"human-{src['kind']}-{got:02d}",
                    "kind": src["kind"],
                    "text": t,
                    "source": {
                        "dataset": src["dataset"], "config": src["config"], "split": src["split"],
                        "row": row["row_idx"],
                        "api": f"{API}?dataset={src['dataset']}&config={src['config']}&split={src['split']}&offset={row['row_idx']}&length=1",
                    },
                    "words": words(t),
                })
                if src["kind"] == "press-release":
                    items[-1]["source"]["year"] = r.get("parsed_year")
                if src["kind"] == "blog":
                    items[-1]["source"]["date"] = r.get("date")
        print(f"{src['dataset']:40s} {got}/{src['take']}", file=sys.stderr)
    return items


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args()
    items = build()
    print(f"total {len(items)} items, words min={min(i['words'] for i in items)} "
          f"max={max(i['words'] for i in items)}", file=sys.stderr)
    if not a.dry_run:
        os.makedirs(os.path.dirname(a.out), exist_ok=True)
        with open(a.out, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"wrote {a.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
