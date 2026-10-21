// ─────────────────────────────────────────────
// PULL REQUEST BENCHMARKS
// ─────────────────────────────────────────────
const PR_INDEX_LOCAL = 'data/pr/index.json';
let prIndex = [];
let prSource = 'local';
let prCache = {};
let prComparison = null;
let prScatterChart = null;
let prDensityChart = null;
let prMontagneChart = null;
let prMap = null;
let prDiffLayer = null;

function prRawBase() {
  const repo = (typeof BUILD !== 'undefined' && BUILD.repo)
    ? BUILD.repo
    : 'pierromond/NoiseModellingBenchmark';
  return `https://raw.githubusercontent.com/${repo}/pr-data`;
}

async function prFetchJson(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    return null;
  }
}

function prDataBase(pr) {
  return prSource === 'raw' ? `${prRawBase()}/pr/${pr}` : `data/pr/${pr}`;
}

async function prLoad(pr) {
  if (prCache[pr]) return prCache[pr];
  const base = prDataBase(pr);
  const get = async (path, fallback) => (await prFetchJson(`${base}/${path}`)) ?? fallback;
  const data = {
    manifest: await get('manifest.json', {}),
    clisson: {
      results: await get('clisson/results.json', []),
      comparisons: await get('clisson/comparisons.json', []),
    },
    montagne: {
      results: await get('montagne/results.json', []),
      comparisons: await get('montagne/comparisons.json', []),
      measure: await get('montagne/measure_comparison.json', []),
    },
  };
  prCache[pr] = data;
  return data;
}

function prOptions(select, values, selected) {
  select.innerHTML = values
    .map(value => `<option value="${esc(value)}">${esc(value)}</option>`)
    .join('');
  if (selected && values.includes(selected)) select.value = selected;
}

function prCurrentItem() {
  const select = document.getElementById('pr-select');
  const value = select ? select.value : '';
  return prIndex.find(item => String(item.pr) === String(value)) || prIndex[0] || null;
}

function prCurrentDataset() {
  const select = document.getElementById('pr-dataset');
  return select ? select.value : 'clisson';
}

function prComparisonsFor(dataset) {
  if (!prComparison) return [];
  return (prComparison[dataset] && prComparison[dataset].comparisons) || [];
}

function prSelectedComparison() {
  const dataset = prCurrentDataset();
  const baseline = document.getElementById('pr-baseline')?.value;
  return prComparisonsFor(dataset).find(item => item.version_a === baseline) || null;
}

function prUpdateBaselineOptions() {
  const select = document.getElementById('pr-baseline');
  if (!select) return;
  const values = prComparisonsFor(prCurrentDataset()).map(item => item.version_a);
  const current = select.value;
  prOptions(select, values, values.includes(current) ? current : values[0]);
}

function prMetaHtml(item, manifest) {
  const link = item.url || manifest.url || '#';
  const run = item.runUrl || manifest.runUrl || '';
  const runLink = run ? `<a href="${run}" target="_blank" rel="noopener">${run.split('/').pop()}</a>` : '—';
  return `
    <div class="pr-banner">
      <b>Pull request result — not an official benchmark release.</b>
      All numbers below come from the PR merge artifact and must be read with the PR discussion.
      The artifact may include changes from the base branch.
    </div>
    <div class="pr-meta">
      <div><b>PR</b> <a href="${link}" target="_blank" rel="noopener">#${esc(item.pr)} — ${esc(item.title || '')}</a></div>
      <div><b>Version</b> <code>${esc(item.label || '')}</code></div>
      <div><b>Head</b> <code>${esc((item.headSha || '').slice(0, 12))}</code>
           · <b>Base</b> <code>${esc((item.baseSha || '').slice(0, 12))}</code></div>
      <div><b>CI run</b> ${runLink} · <b>Published</b> ${esc(item.publishedAt || '—')}</div>
    </div>`;
}

