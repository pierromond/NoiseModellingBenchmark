// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const RESULTS_URL  = 'data/results.json';
const BUILD_URL    = 'data/build.json';
const SETTINGS_URL = 'data/settings.json';
const STATE_KEY    = 'nm-benchmark-state-v1';
let BUILD = {};
let SETTINGS = {};
let ALL_RESULTS = [];
let histoRedraw = null;
let boxplotRedraw = null;

// Color palette per version index
const PALETTE = ['#00e5ff','#ff6b35','#7fff6b','#f7d716','#c77dff','#ff4081','#00e676','#ff9100','#40c4ff','#ea80fc','#b388ff','#1de9b6'];


const ISO_COLORS_BY_LVL = {
  0:  '#82a7ac',  // < 35
  1:  '#a0bbbf',  // 35-40
  2:  '#b8d6d1',  // 40-45
  3:  '#cfe4cc',  // 45-50
  4:  '#e3f2bf',  // 50-55
  5:  '#f4c683',  // 55-60
  6:  '#e87d4d',  // 60-65
  7:  '#cd463f',  // 65-70
  8:  '#a11a4d',  // 70-75
  9:  '#75095d',  // 75-80
  10: '#430a4a',  // > 80
};

const ISO_COLORS_BY_LABEL = {
  '< 35':  '#82a7ac',
  '35-40': '#a0bbbf',
  '40-45': '#b8d6d1',
  '45-50': '#cfe4cc',
  '50-55': '#e3f2bf',
  '55-60': '#f4c683',
  '60-65': '#e87d4d',
  '65-70': '#cd463f',
  '70-75': '#a11a4d',
  '75-80': '#75095d',
  '> 80':  '#430a4a',
};

