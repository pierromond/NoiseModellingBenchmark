// ─────────────────────────────────────────────
// RENDER HEADER META
// ─────────────────────────────────────────────
function renderHeaderMeta(data) {
  const el = document.getElementById('header-meta');
  const demUrl = (document.querySelector('meta[name="dem-url"]') || {}).content || '';
  const demRow = demUrl
    ? `DEM (652 MB, open data): <a href="${demUrl}" style="color:var(--accent)">download</a><br>`
    : '';

  const st = receiverStats(data);
  const threshold = fmt(data.length ? (data[0].silenceThreshold ?? SILENCE_THRESHOLD) : SILENCE_THRESHOLD, 0);
  const receivers = st
    ? `Receivers: <b>${st.total.toLocaleString()}</b>` +
      (st.maxCompared !== st.minCompared
        ? ` (<b>${st.minCompared.toLocaleString()}</b>–<b>${st.maxCompared.toLocaleString()}</b> compared per pair)`
        : '') +
      `<br>Levels ≤ <b>${threshold}</b> dB are NaN: excluded from means and comparisons<br>`
    : '';
  const occurrences = (typeof SETTINGS.favorableOccurrence === 'number' && SETTINGS.occurrencesPerDay)
    ? `${Math.round(SETTINGS.favorableOccurrence * 100)}% (${SETTINGS.occurrencesPerDay}/day)`
    : '—';

  el.innerHTML = `
    <b>${data.length}</b> version${data.length > 1 ? 's' : ''} compared<br>
    Input: <b>${SETTINGS.dataset || 'Clisson, France'}</b> (EPSG:2154)<br>
    ${receivers}
    ${demRow}
    *Max Error: <b>${SETTINGS.maxError ?? '—'}</b><br>
    Reflexion Order: <b>${SETTINGS.reflOrder ?? '—'}</b><br>
    Propagation Distance: <b>${SETTINGS.maxSrcDist ?? '—'}</b><br>
    Horizontal Diffraction: <b>${SETTINGS.diffHorizontal === undefined ? '—' : String(SETTINGS.diffHorizontal)}</b><br>
    Occurrences of favourable conditions: <b>${occurrences}</b><br>
    <br>
    *: <b>Please note that the definition of this setting has changed over the course of different versions.</b><br>
    <span style="font-size:.62rem;opacity:.8">Settings published from <code>${SETTINGS.source || 'the simulation script'}</code></span>
  `;
  clissonHeaderHtml = el.innerHTML;
}

let clissonHeaderHtml = '';

function renderMontagneHeaderMeta() {
  const el = document.getElementById('header-meta');
  if (!el) return;
  const n = montagneData.length;
  const ref = montagneEntries()[0] || {};
  el.innerHTML = `
    La Montagne — comparison to measurements.<br>
    Input: <b>La Montagne, France</b> (EPSG:2154).<br>
    <b>${n}</b> version${n > 1 ? 's' : ''} calibrated per version; reference receiver
    <b>#${ref.reference_receiver ?? '—'}</b> (${fmt(ref.reference_distance, 1)} m from the source).<br>
    Measured reference: <code>benchmark/input/montagne/measure/RECEIVERS_LEVEL.geojson</code>.
  `;
}

function renderFooter() {
  const el = document.getElementById('footer-date');
  if (!el) return;
  const parts = [];
  if (BUILD.builtAt) parts.push(`Built ${BUILD.builtAt}`);
  if (BUILD.repo && BUILD.sha) {
    parts.push(`<a href="https://github.com/${BUILD.repo}/commit/${BUILD.sha}" target="_blank" rel="noopener">${BUILD.sha.slice(0, 8)}</a>`);
  }
  if (BUILD.repo && BUILD.runId) {
    parts.push(`<a href="https://github.com/${BUILD.repo}/actions/runs/${BUILD.runId}" target="_blank" rel="noopener">run ${BUILD.runId}</a>`);
  }
  el.innerHTML = parts.join(' · ');
}

function sourceLabel(version) {
  const url = (BUILD.versionSources || {})[version];
  return url
    ? `<a href="${url}" target="_blank" rel="noopener">release zip</a>`
    : 'CI artifact (head)';
}

