"""Hugging Face weight cache inspection & gated access status helper."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List


def get_hf_cache_root(override: str = "") -> Path:
    if override:
        return Path(override)
    if os.getenv("HUGGINGFACE_HUB_CACHE"):
        return Path(os.environ["HUGGINGFACE_HUB_CACHE"])
    if os.getenv("HF_HOME"):
        return Path(os.environ["HF_HOME"]) / "hub"
    return Path.home() / ".cache" / "huggingface" / "hub"


def is_model_cached(hf_id: str, cache_root: Path) -> bool:
    if not hf_id or "/" not in hf_id:
        return False
    folder = "models--" + hf_id.replace("/", "--")
    target = cache_root / folder
    return target.exists() and any(target.iterdir())


def list_weight_status(models: List[Dict[str, Any]], cache_override: str = "") -> List[Dict[str, Any]]:
    root = get_hf_cache_root(cache_override)
    out = []
    for m in models:
        hf_id = m.get("hf_id", "")
        out.append(
            {
                "id": m["id"],
                "name": m["name"],
                "hf_id": hf_id,
                "gated": bool(m.get("gated", False)),
                "vram_gb": m.get("vram_gb", 0),
                "cached_locally": is_model_cached(hf_id, root),
            }
        )
    return out