function isoColor(labelOrLvl, lvl) {
  if (lvl !== undefined && ISO_COLORS_BY_LVL[lvl] !== undefined) {
    return ISO_COLORS_BY_LVL[lvl];
  }
  if (typeof labelOrLvl === 'number' && ISO_COLORS_BY_LVL[labelOrLvl] !== undefined) {
    return ISO_COLORS_BY_LVL[labelOrLvl];
  }

  const label = String(labelOrLvl || '').trim();
  if (ISO_COLORS_BY_LABEL[label]) return ISO_COLORS_BY_LABEL[label];

  const num = parseFloat(label);
  if (!isNaN(num)) {
    if (num < 35) return ISO_COLORS_BY_LVL[0];
    else if (num < 40) return ISO_COLORS_BY_LVL[1];
    else if (num < 45) return ISO_COLORS_BY_LVL[2];
    else if (num < 50) return ISO_COLORS_BY_LVL[3];
    else if (num < 55) return ISO_COLORS_BY_LVL[4];
    else if (num < 60) return ISO_COLORS_BY_LVL[5];
    else if (num < 65) return ISO_COLORS_BY_LVL[6];
    else if (num < 70) return ISO_COLORS_BY_LVL[7];
    else if (num < 75) return ISO_COLORS_BY_LVL[8];
    else if (num < 80) return ISO_COLORS_BY_LVL[9];
    else return ISO_COLORS_BY_LVL[10];
  }
  return '#82a7ac';
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function fmt(n, dec = 2) {
  return typeof n === 'number' ? n.toFixed(dec) : '—';
}

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function readState() {
  const fromHash = new URLSearchParams(location.hash.replace(/^#/, ''));
  if ([...fromHash.keys()].length) return fromHash;
  try { return new URLSearchParams(localStorage.getItem(STATE_KEY) || ''); } catch (e) { return new URLSearchParams(); }
}

function syncState(patch) {
  const cur = new URLSearchParams(location.hash.replace(/^#/, ''));
  Object.entries(patch).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') cur.delete(key);
    else cur.set(key, value);
  });
  const qs = cur.toString();
  history.replaceState(null, '', location.pathname + location.search + (qs ? '#' + qs : ''));
  try { localStorage.setItem(STATE_KEY, qs); } catch (e) {}
}

function copyLink(btn) {
  const url = location.href;
  const done = () => {
    const old = btn.textContent;
    btn.textContent = 'Link copied';
    setTimeout(() => { btn.textContent = old; }, 1500);
  };
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(done).catch(() => {});
  else done();
}

function receiverStats(data) {
  const totals = data.map(r => Object.values(r.histogram || {}).reduce((a, b) => a + b, 0)).filter(n => n > 0);
  const silenced = data.map(r => r.nNan).filter(n => typeof n === 'number');
  if (!totals.length) return null;
  const total = totals[0];
  return {
    total,
    minCompared: silenced.length ? total - Math.max(...silenced) : total,
    maxCompared: silenced.length ? total - Math.min(...silenced) : total,
    maxSilenced: silenced.length ? Math.max(...silenced) : 0,
  };
}

function activeLayerIds() {
  return [...document.querySelectorAll('#map-layer-controls .layer-btn.active')]
    .filter(btn => !btn.disabled)
    .map(btn => btn.dataset.layer)
    .join(',');
}

// ─────────────────────────────────────────────
// RENDER CARDS
// ─────────────────────────────────────────────
function renderCards(data) {
  const grid = document.getElementById('cards-grid');
  if (!data.length) { grid.innerHTML = '<div class="empty">No results found.</div>'; return; }

  grid.innerHTML = data.map((row, i) => {
    const color = PALETTE[i % PALETTE.length];
    const raysRows = (row.nbRays && row.timePerRays) ? `
          <div class="stat-row">
            <span class="stat-label">Rays number</span>
            <span class="stat-value accent3">${row.nbRays}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Compute time Per Rays</span>
            <span class="stat-value accent2">${fmt(row.timePerRays)} ms</span>
          </div>` : '';
    const silencedRow = row.nNan ? `
          <div class="stat-row">
            <span class="stat-label">Silenced receivers (≤ ${row.silenceThreshold ?? -89} dB)</span>
            <span class="stat-value">${row.nNan.toLocaleString()}</span>
          </div>` : '';
    return `
      <div class="card" style="--card-accent:${color}">
        <div class="card-version">${row.version}</div>
        <div class="card-stats">
          <div class="stat-row">
            <span class="stat-label">Mean LAEQ</span>
            <span class="stat-value accent">${fmt(row.mean)} dB</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Compute time</span>
            <span class="stat-value accent3">${row.time || '—'}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Compute time Per Receiver</span>
            <span class="stat-value accent2">${row.timePerReceive  || '—'} ms</span>
          </div>${raysRows}${silencedRow}
          <div class="stat-row">
            <span class="stat-label">Java</span>
            <span class="stat-value">${row.java || '—'}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Runner</span>
            <span class="stat-value">${row.runner || '—'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ─────────────────────────────────────────────
// RENDER HEADER META
// ─────────────────────────────────────────────
function renderHeaderMeta(data) {
  const el = document.getElementById('header-meta');
  const demUrl = (document.querySelector('meta[name="dem-url"]') || {}).content || '';
  const demRow = demUrl
    ? `DEM (652 MB, open data): <a href="${demUrl}" style="color:var(--accent)">download</a><br>`
    : '';

  const st = receiverStats(data);
  const threshold = fmt(data.length ? (data[0].silenceThreshold ?? -89) : -89, 0);
  const receivers = st
    ? `Receivers: <b>${st.total.toLocaleString()}</b>` +
      (st.maxCompared !== st.minCompared
        ? ` (<b>${st.minCompared.toLocaleString()}</b>–<b>${st.maxCompared.toLocaleString()}</b> compared per pair)`
        : '') +
      `<br>Levels ≤ <b>${threshold}</b> dB are NaN: excluded from means and comparisons<br>`
    : '';
  const occurrences = (typeof SETTINGS.favorableOccurrence === 'number' && SETTINGS.occurrencesPerDay)
    ? `${Math.round(SETTINGS.favorableOccurrence * 100)}% (${SETTINGS.occurrencesPerDay}/day)`
    : '—';

  el.innerHTML = `
    <b>${data.length}</b> version${data.length > 1 ? 's' : ''} compared<br>
    Input: <b>${SETTINGS.dataset || 'Clisson, France'}</b> (EPSG:2154)<br>
    ${receivers}
    ${demRow}
    *Max Error: <b>${SETTINGS.maxError ?? '—'}</b><br>
    Reflexion Order: <b>${SETTINGS.reflOrder ?? '—'}</b><br>
    Propagation Distance: <b>${SETTINGS.maxSrcDist ?? '—'}</b><br>
    Horizontal Diffraction: <b>${SETTINGS.diffHorizontal === undefined ? '—' : String(SETTINGS.diffHorizontal)}</b><br>
    Occurrences of favourable conditions: <b>${occurrences}</b><br>
    <br>
    *: <b>Please note that the definition of this setting has changed over the course of different versions.</b><br>
    <span style="font-size:.62rem;opacity:.8">Settings published from <code>${SETTINGS.source || 'the simulation script'}</code></span><br>
    <button class="map-btn" onclick="copyLink(this)" style="margin-top:.5rem">Copy link to this view</button>
  `;
}

function renderFooter() {
  const el = document.getElementById('footer-date');
  if (!el) return;
  const parts = [];
  if (BUILD.builtAt) parts.push(`Built ${BUILD.builtAt}`);
  if (BUILD.repo && BUILD.sha) {
    parts.push(`<a href="https://github.com/${BUILD.repo}/commit/${BUILD.sha}" target="_blank" rel="noopener">${BUILD.sha.slice(0, 8)}</a>`);
  }
  if (BUILD.repo && BUILD.runId) {
    parts.push(`<a href="https://github.com/${BUILD.repo}/actions/runs/${BUILD.runId}" target="_blank" rel="noopener">run ${BUILD.runId}</a>`);
  }
  el.innerHTML = parts.join(' · ');
}

function sourceLabel(version) {
  const url = (BUILD.versionSources || {})[version];
  return url
    ? `<a href="${url}" target="_blank" rel="noopener">release zip</a>`
    : 'CI artifact (head)';
}

function downloadCsv() {
  const cols = ['version', 'mean', 'time', 'timePerReceive', 'java', 'runner', 'nNan', ...HISTO_BINS];
  const lines = [cols.join(',')];
  ALL_RESULTS.forEach(row => {
    lines.push(cols.map(col => {
      if (col === 'version') return row.version;
      if (HISTO_BINS.includes(col)) return (row.histogram || {})[col] ?? '';
      return row[col] ?? '';
    }).join(','));
  });
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'noisemodelling-benchmark.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

function renderMethod(data) {
  const el = document.getElementById('method-body');
  if (!el) return;
  const st = receiverStats(data);
  const threshold = fmt(data.length ? (data[0].silenceThreshold ?? -89) : -89, 0);
  const samplePoints = (pairComparisons[0] || {}).max_payload_points || 3000;
  const demUrl = (document.querySelector('meta[name="dem-url"]') || {}).content || '';
  const repo = BUILD.repo || 'Universite-Gustave-Eiffel/NoiseModellingBenchmark';

  const rows = data.map(row => `
    <tr>
      <td style="padding:.15rem .8rem .15rem 0">${row.version}</td>
      <td style="padding:.15rem .8rem">${row.java || '—'}</td>
      <td style="padding:.15rem .8rem">${row.runner || '—'}</td>
      <td style="padding:.15rem .8rem">${row.time || '—'}</td>
      <td style="padding:.15rem .8rem">${row.timePerReceive || '—'} ms</td>
      <td style="padding:.15rem .8rem">${(row.nNan ?? 0).toLocaleString()}</td>
      <td style="padding:.15rem 0">${sourceLabel(row.version)}</td>
    </tr>`).join('');

  el.innerHTML = `
    <p style="margin:.5rem 0">
      <b>Dataset</b> — ${SETTINGS.dataset || 'Clisson, France'}, EPSG:2154, versioned with Git LFS
      ${demUrl ? `(<a href="${demUrl}" target="_blank" rel="noopener">DEM</a>, 652 MB)` : ''}.<br>
      <b>Simulation</b> — source <code>${SETTINGS.source || 'n/a'}</code>: max error ${SETTINGS.maxError ?? '—'},
      reflexion order ${SETTINGS.reflOrder ?? '—'}, propagation distance ${SETTINGS.maxSrcDist ?? '—'} m,
      horizontal diffraction ${SETTINGS.diffHorizontal === undefined ? '—' : String(SETTINGS.diffHorizontal)},
      favourable occurrences ${typeof SETTINGS.favorableOccurrence === 'number'
        ? `${Math.round(SETTINGS.favorableOccurrence * 100)}% (${SETTINGS.occurrencesPerDay}/day)`
        : '—'}.<br>
      <b>Statistics</b> — levels ≤ ${threshold} dB are treated as NaN and excluded from means, histograms and
      pairwise comparisons. Mean, standard deviation, RMSE and max are exact over all compared receivers
      ${st ? `(${st.minCompared.toLocaleString()} to ${st.maxCompared.toLocaleString()} per pair)` : ''};
      distributions and the diff map use a ${samplePoints.toLocaleString()}-point sample per pair.<br>
      <b>JVM</b> — Java 11 for v4.x/v5.x, Java 25 for v6.x.<br>
      <b>Reproduce</b> — <a href="https://github.com/${repo}#readme" target="_blank" rel="noopener">benchmark_run_clisson.sh + versions.json</a>
      · <a href="data/results.json" download>results.json</a>
      · <a href="data/comparisons.json" download>comparisons.json</a>
      · <a href="#" onclick="downloadCsv();return false">results.csv</a><br>
      <b>License</b> — GPL-3.0; simulation scripts are vendored from NoiseModelling.
      Please cite the <a href="https://noise-planet.org/noisemodelling.html" target="_blank" rel="noopener">NoiseModelling</a>
      project when reusing these results.
    </p>
    <table style="border-collapse:collapse;margin-top:.5rem">
      <thead>
        <tr style="color:var(--accent)">
          <th align="left">Version</th><th align="left">Java</th><th align="left">Runner</th>
          <th align="left">Compute</th><th align="left">ms/receiver</th><th align="left">Silenced</th><th align="left">Binary</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ─────────────────────────────────────────────
// MAP
// ─────────────────────────────────────────────
let map;

// ─────────────────────────────────────────────
// MAP CONFIG
// ─────────────────────────────────────────────
const LAYER_CONFIG = [
  {
    id: 'ISO_CONTOUR',
    label: 'ISO_CONTOUR',
    file: 'ISO_CONTOUR.geojson',
    color: '#ff4081',
    always: false,
    style: feature => {
      const p = feature.properties || {};
      return {
        fillColor: isoColor(p.ISOLABEL || '', p.ISOLVL),
        fillOpacity: 0.65,
        color: 'transparent',
        weight: 0,
      };
    },
    tooltip: f => {
      const p = f.properties || {};
      const lbl = p.ISOLABEL || (p.ISOLVL != null ? p.ISOLVL : '?');
      return `${lbl} dBA`;
    },
  },
  {
    id: 'BUILDINGS',
    label: 'Buildings',
    file: 'BUILDINGS.geojson',
    color: '#7fff6b',
    always: false,
    style: () => ({ color: '#7fff6b', weight: 1, fillColor: '#7fff6b', fillOpacity: 0.25 }),
    tooltip: f => {
      const p = f.properties || {};
      return p.HEIGHT ? `Building — H: ${p.HEIGHT} m`:'';
    },
  },
  {
    id: 'ROADS',
    label: 'Roads',
    file: 'ROADS.geojson',
    color: '#ffeb3b',
    always: false,
    style: () => ({ color: '#ffeb3b', weight: 2, fillOpacity: 0 }),
  },
  {
    id: 'RECEIVERS',
    label: 'Receivers',
    file: 'RECEIVERS.geojson',
    color: '#ff6b35',
    always: false,
    style: () => ({}),
    pointToLayer: (f, latlng) => L.circleMarker(latlng, {
      radius: 2.5,
      color: '#ff6b35',
      fillColor: '#ff6b35',
      fillOpacity: 0.8,
      weight: 0,
    }),
    tooltip: f => {
      const p = f.properties || {};
      return `Receiver${p.PK ? ' #' + p.PK : ''}`;
    },
  },
  {
    id: 'GROUNDS',
    label: 'Grounds',
    file: 'GROUNDS.geojson',
    color: '#9c27b0',
    always: false,
    style: () => ({ color: '#9c27b0', weight: 2, fillOpacity: 0 }),
    tooltip: f => {
      const p = f.properties || {};
      return p.G || p.g ? `G = ${p.G.toFixed(1) || p.g || ''}` : '';
    },
  },
];

let activeVersion = null;
const activeLayers = {};

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([47.086, -1.27], 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_2ski_1_676978ffa428a6a1dd5d0e17', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);
}


const LAMBERT93 = '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

function reprojectGeojson(geojson) {
  // Detect if reprojection is needed from the crs field
  const crsName = geojson?.crs?.properties?.name || '';
  const needs2154 = crsName.includes('2154');
  // Also detect if coords look metric (x > 100000 means Lambert, not WGS84)
  const firstCoord = geojson?.features?.[0]?.geometry?.coordinates?.[0]?.[0]?.[0];
  const looksMetric = Array.isArray(firstCoord)
    ? Math.abs(firstCoord[0]) > 1000
    : firstCoord && Math.abs(firstCoord) > 1000;

  if (!needs2154 && !looksMetric) return geojson; // already WGS84

  // Deep-clone and reproject all coordinates
  function reproj(coords) {
    if (typeof coords[0] === 'number') {
      // [x, y] or [x, y, z]
      const [lng, lat] = proj4(LAMBERT93, 'WGS84', [coords[0], coords[1]]);
      return coords.length > 2 ? [lng, lat, coords[2]] : [lng, lat];
    }
    return coords.map(reproj);
  }

  const reprojected = JSON.parse(JSON.stringify(geojson));
  delete reprojected.crs; // remove non-standard crs field so Leaflet is happy
  reprojected.features = reprojected.features.map(f => ({
    ...f,
    geometry: { ...f.geometry, coordinates: reproj(f.geometry.coordinates) }
  }));
  return reprojected;
}

async function loadLayer(version, layerCfg) {

  if (activeLayers[layerCfg.id]) {
    map.removeLayer(activeLayers[layerCfg.id]);
    delete activeLayers[layerCfg.id];
  }

  try {
    const res = await fetch(`data/${version}/${layerCfg.file}`);
    if (!res.ok) throw new Error(`${layerCfg.file} not found`);
    const raw  = await res.json();
    const geojson = reprojectGeojson(raw);

    const opts = {
      style: layerCfg.style,
      onEachFeature: (f, layer) => {
        const tip = layerCfg.tooltip ? layerCfg.tooltip(f) : '';
        if (tip) layer.bindTooltip(tip, { className: 'leaflet-tooltip-dark', sticky: true });
      },
    };
    if (layerCfg.pointToLayer) opts.pointToLayer = layerCfg.pointToLayer;

    const lyr = L.geoJSON(geojson, opts).addTo(map);
    activeLayers[layerCfg.id] = lyr;
    const statusEl = document.getElementById('map-status');
    if (statusEl) statusEl.textContent = '';


    if (layerCfg.id === 'ISO_CONTOUR') {
      try { map.fitBounds(lyr.getBounds(), { padding: [30, 30] }); } catch(e) {}
    }
  } catch(e) {
    console.warn(`[map] ${layerCfg.id} not available for ${version}:`, e.message);
    const statusEl = document.getElementById('map-status');
    if (statusEl) statusEl.textContent = `${layerCfg.label || layerCfg.id} is not published for ${version}.`;
  }
}

function removeLayer(layerCfg) {
  if (activeLayers[layerCfg.id]) {
    map.removeLayer(activeLayers[layerCfg.id]);
    delete activeLayers[layerCfg.id];
  }
}

async function switchVersion(version) {
  activeVersion = version;
  syncState({ version });
  document.getElementById('map-status').textContent = '';

  const layerCtrl = document.getElementById('map-layer-controls');
  for (const cfg of LAYER_CONFIG) {
    const btn = layerCtrl?.querySelector(`[data-layer="${cfg.id}"]`);
    const isActive = cfg.always || btn?.classList.contains('active');
    if (isActive) {
      await loadLayer(version, cfg);
    } else {
      removeLayer(cfg);
    }
  }
}

function renderMapControls(data) {
  const vCtrl = document.getElementById('map-version-controls');
  const lCtrl = document.getElementById('map-layer-controls');

  vCtrl.innerHTML = data.map((row, i) =>
    `<button class="map-btn${i === 0 ? ' active' : ''}" data-version="${row.version}" aria-pressed="${i === 0}">
      ${row.version}
    </button>`
  ).join('');

  vCtrl.querySelectorAll('.map-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      vCtrl.querySelectorAll('.map-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      switchVersion(btn.dataset.version);
    });
  });


  lCtrl.innerHTML = LAYER_CONFIG.map(cfg => {
    if (cfg.always) {

      return `<button class="map-btn layer-btn active" data-layer="${cfg.id}" disabled aria-pressed="true"
        style="border-color:${cfg.color};color:${cfg.color};cursor:default">
        <span class="layer-dot" style="background:${cfg.color}"></span>
        ${cfg.label}
      </button>`;
    }
    return `<button class="map-btn layer-btn" data-layer="${cfg.id}" aria-pressed="false"
      style="border-color:${cfg.color};color:${cfg.color}">
      <span class="layer-dot" style="background:${cfg.color}"></span>
      ${cfg.label}
    </button>`;
  }).join('');

  lCtrl.querySelectorAll('.layer-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cfg = LAYER_CONFIG.find(c => c.id === btn.dataset.layer);
      if (!cfg || !activeVersion) return;

      if (btn.classList.contains('active')) {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
        removeLayer(cfg);
      } else {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        await loadLayer(activeVersion, cfg);
      }
      syncState({ layers: activeLayerIds() });
    });
  });

  // Charger la première version par défaut
  if (data.length) switchVersion(data[0].version);
}