function downloadCsv() {
  const cols = ['version', 'mean', 'time', 'timePerReceive', 'java', 'runner', 'nNan', ...HISTO_BINS];
  const lines = [cols.join(',')];
  ALL_RESULTS.forEach(row => {
    lines.push(cols.map(col => {
      if (col === 'version') return row.version;
      if (HISTO_BINS.includes(col)) return (row.histogram || {})[col] ?? '';
      return row[col] ?? '';
    }).join(','));
  });
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'noisemodelling-benchmark.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

function renderMethod(data) {
  const el = document.getElementById('method-body');
  if (!el) return;
  const st = receiverStats(data);
  const threshold = fmt(data.length ? (data[0].silenceThreshold ?? SILENCE_THRESHOLD) : SILENCE_THRESHOLD, 0);
  const samplePoints = (pairComparisons[0] || {}).max_payload_points || 3000;
  const demUrl = (document.querySelector('meta[name="dem-url"]') || {}).content || '';
  const repo = BUILD.repo || 'Universite-Gustave-Eiffel/NoiseModellingBenchmark';

  const rows = data.map(row => `
    <tr>
      <td style="padding:.15rem .8rem .15rem 0">${row.version}</td>
      <td style="padding:.15rem .8rem">${row.java || '—'}</td>
      <td style="padding:.15rem .8rem">${row.runner || '—'}</td>
      <td style="padding:.15rem .8rem">${row.time || '—'}</td>
      <td style="padding:.15rem .8rem">${row.timePerReceive || '—'} ms</td>
      <td style="padding:.15rem .8rem">${(row.nNan ?? 0).toLocaleString()}</td>
      <td style="padding:.15rem 0">${sourceLabel(row.version)}</td>
    </tr>`).join('');

  el.innerHTML = `
    <p style="margin:.5rem 0">
      <b>Dataset</b> — ${SETTINGS.dataset || 'Clisson, France'}, EPSG:2154, versioned with Git LFS
      ${demUrl ? `(<a href="${demUrl}" target="_blank" rel="noopener">DEM</a>, 652 MB)` : ''}.<br>
      <b>Simulation</b> — source <code>${SETTINGS.source || 'n/a'}</code>: max error ${SETTINGS.maxError ?? '—'},
      reflexion order ${SETTINGS.reflOrder ?? '—'}, propagation distance ${SETTINGS.maxSrcDist ?? '—'} m,
      horizontal diffraction ${SETTINGS.diffHorizontal === undefined ? '—' : String(SETTINGS.diffHorizontal)},
      favourable occurrences ${typeof SETTINGS.favorableOccurrence === 'number'
        ? `${Math.round(SETTINGS.favorableOccurrence * 100)}% (${SETTINGS.occurrencesPerDay}/day)`
        : '—'}.<br>
      <b>Statistics</b> — levels ≤ ${threshold} dB are treated as NaN and excluded from means, histograms and
      pairwise comparisons. Mean, standard deviation, RMSE and max are exact over all compared receivers
      ${st ? `(${st.minCompared.toLocaleString()} to ${st.maxCompared.toLocaleString()} per pair)` : ''};
      distributions and the diff map use a ${samplePoints.toLocaleString()}-point sample per pair.<br>
      <b>JVM</b> — Java 11 for v4.x/v5.x, Java 25 for v6.x.<br>
      <b>Reproduce</b> — <a href="https://github.com/${repo}#readme" target="_blank" rel="noopener">benchmark/drivers/benchmark_run_clisson.sh + benchmark/versions.json</a>
      · <a href="data/results.json" download>results.json</a>
      · <a href="data/comparisons.json" download>comparisons.json</a>
      · <a href="#" onclick="downloadCsv();return false">results.csv</a><br>
      <b>License</b> — GPL-3.0; simulation scripts are vendored from NoiseModelling.
      Please cite the <a href="https://noise-planet.org/noisemodelling.html" target="_blank" rel="noopener">NoiseModelling</a>
      project when reusing these results.
    </p>
    <table style="border-collapse:collapse;margin-top:.5rem">
      <thead>
        <tr style="color:var(--accent)">
          <th align="left">Version</th><th align="left">Java</th><th align="left">Runner</th>
          <th align="left">Compute</th><th align="left">ms/receiver</th><th align="left">Silenced</th><th align="left">Binary</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

