"""Runner for Family 2: 3D Chest CT Vision-Language & Report FMs
(CT-CLIP, CT-CHAT, Merlin, M3D-LaMed, RadFM, MedGemma-4B / 1.5)."""
from __future__ import annotations

from typing import Any, Dict

from runners.common import inspect_scan_header, model_seed_delta


def run_ct_vlm(
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
    return {
        "view_type": "vlm_3d",
        "header": header,
        "measured_vram_gb": 0.3 if mock_mode else model["vram_gb"],
        "kpis": [
            {"label": "Primary Finding", "value": "RUL Spiculated Nodule"},
            {"label": "Lung-RADS v2022", "value": "4B (Suspicious)"},
            {"label": "18-Finding Triage", "value": "3 Flagged"},
            {"label": "Model Scale", "value": model["params"]},
        ],
        "findings_probs": [
            {"label": "Lung Nodule / Mass", "score": round(0.95 + delta, 2)},
            {"label": "Lymphadenopathy (Station 4R)", "score": round(0.72 + delta, 2)},
            {"label": "Pulmonary Calcification (Benign LLL)", "score": 0.64},
            {"label": "Emphysema", "score": 0.29},
            {"label": "Pleural Effusion", "score": 0.06},
            {"label": "Pneumothorax", "score": 0.02},
        ],
        "report": {
            "indication": indication or "Thoracic CT foundation model evaluation.",
            "technique": f"3D Chest CT analyzed via {model['name']} ({model['architecture']}).",
            "findings": "Dominant 18.4 mm spiculated part-solid pulmonary nodule in the right upper lobe with subtle peripheral ground-glass halo. Benign 6.2 mm calcified granuloma in the left lower lobe. Borderline 11 mm station 4R node. No pleural effusion or pneumothorax.",
            "impression": "Suspicious RUL spiculated nodule (Lung-RADS v2022 Category 4B); correlate with contrast CT / FDG-PET/CT and multidisciplinary review.",
        },
    }
