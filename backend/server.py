"""FastAPI local / HPC GPU inference server for the Lung Radiology FM Portal."""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import MODELS_JSON_PATH, PortalConfig, is_path_allowed, load_config
from hardware import detect_hardware
from jobs import JobManager
from weights import list_weight_status


def load_catalogue() -> Dict[str, Any]:
    return json.loads(MODELS_JSON_PATH.read_text(encoding="utf-8"))


def create_app(config: PortalConfig | None = None) -> FastAPI:
    cfg = config or load_config()
    catalogue = load_catalogue()
    models_by_id = {m["id"]: m for m in catalogue["models"]}
    job_manager = JobManager(models_by_id=models_by_id, mock_mode=cfg.mock_mode)

    work_dir = Path(cfg.work_dir).resolve()
    work_dir.mkdir(parents=True, exist_ok=True)

    app = FastAPI(
        title="Lung Radiology FM Portal — Local GPU Server",
        version=catalogue["portal"]["version"],
        description="Privacy-preserving local/HPC inference server for 33 open-weight Lung & Thoracic Radiology foundation models.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def private_network_access_header(request: Request, call_next):
        response = await call_next(request)
        if request.headers.get("access-control-request-private-network") == "true":
            response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response

    def verify_portal_key(x_portal_key: Optional[str] = Header(default=None)):
        if cfg.portal_key and x_portal_key != cfg.portal_key:
            raise HTTPException(status_code=401, detail="Invalid or missing X-Portal-Key")

    @app.get("/api/health")
    def health():
        return {
            "status": "ok",
            "portal": catalogue["portal"]["name"],
            "version": catalogue["portal"]["version"],
            "mock_mode": cfg.mock_mode,
            "model_count": len(catalogue["models"]),
            "dataset_count": len(catalogue["datasets"]),
            "benchmark_count": len(catalogue["benchmarks"]),
        }

    @app.get("/api/hardware", dependencies=[Depends(verify_portal_key)])
    def hardware():
        return detect_hardware()

    @app.get("/api/models", dependencies=[Depends(verify_portal_key)])
    def models():
        return {"models": catalogue["models"], "families": catalogue["families"], "tasks": catalogue["tasks"]}

    @app.get("/api/datasets", dependencies=[Depends(verify_portal_key)])
    def datasets():
        return {"datasets": catalogue["datasets"]}

    @app.get("/api/benchmarks", dependencies=[Depends(verify_portal_key)])
    def benchmarks():
        return {"benchmarks": catalogue["benchmarks"], "ecosystem": catalogue["ecosystem"]}

    @app.get("/api/weights", dependencies=[Depends(verify_portal_key)])
    def weights():
        return {"weights": list_weight_status(catalogue["models"], cfg.hf_cache_dir)}

    @app.get("/api/jobs", dependencies=[Depends(verify_portal_key)])
    def list_jobs():
        return {"jobs": job_manager.list_jobs()}

    @app.get("/api/jobs/{job_id}", dependencies=[Depends(verify_portal_key)])
    def get_job(job_id: str):
        job = job_manager.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return job

    @app.post("/api/jobs", dependencies=[Depends(verify_portal_key)])
    async def submit_job(
        model_id: str = Form(...),
        task: str = Form(...),
        indication: str = Form(""),
        guideline: str = Form("lungrads"),
        roi_prompt: str = Form(""),
        server_scan_path: str = Form(""),
        scan: Optional[UploadFile] = File(default=None),
        x_hf_token: Optional[str] = Header(default=None),
    ):
        resolved_scan_path: str | None = None
        scan_name = "demo_thorax_ldct.nii.gz"

        if server_scan_path:
            if not is_path_allowed(server_scan_path, cfg.allowed_scan_roots):
                raise HTTPException(status_code=403, detail="Scan path is outside allowed_scan_roots")
            resolved_scan_path = str(Path(server_scan_path).resolve())
            scan_name = Path(resolved_scan_path).name
        elif scan is not None and scan.filename:
            safe_name = Path(scan.filename).name
            dest = work_dir / safe_name
            with dest.open("wb") as fh:
                shutil.copyfileobj(scan.file, fh)
            resolved_scan_path = str(dest)
            scan_name = safe_name

        try:
            record = job_manager.submit_and_run(
                model_id=model_id,
                task=task,
                scan_path=resolved_scan_path,
                scan_name=scan_name,
                indication=indication,
                guideline=guideline,
                roi_prompt=roi_prompt,
                hf_token=x_hf_token or "",
            )
            return JSONResponse(content=record)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    return app


app = create_app()
