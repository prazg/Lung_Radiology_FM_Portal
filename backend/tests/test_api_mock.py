"""Comprehensive validation & mock-mode test suite for Lung Radiology FM Portal.
Verifies:
1. Single-source docs/models.json integrity (all 33 models, 18 datasets, 8 benchmarks, DOIs, BibTeX, URLs)
2. Path traversal sandbox guard (allowed_scan_roots)
3. Direct runner dispatch across EVERY model x EVERY supported task
4. FastAPI REST endpoints when FastAPI + httpx are installed
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from config import MODELS_JSON_PATH, PortalConfig, is_path_allowed
from jobs import JobManager


def _load_catalogue():
    return json.loads(MODELS_JSON_PATH.read_text(encoding="utf-8"))


def test_catalogue_schema_and_citations():
    cat = _load_catalogue()
    assert len(cat["models"]) == 33, f"Expected 33 models, got {len(cat['models'])}"
    assert len(cat["datasets"]) == 18, f"Expected 18 datasets, got {len(cat['datasets'])}"
    assert len(cat["benchmarks"]) == 8, f"Expected 8 benchmarks, got {len(cat['benchmarks'])}"

    family_ids = {f["id"] for f in cat["families"]}
    task_ids = {t["id"] for t in cat["tasks"]}
    model_ids = set()

    for m in cat["models"]:
        assert m["id"] not in model_ids, f"Duplicate model id: {m['id']}"
        model_ids.add(m["id"])
        assert m["family"] in family_ids, f"Invalid family on {m['id']}"
        assert m["tasks"], f"No tasks on {m['id']}"
        for t in m["tasks"]:
            assert t in task_ids, f"Invalid task {t} on {m['id']}"
        assert m["doi"], f"Missing DOI on {m['id']}"
        assert m["bibtex"].startswith("@"), f"Invalid BibTeX on {m['id']}"
        assert m["paper_url"].startswith("https://"), f"Invalid paper_url on {m['id']}"
        assert m["github"].startswith("https://"), f"Invalid github URL on {m['id']}"
        assert isinstance(m["vram_gb"], (int, float)) and m["vram_gb"] > 0

    for d in cat["datasets"]:
        assert d["doi"], f"Missing DOI on dataset {d['id']}"
        assert d["bibtex"].startswith("@"), f"Invalid BibTeX on dataset {d['id']}"
        assert d["url"].startswith("http"), f"Invalid URL on dataset {d['id']}"

    for b in cat["benchmarks"]:
        assert b["entries"], f"Empty leaderboard on benchmark {b['id']}"
        for e in b["entries"]:
            assert e["model_id"] in model_ids, f"Benchmark {b['id']} references unknown model_id {e['model_id']}"


def test_path_sandbox_guard(tmp_path):
    allowed = tmp_path / "scans"
    allowed.mkdir()
    good = allowed / "patient01.nii.gz"
    good.write_bytes(b"test")
    outside = tmp_path / "secret.txt"
    outside.write_text("nope", encoding="utf-8")

    assert is_path_allowed(good, [str(allowed)]) is True
    assert is_path_allowed(outside, [str(allowed)]) is False
    assert is_path_allowed(allowed / ".." / "secret.txt", [str(allowed)]) is False


def test_all_models_and_tasks_mock_dispatch():
    cat = _load_catalogue()
    models_by_id = {m["id"]: m for m in cat["models"]}
    jm = JobManager(models_by_id=models_by_id, mock_mode=True)

    run_count = 0
    for m in cat["models"]:
        for task in m["tasks"]:
            rec = jm.submit_and_run(model_id=m["id"], task=task, indication="Test LDCT nodule")
            assert rec["status"] == "completed"
            assert rec["model_id"] == m["id"]
            assert rec["task"] == task
            assert rec["result"]["view_type"] in ("risk_3d", "seg_3d", "vlm_3d", "cxr_2d", "embed_3d")
            run_count += 1

    assert run_count >= 50
    assert len(jm.list_jobs()) == run_count


def test_fastapi_endpoints_if_installed():
    try:
        from fastapi.testclient import TestClient  # type: ignore
        from server import create_app
    except ImportError:
        return  # Allows running core suite without FastAPI installed locally

    cfg = PortalConfig(mock_mode=True, portal_key="test-secret")
    app = create_app(cfg)
    client = TestClient(app)

    r_health = client.get("/api/health")
    assert r_health.status_code == 200
    body = r_health.json()
    assert body["model_count"] == 33
    assert body["dataset_count"] == 18
    assert body["benchmark_count"] == 8

    # Auth guard check
    assert client.get("/api/models").status_code == 401
    headers = {"X-Portal-Key": "test-secret"}
    assert client.get("/api/models", headers=headers).status_code == 200
    assert client.get("/api/datasets", headers=headers).status_code == 200
    assert client.get("/api/benchmarks", headers=headers).status_code == 200

    # Submit a mock job via REST API
    r_job = client.post(
        "/api/jobs",
        data={"model_id": "sybil_1_5", "task": "risk_pred", "indication": "RUL 18mm screening LDCT"},
        headers=headers,
    )
    assert r_job.status_code == 200
    job_data = r_job.json()
    assert job_data["status"] == "completed"
    assert len(job_data["result"]["risk_curve"]) == 6

    # Retrieve job by ID
    r_get = client.get(f"/api/jobs/{job_data['job_id']}", headers=headers)
    assert r_get.status_code == 200
    assert r_get.json()["job_id"] == job_data["job_id"]