function prSummaryTable(comparisons) {
  if (!comparisons.length) return '<div class="empty">No comparison data for this PR and dataset.</div>';
  const rows = comparisons.map(item => `
    <tr>
      <td>${esc(item.version_a)}</td>
      <td>${fmt(item.rmse)}</td>
      <td>${fmt(item.mean_delta)}</td>
      <td>${fmt(item.max_delta)}</td>
      <td>${Number(item.n_valid || 0).toLocaleString()}</td>
    </tr>`).join('');
  return `
    <div class="table-scroll"><table class="pr-table">
      <thead><tr><th align="left">Baseline</th><th align="left">RMSE (dB)</th>
        <th align="left">Mean |Δ| (dB)</th><th align="left">Max |Δ| (dB)</th><th align="left">Compared</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

function prSelectedCard(item) {
  if (!item) return '';
  const stable = item.rmse < 0.1;
  const warn = item.rmse >= 0.1 && item.rmse < 0.5;
  const color = stable ? 'var(--accent3)' : warn ? 'var(--accent2)' : '#f44336';
  const verdict = stable ? 'Numerically stable' : warn ? 'Minor differences' : 'Significant differences';
  return `
    <div class="card" style="--card-accent:${color};margin-top:1rem">
      <div class="card-version">${esc(item.version_a)} → ${esc(item.version_b)}
        <span style="margin-left:.75rem;font-size:.65rem;color:${color}">${verdict}</span></div>
      <div class="card-stats">
        <div class="stat-row"><span class="stat-label">RMSE</span><span class="stat-value accent2">${fmt(item.rmse)} dB</span></div>
        <div class="stat-row"><span class="stat-label">Standard deviation</span><span class="stat-value accent2">${fmt(item.std_delta)} dB</span></div>
        <div class="stat-row"><span class="stat-label">Mean |delta|</span><span class="stat-value">${fmt(item.mean_delta)} dB</span></div>
        <div class="stat-row"><span class="stat-label">Max |delta|</span><span class="stat-value">${fmt(item.max_delta)} dB</span></div>
        <div class="stat-row"><span class="stat-label">Compared receivers</span><span class="stat-value">${Number(item.n_valid || 0).toLocaleString()} / ${Number(item.n_common || 0).toLocaleString()}</span></div>
        <div class="stat-row"><span class="stat-label">Silenced receivers (a / b)</span><span class="stat-value">${Number(item.n_nan_a || 0).toLocaleString()} / ${Number(item.n_nan_b || 0).toLocaleString()}</span></div>
      </div>
    </div>`;
}

function prDrawScatter(item) {
  const canvas = document.getElementById('pr-scatter-chart');
  if (!canvas) return;
  if (prScatterChart) { prScatterChart.destroy(); prScatterChart = null; }
  if (!item || !item.scatter || !item.scatter.length) return;
  const points = item.scatter.map(([x, y]) => ({ x, y }));
  const all = points.flatMap(p => [p.x, p.y]);
  const minV = Math.floor(Math.min(...all) / 5) * 5;
  const maxV = Math.ceil(Math.max(...all) / 5) * 5;
  prScatterChart = new Chart(canvas.getContext('2d'), {
    data: {
      datasets: [
        { type: 'scatter', label: `Receivers (n=${Number(item.n_valid || 0).toLocaleString()})`,
          data: points, backgroundColor: 'rgba(0,229,255,0.3)', pointRadius: 2, pointHoverRadius: 5, order: 2 },
        { type: 'line', label: 'y = x', data: [{ x: minV, y: minV }, { x: maxV, y: maxV }],
          borderColor: 'rgba(255,255,255,0.5)', borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0, order: 1 },
      ],
    },
    options: {
      responsive: true, animation: false,
      plugins: {
        legend: { labels: { color: CHART.text, font: { family: 'Space Mono', size: 11 }, filter: i => i.datasetIndex === 0 } },
        tooltip: {
          backgroundColor: CHART.tooltipBg, borderColor: CHART.grid, borderWidth: 1,
          titleColor: CHART.accent, bodyColor: CHART.fg,
          callbacks: { title: () => '', label: ctx => ctx.datasetIndex === 0
            ? ` ${item.version_a}: ${ctx.parsed.x} dB → ${item.version_b}: ${ctx.parsed.y} dB` : null },
        },
      },
      scales: {
        x: { type: 'linear', min: minV, max: maxV, ticks: { color: CHART.text, callback: v => v + ' dB' },
             grid: { color: CHART.grid }, title: { display: true, text: item.version_a, color: CHART.text } },
        y: { type: 'linear', min: minV, max: maxV, ticks: { color: CHART.accent, callback: v => v + ' dB' },
             grid: { color: CHART.grid }, title: { display: true, text: item.version_b, color: CHART.accent } },
      },
    },
  });
}

function prDrawDensity(item) {
  const canvas = document.getElementById('pr-density-chart');
  if (!canvas) return;
  if (prDensityChart) { prDensityChart.destroy(); prDensityChart = null; }
  if (!item || !item.deltas_signed || !item.deltas_signed.length) return;
  const deltas = item.deltas_signed;
  const minD = Math.min(...deltas), maxD = Math.max(...deltas);
  const pad = (maxD - minD) * 0.15 || 2;
  const xs = linspace(minD - pad, maxD + pad, 300);
  const ys = kde(deltas, null, xs);
  const binWidth = (xs[xs.length - 1] - xs[0]) / xs.length;
  const toCount = d => d * deltas.length * binWidth;
  const pos = xs.map((x, i) => ({ x: +x.toFixed(3), y: x >= 0 ? toCount(ys[i]) : 0 }));
  const neg = xs.map((x, i) => ({ x: +x.toFixed(3), y: x <= 0 ? toCount(ys[i]) : 0 }));
  const all = xs.map((x, i) => ({ x: +x.toFixed(3), y: toCount(ys[i]) }));
  prDensityChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { datasets: [
      { label: `${item.version_b} louder`, data: pos, borderColor: '#f44336', backgroundColor: 'rgba(244,67,54,0.25)', fill: true, pointRadius: 0, borderWidth: 0, tension: 0.4 },
      { label: `${item.version_b} quieter`, data: neg, borderColor: '#2196f3', backgroundColor: 'rgba(33,150,243,0.25)', fill: true, pointRadius: 0, borderWidth: 0, tension: 0.4 },
      { label: 'Density', data: all, borderColor: CHART.accent, fill: false, pointRadius: 0, borderWidth: 2, tension: 0.4 },
    ] },
    options: {
      responsive: true, animation: false, parsing: false,
      plugins: { legend: { labels: { color: CHART.text, filter: i => i.datasetIndex !== 2 } } },
      scales: {
        x: { type: 'linear', ticks: { color: CHART.text, callback: v => v + ' dB' }, grid: { color: CHART.grid } },
        y: { type: 'linear', ticks: { color: CHART.text }, grid: { color: CHART.grid } },
      },
    },
  });
}

function prDrawMap(item) {
  const el = document.getElementById('pr-diff-map');
  const info = document.getElementById('pr-diff-info');
  if (!el) return;
  if (prDiffLayer) { prMap.removeLayer(prDiffLayer); prDiffLayer = null; }
  if (!item || !item.diff_map || !item.diff_map.length) {
    if (info) info.textContent = 'No diff map data for this pair.';
    return;
  }
  if (!prMap) {
    prMap = L.map('pr-diff-map', { zoomControl: true }).setView([47.086, -1.27], 13);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri', maxNativeZoom: 16, maxZoom: 19,
    }).addTo(prMap);
  }
  const geojson = {
    type: 'FeatureCollection',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } },
    features: item.diff_map.map(([lon, lat, delta]) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { delta },
    })),
  };
  prDiffLayer = L.geoJSON(reprojectGeojson(geojson), {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
      radius: 3, fillColor: diffColor(feature.properties.delta), color: 'transparent', fillOpacity: 0.9, weight: 0,
    }),
    onEachFeature: (feature, layer) => {
      const d = feature.properties.delta;
      layer.bindTooltip(`Δ: ${d >= 0 ? '+' : ''}${d.toFixed(2)} dB<br>${item.version_a} → ${item.version_b}`,
        { className: 'leaflet-tooltip-dark', sticky: true });
    },
  }).addTo(prMap);
  try { prMap.fitBounds(prDiffLayer.getBounds(), { padding: [30, 30] }); } catch (e) {}
  if (info) info.innerHTML = `n=${item.diff_map.length.toLocaleString()}<br>${esc(item.version_a)} → ${esc(item.version_b)}`;
  setTimeout(() => prMap.invalidateSize(), 50);
}

function prDrawMontagne(item) {
  const canvas = document.getElementById('pr-montagne-chart');
  if (!canvas) return;
  if (prMontagneChart) { prMontagneChart.destroy(); prMontagneChart = null; }
  if (!item || !item.scatter || !item.scatter.length) return;
  const points = item.scatter.map(([m, c, camp]) => ({ x: m, y: c, camp: camp || 'c1' }));
  const all = points.flatMap(p => [p.x, p.y]);
  const minV = Math.floor(Math.min(...all) / 5) * 5;
  const maxV = Math.ceil(Math.max(...all) / 5) * 5;
  prMontagneChart = new Chart(canvas.getContext('2d'), {
    data: { datasets: [
      { type: 'scatter', label: item.version, data: points, backgroundColor: 'rgba(0,229,255,0.4)', pointRadius: 5, order: 2 },
      { type: 'line', label: 'y = x', data: [{ x: minV, y: minV }, { x: maxV, y: maxV }],
        borderColor: 'rgba(255,255,255,0.5)', borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0, order: 1 },
    ] },
    options: {
      responsive: true, animation: false,
      plugins: { legend: { labels: { color: CHART.text } } },
      scales: {
        x: { type: 'linear', min: minV, max: maxV, ticks: { color: CHART.text, callback: v => v + ' dB' }, grid: { color: CHART.grid },
             title: { display: true, text: 'Measured LAeq,D (dB)', color: CHART.text } },
        y: { type: 'linear', min: minV, max: maxV, ticks: { color: CHART.accent, callback: v => v + ' dB' }, grid: { color: CHART.grid },
             title: { display: true, text: 'Calibrated LAeq,D (dB)', color: CHART.accent } },
      },
    },
  });
}

function prMontagneTable(prMeasure, official) {
  const rows = [];
  const seen = new Set();
  (official || []).forEach(item => {
    if (!prComparisonsFor('montagne').some(c => c.version_a === item.version)) return;
    if (seen.has(item.version)) return;
    seen.add(item.version);
    rows.push(`<tr><td>${esc(item.version)}</td><td>${fmt(item.offset)}</td><td>${fmt(item.mean_error)}</td>
      <td>${fmt(item.std_error)}</td><td>${fmt(item.rmse)}</td><td>${fmt(item.max_abs_error)}</td>
      <td>${item.n_compared}/${item.n_measured}</td></tr>`);
  });
  (prMeasure || []).forEach(item => {
    rows.push(`<tr class="pr-row"><td>${esc(item.version)} <span class="start-tag">PR</span></td><td>${fmt(item.offset)}</td>
      <td>${fmt(item.mean_error)}</td><td>${fmt(item.std_error)}</td><td>${fmt(item.rmse)}</td>
      <td>${fmt(item.max_abs_error)}</td><td>${item.n_compared}/${item.n_measured}</td></tr>`);
  });
  return `<div class="table-scroll"><table class="pr-table">
    <thead><tr><th align="left">Version</th><th align="left">Offset (dB)</th><th align="left">Mean error</th>
      <th align="left">Std</th><th align="left">RMSE</th><th align="left">Max |error|</th><th align="left">Receivers</th></tr></thead>
    <tbody>${rows.join('')}</tbody></table></div>`;
}

async function prRender() {
  const item = prCurrentItem();
  if (!item) return;
  const data = await prLoad(item.pr);
  prComparison = data;
  prUpdateBaselineOptions();
  const dataset = prCurrentDataset();
  const selected = prSelectedComparison();
  const comparisons = prComparisonsFor(dataset);

  const meta = document.getElementById('pr-meta');
  if (meta) meta.innerHTML = prMetaHtml(item, data.manifest || {});
  const summary = document.getElementById('pr-summary');
  if (summary) summary.innerHTML = prSummaryTable(comparisons) + prSelectedCard(selected);

  document.getElementById('pr-charts-section').style.display = dataset === 'clisson' ? '' : 'none';
  document.getElementById('pr-montagne-section').style.display = dataset === 'montagne' ? '' : 'none';

  if (dataset === 'clisson') {
    const title = document.getElementById('pr-chart-title');
    if (title) title.textContent = selected ? `${selected.version_a} → ${selected.version_b}` : 'Comparison';
    prDrawScatter(selected);
    prDrawDensity(selected);
    prDrawMap(selected);
  } else {
    const measure = (data.montagne.measure || [])[0] || null;
    const official = await loadJson('data/montagne/measure_comparison.json', []);
    const table = document.getElementById('pr-montagne-table');
    if (table) table.innerHTML = prMontagneTable(measure ? [measure] : [], official);
    prDrawMontagne(measure);
  }
  syncState({ dataset: 'pr', pr: String(item.pr), pr_base: document.getElementById('pr-baseline')?.value || '',
              pr_dataset: dataset });
}

function prFillSelectors() {
  const prSelect = document.getElementById('pr-select');
  const datasetSelect = document.getElementById('pr-dataset');
  if (!prSelect || !prIndex.length) return;
  prSelect.innerHTML = prIndex.map(item => `<option value="${item.pr}">#${item.pr} — ${esc(item.title || item.label || '')}</option>`).join('');
  prSelect.value = prIndex[0].pr;
  if (datasetSelect) datasetSelect.value = 'clisson';
}

