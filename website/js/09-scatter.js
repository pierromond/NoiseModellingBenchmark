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
            color: CHART.text,
            font: { family: 'Space Mono', size: 11 },
            filter: item => item.datasetIndex === 0,
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
          ticks: { color: CHART.text, font: { family: 'Space Mono', size: 11 },
            callback: v => v + ' dB' },
          grid: { color: CHART.grid },
          title: { display: true, text: `${vA} LAeq,D (dB)`,
            color: CHART.text, font: { family: 'Space Mono', size: 11 } },
        },
        y: {
          type: 'linear',
          min: minV, max: maxV,
          ticks: { color: CHART.accent, font: { family: 'Space Mono', size: 11 },
            callback: v => v + ' dB' },
          grid: { color: CHART.grid },
          title: { display: true, text: `${vB} LAeq,D (dB)`,
            color: CHART.accent, font: { family: 'Space Mono', size: 11 } },
        }
      }
    }
  });
  boxplotRedraw = renderBoxplot;
}