// ─────────────────────────────────────────────
// RENDER COMPARISONS
// ─────────────────────────────────────────────
let pairComparisons = [];

function findComparison(vA, vB) {
  return pairComparisons.find(c =>
    (c.version_a === vA && c.version_b === vB) ||
    (c.version_a === vB && c.version_b === vA)
  ) || null;
}

function renderComparisonCard(c, vA, vB) {
  const wrap = document.getElementById('comparisons-wrap');
  if (!c) {
    wrap.innerHTML = '<div class="empty">No comparison data for this pair.</div>';
    return;
  }

  const stable = c.rmse < 0.1;
  const warn   = c.rmse >= 0.1 && c.rmse < 0.5;
  const badgeColor = stable ? 'var(--accent3)' : warn ? 'var(--accent2)' : '#f44336';
  const verdict = stable ? 'Numerically stable' : warn ? 'Minor differences' : 'Significant differences';
  const nCompared = (c.n_valid ?? c.n_common);
  const nCommon   = (c.n_common ?? nCompared);
  const silencedRow = (c.n_nan_a || c.n_nan_b) ? `
        <div class="stat-row">
          <span class="stat-label">Silenced receivers (a / b)</span>
          <span class="stat-value">${(c.n_nan_a ?? 0).toLocaleString()} / ${(c.n_nan_b ?? 0).toLocaleString()}</span>
        </div>` : '';
  wrap.innerHTML = `
    <div class="card" style="--card-accent:${badgeColor}">
      <div class="card-version">
        ${vA} → ${vB}
        <span style="margin-left:.75rem;font-size:.65rem;color:${badgeColor}">${verdict}</span>
      </div>
      <div class="card-stats">
        <div class="stat-row">
          <span class="stat-label">RMSE</span>
          <span class="stat-value accent2">${fmt(c.rmse)} dB</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Standard deviation</span>
          <span class="stat-value accent2">${fmt(c.std_delta)} dB</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Mean |delta|</span>
          <span class="stat-value">${fmt(c.mean_delta)} dB</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Max |delta|</span>
          <span class="stat-value">${fmt(c.max_delta)} dB</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Compared receivers</span>
          <span class="stat-value">${nCompared.toLocaleString()} / ${nCommon.toLocaleString()}</span>
        </div>${silencedRow}
      </div>
    </div>`;
}

