// ─────────────────────────────────────────────
// LA MONTAGNE — COMPARAISON A LA MESURE
// ─────────────────────────────────────────────
let montagneChart = null;
let montagneData = [];
let pendingMontagne = null;
// Display mode shared by the scatter plot and the map: absolute levels, or
// levels relative to each campaign reference receiver (#10 for c1, #11 for c2).
let montagneRelative = false;

function montagneRefLevel(entry, camp) {
  const refs = (entry && entry.references) || {};
  const ref = refs[camp || 'c1'];
  return (ref && ref.measured != null) ? Number(ref.measured) : 0;
}

function montagneLatestVersion() {
  if (!montagneData.length) return null;
  const versions = montagneData.map(d => d.version)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return versions[versions.length - 1] || null;
}

function setMontagneRelative(value) {
  montagneRelative = !!value;
  const btn = document.getElementById('montagne-level-mode');
  if (btn) {
    btn.classList.toggle('active', montagneRelative);
    btn.setAttribute('aria-pressed', String(montagneRelative));
  }
}

// Draws the upper (homogeneous -> favourable) error bar for every scatter point.
const montagneErrorBarsPlugin = {
  id: 'montagneErrorBars',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    chart.data.datasets.forEach((ds, di) => {
      if (!ds.errorBars) return;
      const meta = chart.getDatasetMeta(di);
      const yScale = chart.scales.y;
      ctx.save();
      ctx.strokeStyle = ds.borderColor || '#888';
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1.5;
      meta.data.forEach((el, i) => {
        const raw = ds.data[i];
        // Upper error bar only: skip when the favourable level is not above.
        if (!raw || raw.y == null || raw.yFav == null || raw.yFav <= raw.y) return;
        const yFav = yScale.getPixelForValue(raw.yFav);
        ctx.beginPath();
        ctx.moveTo(el.x, el.y);
        ctx.lineTo(el.x, yFav);
        ctx.moveTo(el.x - 3, yFav);
        ctx.lineTo(el.x + 3, yFav);
        ctx.stroke();
      });
      ctx.restore();
    });
  }
};

function modelColor(index) {
  const light = document.documentElement.dataset.theme === 'light';
  const lightPalette = ['#0e6b6b', '#b45309', '#15803d', '#b91c1c', '#6d28d9', '#0369a1', '#a16207', '#4d7c0f', '#9d174d'];
  const palette = light ? lightPalette : PALETTE;
  return palette[index % palette.length];
}

function drawMontagneScatter(entries) {
  const nodata = document.getElementById('montagne-nodata');
  const canvas = document.getElementById('montagne-scatter-chart');
  entries = (entries || []).filter(e => e && e.scatter && e.scatter.length);

  if (!entries.length) {
    nodata.style.display = 'block';
    canvas.style.display = 'none';
    if (montagneChart) { montagneChart.destroy(); montagneChart = null; }
    return;
  }
  nodata.style.display = 'none';
  canvas.style.display = 'block';

  const font = { family: C('--chart-font', 'Space Mono, monospace'), size: 12 };

  if (montagneChart) montagneChart.destroy();

  const labelOf = camp =>
    (entries[0].campaign_labels && entries[0].campaign_labels[camp]) || camp;
  const datasets = [];
  entries.forEach((entry, i) => {
    const color = modelColor(i);
    const bars = entry.bars || [];
    const byCamp = {};
    (entry.scatter || []).forEach((pt, idx) => {
      const [m, c, camp] = pt;
      const key = camp || 'c1';
      const shift = montagneRelative ? montagneRefLevel(entry, key) : 0;
      const bar = bars[idx];
      const yFav = (bar && bar[2] != null) ? bar[2] - shift : null;
      (byCamp[key] = byCamp[key] || []).push({ x: m - shift, y: c - shift, yFav });
    });
    Object.keys(byCamp).sort().forEach(camp => {
      datasets.push({
        type: 'scatter',
        label: `${entry.version} · ${labelOf(camp)} (n=${byCamp[camp].length})`,
        data: byCamp[camp],
        backgroundColor: color,
        borderColor: color,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointStyle: camp === 'c2' ? 'rect' : 'circle',
        order: 2,
        errorBars: true,
      });
    });
  });

  const allVals = datasets.flatMap(ds =>
    ds.data.flatMap(p => (p.yFav != null ? [p.x, p.y, p.yFav] : [p.x, p.y])));
  const minV = Math.floor(Math.min(...allVals) / 5) * 5;
  const maxV = Math.ceil(Math.max(...allVals) / 5) * 5;
  const diagLine = [{ x: minV, y: minV }, { x: maxV, y: maxV }];
  datasets.push({
    type: 'line',
    label: 'y = x',
    data: diagLine,
    borderColor: C('--chart-diagonal', 'rgba(255,255,255,.55)'),
    borderWidth: 2,
    borderDash: [6, 4],
    pointRadius: 0,
    fill: false,
    order: 1,
  });

  const multi = entries.length > 1;
  const ctx = canvas.getContext('2d');
  montagneChart = new Chart(ctx, {
    data: { datasets },
    plugins: [montagneErrorBarsPlugin],
    options: {
      responsive: true,
      animation: false,
      plugins: {
        legend: { labels: { color: CHART.text, font } },
        tooltip: {
          backgroundColor: CHART.tooltipBg,
          borderColor: CHART.grid,
          borderWidth: 1,
          titleColor: CHART.accent,
          bodyColor: CHART.fg,
          callbacks: {
            title: () => '',
            label: item => {
              if (item.dataset.type !== 'scatter') return null;
              const { x, y } = item.parsed;
              const rel = montagneRelative ? ' (rel.)' : '';
              let text = ` ${item.dataset.label}: measured${rel} ${x} dB -> ${y} dB (delta=${(y - x).toFixed(2)} dB)`;
              const raw = item.raw || {};
              if (raw.yFav != null && raw.yFav !== y) {
                text += ` · favorable${rel} ${Number(raw.yFav).toFixed(2)} dB (${raw.yFav - y >= 0 ? '+' : ''}${(raw.yFav - y).toFixed(2)})`;
              }
              return text;
            }
          }
        }
      },
      scales: {
        x: { type: 'linear', min: minV, max: maxV,
          ticks: { color: CHART.text, font, callback: v => v + ' dB' },
          grid: { color: CHART.grid },
          title: { display: true, text: montagneRelative ? 'Measured LAeq,D relative to reference (dB)' : 'Measured LAeq,D (dB)', color: CHART.text, font } },
        y: { type: 'linear', min: minV, max: maxV,
          ticks: { color: CHART.text, font, callback: v => v + ' dB' },
          grid: { color: CHART.grid },
          title: { display: true, text: montagneRelative
              ? 'Calibrated LAeq,D relative to reference (dB)'
              : (multi ? 'Calibrated LAeq,D (dB)' : `${entries[0].version} calibrated LAeq,D (dB)`),
            color: CHART.text, font } }
      }
    }
  });
}

