"""Shared NIfTI / DICOM / image metadata inspection and deterministic seeding utilities."""
from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any, Dict


def model_seed_delta(model_id: str) -> float:
    digest = hashlib.sha256(model_id.encode("utf-8")).digest()
    return ((digest[0] % 11) - 5) * 0.004


def inspect_scan_header(scan_path: str | None) -> Dict[str, Any]:
    """Read lightweight shape/spacing metadata from NIfTI or image files when present."""
    if not scan_path or not Path(scan_path).exists():
        return {"source": "synthetic_phantom", "shape": [96, 96, 96], "spacing_mm": [3.2, 3.2, 3.2]}

    p = Path(scan_path)
    suffix = "".join(p.suffixes).lower()
    if suffix.endswith(".nii") or suffix.endswith(".nii.gz"):
        try:
            import nibabel as nib  # type: ignore

            img = nib.load(str(p))
            zooms = [round(float(z), 2) for z in img.header.get_zooms()[:3]]
            return {"source": "nifti", "shape": list(img.shape), "spacing_mm": zooms}
        except Exception as exc:
            return {"source": "nifti_fallback", "note": str(exc)}
    return {"source": "file", "filename": p.name, "bytes": p.stat().st_size}
