/**
 * viewers.js — Interactive Thoracic PACS Viewers & Quantitative Visualizations
 * - Tri-Planar 3D Chest CT PACS Viewer with real HU Window/Level presets
 *   (Lung W1500/L-600, Mediastinal W400/L40, High-Res Nodule W1200/L-500, Bone W1800/L400, Inverted)
 * - Synchronized crosshair, real-time HU + anatomical structure readout, ROI isolation & mask opacity
 * - 1-6 Year Lung Cancer Cumulative Risk Curve (SVG)
 * - Grounded 2D Chest X-Ray Viewer with toggleable bounding boxes
 * - 3D Biomarker Embedding PCA Plot + Structured Thoracic Report Card
 */
(function (global) {
  'use strict';

  const HU_PRESETS = {
    lung:        { label: 'Lung (W1500 / L-600)',        w: 1500, l: -600, invert: false },
    mediastinal: { label: 'Mediastinal (W400 / L40)',    w: 400,  l: 40,   invert: false },
    nodule:      { label: 'HR Nodule (W1200 / L-500)',   w: 1200, l: -500, invert: false },
    bone:        { label: 'Bone / Calc (W1800 / L400)',  w: 1800, l: 400,  invert: false },
    inverted:    { label: 'Inverted Lung',               w: 1500, l: -600, invert: true  }
  };

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function downloadBlob(content, filename, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function huToGray(huVal, preset) {
    const low = preset.l - preset.w / 2;
    let t = (huVal - low) / preset.w;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    if (preset.invert) t = 1 - t;
    return Math.round(t * 255);
  }

  function mountTriplanarPacs(container, job) {
    const phantom = global.LungDemo.getThoraxPhantom();
    const D = phantom.dim;
    const state = {
      x: phantom.defaultCrosshair.x,
      y: phantom.defaultCrosshair.y,
      z: phantom.defaultCrosshair.z,
      preset: HU_PRESETS[job.window_preset] ? job.window_preset : 'lung',
      roi: job.view_type === 'seg_3d' ? 'all' : '1',
      opacity: job.view_type === 'seg_3d' ? 0.55 : 0.42
    };

    const labelMap = {};
    phantom.labels.forEach(function (l) { labelMap[l.id] = l; });

    const pacsEl = document.createElement('div');
    pacsEl.className = 'pacs-box';
    pacsEl.innerHTML =
      '<div class="pacs-toolbar">' +
        '<div class="pacs-presets">' +
          Object.keys(HU_PRESETS).map(function (k) {
            return '<button type="button" class="pacs-btn' + (k === state.preset ? ' active' : '') + '" data-preset="' + k + '">' + esc(HU_PRESETS[k].label) + '</button>';
          }).join('') +
        '</div>' +
        '<div class="pacs-controls">' +
          '<label>ROI: <select class="pacs-roi-sel">' +
            '<option value="all"' + (state.roi === 'all' ? ' selected' : '') + '>All Thoracic ROIs (9)</option>' +
            '<option value="none">CT Only (No Overlay)</option>' +
            phantom.labels.map(function (l) {
              return '<option value="' + l.id + '"' + (state.roi === String(l.id) ? ' selected' : '') + '>' + esc(l.name) + '</option>';
            }).join('') +
          '</select></label>' +
          '<label>Mask: <input type="range" class="pacs-opacity" min="0" max="0.9" step="0.05" value="' + state.opacity + '" style="width:76px;vertical-align:middle;" /></label>' +
        '</div>' +
      '</div>' +
      '<div class="triplanar-grid">' +
        '<div class="plane-card">' +
          '<div class="plane-head"><span>AXIAL (Z)</span><span class="plane-idx" data-idx="z"></span></div>' +
          '<div class="plane-canvas-wrap">' +
            '<canvas width="' + D + '" height="' + D + '" data-plane="axial"></canvas>' +
            '<span class="orient-tag orient-top">A</span><span class="orient-tag orient-bot">P</span><span class="orient-tag orient-l">R</span><span class="orient-tag orient-r">L</span>' +
          '</div>' +
          '<input type="range" class="slice-slider" data-axis="z" min="0" max="' + (D - 1) + '" value="' + state.z + '" />' +
        '</div>' +
        '<div class="plane-card">' +
          '<div class="plane-head"><span>CORONAL (Y)</span><span class="plane-idx" data-idx="y"></span></div>' +
          '<div class="plane-canvas-wrap">' +
            '<canvas width="' + D + '" height="' + D + '" data-plane="coronal"></canvas>' +
            '<span class="orient-tag orient-top">S</span><span class="orient-tag orient-bot">I</span><span class="orient-tag orient-l">R</span><span class="orient-tag orient-r">L</span>' +
          '</div>' +
          '<input type="range" class="slice-slider" data-axis="y" min="0" max="' + (D - 1) + '" value="' + state.y + '" />' +
        '</div>' +
        '<div class="plane-card">' +
          '<div class="plane-head"><span>SAGITTAL (X)</span><span class="plane-idx" data-idx="x"></span></div>' +
          '<div class="plane-canvas-wrap">' +
            '<canvas width="' + D + '" height="' + D + '" data-plane="sagittal"></canvas>' +
            '<span class="orient-tag orient-top">S</span><span class="orient-tag orient-bot">I</span><span class="orient-tag orient-l">A</span><span class="orient-tag orient-r">P</span>' +
          '</div>' +
          '<input type="range" class="slice-slider" data-axis="x" min="0" max="' + (D - 1) + '" value="' + state.x + '" />' +
        '</div>' +
      '</div>' +
      '<div class="pacs-hud"></div>' +
      '<div class="legend-strip">' +
        phantom.labels.map(function (l) {
          return '<span class="legend-item"><span class="legend-dot" style="background:' + l.hex + '"></span>' + esc(l.short) + '</span>';
        }).join('') +
      '</div>';

    container.appendChild(pacsEl);

    const canvases = {
      axial: pacsEl.querySelector('canvas[data-plane="axial"]'),
      coronal: pacsEl.querySelector('canvas[data-plane="coronal"]'),
      sagittal: pacsEl.querySelector('canvas[data-plane="sagittal"]')
    };
    const hudEl = pacsEl.querySelector('.pacs-hud');

    function drawPlane(plane) {
      const canvas = canvases[plane];
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(D, D);
      const data = img.data;
      const preset = HU_PRESETS[state.preset];
      const alpha = state.opacity;
      const roiFilter = state.roi;

      for (let py = 0; py < D; py++) {
        for (let px = 0; px < D; px++) {
          let vx, vy, vz;
          if (plane === 'axial') {
            vx = px; vy = py; vz = state.z;
          } else if (plane === 'coronal') {
            vx = px; vy = state.y; vz = (D - 1) - py;
          } else {
            vx = state.x; vy = px; vz = (D - 1) - py;
          }
          const vIdx = vz * D * D + vy * D + vx;
          const g = huToGray(phantom.hu[vIdx], preset);
          let r = g, gr = g, b = g;

          const m = phantom.mask[vIdx];
          if (m > 0 && alpha > 0 && roiFilter !== 'none' && (roiFilter === 'all' || String(m) === roiFilter)) {
            const c = labelMap[m].color;
            r = Math.round(r * (1 - alpha) + c[0] * alpha);
            gr = Math.round(gr * (1 - alpha) + c[1] * alpha);
            b = Math.round(b * (1 - alpha) + c[2] * alpha);
          }

          const pOff = (py * D + px) * 4;
          data[pOff] = r;
          data[pOff + 1] = gr;
          data[pOff + 2] = b;
          data[pOff + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);

      // Draw crisp crosshair lines
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = 1;
      let cx, cy;
      if (plane === 'axial') { cx = state.x; cy = state.y; }
      else if (plane === 'coronal') { cx = state.x; cy = (D - 1) - state.z; }
      else { cx = state.y; cy = (D - 1) - state.z; }

      ctx.beginPath();
      ctx.moveTo(cx + 0.5, 0); ctx.lineTo(cx + 0.5, D);
      ctx.moveTo(0, cy + 0.5); ctx.lineTo(D, cy + 0.5);
      ctx.stroke();
    }

    function renderAll() {
      drawPlane('axial');
      drawPlane('coronal');
      drawPlane('sagittal');
      pacsEl.querySelector('[data-idx="z"]').textContent = 'Slice ' + (state.z + 1) + ' / ' + D;
      pacsEl.querySelector('[data-idx="y"]').textContent = 'Slice ' + (state.y + 1) + ' / ' + D;
      pacsEl.querySelector('[data-idx="x"]').textContent = 'Slice ' + (state.x + 1) + ' / ' + D;
      pacsEl.querySelector('input[data-axis="z"]').value = state.z;
      pacsEl.querySelector('input[data-axis="y"]').value = state.y;
      pacsEl.querySelector('input[data-axis="x"]').value = state.x;

      const idx = state.z * D * D + state.y * D + state.x;
      const huVal = phantom.hu[idx];
      const lbl = labelMap[phantom.mask[idx]];
      const preset = HU_PRESETS[state.preset];
      hudEl.innerHTML =
        '<span>Crosshair: (' + state.x + ', ' + state.y + ', ' + state.z + ') · HU: <strong>' + huVal + ' HU</strong> · ROI: <strong>' + esc(lbl ? lbl.name : 'Chest Wall / Mediastinum / Air') + '</strong></span>' +
        '<span>W:' + preset.w + ' / L:' + preset.l + ' · Spacing: 3.2 mm isotropic (Click any plane to re-center)</span>';
    }

    pacsEl.querySelectorAll('.pacs-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.preset = btn.dataset.preset;
        pacsEl.querySelectorAll('.pacs-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
        renderAll();
      });
    });

    pacsEl.querySelector('.pacs-roi-sel').addEventListener('change', function (e) {
      state.roi = e.target.value;
      renderAll();
    });
    pacsEl.querySelector('.pacs-opacity').addEventListener('input', function (e) {
      state.opacity = Number(e.target.value);
      renderAll();
    });

    pacsEl.querySelectorAll('.slice-slider').forEach(function (sl) {
      sl.addEventListener('input', function () {
        state[sl.dataset.axis] = Number(sl.value);
        renderAll();
      });
    });

    Object.keys(canvases).forEach(function (plane) {
      canvases[plane].addEventListener('click', function (ev) {
        const rect = canvases[plane].getBoundingClientRect();
        const px = Math.max(0, Math.min(D - 1, Math.floor(((ev.clientX - rect.left) / rect.width) * D)));
        const py = Math.max(0, Math.min(D - 1, Math.floor(((ev.clientY - rect.top) / rect.height) * D)));
        if (plane === 'axial') { state.x = px; state.y = py; }
        else if (plane === 'coronal') { state.x = px; state.z = (D - 1) - py; }
        else { state.y = px; state.z = (D - 1) - py; }
        renderAll();
      });
    });

    renderAll();
  }

  function renderRiskCurveSvg(curve) {
    const W = 460, H = 210, padL = 46, padR = 20, padT = 18, padB = 34;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const pts = curve.map(function (c, idx) {
      const x = padL + (idx / (curve.length - 1)) * plotW;
      const y = padT + (1 - c.prob) * plotH;
      return { x: x, y: y, year: c.year, prob: c.prob };
    });

    const lineD = pts.map(function (p, i) { return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
    const areaD = lineD + ' L' + pts[pts.length - 1].x.toFixed(1) + ',' + (padT + plotH) + ' L' + pts[0].x.toFixed(1) + ',' + (padT + plotH) + ' Z';

    const gridLines = [0, 0.25, 0.5, 0.75, 1.0].map(function (v) {
      const y = (padT + (1 - v) * plotH).toFixed(1);
      return '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="currentColor" opacity="0.14" />' +
             '<text x="' + (padL - 8) + '" y="' + (Number(y) + 4) + '" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.65">' + Math.round(v * 100) + '%</text>';
    }).join('');

    const dots = pts.map(function (p) {
      return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4.5" fill="#f59e0b" stroke="#090f16" stroke-width="1.5" />' +
             '<text x="' + p.x.toFixed(1) + '" y="' + (p.y - 9).toFixed(1) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="currentColor">' + Math.round(p.prob * 100) + '%</text>' +
             '<text x="' + p.x.toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.72">Yr ' + p.year + '</text>';
    }).join('');

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;font-family:var(--font-mono);">' +
      gridLines +
      '<path d="' + areaD + '" fill="#f59e0b" opacity="0.16" />' +
      '<path d="' + lineD + '" fill="none" stroke="#f59e0b" stroke-width="2.6" />' +
      dots +
    '</svg>';
  }

  function renderPcaSvg(points, query) {
    const W = 460, H = 230, pad = 34;
    function sx(v) { return pad + ((v + 3.2) / 6.6) * (W - pad * 2); }
    function sy(v) { return H - pad - ((v + 2.1) / 4.2) * (H - pad * 2); }

    const circles = points.map(function (p) {
      return '<circle cx="' + sx(p.x).toFixed(1) + '" cy="' + sy(p.y).toFixed(1) + '" r="5.5" fill="' + p.color + '" opacity="0.82"><title>' + esc(p.group) + '</title></circle>';
    }).join('');

    const qx = sx(query.x).toFixed(1), qy = sy(query.y).toFixed(1);
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;font-family:var(--font-mono);">' +
      '<line x1="' + pad + '" y1="' + (H / 2) + '" x2="' + (W - pad) + '" y2="' + (H / 2) + '" stroke="currentColor" opacity="0.15" />' +
      '<line x1="' + (W / 2) + '" y1="' + pad + '" x2="' + (W / 2) + '" y2="' + (H - pad) + '" stroke="currentColor" opacity="0.15" />' +
      circles +
      '<circle cx="' + qx + '" cy="' + qy + '" r="8" fill="none" stroke="#ffffff" stroke-width="2.2" />' +
      '<circle cx="' + qx + '" cy="' + qy + '" r="4.5" fill="#f59e0b" />' +
      '<text x="' + (Number(qx) + 10) + '" y="' + (Number(qy) + 4) + '" font-size="10.5" font-weight="700" fill="#f59e0b">Current Study</text>' +
      '<text x="' + (W - pad) + '" y="' + (H - 8) + '" text-anchor="end" font-size="10" fill="currentColor" opacity="0.6">PC1 (Tumor Burden / Morphology)</text>' +
      '<text x="' + pad + '" y="' + (pad - 10) + '" font-size="10" fill="currentColor" opacity="0.6">PC2 (Parenchymal Texture)</text>' +
    '</svg>';
  }

  function mountCxrViewer(container) {
    const cxr = global.LungDemo.getCxrPhantom();
    let showBoxes = true;

    const wrap = document.createElement('div');
    wrap.className = 'pacs-box';
    wrap.innerHTML =
      '<div class="pacs-toolbar">' +
        '<span class="mono" style="font-size:12px;">PA CHEST RADIOGRAPH · PHRASE-GROUNDED LOCALIZATION</span>' +
        '<label class="pacs-controls"><input type="checkbox" class="cxr-box-toggle" checked /> Show grounded bounding boxes</label>' +
      '</div>' +
      '<div style="max-width:380px;margin:0 auto;position:relative;">' +
        '<canvas width="' + cxr.width + '" height="' + cxr.height + '" style="width:100%;height:auto;border-radius:6px;display:block;border:1px solid #1d2d3e;"></canvas>' +
      '</div>' +
      '<div class="legend-strip">' +
        cxr.boxes.map(function (b, idx) {
          return '<span class="legend-item"><span class="legend-dot" style="background:' + b.color + '"></span>[Box #' + (idx + 1) + '] ' + esc(b.label) + ' (' + Math.round(b.confidence * 100) + '%)</span>';
        }).join('') +
      '</div>';

    container.appendChild(wrap);
    const canvas = wrap.querySelector('canvas');
    const ctx = canvas.getContext('2d');

    function draw() {
      const img = ctx.createImageData(cxr.width, cxr.height);
      for (let i = 0; i < cxr.pixels.length; i++) {
        const v = cxr.pixels[i];
        img.data[i * 4] = v;
        img.data[i * 4 + 1] = v;
        img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);

      // Radiological R / L markers
      ctx.fillStyle = 'rgba(56,189,248,0.85)';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('R', 10, 22);
      ctx.fillText('L', cxr.width - 20, 22);

      if (showBoxes) {
        cxr.boxes.forEach(function (b, idx) {
          ctx.strokeStyle = b.color;
          ctx.lineWidth = 2.2;
          ctx.strokeRect(b.x, b.y, b.w, b.h);
          ctx.fillStyle = b.color;
          ctx.fillRect(b.x, b.y - 16, 48, 16);
          ctx.fillStyle = '#061018';
          ctx.font = 'bold 11px monospace';
          ctx.fillText('#' + (idx + 1) + ' ' + Math.round(b.confidence * 100) + '%', b.x + 3, b.y - 4);
        });
      }
    }

    wrap.querySelector('.cxr-box-toggle').addEventListener('change', function (e) {
      showBoxes = e.target.checked;
      draw();
    });
    draw();
  }

  function renderFindingsBars(probs) {
    return '<div class="conf-bars">' + probs.map(function (f) {
      const pct = Math.round(f.score * 100);
      return '<div class="conf-row">' +
        '<div class="conf-head"><span>' + esc(f.label) + '</span><span class="mono">' + pct + '%</span></div>' +
        '<div class="conf-track"><div class="conf-fill' + (pct >= 70 ? ' high' : '') + '" style="width:' + pct + '%"></div></div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function renderReportCard(report, onCopy) {
    const card = document.createElement('div');
    card.className = 'viz-card';
    const vqaHtml = (report.vqa && report.vqa.length)
      ? '<div class="report-section"><div class="report-label">Clinical Visual QA</div>' +
          report.vqa.map(function (pair) {
            return '<p class="report-text" style="margin-bottom:6px;"><strong>Q:</strong> ' + esc(pair.q) + '<br/><strong>A:</strong> ' + esc(pair.a) + '</p>';
          }).join('') +
        '</div>'
      : '';

    card.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;">' +
        '<h4>Structured Thoracic Radiology Report</h4>' +
        '<button type="button" class="btn btn-xs btn-copy-report">Copy report</button>' +
      '</div>' +
      '<div class="report-section"><div class="report-label">Clinical Indication</div><p class="report-text">' + esc(report.indication) + '</p></div>' +
      '<div class="report-section"><div class="report-label">Technique</div><p class="report-text">' + esc(report.technique) + '</p></div>' +
      '<div class="report-section"><div class="report-label">Findings</div><p class="report-text">' + esc(report.findings) + '</p></div>' +
      '<div class="report-section"><div class="report-label">Impression &amp; Recommendation</div><p class="report-text"><strong>' + esc(report.impression) + '</strong></p></div>' +
      vqaHtml;

    card.querySelector('.btn-copy-report').addEventListener('click', function () {
      const txt = [
        'CLINICAL INDICATION: ' + report.indication,
        'TECHNIQUE: ' + report.technique,
        'FINDINGS:\n' + report.findings,
        'IMPRESSION:\n' + report.impression
      ].join('\n\n');
      if (onCopy) onCopy(txt);
    });
    return card;
  }

  function renderJobResult(container, job, onToast) {
    container.innerHTML = '';

    // 1. Header KPI strip & export buttons
    const header = document.createElement('div');
    header.className = 'res-header-card';
    header.innerHTML =
      '<div>' +
        '<span class="modal-kicker">' + esc(job.mode === 'demo' ? 'BROWSER DEMO PHANTOM' : 'LOCAL GPU SERVER') + ' · ' + esc(job.created_at) + ' · ' + job.runtime_sec + 's</span>' +
        '<h3 style="font-size:21px;margin-bottom:3px;">' + esc(job.model_name) + '</h3>' +
        '<div class="muted-sm mono">' + esc(job.scan_name) + ' · Task: ' + esc(job.task) + ' · Est. VRAM: ' + job.measured_vram_gb + ' GB</div>' +
      '</div>' +
      '<div class="toolbar-btns">' +
        (job.volumetry ? '<button class="btn btn-sm" id="dl-nifti">↓ Mask (.nii)</button><button class="btn btn-sm" id="dl-vol-csv">↓ Volumetry (.csv)</button>' : '') +
        (job.report ? '<button class="btn btn-sm" id="dl-report-txt">↓ Report (.txt)</button>' : '') +
        '<button class="btn btn-sm" id="dl-job-json">↓ Result (.json)</button>' +
      '</div>';
    container.appendChild(header);

    // KPI bar
    if (job.kpis && job.kpis.length) {
      const kpiWrap = document.createElement('div');
      kpiWrap.className = 'res-kpis';
      kpiWrap.innerHTML = job.kpis.map(function (k) {
        return '<div class="res-kpi"><div class="res-kpi-val">' + esc(k.value) + '</div><div class="res-kpi-lbl">' + esc(k.label) + '</div></div>';
      }).join('');
      container.appendChild(kpiWrap);
    }

    // Wire downloads
    const dlJson = header.querySelector('#dl-job-json');
    if (dlJson) dlJson.addEventListener('click', function () {
      downloadBlob(JSON.stringify(job, null, 2), job.model_id + '_result.json', 'application/json');
    });
    const dlTxt = header.querySelector('#dl-report-txt');
    if (dlTxt && job.report) dlTxt.addEventListener('click', function () {
      const txt = 'Model: ' + job.model_name + '\nScan: ' + job.scan_name + '\n\nINDICATION:\n' + job.report.indication + '\n\nFINDINGS:\n' + job.report.findings + '\n\nIMPRESSION:\n' + job.report.impression;
      downloadBlob(txt, job.model_id + '_report.txt', 'text/plain');
    });
    const dlNifti = header.querySelector('#dl-nifti');
    if (dlNifti) dlNifti.addEventListener('click', function () {
      const phantom = global.LungDemo.getThoraxPhantom();
      const buf = global.LungDemo.buildNifti1Uint8(phantom.mask, phantom.dim, phantom.spacing);
      downloadBlob(new Blob([buf], { type: 'application/octet-stream' }), job.model_id + '_thorax_seg.nii');
      if (onToast) onToast('Downloaded 3D NIfTI-1 segmentation mask (.nii)');
    });
    const dlCsv = header.querySelector('#dl-vol-csv');
    if (dlCsv && job.volumetry) dlCsv.addEventListener('click', function () {
      const rows = ['label_id,structure,voxels,volume_mm3,volume_ml,qc_score'].concat(
        job.volumetry.map(function (v) { return [v.id, '"' + v.name + '"', v.voxels, v.mm3, v.ml, v.qc].join(','); })
      );
      downloadBlob(rows.join('\n'), job.model_id + '_volumetry.csv', 'text/csv');
    });

    // 2. Primary Imaging Viewport (3D Tri-Planar CT or 2D Grounded CXR)
    if (job.view_type === 'cxr_2d') {
      mountCxrViewer(container);
    } else {
      mountTriplanarPacs(container, job);
    }

    // 3. Task-specific quantitative panels
    if (job.view_type === 'risk_3d') {
      const grid = document.createElement('div');
      grid.className = 'two-col-viz';
      const curveCard = document.createElement('div');
      curveCard.className = 'viz-card';
      curveCard.innerHTML =
        '<h4>Cumulative 1–6 Year Lung Cancer Risk Curve</h4>' +
        '<p class="muted-sm" style="margin:0 0 8px;">' + esc(job.lungrads_tier) + '</p>' +
        renderRiskCurveSvg(job.risk_curve);
      grid.appendChild(curveCard);

      const probCard = document.createElement('div');
      probCard.className = 'viz-card';
      probCard.innerHTML = '<h4>Structured Thoracic Finding Probabilities</h4>' + renderFindingsBars(job.findings_probs);
      grid.appendChild(probCard);
      container.appendChild(grid);

      if (job.report) {
        container.appendChild(renderReportCard(job.report, function (txt) {
          navigator.clipboard && navigator.clipboard.writeText(txt);
          if (onToast) onToast('Copied structured report to clipboard');
        }));
      }
    } else if (job.view_type === 'seg_3d' && job.volumetry) {
      const tblWrap = document.createElement('div');
      tblWrap.className = 'viz-card';
      const recistBanner = job.recist
        ? '<div class="model-metric-bar" style="margin-bottom:12px;">RECIST 1.1 Target: ' + esc(job.recist.target_lesion) +
          ' · Long Axis: ' + job.recist.long_axis_mm + ' mm · Short Axis: ' + job.recist.short_axis_mm +
          ' mm · Solid Core: ' + job.recist.solid_core_hu + ' HU · T-Stage: ' + esc(job.recist.tnm_t_stage) + '</div>'
        : '';
      tblWrap.innerHTML =
        '<h4>Quantitative 3D Thoracic Volumetry</h4>' + recistBanner +
        '<div class="table-wrap"><table><thead><tr><th>ROI</th><th>Structure</th><th>Voxels</th><th>Volume (mm³)</th><th>Volume (mL)</th><th>QC Score</th></tr></thead><tbody>' +
        job.volumetry.map(function (v) {
          return '<tr><td><span class="legend-dot" style="display:inline-block;background:' + v.color + '"></span></td>' +
            '<td><strong>' + esc(v.name) + '</strong></td>' +
            '<td class="mono">' + v.voxels.toLocaleString() + '</td>' +
            '<td class="mono">' + v.mm3.toLocaleString() + '</td>' +
            '<td class="mono">' + v.ml.toFixed(2) + '</td>' +
            '<td class="mono">' + v.qc.toFixed(2) + '</td></tr>';
        }).join('') +
        '</tbody></table></div>';
      container.appendChild(tblWrap);
    } else if (job.view_type === 'vlm_3d' || job.view_type === 'cxr_2d') {
      const grid = document.createElement('div');
      grid.className = 'two-col-viz';
      if (job.report) {
        grid.appendChild(renderReportCard(job.report, function (txt) {
          navigator.clipboard && navigator.clipboard.writeText(txt);
          if (onToast) onToast('Copied structured report to clipboard');
        }));
      }
      if (job.findings_probs) {
        const probCard = document.createElement('div');
        probCard.className = 'viz-card';
        probCard.innerHTML = '<h4>Finding Confidence &amp; Multi-Abnormality Triage</h4>' + renderFindingsBars(job.findings_probs);
        grid.appendChild(probCard);
      }
      container.appendChild(grid);
    } else if (job.view_type === 'embed_3d') {
      const grid = document.createElement('div');
      grid.className = 'two-col-viz';

      const pcaCard = document.createElement('div');
      pcaCard.className = 'viz-card';
      pcaCard.innerHTML =
        '<h4>3D Volumetric Embedding Space (PCA vs. Reference Lung Cohorts)</h4>' +
        renderPcaSvg(job.pca_points, job.query_point) +
        '<div class="legend-strip">' +
          '<span class="legend-item"><span class="legend-dot" style="background:#34d399"></span>NLST Benign</span>' +
          '<span class="legend-item"><span class="legend-dot" style="background:#38bdf8"></span>LUNA25 GGN</span>' +
          '<span class="legend-item"><span class="legend-dot" style="background:#f59e0b"></span>Stage I-II NSCLC</span>' +
          '<span class="legend-item"><span class="legend-dot" style="background:#fb7185"></span>Stage III-IV</span>' +
        '</div>';
      grid.appendChild(pcaCard);

      const retCard = document.createElement('div');
      retCard.className = 'viz-card';
      retCard.innerHTML =
        '<h4>Nearest Public Cohort Matches (Cosine Retrieval)</h4>' +
        '<div class="table-wrap"><table><thead><tr><th>Case ID</th><th>Dataset</th><th>Cosine</th><th>Histology / Finding</th></tr></thead><tbody>' +
        job.nearest_cases.map(function (c) {
          return '<tr><td class="mono">' + esc(c.case_id) + '</td><td>' + esc(c.cohort) + '</td><td class="mono"><strong>' + c.cosine.toFixed(2) + '</strong></td><td>' + esc(c.label) + '</td></tr>';
        }).join('') +
        '</tbody></table></div>';
      grid.appendChild(retCard);
      container.appendChild(grid);
    }
  }

  global.LungViewers = {
    HU_PRESETS,
    renderJobResult,
    downloadBlob
  };
})(window);
