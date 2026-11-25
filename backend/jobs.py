"""Sequential job execution manager with measured runtime & VRAM reporting."""
from __future__ import annotations

import threading
import time
import uuid
from typing import Any, Dict, List

from runners import dispatch_runner


class JobManager:
    def __init__(self, models_by_id: Dict[str, Dict[str, Any]], mock_mode: bool = False) -> None:
        self.models_by_id = models_by_id
        self.mock_mode = mock_mode
        self._lock = threading.Lock()
        self._jobs: Dict[str, Dict[str, Any]] = {}

    def submit_and_run(
        self,
        model_id: str,
        task: str,
        scan_path: str | None = None,
        scan_name: str = "demo_thorax_ldct.nii.gz",
        indication: str = "",
        guideline: str = "lungrads",
        roi_prompt: str = "",
        hf_token: str = "",
    ) -> Dict[str, Any]:
        if model_id not in self.models_by_id:
            raise KeyError(f"Unknown model_id: {model_id}")
        model = self.models_by_id[model_id]
        if task not in model.get("tasks", []):
            raise ValueError(f"Task '{task}' is not supported by model '{model_id}' (supported: {model.get('tasks')})")

        job_id = f"job-{uuid.uuid4().hex[:10]}"
        t0 = time.perf_counter()

        with self._lock:
            result = dispatch_runner(
                model=model,
                task=task,
                scan_path=scan_path,
                scan_name=scan_name,
                indication=indication,
                guideline=guideline,
                roi_prompt=roi_prompt,
                hf_token=hf_token,
                mock_mode=self.mock_mode,
            )

        elapsed = round(time.perf_counter() - t0, 3)
        record = {
            "job_id": job_id,
            "status": "completed",
            "model_id": model_id,
            "model_name": model["name"],
            "family": model["family"],
            "task": task,
            "scan_name": scan_name,
            "mock_mode": self.mock_mode,
            "runtime_sec": elapsed,
            "measured_vram_gb": result.get("measured_vram_gb", model.get("vram_gb", 0)),
            "result": result,
        }
        self._jobs[job_id] = record
        return record

    def get_job(self, job_id: str) -> Dict[str, Any] | None:
        return self._jobs.get(job_id)

    def list_jobs(self) -> List[Dict[str, Any]]:
        return list(reversed(self._jobs.values()))
