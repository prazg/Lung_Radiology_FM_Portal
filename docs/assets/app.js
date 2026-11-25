/**
 * app.js — Lung Radiology FM Portal SPA Controller
 * Zero-build static frontend for GitHub Pages with optional local FastAPI GPU backend.
 */
(function () {
  'use strict';

  const state = {
    data: null,
    tab: 'models',
    theme: localStorage.getItem('lungrad_theme') || 'dark',
    execMode: localStorage.getItem('lungrad_exec_mode') || 'demo',
    serverUrl: localStorage.getItem('lungrad_server_url') || 'http://127.0.0.1:8000',
    serverKey: localStorage.getItem('lungrad_server_key') || '',
    hfToken: '', // session-only, never persisted
    browserHw: null,
    serverHw: null,
    vramSelect: 'auto',

    // Model filters
    search: '',
    family: 'all',
    modality: 'all',
    scenario: 'all',
    onlyUngated: false,
    onlyPermissive: false,
    onlyFits: false,
    pinned: [],

    // Datasets & Benchmarks & Papers filters
    dsSearch: '',
    dsCategory: 'all',
    dsAccess: 'all',
    benchModality: 'all',
    paperSearch: '',
    paperKind: 'all',
    paperYear: 'all',

    // Run workflow
    runModelId: 'sybil_1_5',
    runTaskId: 'risk_pred',
    selectedFile: null,
    phantomKind: 'ct3d',

    // Results queue
    jobs: [],
    activeJobId: null
  };

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add('hidden'); }, 2600);
  }

  function copyText(text, label) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast(label || 'Copied to clipboard');
      }).catch(function () {
        showToast('Copy failed — select manually');
      });
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast(label || 'Copied to clipboard');
    }
  }

  function getFamily(id) {
    return state.data.families.find(function (f) { return f.id === id; }) || state.data.families[0];
  }
  function getModel(id) {
    return state.data.models.find(function (m) { return m.id === id; });
  }
  function getTask(id) {
    return state.data.tasks.find(function (t) { return t.id === id; });
  }
  function currentVramTarget() {
    return window.LungHardware.resolveVramTarget(state.vramSelect, state.browserHw, state.serverHw);
  }

  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('lungrad_theme', theme);
  }

  function switchTab(tabId) {
    const valid = ['models', 'datasets', 'benchmarks', 'run', 'results', 'papers', 'connect'];
    if (!valid.includes(tabId)) tabId = 'models';
    state.tab = tabId;
    $$('.nav-tab').forEach(function (btn) {
      const isActive = btn.dataset.tab === tabId;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });
    $$('.tab-panel').forEach(function (sec) {
      sec.classList.toggle('active', sec.id === 'tab-' + tabId);
    });
    if (window.location.hash !== '#' + tabId) {
      history.replaceState(null, '', '#' + tabId);
    }
    if (tabId === 'results') renderResultsTab();
  }

  function updateModeIndicator() {
    const pill = $('#mode-pill');
    const txt = $('#mode-pill-text');
    if (state.execMode === 'server') {
      pill.classList.remove('demo');
      pill.classList.add('live');
      txt.textContent = state.serverHw && state.serverHw.gpu_name
        ? 'GPU Server (' + state.serverHw.gpu_name + ')'
        : 'Local GPU Server';
    } else {
      pill.classList.remove('live');
      pill.classList.add('demo');
      txt.textContent = 'Demo mode (3D Thorax CT)';
    }
    $('#mode-card-demo').classList.toggle('active', state.execMode === 'demo');
    $('#mode-card-server').classList.toggle('active', state.execMode === 'server');
    const radio = document.querySelector('input[name="exec-mode"][value="' + state.execMode + '"]');
    if (radio) radio.checked = true;
  }

  function renderSuiteAndHero() {
    const suiteNav = $('#suite-links');
    suiteNav.innerHTML = state.data.portal.suite_links.map(function (s) {
      return '<a class="suite-link' + (s.active ? ' active' : '') + '" href="' + esc(s.url) + '"' +
        (s.active ? '' : ' target="_blank" rel="noopener noreferrer"') + '>' + esc(s.name) + '</a>';
    }).join('');

    const models = state.data.models;
    const ungated = models.filter(function (m) { return !m.gated; }).length;
    const ctCapable = models.filter(function (m) {
      return m.modality.some(function (mod) { return mod.includes('CT'); });
    }).length;
    const permissive = models.filter(function (m) { return m.permissive; }).length;

    $('#hero-kpis').innerHTML = [
      { v: models.length, l: 'open-weight lung FMs' },
      { v: state.data.datasets.length, l: 'open-access datasets' },
      { v: state.data.benchmarks.length, l: 'clinical benchmarks' },
      { v: ungated, l: 'ungated weights' },
      { v: ctCapable, l: '3D CT / LDCT capable' },
      { v: permissive, l: 'permissive licence' }
    ].map(function (k) {
      return '<div class="kpi-item"><span class="kpi-val">' + k.v + '</span><span class="kpi-lbl">' + k.l + '</span></div>';
    }).join('');
  }

  function renderHardwareBar() {
    const vram = currentVramTarget();
    const fitCount = window.LungHardware.countFittingModels(state.data.models, vram);
    const total = state.data.models.length;
    const hwLabel = state.serverHw && state.execMode === 'server'
      ? 'Server GPU: ' + state.serverHw.gpu_name + ' (' + state.serverHw.vram_gb + ' GB VRAM)'
      : 'This device: ' + state.browserHw.gpu + ' <span class="hw-sep">·</span> ' + state.browserHw.threads + ' threads';

    $('#hw-summary').innerHTML = hwLabel +
      ' <span class="hw-sep">·</span> <span class="hw-fit">' + fitCount + ' of ' + total + ' models fit (' + (vram === 0 ? 'CPU' : '≤' + vram + ' GB VRAM') + ')</span>';

    $('#hw-sub').textContent = state.execMode === 'server'
      ? 'Connected to local/HPC GPU server at ' + state.serverUrl + ' — real NIfTI & DICOM inference active.'
      : 'Browser Demo mode active — switch VRAM target to check hardware fit or connect a GPU server under Connect.';
  }

  function getFilteredModels() {
    const q = state.search.trim().toLowerCase();
    const vram = currentVramTarget();
    const activeScen = state.data.scenarios.find(function (s) { return s.id === state.scenario; });
    const scenTag = activeScen && activeScen.filter && activeScen.filter.tag;

    return state.data.models.filter(function (m) {
      if (state.family !== 'all' && m.family !== state.family) return false;
      if (state.modality !== 'all' && !m.modality.includes(state.modality)) return false;
      if (scenTag && !m.tags.includes(scenTag)) return false;
      if (state.onlyUngated && m.gated) return false;
      if (state.onlyPermissive && !m.permissive) return false;
      if (state.onlyFits && !window.LungHardware.modelFits(m, vram)) return false;
      if (q) {
        const hay = [m.name, m.org, m.venue, m.architecture, m.summary, m.key_metric, m.modality.join(' '), m.tags.join(' '), m.hf_id].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderSidebarFilters() {
    const total = state.data.models.length;
    const famHtml =
      '<button type="button" class="fam-btn' + (state.family === 'all' ? ' active' : '') + '" data-fam="all">' +
        '<span class="fam-left"><span>All families</span></span><span class="fam-count">' + total + '</span>' +
      '</button>' +
      state.data.families.map(function (f) {
        const cnt = state.data.models.filter(function (m) { return m.family === f.id; }).length;
        return '<button type="button" class="fam-btn' + (state.family === f.id ? ' active' : '') + '" data-fam="' + f.id + '">' +
          '<span class="fam-left"><span class="fam-swatch" style="background:var(--fam-' + f.id + ')"></span><span>' + esc(f.name) + '</span></span>' +
          '<span class="fam-count">' + cnt + '</span>' +
        '</button>';
      }).join('');
    $('#family-filters').innerHTML = famHtml;

    $('#family-filters').querySelectorAll('.fam-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.family = btn.dataset.fam;
        renderModelsSection();
      });
    });

    const mods = ['all', '3D Chest CT', 'LDCT', 'CXR', 'FDG-PET/CT', 'Whole-Body CT'];
    $('#modality-filters').innerHTML = mods.map(function (mod) {
      return '<button type="button" class="mod-pill' + (state.modality === mod ? ' active' : '') + '" data-mod="' + esc(mod) + '">' +
        (mod === 'all' ? 'All modalities' : esc(mod)) + '</button>';
    }).join('');

    $('#modality-filters').querySelectorAll('.mod-pill').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.modality = btn.dataset.mod;
        renderModelsSection();
      });
    });

    $('#scenario-chips').innerHTML = state.data.scenarios.map(function (sc) {
      const cnt = sc.filter && sc.filter.tag
        ? state.data.models.filter(function (m) { return m.tags.includes(sc.filter.tag); }).length
        : state.data.models.length;
      return '<button type="button" class="scenario-chip' + (state.scenario === sc.id ? ' active' : '') + '" data-scen="' + sc.id + '">' +
        esc(sc.label) + ' <span class="chip-n">' + cnt + '</span></button>';
    }).join('');

    $('#scenario-chips').querySelectorAll('.scenario-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.scenario = btn.dataset.scen;
        renderModelsSection();
      });
    });
  }

  function renderModelsSection() {
    renderSidebarFilters();
    const filtered = getFilteredModels();
    const vram = currentVramTarget();

    $('#model-count').textContent = 'Showing ' + filtered.length + ' of ' + state.data.models.length + ' thoracic foundation models';

    const container = $('#models-container');
    if (!filtered.length) {
      container.innerHTML = '<div class="card-panel"><p class="muted-sm">No models match the active filters. Clear search or relax VRAM/modality filters.</p></div>';
      return;
    }

    const groupsHtml = state.data.families.map(function (fam) {
      const items = filtered.filter(function (m) { return m.family === fam.id; });
      if (!items.length) return '';

      const cards = items.map(function (m) {
        const isPinned = state.pinned.includes(m.id);
        const fits = window.LungHardware.modelFits(m, vram);
        return '<article class="model-card' + (isPinned ? ' pinned' : '') + '" data-family="' + m.family + '">' +
          '<div class="model-card-top">' +
            '<div>' +
              '<div class="model-title">' + esc(m.name) + '</div>' +
              '<div class="model-org">' + esc(m.org) + ' · ' + m.year + ' · ' + esc(m.venue) + '</div>' +
            '</div>' +
            '<button type="button" class="btn btn-xs' + (isPinned ? ' btn-pinned' : '') + '" data-pin="' + m.id + '">' +
              (isPinned ? '✓ Pinned' : '+ Compare') +
            '</button>' +
          '</div>' +
          '<p class="model-summary">' + esc(m.summary) + '</p>' +
          '<div class="model-metric-bar">' + esc(m.key_metric) + '</div>' +
          '<div class="badge-row">' +
            m.modality.map(function (mod) { return '<span class="badge badge-accent">' + esc(mod) + '</span>'; }).join('') +
            '<span class="badge">' + esc(m.params) + '</span>' +
            '<span class="badge ' + (fits ? 'badge-ok' : 'badge-warn') + '">' + m.vram_gb + ' GB VRAM</span>' +
            '<span class="badge ' + (m.gated ? 'badge-warn' : 'badge-ok') + '">' + (m.gated ? 'Gated HF' : 'Ungated') + '</span>' +
            '<span class="badge">' + esc(m.license) + '</span>' +
          '</div>' +
          '<div class="model-card-foot">' +
            '<div class="card-links">' +
              '<a href="' + esc(m.paper_url) + '" target="_blank" rel="noopener noreferrer">Paper ↗</a>' +
              '<a href="' + esc(m.github) + '" target="_blank" rel="noopener noreferrer">Code / HF ↗</a>' +
              '<button type="button" class="btn btn-xs btn-ghost" data-details="' + m.id + '">Details &amp; CLI</button>' +
            '</div>' +
            '<button type="button" class="btn btn-xs btn-primary" data-run="' + m.id + '">Run →</button>' +
          '</div>' +
        '</article>';
      }).join('');

      return '<div class="family-group">' +
        '<div class="family-group-head"><h3>' + esc(fam.name) + '</h3><p>' + esc(fam.description) + '</p></div>' +
        '<div class="models-grid">' + cards + '</div>' +
      '</div>';
    }).join('');

    container.innerHTML = groupsHtml;

    container.querySelectorAll('[data-pin]').forEach(function (btn) {
      btn.addEventListener('click', function () { togglePin(btn.dataset.pin); });
    });
    container.querySelectorAll('[data-details]').forEach(function (btn) {
      btn.addEventListener('click', function () { openDetailsModal(btn.dataset.details); });
    });
    container.querySelectorAll('[data-run]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const m = getModel(btn.dataset.run);
        if (m) {
          state.runModelId = m.id;
          state.runTaskId = m.tasks[0];
          syncRunTab();
          switchTab('run');
        }
      });
    });
  }

  function togglePin(modelId) {
    const idx = state.pinned.indexOf(modelId);
    if (idx >= 0) {
      state.pinned.splice(idx, 1);
    } else {
      if (state.pinned.length >= 4) {
        showToast('Maximum 4 models can be pinned for side-by-side comparison');
        return;
      }
      state.pinned.push(modelId);
    }
    renderCompareDock();
    renderModelsSection();
  }

  function renderCompareDock() {
    const dock = $('#compare-dock');
    if (!state.pinned.length) {
      dock.classList.add('hidden');
      return;
    }
    dock.classList.remove('hidden');
    $('#compare-dock-label').textContent = 'Compare Lung Models (' + state.pinned.length + '/4)';
    $('#btn-open-compare').textContent = 'Compare side-by-side (' + state.pinned.length + ')';

    const chipsEl = $('#compare-chips');
    chipsEl.innerHTML = state.pinned.map(function (id) {
      const m = getModel(id);
      if (!m) return '';
      return '<span class="compare-chip">' +
        '<span class="fam-swatch" style="background:var(--fam-' + m.family + ')"></span>' +
        '<span>' + esc(m.name) + '</span>' +
        '<button type="button" data-unpin="' + m.id + '" aria-label="Remove ' + esc(m.name) + '">✕</button>' +
      '</span>';
    }).join('');

    chipsEl.querySelectorAll('[data-unpin]').forEach(function (btn) {
      btn.addEventListener('click', function () { togglePin(btn.dataset.unpin); });
    });
  }

  function openDetailsModal(modelId) {
    const m = getModel(modelId);
    if (!m) return;
    const fam = getFamily(m.family);
    $('#detail-modal-kicker').textContent = fam.name + ' · ' + m.venue + ' (' + m.year + ')';
    $('#detail-modal-title').textContent = m.name;

    $('#detail-modal-body').innerHTML =
      '<p style="margin-top:0;">' + esc(m.summary) + '</p>' +
      '<div class="model-metric-bar">' + esc(m.key_metric) + '</div>' +
      '<div class="spec-grid">' +
        '<div class="spec-cell"><div class="meta-k">Organization</div><div class="meta-v">' + esc(m.org) + '</div></div>' +
        '<div class="spec-cell"><div class="meta-k">Architecture</div><div class="meta-v">' + esc(m.architecture) + '</div></div>' +
        '<div class="spec-cell"><div class="meta-k">Parameters / VRAM</div><div class="meta-v">' + esc(m.params) + ' · ' + m.vram_gb + ' GB VRAM</div></div>' +
        '<div class="spec-cell"><div class="meta-k">Input Specification</div><div class="meta-v">' + esc(m.input_spec) + '</div></div>' +
        '<div class="spec-cell"><div class="meta-k">Pretraining Cohort</div><div class="meta-v">' + esc(m.pretrain_data) + '</div></div>' +
        '<div class="spec-cell"><div class="meta-k">Weights &amp; License</div><div class="meta-v">' + esc(m.hf_id) + ' · ' + esc(m.license) + (m.gated ? ' (Gated)' : ' (Ungated)') + '</div></div>' +
      '</div>' +
      '<div class="field-label">Python / CLI Quickstart</div>' +
      '<pre class="code-block">' + esc(m.cli_snippet) + '</pre>' +
      '<div class="btn-row" style="margin-bottom:14px;">' +
        '<button type="button" class="btn btn-sm" id="modal-copy-cli">Copy CLI snippet</button>' +
        '<button type="button" class="btn btn-sm" id="modal-copy-bib">Copy BibTeX</button>' +
        '<a class="btn btn-sm" href="' + esc(m.paper_url) + '" target="_blank" rel="noopener noreferrer">Open Paper (' + esc(m.doi) + ') ↗</a>' +
        '<a class="btn btn-sm" href="' + esc(m.github) + '" target="_blank" rel="noopener noreferrer">GitHub / HF ↗</a>' +
        '<button type="button" class="btn btn-sm btn-primary" id="modal-run-btn">Run in Workbench →</button>' +
      '</div>' +
      '<div class="field-label">Verified BibTeX</div>' +
      '<pre class="code-block" style="margin-bottom:0;">' + esc(m.bibtex) + '</pre>';

    $('#modal-copy-cli').addEventListener('click', function () { copyText(m.cli_snippet, 'Copied CLI quickstart'); });
    $('#modal-copy-bib').addEventListener('click', function () { copyText(m.bibtex, 'Copied BibTeX for ' + m.name); });
    $('#modal-run-btn').addEventListener('click', function () {
      $('#detail-modal').classList.add('hidden');
      state.runModelId = m.id;
      state.runTaskId = m.tasks[0];
      syncRunTab();
      switchTab('run');
    });

    $('#detail-modal').classList.remove('hidden');
  }

  function openCompareModal() {
    const addSel = $('#compare-add-select');
    addSel.innerHTML = '<option value="">+ Add model to compare…</option>' +
      state.data.models.filter(function (m) { return !state.pinned.includes(m.id); }).map(function (m) {
        return '<option value="' + m.id + '">' + esc(m.name) + ' (' + m.year + ')</option>';
      }).join('');

    const models = state.pinned.map(getModel).filter(Boolean);
    const body = $('#compare-modal-body');
    if (!models.length) {
      body.innerHTML = '<p class="muted-sm">Pin at least one model using "+ Compare" to compare specifications side by side.</p>';
    } else {
      const rows = [
        { k: 'Family', fn: function (m) { return getFamily(m.family).short; } },
        { k: 'Lab / Institution', fn: function (m) { return m.org; } },
        { k: 'Year & Venue', fn: function (m) { return m.year + ' · ' + m.venue; } },
        { k: 'Modalities', fn: function (m) { return m.modality.join(', '); } },
        { k: 'Architecture', fn: function (m) { return m.architecture; } },
        { k: 'Parameters', fn: function (m) { return m.params; } },
        { k: 'Min VRAM', fn: function (m) { return m.vram_gb + ' GB'; } },
        { k: 'Input Spec', fn: function (m) { return m.input_spec; } },
        { k: 'Pretraining Data', fn: function (m) { return m.pretrain_data; } },
        { k: 'Key Benchmark', fn: function (m) { return m.key_metric; } },
        { k: 'License & Access', fn: function (m) { return m.license + (m.gated ? ' (Gated HF)' : ' (Ungated)'); } }
      ];

      body.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Specification</th>' +
        models.map(function (m) {
          return '<th><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><span>' + esc(m.name) +
            '</span><button type="button" class="btn btn-xs btn-ghost" data-cmp-rm="' + m.id + '">✕</button></div></th>';
        }).join('') +
      '</tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td><strong>' + esc(r.k) + '</strong></td>' +
          models.map(function (m) { return '<td>' + esc(r.fn(m)) + '</td>'; }).join('') + '</tr>';
      }).join('') +
      '</tbody></table></div>';

      body.querySelectorAll('[data-cmp-rm]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          togglePin(btn.dataset.cmpRm);
          openCompareModal();
        });
      });
    }
    $('#compare-modal').classList.remove('hidden');
  }

  /* ==================== TAB 2: OPEN DATASETS ==================== */
  function getFilteredDatasets() {
    const q = state.dsSearch.trim().toLowerCase();
    return state.data.datasets.filter(function (d) {
      if (state.dsCategory !== 'all' && d.category !== state.dsCategory) return false;
      if (state.dsAccess !== 'all' && d.access_tier !== state.dsAccess) return false;
      if (q) {
        const hay = [d.name, d.cases, d.annotations, d.access, d.license, d.modality.join(' '), d.tasks.join(' '), d.doi].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderDatasetsTab() {
    const items = getFilteredDatasets();
    $('#dataset-count').textContent = 'Showing ' + items.length + ' of ' + state.data.datasets.length + ' open-access lung & thoracic datasets';
    $('#datasets-grid').innerHTML = items.map(function (d) {
      const accessCls = d.access_tier === 'open' ? 'badge-ok' : (d.access_tier === 'registration' ? 'badge-accent' : 'badge-warn');
      return '<article class="dataset-card">' +
        '<div class="model-card-top">' +
          '<div>' +
            '<div class="model-title">' + esc(d.name) + '</div>' +
            '<div class="model-org">' + esc(d.venue) + ' · ' + d.year + ' · DOI: ' + esc(d.doi) + '</div>' +
          '</div>' +
          '<span class="badge ' + accessCls + '">' + esc(d.access) + '</span>' +
        '</div>' +
        '<div class="dataset-meta-grid">' +
          '<div><div class="meta-k">Cohort Scale</div><div class="meta-v">' + esc(d.cases) + '</div></div>' +
          '<div><div class="meta-k">Format &amp; Size</div><div class="meta-v">' + esc(d.size_label) + '</div></div>' +
        '</div>' +
        '<p class="model-summary">' + esc(d.annotations) + '</p>' +
        '<div class="badge-row">' +
          d.modality.map(function (mod) { return '<span class="badge badge-accent">' + esc(mod) + '</span>'; }).join('') +
          d.tasks.map(function (t) { return '<span class="badge">' + esc(t) + '</span>'; }).join('') +
          '<span class="badge">' + esc(d.license) + '</span>' +
        '</div>' +
        '<pre class="code-block" style="margin:2px 0;">' + esc(d.cli_hint) + '</pre>' +
        '<div class="model-card-foot">' +
          '<div class="card-links">' +
            '<a href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">Dataset Portal ↗</a>' +
            '<a href="https://doi.org/' + esc(d.doi) + '" target="_blank" rel="noopener noreferrer">Paper / DOI ↗</a>' +
          '</div>' +
          '<div class="toolbar-btns">' +
            '<button type="button" class="btn btn-xs" data-ds-cli="' + d.id + '">Copy CLI</button>' +
            '<button type="button" class="btn btn-xs" data-ds-bib="' + d.id + '">Copy BibTeX</button>' +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('');

    $('#datasets-grid').querySelectorAll('[data-ds-cli]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const d = state.data.datasets.find(function (x) { return x.id === btn.dataset.dsCli; });
        if (d) copyText(d.cli_hint, 'Copied download command for ' + d.name);
      });
    });
    $('#datasets-grid').querySelectorAll('[data-ds-bib]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const d = state.data.datasets.find(function (x) { return x.id === btn.dataset.dsBib; });
        if (d) copyText(d.bibtex, 'Copied BibTeX for ' + d.name);
      });
    });
  }

  /* ==================== TAB 3: BENCHMARKS ==================== */
  function renderBenchmarksTab() {
    const items = state.data.benchmarks.filter(function (b) {
      return state.benchModality === 'all' || b.modality === state.benchModality;
    });

    $('#benchmarks-grid').innerHTML = items.map(function (b) {
      const rows = b.entries.map(function (e) {
        const pct = Math.min(100, Math.round((e.score / b.scale_max) * 100));
        return '<div class="bench-row">' +
          '<div class="bench-row-head">' +
            '<span><a href="#models" class="bench-model-name" data-open-model="' + esc(e.model_id) + '">' + esc(e.model) + '</a>' +
            '<span class="bench-sec">' + esc(e.secondary) + '</span></span>' +
            '<span class="bench-score">' + e.score.toFixed(3) + '</span>' +
          '</div>' +
          '<div class="bench-track"><div class="bench-fill' + (e.highlight ? ' top' : '') + '" style="width:' + pct + '%"></div></div>' +
        '</div>';
      }).join('');

      return '<article class="bench-card">' +
        '<div class="bench-top">' +
          '<div>' +
            '<div class="model-title">' + esc(b.name) + '</div>' +
            '<div class="bench-cohort">' + esc(b.cohort) + '</div>' +
          '</div>' +
          '<span class="badge badge-accent">' + esc(b.modality) + ' · ' + esc(b.metric_name) + '</span>' +
        '</div>' +
        '<p class="model-summary">' + esc(b.description) + '</p>' +
        '<div class="bench-rows">' + rows + '</div>' +
        '<div class="model-card-foot">' +
          '<div class="card-links">' +
            '<a href="' + esc(b.url) + '" target="_blank" rel="noopener noreferrer">Challenge / Leaderboard ↗</a>' +
            '<a href="https://doi.org/' + esc(b.doi) + '" target="_blank" rel="noopener noreferrer">Reference DOI ↗</a>' +
          '</div>' +
          '<span class="muted-sm mono">Click any model to inspect</span>' +
        '</div>' +
      '</article>';
    }).join('');

    $('#benchmarks-grid').querySelectorAll('[data-open-model]').forEach(function (a) {
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        openDetailsModal(a.dataset.openModel);
      });
    });

    $('#ecosystem-grid').innerHTML = state.data.ecosystem.map(function (eco) {
      return '<div class="eco-card">' +
        '<div class="eco-role">' + esc(eco.role) + '</div>' +
        '<div class="model-title" style="font-size:15.5px;margin-bottom:5px;"><a href="' + esc(eco.url) + '" target="_blank" rel="noopener noreferrer">' + esc(eco.name) + ' ↗</a></div>' +
        '<p class="model-summary">' + esc(eco.description) + '</p>' +
      '</div>';
    }).join('');
  }

  /* ==================== TAB 4: RUN WORKFLOW ==================== */
  function syncRunTab() {
    const sel = $('#run-model-select');
    sel.innerHTML = state.data.families.map(function (f) {
      const ms = state.data.models.filter(function (m) { return m.family === f.id; });
      return '<optgroup label="' + esc(f.name) + '">' +
        ms.map(function (m) {
          return '<option value="' + m.id + '"' + (m.id === state.runModelId ? ' selected' : '') + '>' +
            esc(m.name) + ' — ' + esc(m.modality.join('/')) + ' (' + m.vram_gb + ' GB VRAM)</option>';
        }).join('') +
      '</optgroup>';
    }).join('');

    const m = getModel(state.runModelId) || state.data.models[0];
    if (!m.tasks.includes(state.runTaskId)) state.runTaskId = m.tasks[0];

    const taskWrap = $('#run-task-buttons');
    taskWrap.innerHTML = state.data.tasks.map(function (t) {
      const supported = m.tasks.includes(t.id);
      const active = t.id === state.runTaskId;
      return '<button type="button" class="task-btn' + (active ? ' active' : '') + '" data-task="' + t.id + '"' + (supported ? '' : ' disabled title="Not supported by ' + esc(m.name) + '"') + '>' + esc(t.label) + '</button>';
    }).join('');

    taskWrap.querySelectorAll('.task-btn:not(:disabled)').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.runTaskId = btn.dataset.task;
        syncRunTab();
      });
    });

    const activeTask = getTask(state.runTaskId);
    $('#run-task-desc').textContent = activeTask ? activeTask.description : '';

    // Update sticky right summary card
    const fam = getFamily(m.family);
    const fits = window.LungHardware.modelFits(m, currentVramTarget());
    $('#run-summary-card').innerHTML =
      '<div><span class="modal-kicker">' + esc(fam.name) + '</span><h3>' + esc(m.name) + '</h3></div>' +
      '<div class="summary-kv">' +
        '<span class="muted-sm">Task</span><strong>' + esc(activeTask.label) + '</strong>' +
        '<span class="muted-sm">Modalities</span><span>' + esc(m.modality.join(', ')) + '</span>' +
        '<span class="muted-sm">Architecture</span><span>' + esc(m.architecture) + '</span>' +
        '<span class="muted-sm">Input Spec</span><span class="mono" style="font-size:12px;">' + esc(m.input_spec) + '</span>' +
        '<span class="muted-sm">VRAM Req</span><span>' + m.vram_gb + ' GB (' + (fits ? 'Fits target' : 'Exceeds target') + ')</span>' +
        '<span class="muted-sm">Weights ID</span><span class="mono" style="font-size:12px;">' + esc(m.hf_id) + '</span>' +
        '<span class="muted-sm">Execution</span><strong>' + (state.execMode === 'server' ? 'Local GPU Server' : 'Browser Demo Phantom') + '</strong>' +
      '</div>' +
      (m.gated ? '<div class="alert-box"><strong>Gated Hugging Face weights:</strong> In local GPU server mode, accept the model terms on Hugging Face and provide a session token under Connect or via <code>hf auth login</code>. Browser Demo Mode runs immediately without a token.</div>' : '') +
      '<div class="toolbar-btns">' +
        '<a class="btn btn-sm" href="' + esc(m.paper_url) + '" target="_blank" rel="noopener noreferrer">Paper ↗</a>' +
        '<a class="btn btn-sm" href="' + esc(m.github) + '" target="_blank" rel="noopener noreferrer">GitHub / HF ↗</a>' +
      '</div>';
  }

  async function executeModelRun() {
    const m = getModel(state.runModelId);
    const opts = {
      indication: $('#run-indication').value.trim(),
      guideline: $('#run-guideline').value,
      windowPreset: $('#run-window').value,
      roiPrompt: $('#run-roi-prompt').value.trim(),
      scanName: state.selectedFile ? state.selectedFile.name : (state.phantomKind === 'cxr2d' ? 'demo_pa_cxr_rul_nodule.png' : 'demo_thorax_ldct_rul_18mm.nii.gz')
    };

    if (state.execMode === 'server') {
      try {
        showToast('Submitting job to ' + state.serverUrl + '…');
        const fd = new FormData();
        fd.append('model_id', m.id);
        fd.append('task', state.runTaskId);
        fd.append('indication', opts.indication);
        fd.append('guideline', opts.guideline);
        fd.append('roi_prompt', opts.roiPrompt);
        if (state.selectedFile) fd.append('scan', state.selectedFile);

        const headers = {};
        if (state.serverKey) headers['X-Portal-Key'] = state.serverKey;
        if (state.hfToken) headers['X-HF-Token'] = state.hfToken;

        const resp = await fetch(state.serverUrl.replace(/\/$/, '') + '/api/jobs', { method: 'POST', body: fd, headers: headers });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const serverJob = await resp.json();
        // Hydrate server response into our viewer shape
        const merged = Object.assign(window.LungDemo.runDemoInference(m, state.runTaskId, opts), serverJob.result || {}, {
          job_id: serverJob.job_id || ('srv-' + Date.now()),
          mode: 'server',
          runtime_sec: serverJob.runtime_sec || 0.9,
          measured_vram_gb: serverJob.measured_vram_gb || m.vram_gb
        });
        state.jobs.unshift(merged);
        state.activeJobId = merged.job_id;
        showToast('Completed on local server: ' + m.name);
        switchTab('results');
        return;
      } catch (err) {
        showToast('Server unreachable (' + err.message + ') — falling back to Browser Demo Mode');
      }
    }

    const job = window.LungDemo.runDemoInference(m, state.runTaskId, opts);
    state.jobs.unshift(job);
    state.activeJobId = job.job_id;
    showToast('Completed ' + m.name + ' (' + job.task + ')');
    switchTab('results');
  }

  /* ==================== TAB 5: RESULTS ==================== */
  function seedInitialDemoJobs() {
    const seeds = [
      { id: 'sybil_1_5', task: 'risk_pred', scan: 'demo_nlst_ldct_rul_18mm.nii.gz' },
      { id: 'vista3d',   task: 'seg_3d',    scan: 'demo_nsclc_gtv_5lobes.nii.gz' },
      { id: 'ct_clip',   task: 'ct_report', scan: 'demo_ct_rate_thorax.nii.gz' },
      { id: 'maira_2',   task: 'cxr_report', scan: 'demo_pa_cxr_rul_nodule.png' }
    ];
    state.jobs = seeds.map(function (s) {
      const m = getModel(s.id);
      return window.LungDemo.runDemoInference(m, s.task, { scanName: s.scan });
    });
    state.activeJobId = state.jobs[0].job_id;
  }

  function renderResultsTab() {
    const list = $('#jobs-list');
    list.innerHTML = state.jobs.map(function (j) {
      return '<button type="button" class="job-item' + (j.job_id === state.activeJobId ? ' active' : '') + '" data-job="' + j.job_id + '">' +
        '<div class="job-item-title">' + esc(j.model_name) + '</div>' +
        '<div class="job-item-meta">' + esc(j.task) + ' · ' + esc(j.mode) + ' · ' + esc(j.created_at) + '</div>' +
      '</button>';
    }).join('');

    list.querySelectorAll('.job-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.activeJobId = btn.dataset.job;
        renderResultsTab();
      });
    });

    const activeJob = state.jobs.find(function (j) { return j.job_id === state.activeJobId; }) || state.jobs[0];
    if (activeJob) {
      window.LungViewers.renderJobResult($('#results-main'), activeJob, showToast);
    }
  }

  /* ==================== TAB 6: PAPERS & BIBTEX ==================== */
  function getAllBibliographyItems() {
    const mItems = state.data.models.map(function (m) {
      return {
        kind: 'model',
        id: m.id,
        name: m.name,
        subtitle: m.org,
        group: getFamily(m.family).short,
        year: m.year,
        venue: m.venue,
        doi: m.doi,
        paper_url: m.paper_url,
        code_url: m.github,
        bibtex: m.bibtex
      };
    });
    const dItems = state.data.datasets.map(function (d) {
      return {
        kind: 'dataset',
        id: d.id,
        name: d.name,
        subtitle: d.cases,
        group: 'Dataset (' + d.modality.join('/') + ')',
        year: d.year,
        venue: d.venue,
        doi: d.doi,
        paper_url: 'https://doi.org/' + d.doi,
        code_url: d.url,
        bibtex: d.bibtex
      };
    });
    return mItems.concat(dItems);
  }

  function renderPapersTab() {
    const q = state.paperSearch.trim().toLowerCase();
    const items = getAllBibliographyItems().filter(function (p) {
      if (state.paperKind !== 'all' && p.kind !== state.paperKind) return false;
      if (state.paperYear === 'older' && p.year > 2022) return false;
      else if (state.paperYear !== 'all' && state.paperYear !== 'older' && String(p.year) !== state.paperYear) return false;
      if (q) {
        const hay = [p.name, p.subtitle, p.group, p.venue, p.doi, p.bibtex].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    $('#papers-tbody').innerHTML = items.map(function (p) {
      return '<tr>' +
        '<td><strong>' + esc(p.name) + '</strong><div class="muted-sm">' + esc(p.subtitle) + '</div></td>' +
        '<td><span class="badge ' + (p.kind === 'dataset' ? 'badge-ok' : 'badge-accent') + '">' + esc(p.group) + '</span></td>' +
        '<td class="mono">' + p.year + '</td>' +
        '<td>' + esc(p.venue) + '</td>' +
        '<td class="mono" style="white-space:nowrap;">' +
          '<a href="' + esc(p.paper_url) + '" target="_blank" rel="noopener noreferrer">DOI ↗</a> · ' +
          '<a href="' + esc(p.code_url) + '" target="_blank" rel="noopener noreferrer">' + (p.kind === 'dataset' ? 'Data ↗' : 'Repo ↗') + '</a>' +
        '</td>' +
        '<td><button type="button" class="btn btn-xs" data-bib-key="' + p.kind + ':' + p.id + '">Copy BibTeX</button></td>' +
      '</tr>';
    }).join('');

    $('#papers-tbody').querySelectorAll('[data-bib-key]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const parts = btn.dataset.bibKey.split(':');
        const found = items.find(function (x) { return x.kind === parts[0] && x.id === parts[1]; });
        if (found) copyText(found.bibtex, 'Copied BibTeX for ' + found.name);
      });
    });
  }

  /* ==================== EXPORTS (.bib & .csv) ==================== */
  function exportBib(items, filename) {
    const content = items.map(function (x) { return x.bibtex; }).join('\n\n') + '\n';
    window.LungViewers.downloadBlob(content, filename, 'application/x-bibtex');
    showToast('Exported ' + items.length + ' BibTeX entries');
  }

  function exportModelsCsv(models, filename) {
    const cols = ['id', 'name', 'family', 'org', 'year', 'venue', 'modality', 'architecture', 'params', 'vram_gb', 'license', 'gated', 'hf_id', 'doi', 'github'];
    const lines = [cols.join(',')].concat(models.map(function (m) {
      return cols.map(function (c) {
        const val = Array.isArray(m[c]) ? m[c].join('; ') : String(m[c] == null ? '' : m[c]);
        return '"' + val.replace(/"/g, '""') + '"';
      }).join(',');
    }));
    window.LungViewers.downloadBlob(lines.join('\n'), filename, 'text/csv');
    showToast('Exported ' + models.length + ' models to CSV');
  }

  function exportDatasetsCsv(datasets, filename) {
    const cols = ['id', 'name', 'category', 'modality', 'cases', 'size_label', 'access', 'license', 'year', 'venue', 'doi', 'url'];
    const lines = [cols.join(',')].concat(datasets.map(function (d) {
      return cols.map(function (c) {
        const val = Array.isArray(d[c]) ? d[c].join('; ') : String(d[c] == null ? '' : d[c]);
        return '"' + val.replace(/"/g, '""') + '"';
      }).join(',');
    }));
    window.LungViewers.downloadBlob(lines.join('\n'), filename, 'text/csv');
    showToast('Exported ' + datasets.length + ' datasets to CSV');
  }

  /* ==================== TAB 7: CONNECT SERVER ==================== */
  async function testServerConnection() {
    const url = $('#server-url').value.trim().replace(/\/$/, '');
    const key = $('#server-key').value.trim();
    const box = $('#server-status-box');
    box.innerHTML = 'Probing <code>' + esc(url) + '/api/health</code>…';
    try {
      const headers = key ? { 'X-Portal-Key': key } : {};
      const r1 = await fetch(url + '/api/health', { headers: headers });
      if (!r1.ok) throw new Error('HTTP ' + r1.status);
      const health = await r1.json();

      const r2 = await fetch(url + '/api/hardware', { headers: headers });
      const hw = r2.ok ? await r2.json() : null;
      state.serverHw = hw;
      box.innerHTML = '<strong>Connected!</strong> Backend v' + esc(health.version) +
        ' · Mode: <code>' + esc(health.mock_mode ? 'PORTAL_MOCK=1' : 'Real GPU') + '</code>' +
        (hw ? ' · Hardware: <strong>' + esc(hw.gpu_name) + '</strong> (' + hw.vram_gb + ' GB VRAM, ' + hw.ram_gb + ' GB RAM)' : '');
      renderHardwareBar();
      showToast('Connected to local FastAPI server');
    } catch (err) {
      box.innerHTML = '<strong>Connection failed:</strong> ' + esc(err.message) +
        '. Ensure <code>backend/server.py</code> is running locally (see quickstart right). Browser Demo Mode remains ready.';
    }
  }

  /* ==================== INITIALIZATION ==================== */
  function bindEvents() {
    $$('.nav-tab').forEach(function (btn) {
      btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
    });
    $('#brand-home').addEventListener('click', function (e) { e.preventDefault(); switchTab('models'); });
    $('#mode-pill').addEventListener('click', function () { switchTab('connect'); });
    $('#theme-toggle').addEventListener('click', function () {
      applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    });

    // Keyboard `/` focuses search and Escape closes modals
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        switchTab('models');
        $('#model-search').focus();
      } else if (e.key === 'Escape') {
        $$('.modal-backdrop').forEach(function (m) { m.classList.add('hidden'); });
      }
    });

    // Model filters
    $('#model-search').addEventListener('input', function (e) { state.search = e.target.value; renderModelsSection(); });
    $('#filter-ungated').addEventListener('change', function (e) { state.onlyUngated = e.target.checked; renderModelsSection(); });
    $('#filter-permissive').addEventListener('change', function (e) { state.onlyPermissive = e.target.checked; renderModelsSection(); });
    $('#filter-fits').addEventListener('change', function (e) { state.onlyFits = e.target.checked; renderModelsSection(); });
    $('#vram-select').addEventListener('change', function (e) {
      state.vramSelect = e.target.value;
      renderHardwareBar();
      renderModelsSection();
    });

    // Exports
    $('#export-bib-models').addEventListener('click', function () { exportBib(getFilteredModels(), 'lung_radiology_fms.bib'); });
    $('#export-csv-models').addEventListener('click', function () { exportModelsCsv(getFilteredModels(), 'lung_radiology_fms.csv'); });
    $('#export-datasets-bib').addEventListener('click', function () { exportBib(getFilteredDatasets(), 'lung_radiology_datasets.bib'); });
    $('#export-datasets-csv').addEventListener('click', function () { exportDatasetsCsv(getFilteredDatasets(), 'lung_radiology_datasets.csv'); });
    $('#export-all-bib').addEventListener('click', function () { exportBib(getAllBibliographyItems(), 'lung_radiology_all_references.bib'); });
    $('#export-all-csv').addEventListener('click', function () { exportModelsCsv(state.data.models, 'lung_radiology_models_full.csv'); });

    // Compare dock
    $('#btn-open-compare').addEventListener('click', openCompareModal);
    $('#btn-compare-bib').addEventListener('click', function () { exportBib(state.pinned.map(getModel).filter(Boolean), 'lung_compared_models.bib'); });
    $('#btn-compare-csv').addEventListener('click', function () { exportModelsCsv(state.pinned.map(getModel).filter(Boolean), 'lung_compared_models.csv'); });
    $('#btn-compare-clear').addEventListener('click', function () { state.pinned = []; renderCompareDock(); renderModelsSection(); });
    $('#compare-add-select').addEventListener('change', function (e) {
      if (e.target.value) {
        togglePin(e.target.value);
        openCompareModal();
      }
    });

    // Modals close
    $$('[data-close-modal]').forEach(function (btn) {
      btn.addEventListener('click', function () { $('#' + btn.dataset.closeModal).classList.add('hidden'); });
    });
    $$('.modal-backdrop').forEach(function (bd) {
      bd.addEventListener('click', function (e) { if (e.target === bd) bd.classList.add('hidden'); });
    });

    // Datasets, Benchmarks, Papers filters
    $('#dataset-search').addEventListener('input', function (e) { state.dsSearch = e.target.value; renderDatasetsTab(); });
    $('#dataset-category').addEventListener('change', function (e) { state.dsCategory = e.target.value; renderDatasetsTab(); });
    $('#dataset-access').addEventListener('change', function (e) { state.dsAccess = e.target.value; renderDatasetsTab(); });
    $('#benchmark-modality').addEventListener('change', function (e) { state.benchModality = e.target.value; renderBenchmarksTab(); });
    $('#paper-search').addEventListener('input', function (e) { state.paperSearch = e.target.value; renderPapersTab(); });
    $('#paper-kind').addEventListener('change', function (e) { state.paperKind = e.target.value; renderPapersTab(); });
    $('#paper-year').addEventListener('change', function (e) { state.paperYear = e.target.value; renderPapersTab(); });

    // Run tab
    $('#run-model-select').addEventListener('change', function (e) {
      state.runModelId = e.target.value;
      syncRunTab();
    });
    const dz = $('#scan-dropzone');
    const fileInput = $('#scan-file-input');
    $('#btn-choose-file').addEventListener('click', function (e) { e.stopPropagation(); fileInput.click(); });
    dz.addEventListener('click', function () { fileInput.click(); });
    dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', function () { dz.classList.remove('dragover'); });
    dz.addEventListener('drop', function (e) {
      e.preventDefault();
      dz.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        state.selectedFile = e.dataTransfer.files[0];
        $('#dropzone-title').textContent = 'Selected local file: ' + state.selectedFile.name + ' (' + (state.selectedFile.size / 1024).toFixed(1) + ' KB)';
      }
    });
    fileInput.addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) {
        state.selectedFile = e.target.files[0];
        $('#dropzone-title').textContent = 'Selected local file: ' + state.selectedFile.name + ' (' + (state.selectedFile.size / 1024).toFixed(1) + ' KB)';
      }
    });
    $('#btn-use-phantom').addEventListener('click', function (e) {
      e.stopPropagation();
      state.selectedFile = null;
      state.phantomKind = 'ct3d';
      $('#dropzone-title').textContent = 'Active input: Built-in 96³ Analytical 3D Thorax CT Phantom (RUL 18.4mm Spiculated Nodule)';
      showToast('Loaded 3D Thorax CT Phantom');
    });
    $('#btn-use-cxr-phantom').addEventListener('click', function (e) {
      e.stopPropagation();
      state.selectedFile = null;
      state.phantomKind = 'cxr2d';
      $('#dropzone-title').textContent = 'Active input: Built-in PA Chest Radiograph Phantom (Right Upper Zone Nodule)';
      showToast('Loaded PA Chest X-Ray Phantom');
    });
    $('#btn-run-model').addEventListener('click', executeModelRun);
    $('#btn-new-run').addEventListener('click', function () { switchTab('run'); });

    // Connect tab
    $$('input[name="exec-mode"]').forEach(function (r) {
      r.addEventListener('change', function () {
        state.execMode = r.value;
        localStorage.setItem('lungrad_exec_mode', state.execMode);
        updateModeIndicator();
        renderHardwareBar();
        syncRunTab();
      });
    });
    $('#server-url').value = state.serverUrl;
    $('#server-key').value = state.serverKey;
    $('#btn-test-server').addEventListener('click', testServerConnection);
    $('#btn-save-server').addEventListener('click', function () {
      state.serverUrl = $('#server-url').value.trim().replace(/\/$/, '');
      state.serverKey = $('#server-key').value.trim();
      state.hfToken = $('#hf-token').value.trim();
      state.execMode = 'server';
      localStorage.setItem('lungrad_server_url', state.serverUrl);
      localStorage.setItem('lungrad_server_key', state.serverKey);
      localStorage.setItem('lungrad_exec_mode', 'server');
      updateModeIndicator();
      renderHardwareBar();
      syncRunTab();
      testServerConnection();
    });
    $('#btn-copy-server-cmd').addEventListener('click', function () {
      copyText($('#server-quickstart-code').textContent, 'Copied server startup commands');
    });
  }

  async function init() {
    applyTheme(state.theme);
    state.browserHw = window.LungHardware.detectBrowserHardware();

    try {
      const resp = await fetch('models.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      state.data = await resp.json();
    } catch (err) {
      $('#models-container').innerHTML = '<div class="card-panel"><p>Failed to load <code>docs/models.json</code> (' + esc(err.message) + '). Serve <code>docs/</code> over HTTP (e.g. <code>python -m http.server 5500</code>) or GitHub Pages.</p></div>';
      return;
    }

    renderSuiteAndHero();
    updateModeIndicator();
    renderHardwareBar();
    renderModelsSection();
    renderDatasetsTab();
    renderBenchmarksTab();
    syncRunTab();
    seedInitialDemoJobs();
    renderPapersTab();
    bindEvents();

    const hash = window.location.hash.replace('#', '');
    if (hash) switchTab(hash);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
