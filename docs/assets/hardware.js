/**
 * hardware.js — Browser GPU/CPU detection & VRAM fit advisor
 * Estimates device capability via WebGL renderer strings + hardwareConcurrency,
 * or reports exact VRAM when connected to the local FastAPI GPU server.
 */
(function (global) {
  'use strict';

  function detectBrowserHardware() {
    let gpu = 'Integrated / Unknown GPU';
    let estVramGb = 8;
    const threads = navigator.hardwareConcurrency || 4;
    const memGb = navigator.deviceMemory || null;

    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) {
          const raw = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '';
          const cleaned = raw.replace(/^ANGLE \((?:[^,]+,\s*)?/, '').replace(/ Direct3D.*$/, '').replace(/\)$/, '').trim();
          if (cleaned) gpu = cleaned;
          const lower = raw.toLowerCase();
          if (/(h100|a100|a6000|l40|rtx 6000|rtx 5090)/.test(lower)) estVramGb = 48;
          else if (/(rtx 4090|rtx 3090|titan|l4|a5000|m3 max|m4 max)/.test(lower)) estVramGb = 24;
          else if (/(rtx 4080|rtx 4070 ti|a4000|t4|rx 7900|m2 pro|m3 pro|m4 pro)/.test(lower)) estVramGb = 16;
          else if (/(rtx 4070|rtx 3060|rtx 3080|rtx 2080)/.test(lower)) estVramGb = 12;
          else if (/(rtx 4060|rtx 3070|rtx 3050|rtx 2070|rtx 2060|apple m)/.test(lower)) estVramGb = 8;
          else if (/(gtx|mx|intel|uhd|iris|radeon graphics|swiftshader)/.test(lower)) estVramGb = 6;
        }
      }
    } catch (_) {
      // Fallback safely in headless/restricted browsers
    }

    return {
      source: 'browser',
      gpu,
      threads,
      memGb,
      estVramGb
    };
  }

  function resolveVramTarget(selectValue, browserInfo, serverHardware) {
    if (selectValue !== 'auto') {
      return Number(selectValue);
    }
    if (serverHardware && typeof serverHardware.vram_gb === 'number') {
      return serverHardware.vram_gb;
    }
    return browserInfo.estVramGb;
  }

  function countFittingModels(models, vramGb) {
    return models.filter(function (m) {
      if (vramGb === 0) return m.vram_gb <= 4;
      return m.vram_gb <= vramGb;
    }).length;
  }

  function modelFits(model, vramGb) {
    if (vramGb === 0) return model.vram_gb <= 4;
    return model.vram_gb <= vramGb;
  }

  global.LungHardware = {
    detectBrowserHardware,
    resolveVramTarget,
    countFittingModels,
    modelFits
  };
})(window);
