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
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxZoom: 16
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

