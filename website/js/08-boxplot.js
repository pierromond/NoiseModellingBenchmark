// ─────────────────────────────────────────────
// BOXPLOT (distribution LAEQ par version)
// ─────────────────────────────────────────────
function quantile(sortedArr, q) {
  const pos = (sortedArr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedArr[base + 1] !== undefined) {
    return sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base]);
  }
  return sortedArr[base];
}

function computeBoxStats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const median = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  const whiskerMin = sorted.find(v => v >= lowerFence) ?? sorted[0];
  const whiskerMax = [...sorted].reverse().find(v => v <= upperFence) ?? sorted[sorted.length - 1];
  const outliers = sorted.filter(v => v < whiskerMin || v > whiskerMax);
  return { min: whiskerMin, q1, median, q3, max: whiskerMax, outliers, n: sorted.length };
}

async function renderBoxplot() {
  const wrapper = document.getElementById('boxplot-chart').parentElement;
  const nodata  = document.getElementById('boxplot-nodata');


  let comparisons = (typeof pairComparisons !== 'undefined' && pairComparisons.length)
    ? pairComparisons : [];
  if (!comparisons.length && pairComparisons.length) {
    comparisons = pairComparisons;
  }

  const valuesByVersion = {};
  comparisons.forEach(c => {
    if (!c.scatter || !c.scatter.length) return;
    if (!valuesByVersion[c.version_a]) valuesByVersion[c.version_a] = c.scatter.map(p => p[0]);
    if (!valuesByVersion[c.version_b]) valuesByVersion[c.version_b] = c.scatter.map(p => p[1]);
  });

  if (!Object.keys(valuesByVersion).length) {
    try {
      const r = await fetch('data/results.json');
      if (r.ok) {
        const results = await r.json();
        const BIN_MIDS = {'<35':32,'35-40':37.5,'40-45':42.5,'45-50':47.5,
                          '50-55':52.5,'55-60':57.5,'60-65':62.5,'65-70':67.5,'70-75':72.5,'75-80':77.5,'>80':82};
        results.forEach(row => {
          if (!row.histogram) return;
          const vals = [];
          Object.entries(row.histogram).forEach(([bin, count]) => {
            const mid = BIN_MIDS[bin];
            if (mid === undefined) return;
            for (let i = 0; i < count; i++) vals.push(mid + (Math.random() - 0.5) * 4);
          });
          if (vals.length) valuesByVersion[row.version] = vals;
        });
      }
    } catch(e) {}
  }

  const versions = Object.keys(valuesByVersion)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (!versions.length) {
    nodata.style.display = 'block';
    return;
  }
  nodata.style.display = 'none';

  const stats = versions.map(v => computeBoxStats(valuesByVersion[v]));

  const oldSvg = wrapper.querySelector('svg.boxplot-svg');
  if (oldSvg) oldSvg.remove();

  const canvas = document.getElementById('boxplot-chart');
  canvas.style.display = 'none';

  const margin = { top: 30, right: 30, bottom: 50, left: 60 };
  const totalW  = wrapper.clientWidth || 900;
  const totalH  = 420;
  const W = totalW - margin.left - margin.right;
  const H = totalH - margin.top  - margin.bottom;

  const svg = d3.select(wrapper)
    .append('svg')
    .attr('class', 'boxplot-svg')
    .attr('width', totalW)
    .attr('height', totalH);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);


  const x = d3.scaleBand()
    .domain(versions)
    .range([0, W])
    .padding(0.4);

  const allVals = stats.flatMap(s => [s.min, s.max, ...s.outliers]);
  const yMin = Math.floor(Math.min(...allVals) / 5) * 5 - 5;
  const yMax = Math.ceil( Math.max(...allVals) / 5) * 5 + 5;

  const y = d3.scaleLinear()
    .domain([-20, yMax+20])
    .range([H, 0]);


  g.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(y).tickSize(-W).tickFormat(''))
    .selectAll('line')
    .attr('stroke', CHART.grid)
    .attr('stroke-width', 0.5);
  g.select('.grid .domain').remove();

  g.append('g')
    .attr('transform', `translate(0,${H})`)
    .call(d3.axisBottom(x))
    .selectAll('text')
    .attr('fill', CHART.text)
    .attr('font-family', 'Space Mono, monospace')
    .attr('font-size', '11px');
  g.select('.domain').attr('stroke', CHART.grid);
  g.selectAll('.tick line').attr('stroke', CHART.grid);

  g.append('g')
    .call(d3.axisLeft(y).ticks(8).tickFormat(d => d + ' dB'))
    .selectAll('text')
    .attr('fill', CHART.accent)
    .attr('font-family', 'Space Mono, monospace')
    .attr('font-size', '11px');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -H / 2)
    .attr('y', -48)
    .attr('text-anchor', 'middle')
    .attr('fill', CHART.accent)
    .attr('font-family', 'Space Mono, monospace')
    .attr('font-size', '11px')
    .text('LAEQ,D (dB)');


  g.append('text')
    .attr('x', W / 2)
    .attr('y', H + 42)
    .attr('text-anchor', 'middle')
    .attr('fill', CHART.text)
    .attr('font-family', 'Space Mono, monospace')
    .attr('font-size', '11px')
    .text('Versions');

  const boxW = x.bandwidth();

  versions.forEach((v, i) => {
    const s = stats[i];
    const cx = x(v) + boxW / 2;
    const capW = boxW * 0.35;

    // (min → Q1)
    g.append('line')
      .attr('x1', cx).attr('x2', cx)
      .attr('y1', y(s.min)).attr('y2', y(s.q1))
      .attr('stroke', CHART.fg).attr('stroke-width', 1.5);

    // (Q3 → max)
    g.append('line')
      .attr('x1', cx).attr('x2', cx)
      .attr('y1', y(s.q3)).attr('y2', y(s.max))
      .attr('stroke', CHART.fg).attr('stroke-width', 1.5);


    g.append('line')
      .attr('x1', cx - capW).attr('x2', cx + capW)
      .attr('y1', y(s.min)).attr('y2', y(s.min))
      .attr('stroke', CHART.fg).attr('stroke-width', 1.5);


    g.append('line')
      .attr('x1', cx - capW).attr('x2', cx + capW)
      .attr('y1', y(s.max)).attr('y2', y(s.max))
      .attr('stroke', CHART.fg).attr('stroke-width', 1.5);

    // B(Q1 → Q3)
    g.append('rect')
      .attr('x', x(v))
      .attr('y', y(s.q3))
      .attr('width', boxW)
      .attr('height', y(s.q1) - y(s.q3))
      .attr('fill', 'rgba(0,229,255,0.15)')
      .attr('stroke', CHART.accent)
      .attr('stroke-width', 2);


    g.append('line')
      .attr('x1', x(v)).attr('x2', x(v) + boxW)
      .attr('y1', y(s.median)).attr('y2', y(s.median))
      .attr('stroke', '#ff6b35')
      .attr('stroke-width', 2.5);


    s.outliers.forEach(val => {
      g.append('circle')
        .attr('cx', cx)
        .attr('cy', y(val))
        .attr('r', 2.5)
        .attr('fill', 'rgba(255,107,53,0.5)')
        .attr('stroke', 'none');
    });
  });


  const legend = svg.append('g')
    .attr('transform', `translate(${margin.left + W / 2 - 120}, 8)`);

  [
    { color: CHART.accent, fill: 'rgba(0,229,255,0.15)', label: 'IQR (Q1–Q3)', rect: true },
    { color: '#ff6b35', label: 'Median', rect: true },
    { color: 'rgba(255,107,53,0.5)', label: 'Outliers', rect: false },
  ].forEach((item, i) => {
    const lx = i * 130;
    if (item.rect) {
      legend.append('rect')
        .attr('x', lx).attr('y', 2)
        .attr('width', 18).attr('height', 10)
        .attr('fill', item.fill || item.color)
        .attr('stroke', item.color).attr('stroke-width', 1.5);
    } else {
      legend.append('circle')
        .attr('cx', lx + 9).attr('cy', 7)
        .attr('r', 4).attr('fill', item.color);
    }
    legend.append('text')
      .attr('x', lx + 24).attr('y', 11)
      .attr('fill', CHART.text)
      .attr('font-family', 'Space Mono, monospace')
      .attr('font-size', '10px')
      .text(item.label);
  });
}

