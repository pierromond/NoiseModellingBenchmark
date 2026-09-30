// ─────────────────────────────────────────────
// LA MONTAGNE — MAP (no iso-contours, receivers coloured by error)
// ─────────────────────────────────────────────
let montagneMap = null;
let montagneMapLayers = {};
let montagneErrorLayer = null;

const MONTAGNE_MAP_LAYERS = [
  { id: 'BUILDINGS', label: 'Buildings', file: 'layers/BUILDINGS.geojson',
    color: '#546e7a', weight: 0.7, fill: true, fillOpacity: 0.22, on: true },
  { id: 'GROUNDS', label: 'Grounds', file: 'layers/GROUNDS.geojson',
    color: '#8d8d8d', weight: 0.6, fill: true, fillOpacity: 0.1, on: false },
  { id: 'LW_ROADS', label: 'Source (siren)', file: 'layers/LW_ROADS.geojson',
    point: true, color: '#e0245e', on: true },
];

function montagneErrorColor(e) {
  if (e <= -6) return '#2166ac';
  if (e <= -3) return '#4393c3';
  if (e <= -1) return '#92c5de';
  if (e < 1)   return '#f0f0f0';
  if (e < 3)   return '#f4a582';
  if (e < 6)   return '#d6604d';
  return '#b2182b';
}

async function initMontagneMap() {
  const el = document.getElementById('montagne-map');
  if (!el || montagneMap) return;

  montagneMap = L.map(el, { zoomControl: true });
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxZoom: 16,
  }).addTo(montagneMap);

  const bounds = L.latLngBounds([]);
  for (const cfg of MONTAGNE_MAP_LAYERS) {
    try {
      const res = await fetch('data/montagne/' + cfg.file);
      if (!res.ok) continue;
      const gj = reprojectGeojson(await res.json());
      const layer = cfg.point
        ? L.geoJSON(gj, { pointToLayer: (f, ll) => L.circleMarker(ll, {
            radius: 9, color: cfg.color, weight: 2, fillColor: cfg.color, fillOpacity: 1 }) })
        : L.geoJSON(gj, { style: () => ({
            color: cfg.color, weight: cfg.weight, fill: !!cfg.fill, fillOpacity: cfg.fillOpacity || 0.15 }) });
      layer.bindTooltip(cfg.label, { sticky: true });
      montagneMapLayers[cfg.id] = layer;
      if (cfg.on) layer.addTo(montagneMap);
      if (layer.getBounds && layer.getBounds().isValid()) bounds.extend(layer.getBounds());
    } catch (e) { /* layer unavailable */ }
  }

  montagneErrorLayer = L.layerGroup().addTo(montagneMap);
  montagneMapLayers['RECEIVERS'] = montagneErrorLayer;

  if (bounds.isValid()) montagneMap.fitBounds(bounds, { padding: [24, 24] });
  else montagneMap.setView([47.0, -1.0], 13);

  renderMontagneMapLayers();
}

function renderMontagneMapLayers() {
  const ctrl = document.getElementById('montagne-map-layers');
  if (!ctrl || !montagneMap) return;
  const items = MONTAGNE_MAP_LAYERS.map(cfg => ({ id: cfg.id, label: cfg.label, color: cfg.color }));
  items.push({ id: 'RECEIVERS', label: 'Receivers (Δ)', color: '#333' });
  ctrl.innerHTML = items.map(cfg => {
    const layer = montagneMapLayers[cfg.id];
    const on = layer && montagneMap.hasLayer(layer);
    return `<button class="map-btn layer-btn${on ? ' active' : ''}" data-layer="${cfg.id}" aria-pressed="${on}">
      <span class="layer-dot" style="background:${cfg.color}"></span>${cfg.label}</button>`;
  }).join('');
  ctrl.querySelectorAll('.map-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const layer = montagneMapLayers[btn.dataset.layer];
      if (!layer) return;
      const on = montagneMap.hasLayer(layer);
      if (on) montagneMap.removeLayer(layer); else layer.addTo(montagneMap);
      btn.classList.toggle('active', !on);
      btn.setAttribute('aria-pressed', String(!on));
      syncState({ dataset: 'montagne', m_layers: montagneMapLayerIds().join(',') });
    });
  });
}

function montagneMapLayerIds() {
  if (!montagneMap) return [];
  return Object.keys(montagneMapLayers).filter(id => montagneMap.hasLayer(montagneMapLayers[id]));
}

function updateMontagneReceivers(entry) {
  const legend = document.getElementById('montagne-map-legend');
  if (!montagneErrorLayer) return;
  montagneErrorLayer.clearLayers();
  if (!entry || !entry.receivers || !entry.receivers.length) {
    if (legend) legend.style.display = 'none';
    return;
  }
  entry.receivers.forEach(([id, x, y, measured, corrected, error]) => {
    const [lng, lat] = proj4(LAMBERT93, 'WGS84', [x, y]);
    L.circleMarker([lat, lng], {
      radius: 8, color: '#222', weight: 1,
      fillColor: montagneErrorColor(error), fillOpacity: 1,
    })
      .bindTooltip(`#${id} — measured ${measured} dB · calibrated ${corrected} dB · Δ ${error >= 0 ? '+' : ''}${error} dB`, { direction: 'top' })
      .addTo(montagneErrorLayer);
  });
  if (legend) legend.style.display = '';
}

function refreshMontagneMap() {
  if (!montagneMap) return;
  montagneMap.invalidateSize();
  updateMontagneReceivers(montagneEntries()[0]);
}

// Restore the La Montagne view (selected models + map layers) from the URL state.
function applyMontagneState(st) {
  if (!st || !montagneData.length) return;
  const models = (st.models || []).filter(v => montagneData.some(d => d.version === v));
  if (models.length) montagneSelected = models;

  const ctrl = document.getElementById('montagne-controls');
  if (ctrl) {
    ctrl.querySelectorAll('.map-btn').forEach(btn => {
      const on = montagneSelected.includes(btn.dataset.version);
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on);
    });
  }
  drawMontagneScatter(montagneEntries());
  updateMontagneNote();

  if (montagneMap && (st.layers || []).length) {
    Object.entries(montagneMapLayers).forEach(([id, layer]) => {
      const want = st.layers.includes(id);
      const on = montagneMap.hasLayer(layer);
      if (want && !on) layer.addTo(montagneMap);
      if (!want && on) montagneMap.removeLayer(layer);
    });
    renderMontagneMapLayers();
    updateMontagneReceivers(montagneEntries()[0]);
  }
}

async function initMontagne() {
  const results = await loadJson('data/montagne/results.json', []);
  renderMontagneVersions(results);
  const data = await loadJson('data/montagne/measure_comparison.json', []);
  renderMontagne(data);
  if (pendingMontagne) applyMontagneState(pendingMontagne);
}

function switchDataset(name) {
  document.querySelectorAll('.dataset-tab').forEach(t => {
    const on = t.dataset.dataset === name;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.dataset-panel').forEach(p =>
    p.classList.toggle('active', p.id === `panel-${name}`));

  const meta = document.getElementById('header-meta');
  if (name === 'start') {
    if (meta) meta.style.display = 'none';
  } else if (name === 'montagne') {
    if (meta) meta.style.display = '';
    renderMontagneHeaderMeta();
    if (montagneData.length) drawMontagneScatter(montagneEntries());
    if (montagneMap) refreshMontagneMap();
    else initMontagneMap().then(refreshMontagneMap);
  } else {
    if (meta) { meta.style.display = ''; if (clissonHeaderHtml) meta.innerHTML = clissonHeaderHtml; }
  }
  syncState({ dataset: name });
}

