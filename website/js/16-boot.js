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
  const ds = st.get('dataset') || 'clisson';

  if (ds === 'montagne') {
    pendingMontagne = {
      models: (st.get('m_models') || '').split(',').filter(Boolean),
      mapModel: st.get('m_map') || null,
      layers: (st.get('m_layers') || '').split(',').filter(Boolean),
    };
    switchDataset('montagne');
    return;
  }
  if (ds === 'start') {
    switchDataset('start');
    return;
  }

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
  let savedTheme = 'light';
  try { savedTheme = localStorage.getItem('nm-theme') || 'light'; } catch (e) {}
  const urlTheme = new URLSearchParams(location.search).get('theme');
  if (urlTheme === 'light' || urlTheme === 'dark') savedTheme = urlTheme;
  applyTheme(savedTheme);

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
  await initStart();
}

window.addEventListener('resize', debounce(() => {
  if (histoRedraw) histoRedraw();
  if (boxplotRedraw) boxplotRedraw();
  const mp = document.getElementById('panel-montagne');
  if (montagneChart && montagneData.length && mp && mp.classList.contains('active')) {
    drawMontagneScatter(montagneEntries());
  }
  if (montagneMap && mp && mp.classList.contains('active')) montagneMap.invalidateSize();
}, 250));

init();
