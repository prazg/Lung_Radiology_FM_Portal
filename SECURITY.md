# Security & Clinical Data Privacy Policy

## 1. Zero-Upload Static Architecture
The GitHub Pages frontend (`docs/`) is a 100% static client-side application. In **Browser Demo Mode**, all 3D Thorax CT Hounsfield-unit phantoms, PA chest radiograph visualizations, and model demonstrations execute locally inside your browser without transmitting any imaging data over the network.

## 2. Local / Hospital GPU Server Guardrails
When running the optional FastAPI inference backend (`backend/server.py`) on your own workstation or institutional HPC cluster:
- **Bind localhost by default (`127.0.0.1:8000`)** and use SSH port forwarding (`ssh -N -L 8000:127.0.0.1:8000`) for remote GPUs rather than exposing unauthenticated ports publicly.
- **Set `portal_key`** in `backend/config.yaml` (gitignored) to enforce `X-Portal-Key` authentication.
- **Configure `allowed_scan_roots`** explicitly; the backend rejects any server-side path resolving outside configured directories to prevent path-traversal reads.
- **Session-only Hugging Face tokens**: Tokens entered in the UI for gated weights (e.g., MedGemma, MAIRA-2, CT-CHAT, CXR Foundation) are held only in browser memory and never written to `localStorage`.

## 3. Research Use Only
This repository and the catalogued foundation models are intended strictly for **academic research, benchmarking, and educational exploration**. They are not FDA-cleared or CE-marked medical devices and must not be used for primary clinical diagnosis or patient management.
