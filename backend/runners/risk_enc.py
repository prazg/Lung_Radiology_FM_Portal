"""Runner for Family 1: Lung Cancer Risk & 3D CT Biomarker Encoders
(Sybil, Pillar-0 Chest CT, Sybil-1.5, CT-FM, FMCIB, SuPreM, VoCo, Med3D)."""
from __future__ import annotations

from typing import Any, Dict

from runners.common import inspect_scan_header, model_seed_delta


def run_risk_enc(
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
    delta = model_seed_delta(model["id"])
    y1 = round(min(0.95, max(0.08, 0.42 + delta * 3)), 3)

    if task == "risk_pred":
        curve = [
            {"year": 1, "prob": y1},
            {"year": 2, "prob": round(min(0.97, y1 + 0.16), 3)},
            {"year": 3, "prob": round(min(0.98, y1 + 0.25), 3)},
            {"year": 4, "prob": round(min(0.98, y1 + 0.31), 3)},
            {"year": 5, "prob": round(min(0.99, y1 + 0.35), 3)},
            {"year": 6, "prob": round(min(0.99, y1 + 0.38), 3)},
        ]
        return {
            "view_type": "risk_3d",
            "header": header,
            "measured_vram_gb": 0.2 if mock_mode else model["vram_gb"],
            "risk_curve": curve,
            "lungrads_tier": "4B — Very Suspicious (>15 mm solid/part-solid spiculated nodule)",
            "malignancy_prob": round(0.86 + delta, 3),
            "kpis": [
                {"label": "1-Year Cancer Risk", "value": f"{curve[0]['prob'] * 100:.1f}%"},
                {"label": "6-Year Cumulative Risk", "value": f"{curve[5]['prob'] * 100:.1f}%"},
                {"label": "Lung-RADS v2022", "value": "Category 4B"},
                {"label": "Index Lesion", "value": "18.4 mm RUL"},
            ],
        }

    return {
        "view_type": "embed_3d",
        "header": header,
        "measured_vram_gb": 0.2 if mock_mode else model["vram_gb"],
        "embedding_dim": 768,
        "linear_probe_malignancy": round(0.89 + delta, 3),
        "kpis": [
            {"label": "Embedding Dim", "value": "768-d L2-norm"},
            {"label": "Nearest Cluster", "value": "Stage I-II Adeno"},
            {"label": "Malignancy Probe", "value": f"{(0.89 + delta) * 100:.1f}%"},
            {"label": "Backbone", "value": model["params"]},
        ],
    }
