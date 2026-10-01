// ─────────────────────────────────────────────
// LA MONTAGNE — COMPARAISON A LA MESURE
// ─────────────────────────────────────────────
let montagneChart = null;
let montagneData = [];
let pendingMontagne = null;

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

  const allVals = entries.flatMap(e => e.scatter.flatMap(([m, c]) => [m, c]));
  const minV = Math.floor(Math.min(...allVals) / 5) * 5;
  const maxV = Math.ceil(Math.max(...allVals) / 5) * 5;
  const diagLine = [{ x: minV, y: minV }, { x: maxV, y: maxV }];
  const font = { family: C('--chart-font', 'Space Mono, monospace'), size: 12 };

  if (montagneChart) montagneChart.destroy();

  const datasets = entries.map((entry, i) => {
    const color = modelColor(i);
    return {
      type: 'scatter',
      label: `${entry.version} (n=${entry.n_compared})`,
      data: entry.scatter.map(([m, c]) => ({ x: m, y: c })),
      backgroundColor: color,
      borderColor: color,
      pointRadius: 4,
      pointHoverRadius: 7,
      order: 2,
    };
  });
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
              return ` ${item.dataset.label}: measured ${x} dB -> ${y} dB (delta=${(y - x).toFixed(2)} dB)`;
            }
          }
        }
      },
      scales: {
        x: { type: 'linear', min: minV, max: maxV,
          ticks: { color: CHART.text, font, callback: v => v + ' dB' },
          grid: { color: CHART.grid },
          title: { display: true, text: 'Measured LAeq,D (dB)', color: CHART.text, font } },
        y: { type: 'linear', min: minV, max: maxV,
          ticks: { color: CHART.text, font, callback: v => v + ' dB' },
          grid: { color: CHART.grid },
          title: { display: true, text: multi ? 'Calibrated LAeq,D (dB)' : `${entries[0].version} calibrated LAeq,D (dB)`,
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
  note.innerHTML =
    `Reference receiver <b>#${ref.reference_receiver}</b> (closest to the source, ${fmt(ref.reference_distance, 1)} m). ` +
    `Offset = measured &minus; computed at that receiver: ${offsets}. ` +
    `Errors are computed after applying this offset to every receiver (zero at the reference by construction).` +
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
      <td style="padding:.15rem .8rem">${fmt(r.mean)}</td>
      <td style="padding:.15rem .8rem">${r.time || '—'}</td>
      <td style="padding:.15rem .8rem">${(r.nNan ?? 0).toLocaleString()}</td>
    </tr>`).join('');
  el.innerHTML = `
    <table style="border-collapse:collapse;margin-top:.5rem">
      <thead>
        <tr style="color:var(--accent)">
          <th align="left">Version</th><th align="left">Rays</th><th align="left">Mean LAEQ</th>
          <th align="left">Compute</th><th align="left">Silenced</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
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
  const tableEl = document.getElementById('montagne-table');

  ctrl.innerHTML = data.map(row => {
    const on = montagneSelected.includes(row.version);
    return `<button class="map-btn${on ? ' active' : ''}" data-version="${row.version}" aria-pressed="${on}">${row.version}</button>`;
  }).join('') + `<span class="start-hint" style="margin-left:.4rem">select one or more models</span>`;

  ctrl.querySelectorAll('.map-btn').forEach(btn => {
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
      if (montagneMap) updateMontagneReceivers(montagneEntries()[0]);
      syncState({ dataset: 'montagne', m_models: montagneSelected.join(',') });
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

  updateMontagneNote();
  // Le canvas et la carte n'ont une taille que lorsque l'onglet est visible.
  if (panel.classList.contains('active')) {
    renderMontagneHeaderMeta();
    drawMontagneScatter(montagneEntries());
    initMontagneMap().then(refreshMontagneMap);
  }
}

