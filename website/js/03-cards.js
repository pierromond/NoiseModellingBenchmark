// ─────────────────────────────────────────────
// RENDER CARDS
// ─────────────────────────────────────────────
function renderCards(data) {
  const grid = document.getElementById('cards-grid');
  if (!data.length) { grid.innerHTML = '<div class="empty">No results found.</div>'; return; }

  grid.innerHTML = data.map((row, i) => {
    const color = PALETTE[i % PALETTE.length];
    const hasRays = Number(row.nbRays) > 0;
    const hasProfiles = Number(row.nbProfiles) > 0;
    const raysRows = `
          <div class="stat-row">
            <span class="stat-label">Rays number</span>
            <span class="stat-value accent3">${hasRays ? row.nbRays : 'n/a'}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Profiles number</span>
            <span class="stat-value accent3">${hasProfiles ? row.nbProfiles : 'n/a'}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Compute time Per ${hasRays ? 'Rays' : (hasProfiles ? 'Profiles' : 'Rays')}</span>
            <span class="stat-value accent2">${hasRays ? fmt(row.timePerRays) + ' ms' : (hasProfiles ? fmt(row.timePerProfiles) + ' ms' : 'n/a')}</span>
          </div>`;
    const silencedRow = row.nNan ? `
          <div class="stat-row">
            <span class="stat-label">Silenced receivers (≤ ${row.silenceThreshold ?? SILENCE_THRESHOLD} dB)</span>
            <span class="stat-value">${row.nNan.toLocaleString()}</span>
          </div>` : '';
    return `
      <div class="card" style="--card-accent:${color}">
        <div class="card-version">${row.version}</div>
        <div class="card-stats">
          <div class="stat-row">
            <span class="stat-label">Mean LAEQ</span>
            <span class="stat-value accent">${fmt(row.mean)} dB</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Compute time</span>
            <span class="stat-value accent3">${row.time || '—'}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Compute time Per Receiver</span>
            <span class="stat-value accent2">${row.timePerReceive  || '—'} ms</span>
          </div>${raysRows}${silencedRow}
          <div class="stat-row">
            <span class="stat-label">Java</span>
            <span class="stat-value">${row.java || '—'}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Runner</span>
            <span class="stat-value">${row.runner || '—'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