async function loadComparisons() {
  try {
    const res = await fetch('data/comparisons.json');
    if (!res.ok) throw new Error();
    pairComparisons = await res.json();
  } catch(e) {
    pairComparisons = [];
  }
  return pairComparisons;
}

function setupPairSelector() {
  const selA = document.getElementById('select-vA');
  const selB = document.getElementById('select-vB');

  const versionSet = new Set();
  pairComparisons.forEach(c => { versionSet.add(c.version_a); versionSet.add(c.version_b); });
  const versions = [...versionSet].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (!versions.length) {
    document.getElementById('comparisons-wrap').innerHTML =
            '<div class="empty">No comparison data yet — run benchmark with at least 2 versions.</div>';
    return;
  }

  function fillSelect(sel, exclude) {
    sel.innerHTML = versions
      .filter(v => v !== exclude)
      .map(v => `<option value="${v}">${v}</option>`)
      .join('');
  }

  fillSelect(selA, null);
  fillSelect(selB, null);


  selA.value = versions[Math.max(0, versions.length - 2)];
  selB.value = versions[versions.length - 1];
  if (selA.value === selB.value && versions.length > 1) {
    selA.value = versions[0];
  }

  function refresh() {
    const vA = selA.value;
    const vB = selB.value;
    const c = findComparison(vA, vB);
    renderComparisonCard(c, vA, vB);
    drawScatterForPair(vA, vB, c);
    drawDensityForPair(vA, vB, c);
    syncState({ a: vA, b: vB });
    const note = document.getElementById('sample-note');
    if (note) {
      note.innerHTML = c
        ? `Distribution, density and diff map are built from a ${(c.max_payload_points || 3000).toLocaleString()}-point sample of the ${c.n_valid.toLocaleString()} compared receivers`
          + (c.n_only_a || c.n_only_b ? ` (${c.n_only_a} only in A, ${c.n_only_b} only in B)` : '')
          + `; mean, standard deviation, RMSE and max use all of them.`
        : '';
    }
  }

  selA.addEventListener('change', () => {
    if (selA.value === selB.value) {
      const alt = versions.find(v => v !== selA.value);
      if (alt) selB.value = alt;
    }
    refresh();
  });
  selB.addEventListener('change', () => {
    if (selB.value === selA.value) {
      const alt = versions.find(v => v !== selB.value);
      if (alt) selA.value = alt;
    }
    refresh();
  });

  refresh();
}

// ─────────────────────────────────────────────
// HISTOGRAM
// ─────────────────────────────────────────────
const HISTO_BINS = ['<35','35-40','40-45','45-50','50-55','55-60','60-65','65-70','70-75','75-80','>80','NaN'];
const DB_BINS = HISTO_BINS.filter(b => b !== 'NaN');

let histoChart = null;

// Palette par version (une couleur stable par index)
const VERSION_COLORS = PALETTE;

function renderHistogram(data) {
  const ctrl   = document.getElementById('histo-controls');
  const canvas = document.getElementById('histo-chart');
  const noData = document.getElementById('histo-nodata');
  const ctx    = canvas.getContext('2d');

  const withHisto = data.filter(row => {
    const h = row.histogram || {};
    return HISTO_BINS.some(b => (h[b] || 0) > 0);
  });

  if (!withHisto.length) {
    if (noData) noData.style.display = 'block';
    canvas.style.display = 'none';
    return;
  }
  if (noData) noData.style.display = 'none';
  canvas.style.display = 'block';

  const selected = new Set(withHisto.map(r => r.version));

  function drawHisto() {
    const active = withHisto.filter(r => selected.has(r.version));
    if (!active.length) return;

    if (histoChart) histoChart.destroy();

    canvas.style.width  = '100%';
    canvas.style.height = '320px';
    canvas.width  = canvas.parentElement.clientWidth  || 800;
    canvas.height = 320;

    const datasets = active.map((row, i) => {
      const histo  = row.histogram || {};
      const counts = DB_BINS.map(b => histo[b] || 0);
      const total  = counts.reduce((a, b) => a + b, 0) || 1;
      const colorIdx = Math.max(0, data.findIndex(r => r.version === row.version));
      const color = VERSION_COLORS[colorIdx % VERSION_COLORS.length];
      return {
        label: row.version,
        data: counts,
        backgroundColor: color + '99',
        borderColor: color,
        borderWidth: 1.5,
        borderRadius: 2,
      };
    });

    histoChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: DB_BINS, datasets },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: {
            display: true,
            labels: {
              color: '#6b7280',
              font: { family: 'Space Mono', size: 11 },
              boxWidth: 14,
            }
          },
          tooltip: {
            backgroundColor: '#12161f',
            borderColor: '#252b3b',
            borderWidth: 1,
            titleColor: '#00e5ff',
            bodyColor: '#e8eaf0',
            titleFont: { family: 'Space Mono' },
            bodyFont:  { family: 'Space Mono' },
            callbacks: {
              title: items => `Band: ${items[0].label}`,
              label: ctx => {
                const abs = ctx.parsed.y;
                return ` ${ctx.dataset.label}: ${abs.toLocaleString()} receivers`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#00e5ff', font: { family: 'Space Mono', size: 11 } },
            grid:  { color: '#252b3b' },
            title: { display: true, text: 'LAEQ band (dB)', color: '#00e5ff',
                     font: { family: 'Space Mono', size: 11 } },
          },
          y: {
            ticks: { color: '#00e5ff', font: { family: 'Space Mono', size: 11 },
                     callback: v => v  },
            grid:  { color: '#252b3b' },
            title: { display: true, text: 'Receivers', color: '#00e5ff',
                     font: { family: 'Space Mono', size: 11 } },
          }
        }
      }
    });

    const nanEl = document.getElementById('histo-nan');
    if (nanEl) {
      nanEl.innerHTML = 'Silenced receivers (NaN, excluded from the chart): ' + active
        .map(row => {
          const idx = Math.max(0, data.findIndex(r => r.version === row.version));
          const color = VERSION_COLORS[idx % VERSION_COLORS.length];
          return `<span style="color:${color}">${row.version}</span> ${(row.nNan ?? 0).toLocaleString()}`;
        })
        .join(' · ');
    }
  }

  ctrl.innerHTML = withHisto.map(row => {
    const color = VERSION_COLORS[Math.max(0, data.findIndex(r => r.version === row.version)) % VERSION_COLORS.length];
    return `<button class="map-btn active" data-version="${row.version}"
      style="border-color:${color};color:${color}">${row.version}</button>`;
  }).join('');

  ctrl.querySelectorAll('.map-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.version;
      if (selected.has(v)) {
        if (selected.size === 1) return;
        selected.delete(v);
        btn.classList.remove('active');
        btn.style.opacity = '0.4';
      } else {
        selected.add(v);
        btn.classList.add('active');
        btn.style.opacity = '1';
      }
      drawHisto();
    });
  });

  drawHisto();
  histoRedraw = drawHisto;
}

