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
          borderColor: CHART.accent,
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
            color: CHART.text,
            font: { family: 'Space Mono', size: 11 },
            filter: item => item.datasetIndex !== 2,
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
                color: CHART.text,
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
            color: CHART.text,
            font: { family: 'Space Mono', size: 11 },
            callback: v => (v >= 0 ? '+' : '') + fmt(v) + ' dB'
          },
          grid: { color: CHART.grid },
          title: {
            display: true,
            text: `Δ LAEQ (dB)  =  ${vB} − ${vA}`,
            color: '#ffeb3b',
            font: { family: 'Space Mono', size: 11 }
          },
        },
        y: {
          ticks: { color: CHART.accent, font: { family: 'Space Mono', size: 11 },
                   callback: v => v  },
          grid: { color: CHART.grid },
          title: {
            display: true,
            text: 'Relative density',
            color: CHART.accent,
            font: { family: 'Space Mono', size: 11 }
          },
        }
      }
    }
  });
}

