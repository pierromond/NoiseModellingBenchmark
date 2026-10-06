// ─────────────────────────────────────────────
// GET STARTED — TUTORIAL FOR NEWCOMERS
// ─────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function startBytes(n) {
  if (!n && n !== 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = n;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  const digits = (i === 0 || v >= 100) ? 0 : 1;
  return `${v.toFixed(digits)} ${units[i]}`;
}

function normNumber(s) {
  let t = String(s).replace(/[\u202f\u00a0\s]/g, '');
  if (t.includes(',') && t.includes('.')) {
    t = t.replace(/,/g, '');       // "4,154.6" -> comma is a thousands separator
  } else {
    t = t.replace(',', '.');       // "4154,6" -> comma is the decimal separator
  }
  return t;
}

function startShowPath(which, scroll) {
  const a = document.getElementById('start-path-a');
  const b = document.getElementById('start-path-b');
  if (!a || !b) return;
  a.style.display = (which === 'b') ? 'none' : '';
  b.style.display = (which === 'a') ? 'none' : '';
  document.querySelectorAll('.start-path-card').forEach(card => {
    card.classList.toggle('active', which !== 'both' && card.dataset.path === which);
  });
  if (scroll !== false) {
    const data = document.getElementById('start-data');
    if (data) data.scrollIntoView({ behavior: 'smooth' });
  }
}

function copyPre(btn) {
  const wrap = btn.closest('.code-block');
  const pre = wrap ? wrap.querySelector('pre') : null;
  if (!pre) return;
  navigator.clipboard.writeText(pre.textContent).then(() => {
    const old = btn.textContent;
    btn.textContent = 'copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = old; btn.classList.remove('copied'); }, 1200);
  });
}

function codeBlock(label, code) {
  return `
    <div class="code-block">
      <div class="code-head">
        <span>${esc(label)}</span>
        <button class="copy-btn" onclick="copyPre(this)">copy</button>
      </div>
      <pre>${esc(code)}</pre>
    </div>`;
}

function startTimeRows(label, rows, releaseVersion) {
  if (!rows || !rows.length) return '';
  // Only the latest release matters for someone comparing their own software.
  const filtered = releaseVersion ? rows.filter(r => r.version === releaseVersion) : rows;
  const list = filtered.length ? filtered : (releaseVersion ? [] : rows);
  return list.map(r => {
    const isRelease = releaseVersion && r.version === releaseVersion;
    const perReceiver = r.timePerReceive ? `${normNumber(r.timePerReceive)} ms` : '—';
    const rays = Number(r.nbRays) > 0 ? Number(r.nbRays).toLocaleString() : 'n/a';
    const profiles = Number(r.nbProfiles) > 0 ? Number(r.nbProfiles).toLocaleString() : 'n/a';
    return `<tr${isRelease ? ' class="start-highlight"' : ''}>
      <td>${esc(label)}</td>
      <td>${esc(r.version)}${isRelease ? ' <span class="start-tag">latest release</span>' : ''}</td>
      <td>${esc(r.time || '—')}</td>
      <td>${esc(perReceiver)}</td>
      <td>${esc(rays)}</td>
      <td>${esc(profiles)}</td>
    </tr>`;
  }).join('');
}