// ─────────────────────────────────────────────
// BOXPLOT (distribution LAEQ par version)
// ─────────────────────────────────────────────
function quantile(sortedArr, q) {
  const pos = (sortedArr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedArr[base + 1] !== undefined) {
    return sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base]);
  }
  return sortedArr[base];
}

function computeBoxStats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const median = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  const whiskerMin = sorted.find(v => v >= lowerFence) ?? sorted[0];
  const whiskerMax = [...sorted].reverse().find(v => v <= upperFence) ?? sorted[sorted.length - 1];
  const outliers = sorted.filter(v => v < whiskerMin || v > whiskerMax);
  return { min: whiskerMin, q1, median, q3, max: whiskerMax, outliers, n: sorted.length };
}

async function renderBoxplot() {
  const wrapper = document.getElementById('boxplot-chart').parentElement;
  const nodata  = document.getElementById('boxplot-nodata');


  let comparisons = (typeof pairComparisons !== 'undefined' && pairComparisons.length)
    ? pairComparisons : [];
  if (!comparisons.length && pairComparisons.length) {
    comparisons = pairComparisons;
  }

  const valuesByVersion = {};
  comparisons.forEach(c => {
    if (!c.scatter || !c.scatter.length) return;
    if (!valuesByVersion[c.version_a]) valuesByVersion[c.version_a] = c.scatter.map(p => p[0]);
    if (!valuesByVersion[c.version_b]) valuesByVersion[c.version_b] = c.scatter.map(p => p[1]);
  });

  if (!Object.keys(valuesByVersion).length) {
    try {
      const r = await fetch('data/results.json');
      if (r.ok) {
        const results = await r.json();
        const BIN_MIDS = {'<35':32,'35-40':37.5,'40-45':42.5,'45-50':47.5,
                          '50-55':52.5,'55-60':57.5,'60-65':62.5,'65-70':67.5,'70-75':72.5,'75-80':77.5,'>80':82};
        results.forEach(row => {
          if (!row.histogram) return;
          const vals = [];
          Object.entries(row.histogram).forEach(([bin, count]) => {
            const mid = BIN_MIDS[bin];
            if (mid === undefined) return;
            for (let i = 0; i < count; i++) vals.push(mid + (Math.random() - 0.5) * 4);
          });
          if (vals.length) valuesByVersion[row.version] = vals;
        });
      }
    } catch(e) {}
  }

  const versions = Object.keys(valuesByVersion)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (!versions.length) {
    nodata.style.display = 'block';
    return;
  }
  nodata.style.display = 'none';

  const stats = versions.map(v => computeBoxStats(valuesByVersion[v]));

  const oldSvg = wrapper.querySelector('svg.boxplot-svg');
  if (oldSvg) oldSvg.remove();

  const canvas = document.getElementById('boxplot-chart');
  canvas.style.display = 'none';

  const margin = { top: 30, right: 30, bottom: 50, left: 60 };
  const totalW  = wrapper.clientWidth || 900;
  const totalH  = 420;
  const W = totalW - margin.left - margin.right;
  const H = totalH - margin.top  - margin.bottom;

  const svg = d3.select(wrapper)
    .append('svg')
    .attr('class', 'boxplot-svg')
    .attr('width', totalW)
    .attr('height', totalH);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);


  const x = d3.scaleBand()
    .domain(versions)
    .range([0, W])
    .padding(0.4);

  const allVals = stats.flatMap(s => [s.min, s.max, ...s.outliers]);
  const yMin = Math.floor(Math.min(...allVals) / 5) * 5 - 5;
  const yMax = Math.ceil( Math.max(...allVals) / 5) * 5 + 5;

  const y = d3.scaleLinear()
    .domain([-20, yMax+20])
    .range([H, 0]);


  g.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(y).tickSize(-W).tickFormat(''))
    .selectAll('line')
    .attr('stroke', '#252b3b')
    .attr('stroke-width', 0.5);
  g.select('.grid .domain').remove();

  g.append('g')
    .attr('transform', `translate(0,${H})`)
    .call(d3.axisBottom(x))
    .selectAll('text')
    .attr('fill', '#6b7280')
    .attr('font-family', 'Space Mono, monospace')
    .attr('font-size', '11px');
  g.select('.domain').attr('stroke', '#252b3b');
  g.selectAll('.tick line').attr('stroke', '#252b3b');

  g.append('g')
    .call(d3.axisLeft(y).ticks(8).tickFormat(d => d + ' dB'))
    .selectAll('text')
    .attr('fill', '#00e5ff')
    .attr('font-family', 'Space Mono, monospace')
    .attr('font-size', '11px');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -H / 2)
    .attr('y', -48)
    .attr('text-anchor', 'middle')
    .attr('fill', '#00e5ff')
    .attr('font-family', 'Space Mono, monospace')
    .attr('font-size', '11px')
    .text('LAEQ,D (dB)');


  g.append('text')
    .attr('x', W / 2)
    .attr('y', H + 42)
    .attr('text-anchor', 'middle')
    .attr('fill', '#6b7280')
    .attr('font-family', 'Space Mono, monospace')
    .attr('font-size', '11px')
    .text('Versions');

  const boxW = x.bandwidth();

  versions.forEach((v, i) => {
    const s = stats[i];
    const cx = x(v) + boxW / 2;
    const capW = boxW * 0.35;

    // (min → Q1)
    g.append('line')
      .attr('x1', cx).attr('x2', cx)
      .attr('y1', y(s.min)).attr('y2', y(s.q1))
      .attr('stroke', '#e8eaf0').attr('stroke-width', 1.5);

    // (Q3 → max)
    g.append('line')
      .attr('x1', cx).attr('x2', cx)
      .attr('y1', y(s.q3)).attr('y2', y(s.max))
      .attr('stroke', '#e8eaf0').attr('stroke-width', 1.5);


    g.append('line')
      .attr('x1', cx - capW).attr('x2', cx + capW)
      .attr('y1', y(s.min)).attr('y2', y(s.min))
      .attr('stroke', '#e8eaf0').attr('stroke-width', 1.5);


    g.append('line')
      .attr('x1', cx - capW).attr('x2', cx + capW)
      .attr('y1', y(s.max)).attr('y2', y(s.max))
      .attr('stroke', '#e8eaf0').attr('stroke-width', 1.5);

    // B(Q1 → Q3)
    g.append('rect')
      .attr('x', x(v))
      .attr('y', y(s.q3))
      .attr('width', boxW)
      .attr('height', y(s.q1) - y(s.q3))
      .attr('fill', 'rgba(0,229,255,0.15)')
      .attr('stroke', '#00e5ff')
      .attr('stroke-width', 2);


    g.append('line')
      .attr('x1', x(v)).attr('x2', x(v) + boxW)
      .attr('y1', y(s.median)).attr('y2', y(s.median))
      .attr('stroke', '#ff6b35')
      .attr('stroke-width', 2.5);


    s.outliers.forEach(val => {
      g.append('circle')
        .attr('cx', cx)
        .attr('cy', y(val))
        .attr('r', 2.5)
        .attr('fill', 'rgba(255,107,53,0.5)')
        .attr('stroke', 'none');
    });
  });


  const legend = svg.append('g')
    .attr('transform', `translate(${margin.left + W / 2 - 120}, 8)`);

  [
    { color: '#00e5ff', fill: 'rgba(0,229,255,0.15)', label: 'IQR (Q1–Q3)', rect: true },
    { color: '#ff6b35', label: 'Median', rect: true },
    { color: 'rgba(255,107,53,0.5)', label: 'Outliers', rect: false },
  ].forEach((item, i) => {
    const lx = i * 130;
    if (item.rect) {
      legend.append('rect')
        .attr('x', lx).attr('y', 2)
        .attr('width', 18).attr('height', 10)
        .attr('fill', item.fill || item.color)
        .attr('stroke', item.color).attr('stroke-width', 1.5);
    } else {
      legend.append('circle')
        .attr('cx', lx + 9).attr('cy', 7)
        .attr('r', 4).attr('fill', item.color);
    }
    legend.append('text')
      .attr('x', lx + 24).attr('y', 11)
      .attr('fill', '#6b7280')
      .attr('font-family', 'Space Mono, monospace')
      .attr('font-size', '10px')
      .text(item.label);
  });
}