let montagneSelected = [];

function montagneEntry(version) {
  return montagneData.find(d => d.version === version) || null;
}

function montagneEntries() {
  const list = montagneSelected.map(v => montagneEntry(v)).filter(Boolean);
  return list.length ? list : montagneData.slice(0, 1);
}

function updateMontagneNote() {
  const note = document.getElementById('montagne-note');
  if (!note) return;
  const entries = montagneEntries();
  const ref = entries[0] || {};
  const offsets = entries.map(e => `${e.version}: <b>${fmt(e.offset)} dB</b>`).join(' &middot; ');
  const labels = (ref.campaign_labels && Object.values(ref.campaign_labels).length)
      ? Object.values(ref.campaign_labels).join(' &middot; ') : '—';
  const nCamp = ref.campaigns ? ref.campaigns.length : 0;
  const nMeas = (ref.n_measured !== undefined && ref.n_measured !== null) ? ref.n_measured : '—';
  note.innerHTML =
    `Measurements: <b>${nCamp} campaigns</b> (${labels}), ${nMeas} points. ` +
    `Each campaign is calibrated on its own reference receiver (closest to the source: emission level unknown), so the error is zero there. ` +
    `Global indicators (mean, RMSE, scatter) are computed on the pooled calibrated points. ` +
    `Scatter points are the <b>homogeneous</b> scenario; the upper error bar reaches the <b>favourable</b>-wind scenario. ` +
    `Display: <b>${montagneRelative ? 'relative to the reference receiver (#10/#11)' : 'absolute levels'}</b> (toggle above). ` +
    `Mean offset: ${offsets} dB.` +
    `<br>Download: <a href="data/montagne/measure_comparison.json" download>measure_comparison.json</a> &middot; ` +
    `<a href="data/montagne/comparisons.json" download>comparisons.json</a> &middot; ` +
    `<a href="data/montagne/results.json" download>results.json</a>`;
}

