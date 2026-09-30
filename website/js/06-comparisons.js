// ─────────────────────────────────────────────
// RENDER COMPARISONS
// ─────────────────────────────────────────────
let pairComparisons = [];

function findComparison(vA, vB) {
  return pairComparisons.find(c =>
    (c.version_a === vA && c.version_b === vB) ||
    (c.version_a === vB && c.version_b === vA)
  ) || null;
}

function renderComparisonCard(c, vA, vB) {
  const wrap = document.getElementById('comparisons-wrap');
  if (!c) {
    wrap.innerHTML = '<div class="empty">No comparison data for this pair.</div>';
    return;
  }

  const stable = c.rmse < 0.1;
  const warn   = c.rmse >= 0.1 && c.rmse < 0.5;
  const badgeColor = stable ? 'var(--accent3)' : warn ? 'var(--accent2)' : '#f44336';
  const verdict = stable ? 'Numerically stable' : warn ? 'Minor differences' : 'Significant differences';
  const nCompared = (c.n_valid ?? c.n_common);
  const nCommon   = (c.n_common ?? nCompared);
  const silencedRow = (c.n_nan_a || c.n_nan_b) ? `
        <div class="stat-row">
          <span class="stat-label">Silenced receivers (a / b)</span>
          <span class="stat-value">${(c.n_nan_a ?? 0).toLocaleString()} / ${(c.n_nan_b ?? 0).toLocaleString()}</span>
        </div>` : '';
  wrap.innerHTML = `
    <div class="card" style="--card-accent:${badgeColor}">
      <div class="card-version">
        ${vA} → ${vB}
        <span style="margin-left:.75rem;font-size:.65rem;color:${badgeColor}">${verdict}</span>
      </div>
      <div class="card-stats">
        <div class="stat-row">
          <span class="stat-label">RMSE</span>
          <span class="stat-value accent2">${fmt(c.rmse)} dB</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Standard deviation</span>
          <span class="stat-value accent2">${fmt(c.std_delta)} dB</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Mean |delta|</span>
          <span class="stat-value">${fmt(c.mean_delta)} dB</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Max |delta|</span>
          <span class="stat-value">${fmt(c.max_delta)} dB</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Compared receivers</span>
          <span class="stat-value">${nCompared.toLocaleString()} / ${nCommon.toLocaleString()}</span>
        </div>${silencedRow}
      </div>
    </div>`;
}

async function loadComparisons() {
  try {
    const res = await fetch('data/comparisons.json');
    if (!res.ok) throw new Error();
    pairComparisons = await res.json();
  } catch(e) {
    pairComparisons = [];
  }
  return pairComparisons;
}

function setupPairSelector() {
  const selA = document.getElementById('select-vA');
  const selB = document.getElementById('select-vB');

  const versionSet = new Set();
  pairComparisons.forEach(c => { versionSet.add(c.version_a); versionSet.add(c.version_b); });
  const versions = [...versionSet].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (!versions.length) {
    document.getElementById('comparisons-wrap').innerHTML =
            '<div class="empty">No comparison data yet — run benchmark with at least 2 versions.</div>';
    return;
  }

  function fillSelect(sel, exclude) {
    sel.innerHTML = versions
      .filter(v => v !== exclude)
      .map(v => `<option value="${v}">${v}</option>`)
      .join('');
  }

  fillSelect(selA, null);
  fillSelect(selB, null);


  selA.value = versions[Math.max(0, versions.length - 2)];
  selB.value = versions[versions.length - 1];
  if (selA.value === selB.value && versions.length > 1) {
    selA.value = versions[0];
  }

  function refresh() {
    const vA = selA.value;
    const vB = selB.value;
    const c = findComparison(vA, vB);
    renderComparisonCard(c, vA, vB);
    drawScatterForPair(vA, vB, c);
    drawDensityForPair(vA, vB, c);
    syncState({ a: vA, b: vB });
    const note = document.getElementById('sample-note');
    if (note) {
      note.innerHTML = c
        ? `Distribution, density and diff map are built from a ${(c.max_payload_points || 3000).toLocaleString()}-point sample of the ${c.n_valid.toLocaleString()} compared receivers`
          + (c.n_only_a || c.n_only_b ? ` (${c.n_only_a} only in A, ${c.n_only_b} only in B)` : '')
          + `; mean, standard deviation, RMSE and max use all of them.`
        : '';
    }
  }
  pairRefresh = refresh;

  selA.addEventListener('change', () => {
    if (selA.value === selB.value) {
      const alt = versions.find(v => v !== selA.value);
      if (alt) selB.value = alt;
    }
    refresh();
  });
  selB.addEventListener('change', () => {
    if (selB.value === selA.value) {
      const alt = versions.find(v => v !== selB.value);
      if (alt) selA.value = alt;
    }
    refresh();
  });

  refresh();
}