function renderStart(start, clissonResults, montagneResults) {
  const el = document.getElementById('start-body');
  if (!el) return;

  const datasets = (start && start.datasets) || [];
  const release = (start && start.release) || {};
  const relVersion = release.version || 'the latest release';
  const relUrl = release.url || 'https://github.com/Universite-Gustave-Eiffel/NoiseModelling/releases/latest';
  const relZip = (relUrl.split('/').pop()) || 'NoiseModelling.zip';
  const nmDocs = (start && start.nmDocs) || 'https://noise-planet.org/noisemodelling.html';
  const repo = (start && start.repo) || 'Universite-Gustave-Eiffel/NoiseModellingBenchmark';

  const glanceRows = datasets.map(ds => `
    <tr>
      <td><b>${esc(ds.label)}</b></td>
      <td>${esc(ds.kind)}</td>
      <td>${esc(ds.speed)}</td>
      <td><code>${esc(ds.folder)}/</code></td>
    </tr>`).join('');

  const filesHtml = datasets.map(ds => `
    <div class="start-filegroup">
      <div class="start-filegroup-title">
        ${esc(ds.label)} — put these files in a folder named <code>${esc(ds.folder)}/</code>
      </div>
      <div class="table-scroll"><table class="start-table">
        <thead><tr><th align="left">File</th><th align="left">Size</th><th align="left">Link</th></tr></thead>
        <tbody>
          ${ds.files.map(f => `<tr>
            <td><code>${esc(f.name)}</code></td>
            <td>${startBytes(f.size)}${f.size > 100000000 ? ' <span class="start-warn">large file</span>' : ''}</td>
            <td>${f.url ? `<a class="dl-btn" href="${f.url}" download>download</a>` : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>`).join('');

  const scriptsHtml = datasets.map(ds => `
    <div class="start-hint">
      ${esc(ds.label)}:
      ${ds.script && ds.script.url
        ? `<a class="dl-btn" href="${ds.script.url}" download>${esc(ds.script.name)}</a>`
        : `<code>${esc(ds.script ? ds.script.name : '')}</code>`}
    </div>`).join('');

  const dlLinux = `# Linux / macOS
curl -L -o ${relZip} "${relUrl}"
unzip ${relZip} -d NoiseModelling`;
  const dlWindows = `# Windows PowerShell
Invoke-WebRequest -Uri "${relUrl}" -OutFile "${relZip}"
Expand-Archive "${relZip}" -DestinationPath "NoiseModelling"`;

  const runLinux = `# Linux / macOS — run from the folder that contains clisson/ and compare_clisson.groovy
NoiseModelling/bin/ScriptRunner -w workspace -s compare_clisson.groovy`;
  const runWindowsCmd = `REM Windows (cmd) — run from the folder that contains clisson\\ and compare_clisson.groovy
NoiseModelling\\bin\\ScriptRunner.bat -w workspace -s compare_clisson.groovy`;
  const runWindowsPs = `# Windows (PowerShell) — run from the folder that contains clisson\\ and compare_clisson.groovy
.\\NoiseModelling\\bin\\ScriptRunner.bat -w workspace -s compare_clisson.groovy`;

  const exampleOutput = `{
  "type": "Feature",
  "properties": { "IDRECEIVER": 10, "LAEQ": 84.2 },
  "geometry": { "type": "Point", "coordinates": [345560.7, 6687172.6] }
}`;

  const timeRows = startTimeRows('Clisson', clissonResults, relVersion)
                  + startTimeRows('La Montagne', montagneResults, relVersion);

  // Reference run (NoiseModelling) — pre-filled example for the submission table.
  const relClisson = (clissonResults || []).find(r => r.version === relVersion) || {};
  const relMontagne = (montagneResults || []).find(r => r.version === relVersion) || {};
  const refDate = (typeof BUILD !== 'undefined' && BUILD.builtAt) ? BUILD.builtAt : '—';
  const refMachine = 'GitHub Actions ubuntu-latest — 4 vCPU, 16 GB RAM, SSD';
  const refMs = r => r.timePerReceive ? `${normNumber(r.timePerReceive)} ms` : '—';
  const refRays = r => Number(r.nbRays) > 0 ? Number(r.nbRays).toLocaleString() : 'n/a';
  const refProfiles = r => Number(r.nbProfiles) > 0 ? Number(r.nbProfiles).toLocaleString() : 'n/a';
  const refJava = r => r.java ? `Java ${r.java}`
    : (String(r.version || '').startsWith('v6') ? 'Java 25' : (r.version ? 'Java 11' : '—'));
  const referenceTable = `
      <div class="table-scroll"><table class="start-table" style="margin-bottom:1.25rem">
        <thead>
          <tr><th align="left">Field</th><th align="left">Clisson</th><th align="left">La Montagne</th></tr>
        </thead>
        <tbody>
          <tr><td>Software</td><td>NoiseModelling ${esc(relVersion)}</td><td>NoiseModelling ${esc(relVersion)}</td></tr>
          <tr><td>Java</td><td>${esc(refJava(relClisson))}</td><td>${esc(refJava(relMontagne))}</td></tr>
          <tr><td>Date</td><td colspan="2">${esc(refDate)} (last benchmark run)</td></tr>
          <tr><td>Compute time</td><td>${esc(relClisson.time || '—')}</td><td>${esc(relMontagne.time || '—')}</td></tr>
          <tr><td>Time / receiver</td><td>${esc(refMs(relClisson))}</td><td>${esc(refMs(relMontagne))}</td></tr>
          <tr><td>Rays</td><td>${esc(refRays(relClisson))}</td><td>${esc(refRays(relMontagne))}</td></tr>
          <tr><td>Profiles</td><td>${esc(refProfiles(relClisson))}</td><td>${esc(refProfiles(relMontagne))}</td></tr>
          <tr><td>Machine</td><td colspan="2">${esc(refMachine)}</td></tr>
          <tr><td>Threads</td><td colspan="2">all available CPU cores</td></tr>
          <tr><td>GPU</td><td colspan="2">none</td></tr>
          <tr><td>Parameters</td>
              <td>reflection order 1, max source distance 300 m, max error 0.1, 25% favourable occurrences —
                  <a href="#" onclick="document.getElementById('start-params').scrollIntoView({behavior:'smooth'});return false">full list</a></td>
              <td>reflection order 2, max source distance 10 km, max reflection distance 500 m, 24 °C —
                  <a href="#" onclick="document.getElementById('start-params').scrollIntoView({behavior:'smooth'});return false">full list</a></td></tr>
          <tr><td>Output</td>
              <td><a class="dl-btn" href="data/${esc(relVersion)}/RECEIVERS_LEVEL.geojson" download>RECEIVERS_LEVEL.geojson</a></td>
              <td><a class="dl-btn" href="data/montagne/${esc(relVersion)}/RECEIVERS_LEVEL.geojson" download>RECEIVERS_LEVEL.geojson</a></td></tr>
        </tbody>
      </table></div>`;

  const paramTables = datasets.map(ds => `
    <div class="start-filegroup">
      <div class="start-filegroup-title">${esc(ds.label)} — ${(ds.params || []).length} parameters</div>
      <div class="table-scroll">
        <table class="start-table">
          <thead><tr><th align="left">Parameter</th><th align="left">Value</th></tr></thead>
          <tbody>
            ${(ds.params || []).map(row => `<tr><td>${esc(row[0])}</td><td><code>${esc(row[1])}</code></td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`).join('');

  const shareTemplate = [
    'dataset: ""                # Clisson | La Montagne',
    'software:',
    '  name: ""                  # your software',
    '  version: ""',
    '  license: ""               # e.g. MIT, GPL-3.0, proprietary',
    '  url: ""',
    'run:',
    '  date: ""                  # YYYY-MM-DD (date of the computation)',
    '  compute_time: ""          # hh:mm:ss',
    '  time_per_receiver_ms: ""',
    '  machine:',
    '    cpu: ""                 # e.g. AMD Ryzen 9 7950X',
    '    cores: ""               # physical/logical cores',
    '    ram_gb: ""',
    '    os: ""                  # e.g. Ubuntu 24.04, Windows 11',
    '    storage: ""             # SSD | HDD',
    '    environment: ""         # laptop | desktop | server | cloud | cluster',
    '  threads: ""               # number of threads used',
    '  gpu: "none"               # GPU used, if any',
    'parameters: ""              # benchmark defaults, or list your own',
    'experience:',
    '  noise_mapping: ""         # first_time | occasional | regular | expert',
    'output: ""                  # link/attachment of your receivers GeoJSON (IDRECEIVER, LAEQ)',
    'notes: ""                   # anything else relevant (validation, known limits, ...)',
    'contact: ""                 # name / email / GitHub handle',
  ].join('\n');

  const issueTitle = 'Results submission — Clisson / La Montagne';
  const issueBody = '### Results submission\n\nFill in the template below and attach (or link) your receiver output.\n\n```yaml\n'
    + shareTemplate + '\n```\n';
  const issueUrl = `https://github.com/${repo}/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}`;

  el.innerHTML = `
    <section>
      <div class="section-title" role="heading" aria-level="2">Compare your software with NoiseModelling</div>
      <div class="start-intro">
        <p>
          <b>Bring your own noise model.</b> Run it on the same dataset as NoiseModelling, then compare the
          sound levels at the receivers. Two ways to get the NoiseModelling reference — pick the one that
          suits you.
        </p>
      </div>
    </section>

    <section>
      <div class="section-title" role="heading" aria-level="2">Choose your path</div>
      <div class="start-paths">
        <div class="start-path-card" data-path="a">
          <div class="start-path-head">Path A — Compare only <span class="start-tag">recommended</span></div>
          <div class="start-path-sub">No installation needed</div>
          <ol class="start-steps">
            <li>Download the data.</li>
            <li>Run <b>your own software</b> and export the receiver levels.</li>
            <li>Download the published NoiseModelling reference output.</li>
            <li>Compare the two files.</li>
          </ol>
          <button class="start-btn" onclick="startShowPath('a')">Start Path A</button>
        </div>
        <div class="start-path-card" data-path="b">
          <div class="start-path-head">Path B — Compare and run NoiseModelling</div>
          <div class="start-path-sub">Compute the reference yourself</div>
          <ol class="start-steps">
            <li>Download the data.</li>
            <li>Run <b>your own software</b>.</li>
            <li>Install Java, download NoiseModelling and the script.</li>
            <li>Run the NoiseModelling script.</li>
            <li>Compare the two files.</li>
          </ol>
          <button class="start-btn" onclick="startShowPath('b')">Start Path B</button>
        </div>
      </div>
      <div class="start-hint" style="margin-top:.6rem">
        Choosing a path hides the other one below.
        <a href="#" onclick="startShowPath('both');return false">Show both paths</a>.
      </div>
    </section>

    <section id="start-data">
      <div class="section-title" role="heading" aria-level="2">Step 1 — Download the data</div>
      <p class="start-text">
        Download the files of the dataset you want to use and place them in a folder named after the dataset
        (<code>clisson/</code> or <code>montagne/</code>). These files are stored with Git LFS; the links below
        download the real content directly.
      </p>
      <div class="table-scroll"><table class="start-table" style="margin-bottom:1rem">
        <thead>
          <tr><th align="left">Dataset</th><th align="left">Scene</th>
              <th align="left">Typical run time (NoiseModelling)</th><th align="left">Folder</th></tr>
        </thead>
        <tbody>${glanceRows}</tbody>
      </table></div>
      ${filesHtml}
      <div class="start-hint">
        <b>Large files:</b> the DEM files are big (652 MB for Clisson, 219 MB for La Montagne) and can take a
        while to download — the other files are small. Clisson is a realistic road-traffic scene (many line
        sources): a full NoiseModelling run takes several minutes. La Montagne is a single point source (a
        siren on a roof) with only 10 receivers: it runs in under a minute, which makes it ideal for a first
        comparison.
      </div>
    </section>

    <section id="start-you">
      <div class="section-title" role="heading" aria-level="2">Step 2 — Run your own software</div>
      <p class="start-text">
        Run your model on the dataset. The comparison works at the receiver level, so your software must
        produce <b>one sound level per receiver</b>. Export a GeoJSON <code>FeatureCollection</code> with one
        point per receiver, using exactly these two properties:
      </p>
      <ul class="start-list">
        <li><code>IDRECEIVER</code> — the receiver identifier. It is the <code>PK</code> value already present
            in the dataset's <code>RECEIVERS.geojson</code> (Clisson: 0…29410, La Montagne: 1…10).</li>
        <li><code>LAEQ</code> — the computed A-weighted sound level in dB at that receiver.</li>
      </ul>
      ${codeBlock('Expected output format (one feature per receiver)', exampleOutput)}
      <div class="start-hint">
        For Clisson you can optionally add <code>"PERIOD": "D"</code> and the octave-band levels
        (<code>HZ63</code>…<code>HZ8000</code>) like the reference output; only <code>IDRECEIVER</code> and
        <code>LAEQ</code> are required for the comparison.
      </div>
    </section>

    <section id="start-path-a">
      <div class="section-title" role="heading" aria-level="2">Path A — Download the NoiseModelling reference</div>
      <div class="start-pathbar">Following <b>Path A</b>.
        <a href="#" onclick="startShowPath('b');return false">Show Path B instead</a> ·
        <a href="#" onclick="startShowPath('both');return false">Show both</a></div>
      <p class="start-text">
        The benchmark already publishes the NoiseModelling output for each dataset. Download the
        <code>RECEIVERS_LEVEL.geojson</code> of the latest release (${esc(relVersion)}) — no installation, no
        computation needed:
      </p>
      <div class="table-scroll"><table class="start-table">
        <thead><tr><th align="left">Dataset</th><th align="left">Reference output</th></tr></thead>
        <tbody>
          <tr><td>Clisson</td><td><a class="dl-btn" href="data/${esc(relVersion)}/RECEIVERS_LEVEL.geojson" download>RECEIVERS_LEVEL.geojson</a></td></tr>
          <tr><td>La Montagne</td><td><a class="dl-btn" href="data/montagne/${esc(relVersion)}/RECEIVERS_LEVEL.geojson" download>RECEIVERS_LEVEL.geojson</a></td></tr>
        </tbody>
      </table></div>
      <div class="start-hint">
        You can also
        <a href="#" onclick="document.getElementById('start-share').scrollIntoView({behavior:'smooth'});return false">share your results</a>
        with the community, or download the reference above to compare it yourself with your own software.
        Then go to
        <a href="#" onclick="document.getElementById('start-compare').scrollIntoView({behavior:'smooth'});return false">Step 4 — Compare the two files</a>.
      </div>
    </section>

    <section id="start-path-b">
      <div class="section-title" role="heading" aria-level="2">Path B — Run NoiseModelling yourself</div>
      <div class="start-pathbar">Following <b>Path B</b>.
        <a href="#" onclick="startShowPath('a');return false">Show Path A instead</a> ·
        <a href="#" onclick="startShowPath('both');return false">Show both</a></div>

      <p class="start-text">
        <b>B.1 — Install Java.</b> The portable <code>NoiseModelling_*.zip</code> does <b>not</b> include Java.
        Install <b>Java 25 or later</b> (the version required by ${esc(relVersion)}) from
        <a href="https://adoptium.net/temurin/releases/" target="_blank" rel="noopener">Eclipse Temurin</a>,
        then check the installation:
      </p>
      ${codeBlock('Check Java', 'java -version')}
      <div class="start-hint">
        On Windows and macOS, NoiseModelling also provides installers
        (<code>NoiseModelling-*.exe</code> / <code>NoiseModelling-*.dmg</code>) that include Java, but they
        install the graphical application. This path uses the command line, delivered as the portable zip.
      </div>

      <p class="start-text" style="margin-top:1.25rem">
        <b>B.2 — Download NoiseModelling ${esc(relVersion)}</b> and unzip it next to your dataset folder:
      </p>
      ${codeBlock('Linux / macOS', dlLinux)}
      ${codeBlock('Windows PowerShell', dlWindows)}

      <p class="start-text" style="margin-top:1.25rem">
        <b>B.3 — Download the script,</b> put it next to the dataset folder, then run it:
      </p>
      <div class="start-hints">${scriptsHtml}</div>
      ${codeBlock('Linux / macOS', runLinux)}
      ${codeBlock('Windows (cmd)', runWindowsCmd)}
      ${codeBlock('Windows (PowerShell)', runWindowsPs)}
      <div class="start-hint">
        For La Montagne, use <code>compare_montagne.groovy</code> instead of <code>compare_clisson.groovy</code>
        (and the <code>montagne/</code> folder). The script writes <code>output/RECEIVERS_LEVEL.geojson</code>.
      </div>
    </section>

    <section id="start-compare">
      <div class="section-title" role="heading" aria-level="2">Step 4 — Compare the two files</div>
      <p class="start-text">
        Join your output with the NoiseModelling reference on <code>IDRECEIVER</code> and compare the
        <code>LAEQ</code> values. Two rules matter for a fair comparison:
      </p>
      <ul class="start-list">
        <li><b>Silence threshold.</b> In the benchmark, levels at or below −89 dB are treated as silence and
            excluded from the statistics. Apply the same rule.</li>
        <li><b>La Montagne calibration.</b> The published La Montagne comparison is calibrated per version: an
            offset is applied so that the computed level equals the measured level at the receiver closest to
            the source. The raw output is <i>not</i> calibrated — calibration is only used on the results page.</li>
      </ul>
    </section>

    <section id="start-share">
      <div class="section-title" role="heading" aria-level="2">Share your results with the community</div>
      <p class="start-text">
        Comparing independent implementations is how the community finds bugs and improves the models.
        If you would like to share your run, copy the template below into an
        <a href="${issueUrl}" target="_blank" rel="noopener">issue on this repository</a> (or a pull request).
        <b>We would be delighted!</b>
      </p>
      <p class="start-text" style="margin-top:1rem">
        Here is the <b>reference run</b> produced by NoiseModelling in this benchmark. Use it as the baseline
        for your comparison, and as an example of what a submission looks like:
      </p>
      ${referenceTable}
      ${codeBlock('Results submission template (copy and fill in)', shareTemplate)}
      <p class="start-text">
        <a class="dl-btn" href="${issueUrl}" target="_blank" rel="noopener">Open a results issue (template pre-filled)</a>
      </p>
    </section>

    <section>
      <div class="section-title" role="heading" aria-level="2">How long does NoiseModelling take?</div>
      <p class="start-text">
        Compute time of the latest release (${esc(relVersion)}), measured on a GitHub Actions runner
        (4 CPUs). Times depend on your machine and on the parameters, so use them as an order of magnitude.
      </p>
      <div class="table-scroll"><table class="start-table">
        <thead>
          <tr><th align="left">Dataset</th><th align="left">Version</th><th align="left">Compute time</th>
              <th align="left">Time per receiver</th><th align="left">Rays</th><th align="left">Profiles</th></tr>
        </thead>
        <tbody>${timeRows || '<tr><td colspan="6">No data yet.</td></tr>'}</tbody>
      </table></div>
    </section>

    <section id="start-params">
      <div class="section-title" role="heading" aria-level="2">NoiseModelling parameters — full list (for replication)</div>
      <p class="start-text">
        These are the exact parameters used to produce the reference output. They are read directly from the
        simulation scripts, so this list always matches what was actually run. The source emission levels and
        the receiver positions come from the dataset files.
      </p>
      ${paramTables}
      <div class="start-hint">
        <b>La Montagne source:</b> a siren with an emission level of 124.5 dB at 500 Hz, placed 12.4 m above
        ground (1 m above the building roof); receivers at 1.5 m.
      </div>
    </section>

    <section>
      <div class="section-title" role="heading" aria-level="2">Troubleshooting</div>
      <ul class="start-list">
        <li><b>“java: command not found”</b> — Java is not installed or not on your PATH (Path B only).
            Reopen your terminal after installing it.</li>
        <li><b>“Unsupported class file major version”</b> — you are using an older Java. Install Java 25 or later.</li>
        <li><b>Out of memory</b> — give the JVM more memory, e.g. <code>JAVA_OPTS="-Xmx8g"</code> (8 GB) before
            running ScriptRunner.</li>
        <li><b>Where are the results?</b> — in <code>output/RECEIVERS_LEVEL.geojson</code> (and
            <code>workspace/</code> for the database and logs).</li>
        <li><b>Need more help?</b> — see the
            <a href="${nmDocs}" target="_blank" rel="noopener">NoiseModelling documentation</a>.</li>
      </ul>
    </section>
  `;
  startShowPath('a', false);
}

async function initStart() {
  const section = document.getElementById('panel-start');
  if (!section) return;
  const start = await loadJson('data/start.json', null);
  if (!start) { section.style.display = 'none'; return; }
  const clissonResults = await loadJson('data/results.json', []);
  const montagneResults = await loadJson('data/montagne/results.json', []);
  renderStart(start, clissonResults, montagneResults);
}

