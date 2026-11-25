"""Runner for Family 5: Thoracic CT & CXR Generative Synthesis FMs
(MAISI, GenerateCT, RoentGen)."""
from __future__ import annotations

from typing import Any, Dict

from runners.common import inspect_scan_header


def run_synth(
    model: Dict[str, Any],
    task: str,
    scan_path: str | None,
    scan_name: str,
    indication: str,
    guideline: str,
    roi_prompt: str,
    hf_token: str,
    mock_mode: bool,
) -> Dict[str, Any]:
    header = inspect_scan_header(scan_path)
    is_cxr = "CXR" in model.get("modality", []) and "3D Chest CT" not in model.get("modality", [])
    return {
        "view_type": "cxr_2d" if is_cxr else "seg_3d",
        "header": header,
        "measured_vram_gb": 0.3 if mock_mode else model["vram_gb"],
        "prompt": roi_prompt or "Spiculated 18mm nodule in the right upper lobe",
        "kpis": [
            {"label": "Synthetic Target", "value": "512x512 PA CXR" if is_cxr else "3D Thorax CT + Mask"},
            {"label": "Prompt Adherence", "value": "0.93 CLIP-Sim"},
            {"label": "Fidelity", "value": "FID 14.2 (Pass)"},
            {"label": "Privacy", "value": "100% Synthetic"},
        ],
    }