function prRunLink() {
  const repo = (typeof BUILD !== 'undefined' && BUILD.repo)
    ? BUILD.repo
    : 'pierromond/NoiseModellingBenchmark';
  return `https://github.com/${repo}/actions/workflows/benchmark-pr.yml`;
}

async function initPullRequests() {
  const tab = document.querySelector('.dataset-tab[data-dataset="pr"]');
  const runLink = document.getElementById('pr-run-link');
  if (runLink) {
    runLink.innerHTML = `Missing a pull request? <a href="${prRunLink()}" target="_blank" rel="noopener">Run the Benchmark PR workflow</a> (maintainer action).`;
  }
  const local = await prFetchJson(PR_INDEX_LOCAL);
  if (Array.isArray(local) && local.length) {
    prIndex = local;
    prSource = 'local';
  } else {
    const remote = await prFetchJson(`${prRawBase()}/index.json`);
    prIndex = Array.isArray(remote) ? remote : [];
    prSource = 'raw';
  }
  if (!prIndex.length) {
    if (tab) tab.style.display = 'none';
    const intro = document.getElementById('pr-intro');
    if (intro) {
      intro.innerHTML = 'No pull-request benchmark has been published yet. '
        + 'A maintainer can run the <code>Benchmark PR</code> workflow and publish the result.';
    }
    return;
  }
  prIndex.sort((a, b) => Number(b.pr) - Number(a.pr));
  prFillSelectors();
  const initial = readState();
  const prSelect = document.getElementById('pr-select');
  const datasetSelect = document.getElementById('pr-dataset');
  if (prSelect && initial.get('pr') && [...prSelect.options].some(o => o.value === initial.get('pr'))) {
    prSelect.value = initial.get('pr');
  }
  if (datasetSelect && initial.get('pr_dataset')) datasetSelect.value = initial.get('pr_dataset');
  document.getElementById('pr-select')?.addEventListener('change', () => prRender());
  document.getElementById('pr-baseline')?.addEventListener('change', () => prRender());
  document.getElementById('pr-dataset')?.addEventListener('change', () => {
    prUpdateBaselineOptions();
    prRender();
  });
  await prRender();
  const baseline = document.getElementById('pr-baseline');
  if (baseline && initial.get('pr_base') && [...baseline.options].some(o => o.value === initial.get('pr_base'))) {
    baseline.value = initial.get('pr_base');
    await prRender();
  }
}

async function refreshPullRequests() {
  if (!prIndex.length) return;
  await prRender();
}

function applyPrState(st) {
  if (!prIndex.length) return;
  const prSelect = document.getElementById('pr-select');
  const datasetSelect = document.getElementById('pr-dataset');
  if (prSelect && st.get('pr') && [...prSelect.options].some(o => o.value === st.get('pr'))) {
    prSelect.value = st.get('pr');
  }
  if (datasetSelect && st.get('pr_dataset')) datasetSelect.value = st.get('pr_dataset');
  prRender().then(() => {
    const baseline = document.getElementById('pr-baseline');
    if (baseline && st.get('pr_base') && [...baseline.options].some(o => o.value === st.get('pr_base'))) {
      baseline.value = st.get('pr_base');
      prRender();
    }
  });
}
