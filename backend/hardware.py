"""Hardware introspection: CUDA / nvidia-smi, Apple MPS, CPU threads, and host RAM."""
from __future__ import annotations

import os
import platform
import shutil
import subprocess
from typing import Any, Dict


def _probe_nvidia_smi() -> Dict[str, Any] | None:
    if not shutil.which("nvidia-smi"):
        return None
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=3,
        ).strip()
        if not out:
            return None
        first = out.splitlines()[0]
        parts = [p.strip() for p in first.split(",")]
        return {
            "backend": "cuda",
            "gpu_name": parts[0],
            "vram_gb": round(float(parts[1]) / 1024.0, 1),
            "gpu_count": len(out.splitlines()),
        }
    except Exception:
        return None


def _probe_torch() -> Dict[str, Any] | None:
    try:
        import torch  # type: ignore

        if torch.cuda.is_available():
            props = torch.cuda.get_device_properties(0)
            return {
                "backend": "cuda",
                "gpu_name": props.name,
                "vram_gb": round(props.total_memory / (1024**3), 1),
                "gpu_count": torch.cuda.device_count(),
            }
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return {
                "backend": "mps",
                "gpu_name": "Apple Silicon (MPS)",
                "vram_gb": 16.0,
                "gpu_count": 1,
            }
    except Exception:
        return None
    return None


def _host_ram_gb() -> float:
    try:
        import psutil  # type: ignore

        return round(psutil.virtual_memory().total / (1024**3), 1)
    except Exception:
        return 16.0


def detect_hardware() -> Dict[str, Any]:
    gpu = _probe_torch() or _probe_nvidia_smi() or {
        "backend": "cpu",
        "gpu_name": f"{platform.processor() or 'CPU'} (no GPU detected)",
        "vram_gb": 0.0,
        "gpu_count": 0,
    }
    return {
        **gpu,
        "cpu_threads": os.cpu_count() or 4,
        "ram_gb": _host_ram_gb(),
        "os": f"{platform.system()} {platform.release()}",
    }