function renderMontagneVersions(results) {
  const el = document.getElementById('montagne-versions');
  if (!el) return;
  if (!results.length) { el.innerHTML = '<div class="empty">No La Montagne results.</div>'; return; }
  const rows = results.map(r => `
    <tr>
      <td style="padding:.15rem .8rem .15rem 0">${r.version}</td>
      <td style="padding:.15rem .8rem">${Number(r.nbRays) > 0 ? r.nbRays : 'n/a'}</td>
      <td style="padding:.15rem .8rem">${Number(r.nbProfiles) > 0 ? r.nbProfiles : 'n/a'}</td>
      <td style="padding:.15rem .8rem">${fmt(r.mean)}</td>
      <td style="padding:.15rem .8rem">${r.time || '—'}</td>
      <td style="padding:.15rem .8rem">${(r.nNan ?? 0).toLocaleString()}</td>
    </tr>`).join('');
  el.innerHTML = `
    <table style="border-collapse:collapse;margin-top:.5rem">
      <thead>
        <tr style="color:var(--accent)">
          <th align="left">Version</th><th align="left">Rays</th><th align="left">Profiles</th><th align="left">Mean LAEQ</th>
          <th align="left">Compute</th><th align="left">Silenced</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function montagneOffsetCell(row) {
  if (montagneRelative) {
    const camps = Object.keys(row.offsets || {});
    return (camps.length ? camps.map(c => `${c} 0.00`) : ['0.00']).join(' / ');
  }
  return row.offsets
    ? Object.entries(row.offsets).map(([c, v]) => `${c} ${fmt(v)}`).join(' / ')
    : fmt(row.offset);
}

function renderMontagneTable(data) {
  const el = document.getElementById('montagne-table');
  if (!el) return;
  const rows = data.map(row => `
    <tr>
      <td style="padding:.15rem .8rem .15rem 0">${row.version}</td>
      <td style="padding:.15rem .8rem">#${(row.references && Object.values(row.references).map(r => r.receiver).join('/')) || '—'}</td>
      <td style="padding:.15rem .8rem">${montagneOffsetCell(row)}</td>
      <td style="padding:.15rem .8rem">${fmt(row.mean_error)}</td>
      <td style="padding:.15rem .8rem">${fmt(row.std_error)}</td>
      <td style="padding:.15rem .8rem">${fmt(row.rmse)}</td>
      <td style="padding:.15rem .8rem">${fmt(row.max_abs_error)}</td>
      <td style="padding:.15rem 0">${row.n_compared}/${row.n_measured}</td>
    </tr>`).join('');
  el.innerHTML = `
    <table style="border-collapse:collapse;margin-top:.5rem">
      <thead>
        <tr style="color:var(--accent)">
          <th align="left">Version</th><th align="left">Ref.</th><th align="left">Offset (dB)</th>
          <th align="left">Mean error</th><th align="left">Std</th><th align="left">RMSE</th>
          <th align="left">Max |error|</th><th align="left">Receivers</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:.4rem">${montagneRelative
      ? 'Relative mode: the reference receiver (#10/#11) is the origin, so the calibration offset is 0. Error statistics are differences, so they are identical in both modes.'
      : 'Absolute mode: the offset is the model bias at the reference receiver.'}</div>`;
}

function renderMontagne(data) {
  const panel = document.getElementById('panel-montagne');
  const tab   = document.querySelector('.dataset-tab[data-dataset="montagne"]');
  if (!panel) return;

  if (!data.length) {
    panel.style.display = 'none';
    if (tab) tab.style.display = 'none';
    return;
  }

  montagneData = data;
  montagneSelected = [data[0].version];

  const ctrl = document.getElementById('montagne-controls');

  ctrl.innerHTML = data.map(row => {
    const on = montagneSelected.includes(row.version);
    return `<button class="map-btn${on ? ' active' : ''}" data-version="${row.version}" aria-pressed="${on}">${row.version}</button>`;
  }).join('') +
    `<span class="start-hint" style="margin-left:.4rem">select one or more models</span>` +
    `<button class="map-btn${montagneRelative ? ' active' : ''}" id="montagne-level-mode" aria-pressed="${montagneRelative}" style="margin-left:1rem">Relative to reference</button>`;

  ctrl.querySelectorAll('.map-btn[data-version]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.version;
      if (montagneSelected.includes(v)) {
        if (montagneSelected.length === 1) return;
        montagneSelected = montagneSelected.filter(x => x !== v);
      } else {
        montagneSelected = [...montagneSelected, v]
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      }
      const on = montagneSelected.includes(v);
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on);
      drawMontagneScatter(montagneEntries());
      updateMontagneNote();
      if (montagneMap) updateMontagneReceivers(montagneMapEntry());
      syncState({ dataset: 'montagne', m_models: montagneSelected.join(',') });
    });
  });

  const modeBtn = document.getElementById('montagne-level-mode');
  if (modeBtn) {
    modeBtn.addEventListener('click', () => {
      setMontagneRelative(!montagneRelative);
      drawMontagneScatter(montagneEntries());
      updateMontagneNote();
      renderMontagneTable(montagneData);
      if (montagneMap) updateMontagneReceivers(montagneMapEntry());
      if (typeof renderMontagneExplain === 'function') renderMontagneExplain();
      syncState({ dataset: 'montagne', m_rel: montagneRelative ? '1' : '' });
    });
  }

  renderMontagneTable(data);

  updateMontagneNote();
  // Le canvas et la carte n'ont une taille que lorsque l'onglet est visible.
  if (panel.classList.contains('active')) {
    renderMontagneHeaderMeta();
    drawMontagneScatter(montagneEntries());
    initMontagneMap().then(refreshMontagneMap);
  }
}

