# Lung Radiology FM Portal

**Interactive Thoracic PACS Portal, Open-Access Lung Cancer Dataset Explorer, Benchmark Leaderboards & Local GPU Server for 33 Open-Weight Lung & Thoracic Radiology Foundation Models.**

> Inspired by [prazg/Brain_Radiology_FM_Portal](https://github.com/prazg/Brain_Radiology_FM_Portal) — built as a zero-build static GitHub Pages application (`docs/`) paired with an optional privacy-preserving local/HPC FastAPI GPU server (`backend/`).

---

## Key Capabilities

- **33 Verified Open-Weight Lung & Thoracic Foundation Models** across 5 clinical families:
  1. **Lung Cancer Risk & 3D CT Encoders (8):** Sybil, Pillar-0 (Chest CT), Sybil-1.5, CT-FM, FMCIB, SuPreM, VoCo / VoCo-v2, Med3D
  2. **3D Chest CT Vision-Language & Report FMs (6):** CT-CLIP, CT-CHAT, Merlin, M3D-LaMed, RadFM, MedGemma-4B / 1.5
  3. **3D Lung, Nodule, Airway & Tumor Segmentation (8):** TotalSegmentator v2 (Thorax & Nodules), VISTA3D, nnInteractive, SegVol, MedSAM2, SAT, LungMask, BiomedParse
  4. **2D Chest X-Ray Foundation & Grounded VLMs (8):** Ark+, RAD-DINO, MAIRA-2, CheXagent-2, CheXzero, CXR Foundation (ELIXR), BioViL-T, BiomedCLIP
  5. **Thoracic CT & CXR Generative Synthesis (3):** MAISI, GenerateCT, RoentGen
- **18 Open-Access Lung Cancer & Thoracic Datasets:** NLST, LIDC-IDRI, LUNA16, LUNA25, Duke Lung Cancer Screening (DLCSD24), CT-RATE, RAD-ChestCT, NSCLC-Radiomics (Lung1), NSCLC Radiogenomics, Lung-PET-CT-Dx, MSD Task06 Lung, LNDb, AutoPET, ATM'22 & SegTHOR, MIMIC-CXR v2.0, CheXpert, PadChest, VinDr-CXR & NIH ChestX-ray14 — complete with access tiers, cohort sizes, CLI download hints, DOIs, and BibTeX.
- **8 Clinical Benchmarks & Visual Leaderboards:** NLST 1–6 Yr Lung Cancer Risk, LUNA25 Indeterminate Nodule Malignancy, CT-RATE 18-Abnormality Triage, MSD Task06 Lung & Thoracic 3D Seg, ReXrank & CheXbench, Multi-Cohort CXR Classification, LUNA16 CADe, and AutoPET FDG-PET/CT Lesion Segmentation.
- **Interactive Browser PACS Workbench (Zero Setup):**
  - Built-in **96³ Analytical 3D Thorax CT Phantom in True Hounsfield Units (-1024 to +900 HU)** with 5 pulmonary lobes, airways, ribs/spine, heart/aorta, a primary **18.4 mm RUL spiculated adenocarcinoma (Lung-RADS 4B)**, an **LLL calcified granuloma**, and a **station 4R hilar lymph node**.
  - Authentic Thoracic CT Window/Level presets (**Lung W1500/L-600**, **Mediastinal W400/L40**, **HR Nodule W1200/L-500**, **Bone W1800/L400**, **Inverted**), synchronized Axial/Coronal/Sagittal crosshairs, live HU readout, ROI isolation, mask opacity slider, and downloadable **NIfTI-1 (`.nii`)** 3D segmentation masks!
  - **1–6 Year Cumulative Lung Cancer Risk Curve**, **2D Grounded Chest X-Ray Viewer** with toggleable bounding boxes, **3D Biomarker PCA Scatter**, and copyable **Lung-RADS v2022 / RECIST 1.1** reports.
- **Hardware VRAM Fit Advisor & Side-by-Side Comparison:** Auto-detects browser GPU/threads (or probes your local GPU server), filters models fitting your VRAM target (CPU to 48+ GB), and pins up to 4 models for side-by-side specification comparison.
- **51 Verified Papers & 1-Click BibTeX / CSV Export:** Every model and dataset carries a verified DOI/arXiv link and copyable BibTeX citation.

---

## Repository Structure

```text
Lung_Radiology_FM_Portal/
├── .github/workflows/
│   ├── ci.yml                     # Automated schema + mock API pytest suite
│   └── pages.yml                  # Zero-build GitHub Pages deployment from docs/
├── docs/                          # Static GitHub Pages frontend
│   ├── .nojekyll
│   ├── index.html                 # 7-tab thoracic PACS workstation UI
│   ├── models.json                # Single source of truth (33 models, 18 datasets, 8 benchmarks)
│   └── assets/
│       ├── style.css              # PACS Darkroom & Thoracic Lightbox dual themes
│       ├── hardware.js            # Browser GPU/VRAM fit advisor
│       ├── demo.js                # 3D HU Thorax CT & PA CXR phantoms + NIfTI-1 binary builder
│       ├── viewers.js             # Tri-planar HU PACS viewer, risk curve, CXR boxes, PCA, reports
│       └── app.js                 # Catalogue filters, compare dock, datasets, benchmarks, BibTeX
├── backend/                       # Optional local / HPC FastAPI GPU inference server
│   ├── server.py                  # REST API + CORS + Private-Network-Access + path sandbox
│   ├── config.py                  # YAML/env config & allowed_scan_roots guard
│   ├── hardware.py                # CUDA / nvidia-smi / MPS / RAM detection
│   ├── weights.py                 # Hugging Face cache & gated status inspector
│   ├── jobs.py                    # Single-GPU sequential worker & VRAM logger
│   ├── runners/                   # Family runners (risk_enc, ct_vlm, seg3d, cxr_fm, synth)
│   └── tests/test_api_mock.py     # Pytest suite verifying all 33 models x tasks
├── SETUP.md                       # GitHub Pages & GPU server deployment guide
├── SECURITY.md                    # Privacy & clinical PHI handling guidelines
└── LICENSE                        # MIT License
```

---

## Quickstart

### Preview the GitHub Pages Portal Locally

```bash
python -m http.server 5500 --directory docs
# Open http://127.0.0.1:5500
```

### Start the Optional Local FastAPI Server (Mock or GPU)

```bash
cd backend
pip install -r requirements-server.txt
PORTAL_MOCK=1 uvicorn server:app --host 127.0.0.1 --port 8000
```

See [SETUP.md](SETUP.md) for GitHub Pages deployment, full PyTorch/MONAI GPU dependencies, gated Hugging Face tokens, and SSH forwarding to institutional HPC clusters.

---

## Open-Weight Foundation Model Overview

| Family | Count | Highlighted Models | Primary Modalities |
| :--- | :---: | :--- | :--- |
| **Lung Cancer Risk & 3D CT Encoders** | 8 | Sybil, Pillar-0, Sybil-1.5, CT-FM, FMCIB, SuPreM, VoCo, Med3D | LDCT, 3D Chest CT |
| **3D Chest CT Vision-Language & Report FMs** | 6 | CT-CLIP, CT-CHAT, Merlin, M3D-LaMed, RadFM, MedGemma-4B / 1.5 | 3D Chest CT, CXR |
| **3D Lung, Nodule, Airway & Tumor Seg** | 8 | TotalSegmentator v2, VISTA3D, nnInteractive, SegVol, MedSAM2, SAT, LungMask, BiomedParse | 3D Chest CT, PET/CT |
| **2D Chest X-Ray FMs & Grounded VLMs** | 8 | Ark+, RAD-DINO, MAIRA-2, CheXagent-2, CheXzero, CXR Foundation, BioViL-T, BiomedCLIP | Chest X-Ray (CXR) |
| **Thoracic CT & CXR Generative Synthesis** | 3 | MAISI, GenerateCT, RoentGen | 3D Chest CT, CXR |

---

## Research Use Only

This software and all catalogued research models and datasets are provided strictly for **research and educational use**. Nothing in this repository is cleared for clinical diagnosis or patient management.