// ─────────────────────────────────────────────
// SCATTER PLOT
// ─────────────────────────────────────────────
let scatterChart = null;

function drawScatterForPair(vA, vB, c){
  const nodata = document.getElementById('scatter-nodata');
  const canvas = document.getElementById('scatter-chart');

  if (!c || !c.scatter || !c.scatter.length) {
    nodata.style.display = 'block';
    canvas.style.display = 'none';
    if (scatterChart) { scatterChart.destroy(); scatterChart = null; }
    return;
  }
  nodata.style.display = 'none';
  canvas.style.display = 'block';


  const flip = c.version_a !== vA;
  const points = c.scatter.map(([x, y]) => flip ? { x: y, y: x } : { x, y });

  const allVals = points.flatMap(p => [p.x, p.y]);
  const minV = Math.floor(Math.min(...allVals) / 5) * 5;
  const maxV = Math.ceil( Math.max(...allVals) / 5) * 5;
  const diagLine = [{ x: minV, y: minV }, { x: maxV, y: maxV }];

  if (scatterChart) scatterChart.destroy();

  const ctx = canvas.getContext('2d');
  scatterChart = new Chart(ctx, {
    data: {
      datasets: [
        {
          type: 'scatter',
          label: `Receivers (n=${(c.n_valid ?? c.n_common).toLocaleString()})`,
          data: points,
          backgroundColor: 'rgba(255,107,53,0.25)',
          pointRadius: 2,
          pointHoverRadius: 4,
          order: 2,
        },
        {
          type: 'line',
          label: 'y = x',
          data: diagLine,
          borderColor: 'rgba(255,255,255,0.5)',
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
          order: 1,
        }
      ]
    },
    options: {
      responsive: true,
      animation: false,
      plugins: {
        legend: {
          labels: {
            color: '#6b7280',
            font: { family: 'Space Mono', size: 11 },
            filter: item => item.datasetIndex === 0,
          }
        },
        tooltip: {
          backgroundColor: '#12161f',
          borderColor: '#252b3b',
          borderWidth: 1,
          titleColor: '#00e5ff',
          bodyColor: '#e8eaf0',
          titleFont: { family: 'Space Mono' },
          bodyFont:  { family: 'Space Mono' },
          callbacks: {
            title: () => '',
            label: ctx => {
              if (ctx.datasetIndex !== 0) return null;
              const { x, y } = ctx.parsed;
              return ` ${vA}: ${x} dB  →  ${vB}: ${y} dB  (Δ=${(y - x).toFixed(2)} dB)`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: minV, max: maxV,
          ticks: { color: '#6b7280', font: { family: 'Space Mono', size: 11 },
            callback: v => v + ' dB' },
          grid: { color: '#252b3b' },
          title: { display: true, text: `${vA} LAeq,D (dB)`,
            color: '#6b7280', font: { family: 'Space Mono', size: 11 } },
        },
        y: {
          type: 'linear',
          min: minV, max: maxV,
          ticks: { color: '#00e5ff', font: { family: 'Space Mono', size: 11 },
            callback: v => v + ' dB' },
          grid: { color: '#252b3b' },
          title: { display: true, text: `${vB} LAeq,D (dB)`,
            color: '#00e5ff', font: { family: 'Space Mono', size: 11 } },
        }
      }
    }
  });
  boxplotRedraw = renderBoxplot;
}
// ─────────────────────────────────────────────
// DENSITY PLOT (KDE sur delta LAEQ)
// ─────────────────────────────────────────────
let densityChart = null;


function kde(values, bandwidth, xPoints) {
  const n = values.length;
  const sigma = std(values);
  if (sigma === 0) return xPoints.map(() => 0);
  const h = bandwidth || (1.06 * sigma * Math.pow(n, -0.2));
  return xPoints.map(x => {
    const sum = values.reduce((acc, xi) => {
      const u = (x - xi) / h;
      return acc + Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
    }, 0);
    return sum / (n * h);
  });
}

function std(arr) {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}

function linspace(min, max, n) {
  const step = (max - min) / (n - 1);
  return Array.from({ length: n }, (_, i) => min + i * step);
}

function drawDensityForPair(vA, vB, c) {
  const nodata = document.getElementById('density-nodata');
  const canvas = document.getElementById('density-chart');

  if (!c || !c.deltas_signed || !c.deltas_signed.length) {
    nodata.style.display = 'block';
    canvas.style.display = 'none';
    if (densityChart) { densityChart.destroy(); densityChart = null; }
    return;
  }
  nodata.style.display = 'none';
  canvas.style.display = 'block';

  const flip = c.version_a !== vA;
  const rawDeltas = flip ? c.deltas_signed.map(d => -d) : c.deltas_signed;


  const minD = Math.min(...rawDeltas);
  const maxD = Math.max(...rawDeltas);
  const pad  = (maxD - minD) * 0.15 || 2;
  const xMin = minD - pad;
  const xMax = maxD + pad;
  const N_POINTS = 300;
  const xs = linspace(xMin, xMax, N_POINTS);
  const ys = kde(rawDeltas, null, xs);


  const maxY = Math.max(...ys);
  Math.min(...ys);
  if (!maxY) {
    nodata.innerHTML = '<div class="empty">Same versions — Δ LAEQ = 0 for all receivers.</div>';
    nodata.style.display = 'block';
    canvas.style.display = 'none';
    if (densityChart) { densityChart.destroy(); densityChart = null; }
    return;
  }

  const binWidth = (xMax - xMin) / N_POINTS;
  const n = rawDeltas.length;
  const toReceivers = (d) => d * n * binWidth;

  const posPoints = xs.map((x, i) => ({ x: +x.toFixed(3), y: x >= 0 ? toReceivers(ys[i]) : 0 }));
  const negPoints = xs.map((x, i) => ({ x: +x.toFixed(3), y: x <= 0 ? toReceivers(ys[i]) : 0 }));
  const allPoints = xs.map((x, i) => ({ x: +x.toFixed(3), y: toReceivers(ys[i]) }));

  if (densityChart) densityChart.destroy();

  const ctx = canvas.getContext('2d');
  densityChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: `${vB} louder (Δ > 0)`,
          data: posPoints,
          borderColor: '#f44336',
          backgroundColor: 'rgba(244,67,54,0.25)',
          fill: true,
          pointRadius: 0,
          borderWidth: 0,
          tension: 0.4,
          order: 2,
        },
        {
          label: `${vB} quieter (Δ < 0)`,
          data: negPoints,
          borderColor: '#2196f3',
          backgroundColor: 'rgba(33,150,243,0.25)',
          fill: true,
          pointRadius: 0,
          borderWidth: 0,
          tension: 0.4,
          order: 2,
        },
        {
          label: 'Density',
          data: allPoints,
          borderColor: '#00e5ff',
          backgroundColor: 'transparent',
          fill: false,
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.4,
          order: 1,
        }
      ]
    },
    options: {
      responsive: true,
      animation: false,
      parsing: false,
      plugins: {
        legend: {
          labels: {
            color: '#6b7280',
            font: { family: 'Space Mono', size: 11 },
            filter: item => item.datasetIndex !== 2,
          }
        },
        tooltip: {
          backgroundColor: '#12161f',
          borderColor: '#252b3b',
          borderWidth: 1,
          titleColor: '#00e5ff',
          bodyColor: '#e8eaf0',
          titleFont: { family: 'Space Mono' },
          bodyFont:  { family: 'Space Mono' },
          callbacks: {
            title: items => `Δ = ${fmt(items[0].parsed.x)} dB, ${fmt(items[0].parsed.y)}`,
            label: () => null,
          }
        },
        annotation: {
          annotations: {
            zeroline: {
              type: 'line',
              xMin: 0, xMax: 0,
              borderColor: 'rgba(255,255,255,0.4)',
              borderWidth: 1,
              borderDash: [4, 4],
              label: {
                display: true,
                color: '#6b7280',
                font: { family: 'Space Mono', size: 10 },
                position: 'start',
              }
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          ticks: {
            color: '#6b7280',
            font: { family: 'Space Mono', size: 11 },
            callback: v => (v >= 0 ? '+' : '') + fmt(v) + ' dB'
          },
          grid: { color: '#252b3b' },
          title: {
            display: true,
            text: `Δ LAEQ (dB)  =  ${vB} − ${vA}`,
            color: '#ffeb3b',
            font: { family: 'Space Mono', size: 11 }
          },
        },
        y: {
          ticks: { color: '#00e5ff', font: { family: 'Space Mono', size: 11 },
                   callback: v => v  },
          grid: { color: '#252b3b' },
          title: {
            display: true,
            text: 'Relative density',
            color: '#00e5ff',
            font: { family: 'Space Mono', size: 11 }
          },
        }
      }
    }
  });
}

