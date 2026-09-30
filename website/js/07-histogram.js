// ─────────────────────────────────────────────
// HISTOGRAM
// ─────────────────────────────────────────────
// HISTO_BINS now comes from config/benchmark.json via js/00-constants.js.
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
              color: CHART.text,
              font: { family: 'Space Mono', size: 11 },
              boxWidth: 14,
            }
          },
          tooltip: {
            backgroundColor: CHART.tooltipBg,
            borderColor: CHART.grid,
            borderWidth: 1,
            titleColor: CHART.accent,
            bodyColor: CHART.fg,
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
            ticks: { color: CHART.accent, font: { family: 'Space Mono', size: 11 } },
            grid:  { color: CHART.grid },
            title: { display: true, text: 'LAEQ band (dB)', color: CHART.accent,
                     font: { family: 'Space Mono', size: 11 } },
          },
          y: {
            ticks: { color: CHART.accent, font: { family: 'Space Mono', size: 11 },
                     callback: v => v  },
            grid:  { color: CHART.grid },
            title: { display: true, text: 'Receivers', color: CHART.accent,
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

