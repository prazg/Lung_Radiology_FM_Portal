"""Family runner dispatch for all 33 open-weight Lung & Thoracic Radiology FMs."""
from __future__ import annotations

from typing import Any, Dict

from runners.ct_vlm import run_ct_vlm
from runners.cxr_fm import run_cxr_fm
from runners.risk_enc import run_risk_enc
from runners.seg3d import run_seg3d
from runners.synth import run_synth

FAMILY_DISPATCH = {
    "risk_enc": run_risk_enc,
    "ct_vlm": run_ct_vlm,
    "seg3d": run_seg3d,
    "cxr_fm": run_cxr_fm,
    "synth": run_synth,
}


def dispatch_runner(
    model: Dict[str, Any],
    task: str,
    scan_path: str | None = None,
    scan_name: str = "demo_thorax_ldct.nii.gz",
    indication: str = "",
    guideline: str = "lungrads",
    roi_prompt: str = "",
    hf_token: str = "",
    mock_mode: bool = False,
) -> Dict[str, Any]:
    family = model["family"]
    handler = FAMILY_DISPATCH.get(family)
    if handler is None:
        raise ValueError(f"Unsupported model family: {family}")
    return handler(
        model=model,
        task=task,
        scan_path=scan_path,
        scan_name=scan_name,
        indication=indication,
        guideline=guideline,
        roi_prompt=roi_prompt,
        hf_token=hf_token,
        mock_mode=mock_mode,
    )