// ─────────────────────────────────────────────
// DIFF MAP
// ─────────────────────────────────────────────
let diffLayer = null;
let diffMapActive = false;


function diffColor(delta) {
  if (delta < -6)  return '#2166ac';
  else if (delta < -4)  return '#4393c3';
  else if (delta < -2)return '#92c5de';
  else if (delta < 2 && delta > -2)return '#f7f7f7';
  else if (delta <  4)  return '#f4a582';
  else if (delta <  6)  return '#d6604d';
  else return '#b2182b';
}

async function drawDiffMap(vA, vB) {
  if (diffLayer) { map.removeLayer(diffLayer); diffLayer = null; }

  const info = document.getElementById('diff-map-info');
  info.style.display = 'block';
  info.textContent = 'Loading…';

  const c = findComparison(vA, vB);
  if (!c || !c.diff_map || !c.diff_map.length) {
    info.textContent = 'Data diff_map missing';
    return;
  }

  const flip = c.version_a !== vA;

  const geojson = {
    type: 'FeatureCollection',
    crs: {type:"name",properties:{name:"urn:ogc:def:crs:EPSG::2154"}},
    features: c.diff_map.map(([lon, lat, delta]) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { delta: flip ? -delta : delta }
    }))
  };
  console.log(geojson)

  const reprojected = reprojectGeojson(geojson);

  diffLayer = L.geoJSON(reprojected, {
    pointToLayer: (f, latlng) => L.circleMarker(latlng, {
      radius: 3,
      fillColor: diffColor(f.properties.delta),
      color: 'transparent',
      fillOpacity: 0.9,
      weight: 0,
    }),
    onEachFeature: (f, layer) => {
      const d = f.properties.delta;
      const sign = d >= 0 ? '+' : '';
      layer.bindTooltip(
              `Δ: ${sign}${d.toFixed(2)} dB<br>${vA} → ${vB}`,
              { className: 'leaflet-tooltip-dark', sticky: true }
      );
    }
  }).addTo(map);

  info.innerHTML = `n=${c.diff_map.length.toLocaleString()}<br>${vA} → ${vB}`;
  document.getElementById('diff-legend').style.display = 'flex';
}


function clearDiffMap() {
  if (diffLayer) { map.removeLayer(diffLayer); diffLayer = null; }
  document.getElementById('diff-legend').style.display = 'none';
  document.getElementById('diff-map-info').style.display = 'none';
}

function setupDiffMapButton() {
  const btn = document.getElementById('btn-diff-map');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    diffMapActive = !diffMapActive;

    if (diffMapActive) {
      btn.classList.add('active');
      const vA = document.getElementById('select-vA')?.value;
      const vB = document.getElementById('select-vB')?.value;
      if (!vA || !vB) {
        document.getElementById('diff-map-info').style.display = 'block';
        document.getElementById('diff-map-info').textContent = 'Select an A/B pair';
        diffMapActive = false;
        btn.classList.remove('active');
        return;
      }
      await drawDiffMap(vA, vB);
    } else {
      btn.classList.remove('active');
      clearDiffMap();
    }
  });

  ['select-vA', 'select-vB'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', async () => {
      if (!diffMapActive) return;
      const vA = document.getElementById('select-vA')?.value;
      const vB = document.getElementById('select-vB')?.value;
      if (vA && vB) await drawDiffMap(vA, vB);
    });
  });
}

// ─────────────────────────────────────────────
// LA MONTAGNE — COMPARAISON A LA MESURE
// ─────────────────────────────────────────────
let montagneChart = null;

