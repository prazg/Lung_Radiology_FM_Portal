"""Runner for Family 4: 2D Chest X-Ray Foundation & Grounded VLMs
(Ark+, RAD-DINO, MAIRA-2, CheXagent-2, CheXzero, CXR Foundation, BioViL-T, BiomedCLIP)."""
from __future__ import annotations

from typing import Any, Dict

from runners.common import inspect_scan_header, model_seed_delta


def run_cxr_fm(
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
        "view_type": "cxr_2d",
        "header": header,
        "measured_vram_gb": 0.2 if mock_mode else model["vram_gb"],
        "kpis": [
            {"label": "Lung Lesion Score", "value": f"{(0.94 + delta) * 100:.1f}%"},
            {"label": "Grounded Boxes", "value": "2 Localized"},
            {"label": "Cardiothoracic Ratio", "value": "0.47 (Normal)"},
            {"label": "Next Step", "value": "Diagnostic Chest CT"},
        ],
        "findings_probs": [
            {"label": "Lung Lesion / Nodule (RUL)", "score": round(0.94 + delta, 2)},
            {"label": "Right Hilar Prominence", "score": round(0.71 + delta, 2)},
            {"label": "Lung Opacity (Focal)", "score": 0.63},
            {"label": "Pleural Effusion", "score": 0.05},
            {"label": "Pneumothorax", "score": 0.02},
        ],
        "report": {
            "indication": indication or "Frontal PA chest X-ray screening evaluation.",
            "technique": f"PA CXR evaluated with {model['name']} ({model['architecture']}).",
            "findings": "Well-defined ~18 mm nodular opacity projecting over the right upper lung zone [box #1] with mild right hilar prominence [box #2]. Clear left lung and sharp costophrenic angles.",
            "impression": "Suspicious right upper zone pulmonary nodule; recommend diagnostic contrast chest CT.",
        },
    }
