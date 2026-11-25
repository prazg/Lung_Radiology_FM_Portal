"""Configuration loader and filesystem sandbox guard for the Lung Radiology FM Portal server."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

try:
    import yaml  # type: ignore
except ImportError:  # pragma: no cover
    yaml = None

REPO_ROOT = Path(__file__).resolve().parent.parent
MODELS_JSON_PATH = REPO_ROOT / "docs" / "models.json"


@dataclass
class PortalConfig:
    host: str = "127.0.0.1"
    port: int = 8000
    portal_key: str = ""
    mock_mode: bool = False
    cors_origins: List[str] = field(
        default_factory=lambda: [
            "https://prazg.github.io",
            "http://127.0.0.1:5500",
            "http://localhost:5500",
            "http://127.0.0.1:8080",
            "http://localhost:8080",
        ]
    )
    allowed_scan_roots: List[str] = field(default_factory=lambda: ["./sample_scans"])
    work_dir: str = "./work_artifacts"
    hf_cache_dir: str = ""


def load_config(config_path: str | Path | None = None) -> PortalConfig:
    cfg = PortalConfig()
    path = Path(config_path) if config_path else Path(__file__).resolve().parent / "config.yaml"

    if path.exists() and yaml is not None:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        for k in ("host", "port", "portal_key", "mock_mode", "cors_origins", "allowed_scan_roots", "work_dir", "hf_cache_dir"):
            if k in raw and raw[k] is not None:
                setattr(cfg, k, raw[k])

    # Environment overrides
    if os.getenv("PORTAL_MOCK", "").lower() in ("1", "true", "yes"):
        cfg.mock_mode = True
    if os.getenv("PORTAL_KEY"):
        cfg.portal_key = os.environ["PORTAL_KEY"]
    if os.getenv("PORTAL_HOST"):
        cfg.host = os.environ["PORTAL_HOST"]
    if os.getenv("PORTAL_PORT"):
        cfg.port = int(os.environ["PORTAL_PORT"])
    if os.getenv("HF_HOME"):
        cfg.hf_cache_dir = os.environ["HF_HOME"]

    return cfg


def is_path_allowed(candidate: str | Path, allowed_roots: List[str]) -> bool:
    """Verify candidate resolves inside at least one configured allowed scan root."""
    try:
        resolved = Path(candidate).resolve()
    except OSError:
        return False
    for root in allowed_roots:
        try:
            root_resolved = Path(root).resolve()
            resolved.relative_to(root_resolved)
            return True
        except ValueError:
            continue
    return False
