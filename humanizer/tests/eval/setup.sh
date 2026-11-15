#!/usr/bin/env bash
# Idempotent setup for the Inkling real-detector evaluation harness.
#   - Python venv OUTSIDE the repo: /home/user/.venvs/eval (override with EVAL_VENV=...)
#   - CPU-only torch + transformers
#   - pre-downloads detector weights into the default HuggingFace cache (~/.cache/huggingface)
# Usage: bash tests/eval/setup.sh            (safe to re-run)
#        SKIP_MODELS=1 bash tests/eval/setup.sh   (packages only)
set -euo pipefail

VENV="${EVAL_VENV:-/home/user/.venvs/eval}"
PY="$VENV/bin/python"

if [ ! -x "$PY" ]; then
  echo "[setup] creating venv at $VENV"
  mkdir -p "$(dirname "$VENV")"
  python3 -m venv "$VENV"
fi

if ! "$PY" -c "import torch" >/dev/null 2>&1; then
  echo "[setup] installing torch (CPU wheel)"
  "$PY" -m pip install -q --upgrade pip
  "$PY" -m pip install -q torch --index-url https://download.pytorch.org/whl/cpu
fi

if ! "$PY" -c "import transformers, sentencepiece, google.protobuf, safetensors, numpy, huggingface_hub" >/dev/null 2>&1; then
  echo "[setup] installing transformers + tokenizer deps"
  "$PY" -m pip install -q "transformers>=4.45" sentencepiece protobuf safetensors numpy huggingface_hub
fi

"$PY" -c "import torch, transformers; print('[setup] torch', torch.__version__, '| transformers', transformers.__version__)"

if [ "${SKIP_MODELS:-0}" != "1" ]; then
  echo "[setup] downloading detector weights to the HF cache (first run: ~7 GB)"
  "$PY" - <<'EOF'
from huggingface_hub import snapshot_download
MODELS = {
    "openai-community/gpt2": ["config.json", "tokenizer*.json", "vocab.json", "merges.txt", "generation_config.json", "model.safetensors"],
    "openai-community/gpt2-medium": ["config.json", "tokenizer*.json", "vocab.json", "merges.txt", "generation_config.json", "model.safetensors"],
    "Hello-SimpleAI/chatgpt-detector-roberta": ["*.json", "*.txt", "pytorch_model.bin"],
    "openai-community/roberta-base-openai-detector": ["*.json", "*.txt", "model.safetensors"],
    "desklib/ai-text-detector-v1.01": ["*.json", "spm.model", "model.safetensors"],
    "fakespot-ai/roberta-base-ai-text-detection-v1": ["*.json", "*.txt", "model.safetensors"],
    "SuperAnnotate/ai-detector": ["*.json", "*.txt", "model.safetensors", "LICENSE"],
    "yaful/MAGE": ["*.json", "*.txt", "pytorch_model.bin"],
    "HuggingFaceTB/SmolLM2-360M": ["*.json", "merges.txt", "vocab.json", "model.safetensors"],
    "HuggingFaceTB/SmolLM2-360M-Instruct": ["*.json", "merges.txt", "vocab.json", "model.safetensors"],
}
for repo, pats in MODELS.items():
    path = snapshot_download(repo, allow_patterns=pats)
    print("  ok", repo)
EOF
fi
echo "[setup] done. Try: $PY tests/eval/detectors.py --list"
