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

const CLISSON_STATE_KEYS = ['version', 'layers', 'a', 'b'];
const MONTAGNE_STATE_KEYS = ['m_models', 'm_map', 'm_layers'];

function syncState(patch) {
  const cur = new URLSearchParams(location.hash.replace(/^#/, ''));
  const ds = patch.dataset || cur.get('dataset') || 'clisson';
  // Keep the URL scoped to the active dataset only.
  if (ds !== 'clisson') CLISSON_STATE_KEYS.forEach(k => cur.delete(k));
  if (ds !== 'montagne') MONTAGNE_STATE_KEYS.forEach(k => cur.delete(k));
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


// Chart.js theme accessors: same cssVar() calls as inline, read at use time,
// so a theme switch still re-reads the CSS variables exactly as before.
const CHART = {
  get text()      { return C('--chart-text', '#6b7280'); },
  get grid()      { return C('--chart-grid', '#252b3b'); },
  get accent()    { return C('--accent', '#00e5ff'); },
  get fg()        { return C('--chart-fg', '#e8eaf0'); },
  get tooltipBg() { return C('--chart-tooltip-bg', '#12161f'); },
};
