# Setup & Deployment Guide — Lung Radiology FM Portal

## 1. Deploy to GitHub Pages (Zero Build Step)

This repository is pre-configured for one-click GitHub Pages deployment from `docs/` via `.github/workflows/pages.yml`.

1. Create a new GitHub repository (e.g., `Lung_Radiology_FM_Portal`) and push this workspace:
   ```bash
   git init -b main
   git add .
   git commit -m "Initial commit: Lung Radiology FM Portal"
   git remote add origin https://github.com/<your-username>/Lung_Radiology_FM_Portal.git
   git push -u origin main
   ```
2. In your GitHub repository, open **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions** (recommended, uses `.github/workflows/pages.yml`) — or choose **Deploy from a branch → `main` / `/docs`**.
4. Wait ~30 seconds; your interactive portal will go live at `https://<your-username>.github.io/Lung_Radiology_FM_Portal/`.

---

## 2. Preview Locally (No Node.js Required)

Serve `docs/` with Python's built-in HTTP server:

```bash
python -m http.server 5500 --directory docs
```

Open `http://127.0.0.1:5500` in your browser. All 33 models, 18 datasets, 8 benchmark leaderboards, 51 verified BibTeX entries, and the interactive 3D HU Thorax CT + PA CXR PACS Demo Mode work immediately.

---

## 3. Run the Optional Local GPU / Mock Server (`backend/`)

### A. Lightweight Mock + NIfTI Metadata Server (No GPU Needed)

```bash
cd backend
pip install -r requirements-server.txt
PORTAL_MOCK=1 uvicorn server:app --host 127.0.0.1 --port 8000
```

On Windows PowerShell:

```powershell
cd backend
.\start_server.ps1 -Mock
```

### B. Full PyTorch / MONAI / Hugging Face GPU Server

```bash
cd backend
cp config.example.yaml config.yaml
# Edit config.yaml: set portal_key and allowed_scan_roots
pip install -r requirements.txt
uvicorn server:app --host 127.0.0.1 --port 8000
```

### C. Gated Hugging Face Models
28 of 33 catalogued models are ungated. For gated weights (`google/medgemma-4b-it`, `google/cxr-foundation`, `microsoft/maira-2`, `ibrahimhamamci/CT-CHAT`, `stanfordmimi/RoentGen`):
1. Accept the model license terms on Hugging Face Hub.
2. Authenticate via `huggingface-cli login` on your GPU machine, or paste a session-only token in the **Connect** tab (never saved to `localStorage`).

### D. Connecting a Remote Institutional HPC GPU over SSH

```bash
# On your local workstation, forward the remote FastAPI server port:
ssh -N -L 8000:127.0.0.1:8000 user@hpc-gpu-node.institution.edu
```

Then open the portal (even from GitHub Pages!), switch to **Connect**, keep `http://127.0.0.1:8000`, and click **Test connection & probe GPU**.

---

## 4. Running Automated Tests

```bash
PORTAL_MOCK=1 pytest -v backend/tests/test_api_mock.py
```