function drawMontagneScatter(entry) {
  const nodata = document.getElementById('montagne-nodata');
  const canvas = document.getElementById('montagne-scatter-chart');

  if (!entry || !entry.scatter || !entry.scatter.length) {
    nodata.style.display = 'block';
    canvas.style.display = 'none';
    if (montagneChart) { montagneChart.destroy(); montagneChart = null; }
    return;
  }
  nodata.style.display = 'none';
  canvas.style.display = 'block';

  const points = entry.scatter.map(([measured, computed]) => ({ x: measured, y: computed }));
  const allVals = points.flatMap(p => [p.x, p.y]);
  const minV = Math.floor(Math.min(...allVals) / 5) * 5;
  const maxV = Math.ceil(Math.max(...allVals) / 5) * 5;
  const diagLine = [{ x: minV, y: minV }, { x: maxV, y: maxV }];

  if (montagneChart) montagneChart.destroy();

  const ctx = canvas.getContext('2d');
  montagneChart = new Chart(ctx, {
    data: {
      datasets: [
        {
          type: 'scatter',
          label: `Receivers (n=${entry.n_compared})`,
          data: points,
          backgroundColor: 'rgba(0,229,255,0.35)',
          pointRadius: 4,
          pointHoverRadius: 6,
          order: 2,
        },
        {
          type: 'line',
          label: 'y = x',
          data: diagLine,
          borderColor: 'rgba(255,255,255,0.5)',
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
          order: 1,
        }
      ]
    },
    options: {
      responsive: true,
      animation: false,
      plugins: {
        legend: {
          labels: {
            color: '#6b7280',
            font: { family: 'Space Mono', size: 11 },
            filter: item => item.datasetIndex === 0,
          }
        },
        tooltip: {
          backgroundColor: '#12161f',
          borderColor: '#252b3b',
          borderWidth: 1,
          titleColor: '#00e5ff',
          bodyColor: '#e8eaf0',
          titleFont: { family: 'Space Mono' },
          bodyFont:  { family: 'Space Mono' },
          callbacks: {
            title: () => '',
            label: ctx => {
              if (ctx.datasetIndex !== 0) return null;
              const { x, y } = ctx.parsed;
              return ` measured ${x} dB → ${entry.version} ${y} dB (Δ=${(y - x).toFixed(2)} dB)`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: minV, max: maxV,
          ticks: { color: '#6b7280', font: { family: 'Space Mono', size: 11 },
            callback: v => v + ' dB' },
          grid: { color: '#252b3b' },
          title: { display: true, text: 'Measured LAeq,D (dB)',
            color: '#6b7280', font: { family: 'Space Mono', size: 11 } },
        },
        y: {
          type: 'linear',
          min: minV, max: maxV,
          ticks: { color: '#00e5ff', font: { family: 'Space Mono', size: 11 },
            callback: v => v + ' dB' },
          grid: { color: '#252b3b' },
          title: { display: true, text: `${entry.version} corrected LAeq,D (dB)`,
            color: '#00e5ff', font: { family: 'Space Mono', size: 11 } },
        }
      }
    }
  });
}

function renderMontagne(data) {
  const section = document.getElementById('montagne-section');
  if (!section) return;
  if (!data.length) { section.style.display = 'none'; return; }

  const ctrl = document.getElementById('montagne-controls');
  const tableEl = document.getElementById('montagne-table');
  const note = document.getElementById('montagne-note');

  let selected = data[0].version;

  function updateNote() {
    const e = data.find(d => d.version === selected) || {};
    note.innerHTML =
      `Reference receiver <b>#${e.reference_receiver}</b> (closest to the source, ${fmt(e.reference_distance, 1)} m): ` +
      `offset = measured − computed = <b>${fmt(e.offset)} dB</b>. ` +
      `Errors are computed after applying this offset to every receiver (zero at the reference by construction).` +
      `<br>Download: <a href="data/montagne/measure_comparison.json" download>measure_comparison.json</a> · ` +
      `<a href="data/montagne/comparisons.json" download>comparisons.json</a> · ` +
      `<a href="data/montagne/results.json" download>results.json</a>`;
  }

  ctrl.innerHTML = data.map((row, i) =>
    `<button class="map-btn${i === 0 ? ' active' : ''}" data-version="${row.version}" aria-pressed="${i === 0}">
      ${row.version}
    </button>`
  ).join('');

  ctrl.querySelectorAll('.map-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      ctrl.querySelectorAll('.map-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      selected = btn.dataset.version;
      drawMontagneScatter(data.find(d => d.version === selected));
      updateNote();
    });
  });

  const rows = data.map(row => `
    <tr>
      <td style="padding:.15rem .8rem .15rem 0">${row.version}</td>
      <td style="padding:.15rem .8rem">#${row.reference_receiver}</td>
      <td style="padding:.15rem .8rem">${fmt(row.offset)}</td>
      <td style="padding:.15rem .8rem">${fmt(row.mean_error)}</td>
      <td style="padding:.15rem .8rem">${fmt(row.std_error)}</td>
      <td style="padding:.15rem .8rem">${fmt(row.rmse)}</td>
      <td style="padding:.15rem .8rem">${fmt(row.max_abs_error)}</td>
      <td style="padding:.15rem 0">${row.n_compared}/${row.n_measured}</td>
    </tr>`).join('');

  tableEl.innerHTML = `
    <table style="border-collapse:collapse;margin-top:.5rem">
      <thead>
        <tr style="color:var(--accent)">
          <th align="left">Version</th><th align="left">Ref.</th><th align="left">Offset (dB)</th>
          <th align="left">Mean error</th><th align="left">Std</th><th align="left">RMSE</th>
          <th align="left">Max |error|</th><th align="left">Receivers</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  drawMontagneScatter(data[0]);
  updateNote();
}

async function initMontagne() {
  const section = document.getElementById('montagne-section');
  if (!section) return;
  const data = await loadJson('data/montagne/measure_comparison.json', []);
  renderMontagne(data);
}

// ─────────────────────────────────────────────
// SIDEBAR TOGGLE
// ─────────────────────────────────────────────
function toggleSidebar(panelId, btn) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const collapsed = panel.classList.toggle('collapsed');
  btn.classList.toggle('collapsed', collapsed);
}

// ─────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────
async function loadJson(url, fallback) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} not found`);
    return await res.json();
  } catch (e) {
    console.warn(`Could not load ${url}`, e);
    return fallback;
  }
}

async function applyState(data, snapshot) {
  const st = snapshot || readState();
  const wanted = st.get('version');
  if (wanted && data.some(row => row.version === wanted)) {
    const btn = document.querySelector(`#map-version-controls [data-version="${wanted}"]`);
    if (btn) btn.click();
    else await switchVersion(wanted);
  }
  const layers = (st.get('layers') || '').split(',').filter(Boolean);
  for (const id of layers) {
    const btn = document.querySelector(`#map-layer-controls [data-layer="${id}"]:not([disabled])`);
    if (btn && !btn.classList.contains('active')) btn.click();
  }
  const a = st.get('a');
  const b = st.get('b');
  const selA = document.getElementById('select-vA');
  const selB = document.getElementById('select-vB');
  if (selA && selB && (a || b)) {
    if (a && [...selA.options].some(o => o.value === a)) selA.value = a;
    if (b && [...selB.options].some(o => o.value === b)) selB.value = b;
    if (selA.value !== selB.value) selA.dispatchEvent(new Event('change'));
  }
}

async function init() {
  const initialState = readState();
  const data = await loadJson(RESULTS_URL, []);
  if (!data.length) console.warn('No results published yet.');
  data.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));

  ALL_RESULTS = data;
  BUILD = await loadJson(BUILD_URL, {});
  SETTINGS = await loadJson(SETTINGS_URL, {});

  renderHeaderMeta(data);
  renderCards(data);
  renderFooter();
  renderHistogram(data);
  await renderBoxplot();
  await loadComparisons();
  setupPairSelector();
  initMap();
  renderMapControls(data);
  setupDiffMapButton();
  await applyState(data, initialState);
  renderMethod(data);
  await initMontagne();
}

window.addEventListener('resize', debounce(() => {
  if (histoRedraw) histoRedraw();
  if (boxplotRedraw) boxplotRedraw();
}, 250));

init();
