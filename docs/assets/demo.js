/**
 * demo.js — Analytical 3D Thorax CT Phantom (true Hounsfield Units),
 * Synthetic PA Chest Radiograph, and deterministic demo outputs for all 33 models.
 * Runs 100% client-side with zero external dependencies or network uploads.
 */
(function (global) {
  'use strict';

  const PHANTOM_DIM = 96; // 96^3 = 884,736 voxels -> crisp & generates in ~45ms
  let cachedThorax = null;
  let cachedCxr = null;

  const SEG_LABELS = [
    { id: 1, name: 'RUL Primary Tumor (GTV)', short: 'RUL GTV', color: [245, 158, 11], hex: '#f59e0b', lobe: 'Right Upper Lobe' },
    { id: 2, name: 'Right Upper Lobe (RUL)', short: 'RUL', color: [56, 189, 248], hex: '#38bdf8', lobe: 'Right Lung' },
    { id: 3, name: 'Right Middle Lobe (RML)', short: 'RML', color: [14, 165, 233], hex: '#0ea5e9', lobe: 'Right Lung' },
    { id: 4, name: 'Right Lower Lobe (RLL)', short: 'RLL', color: [34, 211, 238], hex: '#22d3ee', lobe: 'Right Lung' },
    { id: 5, name: 'Left Upper Lobe (LUL)', short: 'LUL', color: [52, 211, 153], hex: '#34d399', lobe: 'Left Lung' },
    { id: 6, name: 'Left Lower Lobe (LLL)', short: 'LLL', color: [16, 185, 129], hex: '#10b981', lobe: 'Left Lung' },
    { id: 7, name: 'Trachea & Main Bronchi', short: 'Airways', color: [167, 139, 250], hex: '#a78bfa', lobe: 'Central Airway' },
    { id: 8, name: 'LLL Calcified Granuloma', short: 'LLL Granuloma', color: [244, 114, 182], hex: '#f472b6', lobe: 'Left Lower Lobe' },
    { id: 9, name: 'Station 4R Hilar Node', short: '4R Node', color: [251, 113, 133], hex: '#fb7185', lobe: 'Mediastinum' }
  ];

  function hash3(x, y, z) {
    let n = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 4294967295;
  }

  /**
   * Generates a 96x96x96 3D Thoracic CT in true Hounsfield Units (-1024 to +900 HU)
   * Coordinate convention (radiological):
   *   x: 0 (patient Right) -> 95 (patient Left)   [shown R on left of Axial]
   *   y: 0 (Anterior)      -> 95 (Posterior)      [shown A on top of Axial]
   *   z: 0 (Inferior)      -> 95 (Superior)       [shown S on top of Coronal/Sagittal]
   */
  function getThoraxPhantom() {
    if (cachedThorax) return cachedThorax;

    const D = PHANTOM_DIM;
    const hu = new Int16Array(D * D * D);
    const mask = new Uint8Array(D * D * D);
    const counts = new Uint32Array(10);

    // Tumor centroid: Right Upper Lobe (patient right = low x, mid-anterior y, upper z)
    const tx = 29, ty = 43, tz = 67;
    // Calcified granuloma: Left Lower Lobe
    const gx = 68, gy = 56, gz = 34;
    // Station 4R right paratracheal/hilar lymph node
    const nx = 41, ny = 47, nz = 61;

    for (let z = 0; z < D; z++) {
      const zn = (z - 48) / 44; // -1.09 (inf) .. +1.07 (sup)
      const zOff = z * D * D;
      // Subtle rib periodicity along z
      const ribWave = Math.sin(z * 0.72);
      const isRibZ = ribWave > 0.42;

      for (let y = 0; y < D; y++) {
        const yn = (y - 49) / 33; // anterior (-1) .. posterior (+1)
        const yOff = zOff + y * D;

        for (let x = 0; x < D; x++) {
          const xn = (x - 48) / 42; // right (-1) .. left (+1)
          const idx = yOff + x;

          // Taper thorax near apex (superior z)
          const apexTaper = z > 72 ? 1.0 - (z - 72) * 0.015 : 1.0;
          const bodyR2 = (xn / apexTaper) * (xn / apexTaper) + (yn / (apexTaper * 0.94)) * (yn / (apexTaper * 0.94));

          if (bodyR2 > 1.02) {
            hu[idx] = -1000; // Outside air
            continue;
          }

          // Base chest wall: subcutaneous fat near rim, skeletal muscle inside
          let val = bodyR2 > 0.82 ? -95 : 46;

          // Spine (posterior midline vertebral bodies + spinous process)
          const spX = (x - 48) / 6.2;
          const spY = (y - 72) / 6.8;
          const spineR2 = spX * spX + spY * spY;
          if (spineR2 < 1.0) {
            val = spineR2 > 0.62 ? 640 : 280;
          }
          // Spinous process
          if (Math.abs(x - 48) < 2.2 && y >= 76 && y <= 84) {
            val = 560;
          }
          // Sternum (anterior midline)
          if (Math.abs(x - 48) < 4.5 && y >= 18 && y <= 23 && z >= 28 && z <= 78) {
            val = 540;
          }
          // Bilateral rib cage ring
          if (isRibZ && bodyR2 > 0.70 && bodyR2 < 0.81 && z >= 16 && z <= 82) {
            val = 610;
          }

          // Bilateral Lung Cavities
          // Right lung centered at x~30, Left lung centered at x~66 (slightly narrower due to heart)
          const lungTopZ = 82;
          const rightDiaphragmZ = 18 + 7 * Math.cos(xn * 2.1) + 4 * yn;
          const leftDiaphragmZ = 15 + 6 * Math.cos(xn * 2.1) + 4 * yn;

          let inRightLung = false;
          let inLeftLung = false;

          if (z <= lungTopZ) {
            const zDome = z > 58 ? 1.0 - Math.pow((z - 58) / 28, 2) * 0.45 : 1.0;
            const rlx = (x - 30) / (15.5 * zDome);
            const rly = (y - 49) / (21.5 * zDome);
            if (rlx * rlx + rly * rly < 1.0 && z > rightDiaphragmZ && x < 44) {
              inRightLung = true;
            }
            const llx = (x - 66) / (14.5 * zDome);
            const lly = (y - 50) / (21.0 * zDome);
            if (llx * llx + lly * lly < 1.0 && z > leftDiaphragmZ && x > 52) {
              inLeftLung = true;
            }
          }

          // Heart & Mediastinal Great Vessels (carves cardiac notch out of left lung)
          const hx = (x - 53) / 13.5;
          const hy = (y - 38) / 13.0;
          const hz = (z - 37) / 16.5;
          const inHeart = (hx * hx + hy * hy + hz * hz) < 1.0;

          const ascAx = (x - 47) / 4.2, ascAy = (y - 41) / 4.2;
          const inAscAorta = (ascAx * ascAx + ascAy * ascAy < 1.0) && z >= 45 && z <= 67;
          const descAx = (x - 54) / 3.8, descAy = (y - 61) / 3.8;
          const inDescAorta = (descAx * descAx + descAy * descAy < 1.0) && z >= 10 && z <= 68;

          if (inHeart) {
            inLeftLung = false;
            inRightLung = false;
            val = 58;
          }
          if (inAscAorta || inDescAorta) {
            inLeftLung = false;
            val = 128;
          }

          // Trachea & Mainstem Bronchi
          let inAirway = false;
          if (z >= 60 && z <= 90) {
            const trR2 = (x - 48) * (x - 48) + (y - 47) * (y - 47);
            if (trR2 < 10.5) inAirway = true;
          } else if (z >= 50 && z < 60) {
            // Bifurcation at carina (z=60)
            const dz = 60 - z;
            const rbR2 = (x - (48 - dz * 1.15)) ** 2 + (y - 47) ** 2;
            const lbR2 = (x - (48 + dz * 1.25)) ** 2 + (y - 48) ** 2;
            if (rbR2 < 6.5 || lbR2 < 6.5) inAirway = true;
          }

          if (inAirway) {
            val = -975;
            mask[idx] = 7;
            counts[7]++;
          } else if (inRightLung || inLeftLung) {
            // Aerated lung parenchyma with gentle bronchovascular branching texture
            const noise = (hash3(x, y, z) - 0.5) * 48;
            const vessel = Math.sin(x * 0.48 + z * 0.25) * Math.cos(y * 0.45 - z * 0.22);
            val = Math.round(-785 + noise + (vessel > 0.72 ? 260 : 0));

            if (inRightLung) {
              // Oblique fissure tilts superiorly from anterior-inferior to posterior-superior
              const obliqueZ = 22 + (y - 24) * 0.92;
              if (z < obliqueZ) {
                mask[idx] = 4; // RLL
                counts[4]++;
              } else if (z < 50 && y < 52) {
                mask[idx] = 3; // RML
                counts[3]++;
              } else {
                mask[idx] = 2; // RUL
                counts[2]++;
              }
            } else {
              const obliqueZ = 20 + (y - 24) * 0.95;
              if (z < obliqueZ) {
                mask[idx] = 6; // LLL
                counts[6]++;
              } else {
                mask[idx] = 5; // LUL
                counts[5]++;
              }
            }
          } else if (z < 19 && x < 54 && bodyR2 < 0.70) {
            val = 62; // Upper liver dome
          }

          // ---- PATHOLOGY 1: RUL Spiculated Primary Adenocarcinoma (GTV, ~18.4 mm) ----
          const dtx = x - tx, dty = y - ty, dtz = z - tz;
          const distT = Math.sqrt(dtx * dtx + dty * dty + dtz * dtz);
          if (distT < 7.2 && inRightLung) {
            const ang1 = Math.atan2(dty, dtx);
            const ang2 = Math.atan2(dtz, Math.sqrt(dtx * dtx + dty * dty));
            const spicule = 1.0 + 0.24 * Math.sin(ang1 * 7) * Math.cos(ang2 * 5) + 0.14 * Math.cos(ang1 * 4 - ang2 * 3);
            const effR = distT / spicule;
            if (effR < 3.55) {
              // Solid malignant core (+18 to +42 HU)
              val = Math.round(28 + (hash3(x, y, z) - 0.5) * 26);
              if (mask[idx] > 0) counts[mask[idx]]--;
              mask[idx] = 1;
              counts[1]++;
            } else if (effR < 4.75) {
              // Ground-glass opacity (GGO) halo (-460 HU)
              val = Math.round(-440 + (hash3(x, y, z) - 0.5) * 70);
              if (mask[idx] > 0) counts[mask[idx]]--;
              mask[idx] = 1;
              counts[1]++;
            }
          }

          // ---- PATHOLOGY 2: LLL Benign Calcified Granuloma (~6.2 mm, +310 HU) ----
          const dgx = x - gx, dgy = y - gy, dgz = z - gz;
          const distG = Math.sqrt(dgx * dgx + dgy * dgy + dgz * dgz);
          if (distG < 2.1 && inLeftLung) {
            val = Math.round(310 + (hash3(x, y, z) - 0.5) * 45);
            if (mask[idx] > 0) counts[mask[idx]]--;
            mask[idx] = 8;
            counts[8]++;
          }

          // ---- PATHOLOGY 3: Station 4R Enlarged Hilar / Paratracheal Lymph Node ----
          const dnx = (x - nx) / 3.0, dny = (y - ny) / 2.6, dnz = (z - nz) / 3.2;
          if (dnx * dnx + dny * dny + dnz * dnz < 1.0) {
            val = 52;
            if (mask[idx] > 0) counts[mask[idx]]--;
            mask[idx] = 9;
            counts[9]++;
          }

          // Subtle scanner quantum noise
          hu[idx] = Math.max(-1024, Math.min(1000, val + Math.round((hash3(x + 7, y + 13, z + 3) - 0.5) * 14)));
        }
      }
    }

    // Physical voxel spacing ~3.2 mm x 3.2 mm x 3.2 mm for whole-thorax 96^3 box (~30.7 cm FOV)
    const voxelVolMm3 = 3.2 * 3.2 * 3.2;
    const volumetry = SEG_LABELS.map(function (lbl) {
      const vox = counts[lbl.id];
      const mm3 = Math.round(vox * voxelVolMm3);
      return {
        id: lbl.id,
        name: lbl.name,
        short: lbl.short,
        color: lbl.hex,
        voxels: vox,
        mm3: mm3,
        ml: Number((mm3 / 1000).toFixed(2)),
        qc: Number((0.92 + ((lbl.id * 17) % 7) * 0.01).toFixed(2))
      };
    });

    cachedThorax = {
      dim: D,
      spacing: [3.2, 3.2, 3.2],
      hu: hu,
      mask: mask,
      labels: SEG_LABELS,
      volumetry: volumetry,
      defaultCrosshair: { x: tx, y: ty, z: tz }
    };
    return cachedThorax;
  }

  /**
   * Generates a 320x320 synthetic PA Chest Radiograph (0..255 grayscale)
   * with ribs, clavicles, lung fields, mediastinum, heart, diaphragms & RUL pulmonary nodule.
   */
  function getCxrPhantom() {
    if (cachedCxr) return cachedCxr;
    const W = 320, H = 320;
    const pixels = new Uint8ClampedArray(W * H);

    for (let y = 0; y < H; y++) {
      const yn = (y - H * 0.52) / (H * 0.44);
      for (let x = 0; x < W; x++) {
        const xn = (x - W * 0.5) / (W * 0.45);
        const idx = y * W + x;

        // Soft tissue silhouette of upper torso
        const torso = (xn * xn) / 1.05 + Math.pow((yn - 0.1) / 1.18, 2);
        let intensity = torso < 1.0 ? 115 : 18;

        // Bilateral aerated lung fields (darker = radiolucent)
        const rLung = Math.pow((x - 108) / 56, 2) + Math.pow((y - 154) / 96, 2);
        const lLung = Math.pow((x - 214) / 54, 2) + Math.pow((y - 152) / 94, 2);
        const belowDiaph = y > (226 - 18 * Math.cos((x - 160) * 0.032) + (x < 160 ? -6 : 4));

        if ((rLung < 1.0 || lLung < 1.0) && !belowDiaph && y > 46) {
          intensity = 46 + Math.round((rLung < 1.0 ? rLung : lLung) * 28);
          // Subtle bronchovascular hilar markings
          const hilarDist = Math.hypot(x - 160, y - 148);
          if (hilarDist < 76) {
            intensity += Math.round((76 - hilarDist) * 0.48);
          }
        }

        // Mediastinum, spine & cardiothoracic silhouette (radiopaque = bright)
        if (Math.abs(x - 160) < 23 && y > 32) {
          intensity = Math.max(intensity, 178 - Math.abs(x - 160) * 1.4);
        }
        const heart = Math.pow((x - 180) / 48, 2) + Math.pow((y - 200) / 44, 2);
        if (heart < 1.0) {
          intensity = Math.max(intensity, Math.round(198 - heart * 42));
        }

        // Diaphragm & subdiaphragmatic abdomen
        if (belowDiaph && torso < 1.0) {
          intensity = Math.max(intensity, 184);
        }

        // Posterior & anterior ribs
        if (torso < 0.94 && y > 54 && y < 235) {
          const ribArc = Math.sin((y - Math.pow(Math.abs(x - 160), 1.25) * 0.08) * 0.31);
          if (ribArc > 0.72) intensity += 24;
        }
        // Clavicles
        const clavY = 66 + Math.abs(x - 160) * 0.14;
        if (Math.abs(y - clavY) < 4.5 && Math.abs(x - 160) > 16 && Math.abs(x - 160) < 118) {
          intensity += 42;
        }

        // Primary Finding: Right Upper Zone Pulmonary Nodule (centered x=98, y=104)
        const nodDist = Math.hypot(x - 98, y - 104);
        if (nodDist < 13) {
          const core = Math.exp(-(nodDist * nodDist) / 44);
          intensity += Math.round(core * 92);
        }

        // Quantum grain
        const grain = (hash3(x, y, 11) - 0.5) * 10;
        pixels[idx] = Math.max(0, Math.min(255, Math.round(intensity + grain)));
      }
    }

    cachedCxr = {
      width: W,
      height: H,
      pixels: pixels,
      boxes: [
        {
          id: 'rul_nodule',
          label: 'Right upper zone pulmonary nodule (18 mm)',
          x: 78, y: 86, w: 40, h: 36,
          confidence: 0.94,
          color: '#f59e0b'
        },
        {
          id: 'hilar_node',
          label: 'Mild right hilar prominence',
          x: 124, y: 124, w: 30, h: 32,
          confidence: 0.71,
          color: '#38bdf8'
        }
      ]
    };
    return cachedCxr;
  }

  /**
   * Builds a deterministic demo inference result tailored to the selected model & task.
   */
  function runDemoInference(model, taskId, options) {
    const phantom = getThoraxPhantom();
    const indication = (options && options.indication) || '64M former smoker, LDCT screening evaluation of RUL spiculated nodule.';
    const guideline = (options && options.guideline) || 'lungrads';
    const scanName = (options && options.scanName) || (model.modality.includes('CXR') && !model.modality.includes('3D Chest CT') ? 'demo_pa_cxr_rul_nodule.png' : 'demo_thorax_ldct_rul_18mm.nii.gz');
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Seed small deterministic variation per model ID so comparing models feels realistic
    let seed = 0;
    for (let i = 0; i < model.id.length; i++) seed = (seed * 31 + model.id.charCodeAt(i)) % 1000;
    const delta = ((seed % 11) - 5) * 0.004;

    const baseJob = {
      job_id: 'demo-' + model.id + '-' + Date.now().toString(36),
      model_id: model.id,
      model_name: model.name,
      family: model.family,
      task: taskId,
      scan_name: scanName,
      indication: indication,
      guideline: guideline,
      mode: 'demo',
      created_at: now,
      runtime_sec: Number((0.45 + (seed % 9) * 0.14).toFixed(2)),
      measured_vram_gb: model.vram_gb,
      window_preset: (options && options.windowPreset) || 'lung'
    };

    if (taskId === 'risk_pred') {
      const y1 = Math.min(0.95, Math.max(0.08, 0.42 + delta * 3));
      const curve = [
        { year: 1, prob: Number(y1.toFixed(3)) },
        { year: 2, prob: Number(Math.min(0.97, y1 + 0.16).toFixed(3)) },
        { year: 3, prob: Number(Math.min(0.98, y1 + 0.25).toFixed(3)) },
        { year: 4, prob: Number(Math.min(0.98, y1 + 0.31).toFixed(3)) },
        { year: 5, prob: Number(Math.min(0.99, y1 + 0.35).toFixed(3)) },
        { year: 6, prob: Number(Math.min(0.99, y1 + 0.38).toFixed(3)) }
      ];
      return Object.assign(baseJob, {
        view_type: 'risk_3d',
        kpis: [
          { label: '1-Year Cancer Risk', value: (curve[0].prob * 100).toFixed(1) + '%' },
          { label: '6-Year Cumulative Risk', value: (curve[5].prob * 100).toFixed(1) + '%' },
          { label: 'Lung-RADS v2022', value: 'Category 4B' },
          { label: 'Index Lesion', value: '18.4 mm RUL' }
        ],
        risk_curve: curve,
        malignancy_prob: Number((0.86 + delta).toFixed(3)),
        lungrads_tier: '4B — Very Suspicious (>15 mm solid/part-solid spiculated nodule)',
        findings_probs: [
          { label: 'Suspicious RUL Spiculated Nodule', score: Number((0.94 + delta).toFixed(2)) },
          { label: 'Ground-Glass Peripheral Halo', score: Number((0.81 + delta).toFixed(2)) },
          { label: 'Ipsilateral Station 4R Node (11 mm)', score: Number((0.68 + delta).toFixed(2)) },
          { label: 'Mild Centrilobular Emphysema', score: 0.34 },
          { label: 'LLL Benign Calcified Granuloma', score: 0.14 }
        ],
        report: {
          indication: indication,
          technique: 'Low-dose non-contrast volumetric chest CT (demo 96³ isotropic HU phantom). Evaluated with ' + model.name + ' (' + model.architecture + ').',
          findings: '1. Dominant spiculated part-solid pulmonary nodule in the right upper lobe measuring 18.4 mm maximum diameter (solid core 13.8 mm, 3D volume ' + phantom.volumetry[0].mm3 + ' mm³).\n2. Benign-appearing 6.2 mm calcified granuloma in the left lower lobe (+310 HU).\n3. Borderline 11 mm right paratracheal / hilar lymph node (station 4R). No pleural effusion or pneumothorax.',
          impression: 'High short- and medium-term lung cancer risk (' + (curve[0].prob * 100).toFixed(1) + '% 1-yr; ' + (curve[5].prob * 100).toFixed(1) + '% 6-yr). Lung-RADS v2022 Category 4B. Recommend diagnostic contrast chest CT, FDG-PET/CT staging, and multidisciplinary thoracic tumor board / tissue sampling consideration.'
        }
      });
    }

    if (taskId === 'seg_3d') {
      const gtv = phantom.volumetry[0];
      return Object.assign(baseJob, {
        view_type: 'seg_3d',
        kpis: [
          { label: 'Segmented Classes', value: String(phantom.volumetry.length) },
          { label: 'Primary RUL GTV', value: gtv.ml.toFixed(2) + ' mL' },
          { label: 'RECIST 1.1 Long Axis', value: '18.4 mm' },
          { label: 'Automated QC', value: '0.96 (Pass)' }
        ],
        volumetry: phantom.volumetry,
        recist: {
          target_lesion: 'Right Upper Lobe Primary GTV',
          long_axis_mm: 18.4,
          short_axis_mm: 14.2,
          volume_mm3: gtv.mm3,
          mean_hu: -118,
          solid_core_hu: 28,
          tnm_t_stage: 'cT1b (11-20 mm)'
        }
      });
    }

    if (taskId === 'ct_report') {
      return Object.assign(baseJob, {
        view_type: 'vlm_3d',
        kpis: [
          { label: 'Primary Finding', value: 'RUL Mass/Nodule' },
          { label: 'Lung-RADS v2022', value: '4B (Suspicious)' },
          { label: '18-Finding Triage', value: '3 Flagged' },
          { label: 'Model Context', value: model.params }
        ],
        findings_probs: [
          { label: 'Lung Nodule / Mass', score: Number((0.95 + delta).toFixed(2)) },
          { label: 'Lymphadenopathy (Hilar/Mediastinal)', score: Number((0.72 + delta).toFixed(2)) },
          { label: 'Pulmonary Calcification (Benign LLL)', score: 0.64 },
          { label: 'Emphysema', score: 0.29 },
          { label: 'Pleural Effusion', score: 0.06 },
          { label: 'Pneumothorax', score: 0.02 }
        ],
        report: {
          indication: indication,
          technique: '3D volumetric chest CT ingested by ' + model.name + ' (' + model.input_spec + ').',
          findings: 'LUNGS & AIRWAYS: An 18.4 mm spiculated part-solid nodule is present in the right upper lobe with subtle surrounding ground-glass attenuation and pleural tether. A 6.2 mm densely calcified granuloma is noted in the left lower lobe. Central tracheobronchial tree is patent.\nMEDIASTINUM & HILA: Borderline 11 mm right paratracheal/hilar lymph node (station 4R). Heart size and thoracic aorta caliber are normal.\nPLEURA & CHEST WALL: No pleural effusion, pneumothorax, or suspicious osseous lytic lesion.',
          impression: '1. Suspicious 18.4 mm spiculated right upper lobe pulmonary nodule (Lung-RADS 4B; suspicious for primary bronchogenic carcinoma / adenocarcinoma).\n2. Borderline station 4R lymph node — correlate with FDG-PET/CT.\n3. Benign 6.2 mm calcified granuloma in the left lower lobe.',
          vqa: [
            { q: 'What is the dominant suspicious finding and its lobe location?', a: 'An 18.4 mm spiculated part-solid pulmonary nodule in the right upper lobe (RUL), compatible with ACR Lung-RADS Category 4B.' },
            { q: 'Are there any signs of pleural effusion or pneumothorax?', a: 'No pleural effusion or pneumothorax is detected across the bilateral hemithoraces.' }
          ]
        }
      });
    }

    if (taskId === 'cxr_report' || taskId === 'cxr_detect') {
      return Object.assign(baseJob, {
        view_type: 'cxr_2d',
        kpis: [
          { label: 'Lung Lesion Score', value: ((0.94 + delta) * 100).toFixed(1) + '%' },
          { label: 'Grounded Boxes', value: '2 Localized' },
          { label: 'Cardiothoracic Ratio', value: '0.47 (Normal)' },
          { label: 'Recommended Next Step', value: 'Diagnostic Chest CT' }
        ],
        findings_probs: [
          { label: 'Lung Lesion / Nodule (RUL)', score: Number((0.94 + delta).toFixed(2)) },
          { label: 'Right Hilar Prominence', score: Number((0.71 + delta).toFixed(2)) },
          { label: 'Lung Opacity (Focal)', score: Number((0.63 + delta).toFixed(2)) },
          { label: 'Pleural Effusion', score: 0.05 },
          { label: 'Consolidation / Pneumonia', score: 0.09 },
          { label: 'Pneumothorax', score: 0.02 }
        ],
        report: {
          indication: indication,
          technique: 'Frontal PA chest radiograph analyzed with ' + model.name + ' (' + model.architecture + ').',
          findings: 'A well-defined ~18 mm nodular opacity projects over the right upper lung zone [box #1] with mild ipsilateral right hilar prominence [box #2]. The left lung is clear. Cardiomediastinal silhouette is within normal limits. Bilateral costophrenic angles are sharp with no pleural effusion or pneumothorax.',
          impression: '1. Suspicious ~18 mm right upper lung zone nodule with mild right hilar prominence. Recommend dedicated contrast-enhanced thoracic CT for definitive characterization and staging.'
        }
      });
    }

    if (taskId === 'vol_embed') {
      return Object.assign(baseJob, {
        view_type: 'embed_3d',
        kpis: [
          { label: 'Embedding Dim', value: '768-d L2-norm' },
          { label: 'Nearest Cohort Cluster', value: 'Stage I-II Adeno' },
          { label: 'Linear-Probe Malignancy', value: ((0.89 + delta) * 100).toFixed(1) + '%' },
          { label: '2-Yr Survival Risk', value: 'Intermediate' }
        ],
        pca_points: [
          { x: -2.4, y: -1.6, group: 'NLST Benign / Normal', color: '#34d399' },
          { x: -1.9, y: -1.1, group: 'NLST Benign / Normal', color: '#34d399' },
          { x: -2.1, y: -0.7, group: 'NLST Benign / Normal', color: '#34d399' },
          { x: -0.5, y: 0.2, group: 'Indeterminate GGN (LUNA25)', color: '#38bdf8' },
          { x: -0.2, y: 0.6, group: 'Indeterminate GGN (LUNA25)', color: '#38bdf8' },
          { x: 0.3, y: -0.2, group: 'Indeterminate GGN (LUNA25)', color: '#38bdf8' },
          { x: 1.4, y: 1.1, group: 'Stage I-II NSCLC (Lung1)', color: '#f59e0b' },
          { x: 1.8, y: 0.8, group: 'Stage I-II NSCLC (Lung1)', color: '#f59e0b' },
          { x: 1.5, y: 1.6, group: 'Stage I-II NSCLC (Lung1)', color: '#f59e0b' },
          { x: 2.5, y: -0.9, group: 'Advanced Stage III-IV', color: '#fb7185' },
          { x: 2.8, y: -1.3, group: 'Advanced Stage III-IV', color: '#fb7185' }
        ],
        query_point: { x: Number((1.58 + delta * 8).toFixed(2)), y: Number((1.15 - delta * 6).toFixed(2)), label: 'Current Study (RUL 18.4mm)' },
        nearest_cases: [
          { case_id: 'LIDC-IDRI-0412', cohort: 'LIDC-IDRI', cosine: 0.94, label: 'RUL Spiculated Adenocarcinoma (19 mm)' },
          { case_id: 'LUNG1-108', cohort: 'NSCLC-Radiomics', cosine: 0.91, label: 'Stage IB Adenocarcinoma (GTV 3.1 mL)' },
          { case_id: 'NLST-104928', cohort: 'LUNA25 / NLST', cosine: 0.88, label: 'Malignant Part-Solid Nodule (17 mm)' }
        ]
      });
    }

    // Default: ct_synth (MAISI, GenerateCT, RoentGen)
    const isCxr = model.modality.includes('CXR') && !model.modality.includes('3D Chest CT');
    return Object.assign(baseJob, {
      view_type: isCxr ? 'cxr_2d' : 'seg_3d',
      kpis: [
        { label: 'Synthetic Target', value: isCxr ? '512x512 PA CXR' : '3D Thorax CT + Mask' },
        { label: 'Prompt Adherence', value: '0.93 CLIP-Sim' },
        { label: 'HU / Intensity Fidelity', value: 'FID 14.2 (Pass)' },
        { label: 'Conditioning', value: (options && options.roiPrompt) ? 'Prompt-Guided' : 'Lung Tumor + Lobes' }
      ],
      volumetry: phantom.volumetry,
      findings_probs: [
        { label: 'Synthesized RUL Spiculated Nodule', score: 0.96 },
        { label: 'Anatomical Lobe Boundary Coherence', score: 0.94 },
        { label: 'Rib Cage & Spine HU Calibration', score: 0.92 }
      ],
      report: {
        indication: 'Synthetic thoracic cohort augmentation: ' + indication,
        technique: model.name + ' (' + model.architecture + ') conditioned on prompt: "' + ((options && options.roiPrompt) || 'right upper lobe spiculated nodule') + '".',
        findings: 'Generated anatomically coherent ' + (isCxr ? 'PA chest radiograph' : '3D Hounsfield-calibrated thoracic CT volume paired with 9-class anatomical and RUL tumor ground-truth masks') + ' suitable for reader-study prototyping and minority-class training augmentation.',
        impression: 'Synthetic volume verified for research augmentation. Zero real patient data used.'
      }
    });
  }

  /**
   * Builds a valid minimal NIfTI-1 (.nii) ArrayBuffer from a Uint8Array volume
   * so users can genuinely download the 3D segmentation mask and inspect it in 3D Slicer / ITK-SNAP!
   */
  function buildNifti1Uint8(volumeU8, dim, spacing) {
    const headerSize = 352;
    const buf = new ArrayBuffer(headerSize + volumeU8.length);
    const dv = new DataView(buf);
    dv.setInt32(0, 348, true);        // sizeof_hdr
    dv.setInt16(40, 3, true);         // dim[0] = 3
    dv.setInt16(42, dim, true);       // dim[1]
    dv.setInt16(44, dim, true);       // dim[2]
    dv.setInt16(46, dim, true);       // dim[3]
    dv.setInt16(70, 2, true);         // datatype = DT_UINT8 (2)
    dv.setInt16(72, 8, true);         // bitpix = 8
    dv.setFloat32(76, 1.0, true);     // pixdim[0]
    dv.setFloat32(80, spacing[0], true);
    dv.setFloat32(84, spacing[1], true);
    dv.setFloat32(88, spacing[2], true);
    dv.setFloat32(108, 352.0, true);  // vox_offset
    dv.setFloat32(112, 1.0, true);    // scl_slope
    // magic "n+1\0" at byte 344
    dv.setUint8(344, 110);
    dv.setUint8(345, 43);
    dv.setUint8(346, 49);
    dv.setUint8(347, 0);
    new Uint8Array(buf, headerSize).set(volumeU8);
    return buf;
  }

  global.LungDemo = {
    PHANTOM_DIM,
    SEG_LABELS,
    getThoraxPhantom,
    getCxrPhantom,
    runDemoInference,
    buildNifti1Uint8
  };
})(window);
