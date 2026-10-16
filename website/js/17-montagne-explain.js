// ─────────────────────────────────────────────
// LA MONTAGNE — EXPLAINABILITY OF MEASUREMENT / SIMULATION GAPS
// Uses the exported propagation rays (full profile geometry) of the models
// that support them (v6-based pipeline). Data-driven: shown only if rays exist.
// ─────────────────────────────────────────────

const EXPLAIN_TYPE_COLOR = {
  direct: '#1f77b4',
  reflected: '#d62728',
  diffracted: '#2ca02c',
  mixed: '#9467bd',
};

const EXPLAIN_VEX = 1.5; // vertical exaggeration for the 3D view

const explainState = {
  version: null,
  receiver: null,
  campagne: null,
  mode: 'interaction',
  view: '2d',
  rays: null,          // full FeatureCollection for the current version/campagne
  receivers: [],       // [{id, x, y, measured, corrected, error, campagne}]
  cache: {},           // version|campagne -> FeatureCollection|null
  layers: null,        // {buildings:[], sources:[]}
  dem: null,           // {cell, xmin, ymin, nx, ny, z}
  receiverRays: [],    // rays of the selected receiver (map both views)
  selectedRay: null,   // index in receiverRays highlighted
  rayLines2D: [],      // [{line, color}]
  rayLines3D: [],      // [{line, color}]
  sortKey: 'loss',     // table sort column
  sortDir: 'asc',
  highlightRibbon: null, // yellow camera-facing ribbon highlighting the selected ray in 3D
  map: null,
  mapGroup: null,
  three: null,
};

function explainEnergy(leq) {
  return (leq === null || leq === undefined) ? 0 : Math.pow(10, leq / 10);
}

function explainSumLeq(values) {
  const s = values.reduce((a, v) => a + explainEnergy(v), 0);
  return s > 0 ? 10 * Math.log10(s) : null;
}

function explainRayType(p) {
  const r = p.nReflections || 0;
  const d = p.nDiffractions || 0;
  if (r > 0 && d > 0) return 'mixed';
  if (r > 0) return 'reflected';
  if (d > 0) return 'diffracted';
  return 'direct';
}

async function explainLoadRays(version, campagne) {
  const key = `${version}|${campagne}`;
  if (key in explainState.cache) return explainState.cache[key];
  const data = await loadJson(`data/montagne/${version}/rays_${campagne}.geojson`, null);
  explainState.cache[key] = data;
  return data;
}

async function explainLoadLayers() {
  if (explainState.layers) return explainState.layers;
  const buildings = await loadJson('data/montagne/layers/BUILDINGS.geojson', null);
  const roads = await loadJson('data/montagne/layers/LW_ROADS.geojson', null);
  const sources = [];
  if (roads && roads.features) {
    roads.features.forEach(f => {
      const g = f.geometry || {};
      const c = g.coordinates;
      if (!c) return;
      if (g.type === 'Point') sources.push([c[0], c[1], c[2] || 0]);
      else if (g.type === 'LineString') sources.push([c[0][0], c[0][1], c[0][2] || 0]);
    });
  }
  explainState.layers = { buildings: (buildings && buildings.features) || [], sources };
  return explainState.layers;
}

async function explainLoadDem() {
  if (explainState.dem) return explainState.dem;
  const dem = await loadJson('data/montagne/dem_grid.json', null);
  explainState.dem = dem;
  return dem;
}

function explainMercator(lon, lat) {
  const x = (lon + 180) / 360;
  const s = Math.sin(lat * Math.PI / 180);
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  return [x, y];
}

// Stitch the same ArcGIS Light Gray basemap used by the Leaflet map and return
// a texture + a function mapping Lambert-93 coordinates to UVs.
async function explainLoadBasemap(bbox) {
  if (!bbox || typeof THREE === 'undefined') return null;
  const c0 = proj4(LAMBERT93, 'WGS84', [bbox[0], bbox[3]]);
  const c1 = proj4(LAMBERT93, 'WGS84', [bbox[2], bbox[1]]);
  const lon0 = Math.min(c0[0], c1[0]), lon1 = Math.max(c0[0], c1[0]);
  const lat0 = Math.min(c0[1], c1[1]), lat1 = Math.max(c0[1], c1[1]);
  const [mx0, my0] = explainMercator(lon0, lat1);
  const [mx1, my1] = explainMercator(lon1, lat0);
  let z = 16; // same max zoom as the Leaflet map (ArcGIS Light Gray max)
  while (z > 10) {
    const w = Math.pow(2, z);
    if ((mx1 - mx0) * w * 256 <= 2048 && (my1 - my0) * w * 256 <= 2048) break;
    z--;
  }
  const w = Math.pow(2, z);
  const tx0 = Math.floor(mx0 * w), tx1 = Math.floor(mx1 * w);
  const ty0 = Math.floor(my0 * w), ty1 = Math.floor(my1 * w);
  const cols = tx1 - tx0 + 1, rows = ty1 - ty0 + 1;
  const canvas = document.createElement('canvas');
  canvas.width = cols * 256; canvas.height = rows * 256;
  const ctx = canvas.getContext('2d');
  const loadTile = (tx, ty) => new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res({ img, tx, ty });
    img.onerror = rej;
    img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/${z}/${ty}/${tx}`;
  });
  const jobs = [];
  for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) jobs.push(loadTile(tx, ty));
  try {
    const loaded = await Promise.all(jobs);
    loaded.forEach(({ img, tx, ty }) => ctx.drawImage(img, (tx - tx0) * 256, (ty - ty0) * 256));
  } catch (e) {
    return null;
  }
  const texture = new THREE.CanvasTexture(canvas);
  const uvFor = (x, y) => {
    const [lon, lat] = proj4(LAMBERT93, 'WGS84', [x, y]);
    const [mx, my] = explainMercator(lon, lat);
    return [(mx * w * 256 - tx0 * 256) / canvas.width, 1 - (my * w * 256 - ty0 * 256) / canvas.height];
  };
  return { texture, uvFor };
}

// Build a terrain mesh (BufferGeometry) from the DEM grid, restricted to a bbox.
function explainTerrainGeometry(bbox, toScene, uvFor) {
  const dem = explainState.dem;
  if (!dem || !bbox) return null;
  const { cell, xmin, ymin, nx, ny, z } = dem;
  const ix0 = Math.max(0, Math.floor((bbox[0] - xmin) / cell));
  const ix1 = Math.min(nx - 1, Math.ceil((bbox[2] - xmin) / cell));
  const iy0 = Math.max(0, Math.floor((bbox[1] - ymin) / cell));
  const iy1 = Math.min(ny - 1, Math.ceil((bbox[3] - ymin) / cell));
  if (ix1 <= ix0 || iy1 <= iy0) return null;

  const idx = new Map();
  const positions = [];
  const colors = [];
  const uvs = [];
  const zmin = 0, zmax = 55;
  const colorOf = zz => {
    const t = Math.max(0, Math.min(1, (zz - zmin) / (zmax - zmin)));
    return [0.30 + 0.55 * t, 0.55 - 0.15 * t, 0.75 - 0.55 * t];
  };
  const vert = (ix, iy) => {
    const k = ix + '_' + iy;
    if (idx.has(k)) return idx.get(k);
    const zz = z[iy] ? z[iy][ix] : null;
    const wx = xmin + (ix + 0.5) * cell;
    const wy = ymin + (iy + 0.5) * cell;
    const p = toScene(wx, wy, zz == null ? 0 : zz);
    positions.push(p.x, p.y, p.z);
    const c = colorOf(zz == null ? zmin : zz);
    colors.push(c[0], c[1], c[2]);
    const uv = uvFor ? uvFor(wx, wy)
      : [(wx - bbox[0]) / (bbox[2] - bbox[0]), (wy - bbox[1]) / (bbox[3] - bbox[1])];
    uvs.push(uv[0], uv[1]);
    const i = positions.length / 3 - 1;
    idx.set(k, i);
    return i;
  };
  const indices = [];
  for (let iy = iy0; iy < iy1; iy++) {
    for (let ix = ix0; ix < ix1; ix++) {
      const has = c => c != null;
      const z00 = z[iy] ? z[iy][ix] : null;
      const z10 = z[iy] ? z[iy][ix + 1] : null;
      const z01 = z[iy + 1] ? z[iy + 1][ix] : null;
      const z11 = z[iy + 1] ? z[iy + 1][ix + 1] : null;
      if (!has(z00) || !has(z10) || !has(z01) || !has(z11)) continue;
      const a = vert(ix, iy), b = vert(ix + 1, iy), c = vert(ix, iy + 1), dd = vert(ix + 1, iy + 1);
      indices.push(a, b, c, b, dd, c);
    }
  }
  if (!indices.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function explainBbox(rays) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  rays.forEach(f => f.geometry.coordinates.forEach(([x, y]) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }));
  if (!isFinite(minX)) return null;
  const m = 250;
  return [minX - m, minY - m, maxX + m, maxY + m];
}

function explainBuildingsInBbox(bbox) {
  if (!explainState.layers || !bbox) return [];
  return explainState.layers.buildings.filter(f => {
    const g = f.geometry; if (!g) return false;
    const rings = g.type === 'MultiPolygon' ? g.coordinates.flat() : g.coordinates;
    return rings.some(r => r.some(([x, y]) => x >= bbox[0] && x <= bbox[2] && y >= bbox[1] && y <= bbox[3]));
  });
}

// ── 2D map ──
function explainInitMap() {
  if (explainState.map) return explainState.map;
  const el = document.getElementById('montagne-explain-map');
  if (!el) return null;
  explainState.map = L.map(el, { zoomControl: true, attributionControl: false });
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Esri', maxNativeZoom: 16, maxZoom: 19,
  }).addTo(explainState.map);
  explainState.mapGroup = L.layerGroup().addTo(explainState.map);
  return explainState.map;
}

function explainColorPath(p, mode) {
  if (mode === 'attenuation') {
    const a = (p.aGlobal != null) ? p.aGlobal : null;
    if (a === null) return '#888';
    const lo = 40, hi = 110;
    const t = Math.max(0, Math.min(1, (a - lo) / (hi - lo)));
    return `rgb(${Math.round(30 + 210 * t)},${Math.round(120 - 60 * t)},${Math.round(230 - 200 * t)})`;
  }
  return EXPLAIN_TYPE_COLOR[explainRayType(p)];
}

function explainDraw2D(rays, buildings, mode) {
  const map = explainInitMap();
  if (!map) return;
  explainState.mapGroup.clearLayers();
  const bounds = [];
  buildings.forEach(f => {
    const g = f.geometry; if (!g) return;
    const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
    polys.forEach(poly => {
      const latlngs = poly.map(ring => ring.map(([x, y]) => proj4(LAMBERT93, 'WGS84', [x, y]).reverse()));
      L.polygon(latlngs, { color: '#8a9bb0', weight: 0.6, fillColor: '#cfd8e3', fillOpacity: 0.5 })
        .addTo(explainState.mapGroup);
    });
  });
  explainState.rayLines2D = [];
  rays.forEach((f, i) => {
    const p = f.properties;
    const latlngs = f.geometry.coordinates.map(([x, y]) => proj4(LAMBERT93, 'WGS84', [x, y]).reverse());
    const color = explainColorPath(p, mode);
    const selected = explainState.selectedRay === i;
    const line = L.polyline(latlngs, {
      color: selected ? '#ccff00' : color,
      weight: selected ? 8 : 2,
      opacity: selected ? 1 : 0.85,
    });
    line.bindTooltip(`LEQ ${p.leq?.toFixed?.(1) ?? p.leq} dB · ${explainRayType(p)} · aDiv ${fmt(p.aDiv)} aDif ${fmt(p.aDif)} aRef ${fmt(p.aRef)}`, { sticky: true });
    line.addTo(explainState.mapGroup);
    if (selected) line.bringToFront();
    explainState.rayLines2D[i] = { line, color };
    bounds.push(...latlngs);
    (p.nodes || []).forEach(([type, x, y]) => {
      L.circleMarker(proj4(LAMBERT93, 'WGS84', [x, y]).reverse(), {
        radius: 3, color: '#fff', weight: 1, fillColor: '#111', fillOpacity: 1,
      }).bindTooltip(type).addTo(explainState.mapGroup);
    });
  });
  (explainState.layers?.sources || []).forEach(([x, y]) => {
    const ll = proj4(LAMBERT93, 'WGS84', [x, y]).reverse();
    L.circleMarker(ll, { radius: 6, color: '#000', weight: 2, fillColor: '#ffd400', fillOpacity: 1 })
      .bindTooltip('Source').addTo(explainState.mapGroup);
    bounds.push(ll);
  });
  if (bounds.length) map.fitBounds(L.latLngBounds(bounds), { padding: [20, 20] });
  setTimeout(() => map.invalidateSize(), 0);
}

function explainLegend(mode) {
  const el = document.getElementById('montagne-explain-legend');
  if (!el) return;
  if (mode === 'attenuation') {
    el.innerHTML = `<span class="legend-label">Ray color = attenuation (aGlobal dB) :</span>` +
      `<div class="legend-item"><div class="legend-swatch" style="background:rgb(30,120,230)"></div>≤ 40</div>` +
      `<div class="legend-item"><div class="legend-swatch" style="background:rgb(120,90,130)"></div>≈ 75</div>` +
      `<div class="legend-item"><div class="legend-swatch" style="background:rgb(240,60,30)"></div>≥ 110</div>`;
  } else {
    el.innerHTML = `<span class="legend-label">Ray color = path type :</span>` +
      Object.entries(EXPLAIN_TYPE_COLOR).map(([k, c]) =>
        `<div class="legend-item"><div class="legend-swatch" style="background:${c}"></div>${k}</div>`).join('');
  }
}

// ── 3D (Three.js) ──
function explainDispose3D() {
  const el = document.getElementById('montagne-explain-3d');
  if (el) el.innerHTML = '';
  explainState.three = null;
}

function explainBuildPrism(ring, roofZ, height, toScene, positions) {
  // ring: [[x,y],...] (Lambert93); build roof + walls as triangles in scene coords
  const n = ring.length - 1 >= 3 ? ring.length - 1 : ring.length;
  const roofY = roofZ * EXPLAIN_VEX;
  const baseY = (roofZ - height) * EXPLAIN_VEX;
  const roofPts = [];
  const basePts = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = ring[i];
    roofPts.push(toScene(x, y, roofZ));
    basePts.push(new THREE.Vector3().copy(roofPts[i]));
    basePts[i].y = baseY;
  }
  // roof triangulation (fan) in local XZ
  const contour = roofPts.map(p => new THREE.Vector2(p.x, p.z));
  let tris = [];
  try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { tris = []; }
  if (!tris.length) {
    for (let i = 1; i < n - 1; i++) tris.push([0, i, i + 1]);
  }
  tris.forEach(([a, b, c]) => {
    positions.push(roofPts[a].x, roofPts[a].y, roofPts[a].z);
    positions.push(roofPts[b].x, roofPts[b].y, roofPts[b].z);
    positions.push(roofPts[c].x, roofPts[c].y, roofPts[c].z);
  });
  // walls
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const r0 = roofPts[i], r1 = roofPts[j], b0 = basePts[i], b1 = basePts[j];
    positions.push(r0.x, r0.y, r0.z, r1.x, r1.y, r1.z, b1.x, b1.y, b1.z);
    positions.push(r0.x, r0.y, r0.z, b1.x, b1.y, b1.z, b0.x, b0.y, b0.z);
  }
}

function explainDraw3D(rays, buildings, bbox, basemap) {
  const el = document.getElementById('montagne-explain-3d');
  if (!el || typeof THREE === 'undefined') return;
  explainDispose3D();
  const w = el.clientWidth || 800, h = el.clientHeight || 480;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1220);
  const camera = new THREE.PerspectiveCamera(50, w / h, 1, 100000);

  // horizontal centroid
  const pts = [];
  rays.forEach(f => f.geometry.coordinates.forEach(([x, y]) => pts.push([x, y])));
  const cx = pts.reduce((a, p) => a + p[0], 0) / (pts.length || 1);
  const cy = pts.reduce((a, p) => a + p[1], 0) / (pts.length || 1);

  // vertical centroid from ray altitudes
  let zSum = 0, zN = 0;
  rays.forEach(f => f.geometry.coordinates.forEach(c => { if (typeof c[2] === 'number') { zSum += c[2]; zN++; } }));
  const cz = zN ? zSum / zN : 0;

  const toScene = (x, y, z) => new THREE.Vector3(x - cx, (z || 0) * EXPLAIN_VEX, -(y - cy));

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  el.appendChild(renderer.domElement);

  // buildings
  const positions = [];
  buildings.forEach(f => {
    const g = f.geometry; if (!g) return;
    const height = Number(f.properties?.height) || 4;
    const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
    polys.forEach(poly => {
      const ring = poly[0];
      const zs = ring.map(c => c[2]).filter(v => typeof v === 'number');
      const roofZ = zs.length ? zs.reduce((a, b) => a + b, 0) / zs.length : 0;
      explainBuildPrism(ring, roofZ, height, toScene, positions);
    });
  });
  if (positions.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x9fb2c9, side: THREE.DoubleSide })));
  }

  // DEM terrain (with basemap texture when available)
  const terrainGeo = explainTerrainGeometry(bbox, toScene, basemap ? basemap.uvFor : null);
  if (terrainGeo) {
    scene.add(new THREE.Mesh(terrainGeo, new THREE.MeshBasicMaterial(
      basemap
        ? { map: basemap.texture, transparent: true, opacity: 0.9, side: THREE.DoubleSide }
        : { color: 0x9e9e9e, transparent: true, opacity: 0.9, side: THREE.DoubleSide })));
  }

  // rays
  explainState.rayLines3D = [];
  rays.forEach((f, i) => {
    const p = f.properties;
    const base = new THREE.Color(explainColorPath(p, explainState.mode));
    const selected = explainState.selectedRay === i;
    const color = selected ? new THREE.Color(0xccff00) : base;
    const coords = f.geometry.coordinates.map(([x, y, z]) => toScene(x, y, z));
    const geo = new THREE.BufferGeometry().setFromPoints(coords);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
    scene.add(line);
    explainState.rayLines3D[i] = { line, base };
  });

  // source + receiver (from the first ray endpoints), consistent vertical scale
  if (rays.length) {
    const first = rays[0].geometry.coordinates;
    const s = first[0], r = first[first.length - 1];
    const mk = (c, col) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(5, 14, 14), new THREE.MeshBasicMaterial({ color: col }));
      m.position.copy(toScene(c[0], c[1], c[2]));
      scene.add(m);
    };
    mk(s, 0xffd400);
    mk(r, 0xff2d2d);
  }

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 0.7);
  dir.position.set(1, 3, 1);
  scene.add(dir);

  const target = new THREE.Vector3(0, cz * EXPLAIN_VEX, 0);
  let theta = 0.6, phi = 1.0, dist = 900;
  const update = () => {
    camera.position.set(
      target.x + dist * Math.sin(phi) * Math.cos(theta),
      target.y + dist * Math.cos(phi),
      target.z + dist * Math.sin(phi) * Math.sin(theta));
    camera.lookAt(target);
    explainUpdateRibbon(camera);
    renderer.render(scene, camera);
  };
  let dragging = false, panning = false, lx = 0, ly = 0;
  renderer.domElement.addEventListener('mousedown', e => {
    if (e.button === 1) { panning = true; e.preventDefault(); }
    else { dragging = true; }
    lx = e.clientX; ly = e.clientY;
  });
  window.addEventListener('mouseup', () => { dragging = false; panning = false; });
  renderer.domElement.addEventListener('mousemove', e => {
    if (panning) {
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      let right = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0));
      if (right.lengthSq() < 1e-6) right = new THREE.Vector3(1, 0, 0);
      right.normalize();
      const up = new THREE.Vector3().crossVectors(right, camDir).normalize();
      const s = dist * 0.0015;
      target.addScaledVector(right, -(e.clientX - lx) * s);
      target.addScaledVector(up, (e.clientY - ly) * s);
      lx = e.clientX; ly = e.clientY; update();
      return;
    }
    if (!dragging) return;
    theta -= (e.clientX - lx) * 0.01; phi -= (e.clientY - ly) * 0.01;
    phi = Math.max(0.15, Math.min(Math.PI - 0.15, phi));
    lx = e.clientX; ly = e.clientY; update();
  });
  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
  renderer.domElement.addEventListener('wheel', e => {
    e.preventDefault(); dist *= (1 + Math.sign(e.deltaY) * 0.1); update();
  }, { passive: false });
  window.addEventListener('resize', () => {
    if (!el.clientWidth) return;
    camera.aspect = el.clientWidth / el.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(el.clientWidth, el.clientHeight);
    update();
  });
  update();
  explainState.three = { update, scene, toScene, camera };
}

// Camera-facing ribbon over the selected ray (screen-space thick line).
function explainUpdateRibbon(camera) {
  const r = explainState.highlightRibbon;
  if (!r || !r.userData.points) return;
  const pts = r.userData.points;
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  let right = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0));
  if (right.lengthSq() < 1e-6) right = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 0, 1));
  right.normalize();
  const w = (r.userData.width || 8) / 2;
  const pos = r.geometry.attributes.position;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    pos.setXYZ(2 * i, p.x - right.x * w, p.y - right.y * w, p.z - right.z * w);
    pos.setXYZ(2 * i + 1, p.x + right.x * w, p.y + right.y * w, p.z + right.z * w);
  }
  pos.needsUpdate = true;
  r.geometry.computeBoundingSphere();
}

// ── Summary + table ──
function explainRenderSummary(rays, rec) {
  const el = document.getElementById('montagne-explain-summary');
  if (!el) return;
  const share = { direct: 0, reflected: 0, diffracted: 0, mixed: 0 };
  rays.forEach(f => { share[explainRayType(f.properties)] += explainEnergy(f.properties.leq); });
  const total = Object.values(share).reduce((a, b) => a + b, 0) || 1;
  const pct = k => Math.round(100 * share[k] / total);
  const delta = (rec && rec.error !== undefined) ? rec.error : null;
  el.innerHTML =
    `<div class="explain-kpis">` +
    `<span>Receiver <b>#${rec ? rec.id : '—'}</b> (${explainState.campagne})</span>` +
    `<span>measured <b>${rec ? fmt(rec.measured) : '—'} dB</b></span>` +
    `<span>calibrated <b>${rec ? fmt(rec.corrected) : '—'} dB</b></span>` +
    `<span>Δ <b>${delta === null ? '—' : (delta >= 0 ? '+' : '') + fmt(delta)} dB</b></span>` +
    `<span>${rays.length} rays</span>` +
    `</div>` +
    `<div class="explain-share">` +
    Object.keys(share).map(k => `<span class="explain-share-item"><span class="legend-swatch" style="background:${EXPLAIN_TYPE_COLOR[k]}"></span>${k} ${pct(k)}%</span>`).join('') +
    `</div>`;
}

function explainRayLength(f) {
  let L = 0;
  const c = f.geometry.coordinates;
  for (let i = 1; i < c.length; i++) {
    const dx = c[i][0] - c[i - 1][0], dy = c[i][1] - c[i - 1][1], dz = (c[i][2] || 0) - (c[i - 1][2] || 0);
    L += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return L;
}

const EXPLAIN_COLUMNS = [
  { key: '#', label: '#' },
  { key: 'type', label: 'Type' },
  { key: 'meteo', label: 'meteo' },
  { key: 'LEQ', label: 'LEQ' },
  { key: 'aGlobal', label: 'aGlobal' },
  { key: 'aDiv', label: 'aDiv' },
  { key: 'aDif', label: 'aDif' },
  { key: 'aRef', label: 'aRef' },
  { key: 'aAtm', label: 'aAtm' },
  { key: 'len', label: 'len (m)' },
];

function explainTableRows(rays) {
  const lossOf = p => ['aDiv', 'aDif', 'aRef', 'aAtm'].reduce((s, k) => s + (p[k] != null ? p[k] : 0), 0);
  return rays.map((f, i) => {
    const p = f.properties;
    return {
      i, f, p,
      type: explainRayType(p),
      meteo: p.meteo || '',
      LEQ: p.leq,
      aGlobal: p.aGlobal,
      aDiv: p.aDiv,
      aDif: p.aDif,
      aRef: p.aRef,
      aAtm: p.aAtm,
      len: Math.round(explainRayLength(f)),
      loss: lossOf(p),
    };
  });
}

function explainRenderTable(rays) {
  const el = document.getElementById('montagne-explain-table');
  if (!el) return;
  const rows = explainTableRows(rays);
  const key = explainState.sortKey, dir = explainState.sortDir;
  const numeric = k => k !== 'type' && k !== 'meteo';
  rows.sort((x, y) => {
    let a = x[key], b = y[key];
    if (numeric(key)) {
      a = (a == null) ? Infinity : a; b = (b == null) ? Infinity : b;
      return dir === 'asc' ? a - b : b - a;
    }
    a = String(a); b = String(b);
    return dir === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
  });

  const header = EXPLAIN_COLUMNS.map(c => {
    const active = explainState.sortKey === c.key;
    const arrow = active ? (explainState.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th align="left" data-key="${c.key}" class="explain-th" style="cursor:pointer;user-select:none">${c.label}${arrow}</th>`;
  }).join('');

  const body = rows.map(r => {
    const sel = explainState.selectedRay === r.i;
    return `<tr data-ray="${r.i}" class="explain-row" style="cursor:pointer${sel ? ';background:rgba(204,255,0,.15)' : ''}">
      <td>${r.i + 1}</td><td>${r.type}</td><td>${r.meteo}</td>
      <td>${fmt(r.LEQ)}</td><td>${fmt(r.aGlobal)}</td><td>${fmt(r.aDiv)}</td>
      <td>${fmt(r.aDif)}</td><td>${fmt(r.aRef)}</td><td>${fmt(r.aAtm)}</td><td>${r.len}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <table style="border-collapse:collapse;margin-top:.5rem">
      <thead><tr style="color:var(--accent)">${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;

  el.querySelectorAll('tr.explain-row').forEach(tr => {
    tr.addEventListener('click', () => explainHighlightRay(Number(tr.dataset.ray)));
  });
  el.querySelectorAll('th.explain-th').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.key;
      if (explainState.sortKey === k) {
        explainState.sortDir = explainState.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        explainState.sortKey = k;
        explainState.sortDir = 'asc';
      }
      explainRenderTable(explainState.receiverRays);
    });
  });
}

function explainHighlightRay(idx) {
  explainState.selectedRay = (explainState.selectedRay === idx) ? null : idx;
  explainState.rayLines2D.forEach((entry, i) => {
    if (!entry) return;
    const on = explainState.selectedRay === i;
    entry.line.setStyle({ color: on ? '#ccff00' : entry.color, weight: on ? 8 : 2, opacity: on ? 1 : 0.85 });
    if (on && entry.line.bringToFront) entry.line.bringToFront();
  });
  explainState.rayLines3D.forEach((entry, i) => {
    if (!entry) return;
    const on = explainState.selectedRay === i;
    entry.line.material.color.set(on ? 0xccff00 : entry.base.getHex());
  });
  // thick yellow tube over the selected ray (THREE.Line linewidth is ignored)
  if (explainState.three) {
    const { scene, toScene, update, camera } = explainState.three;
    if (explainState.highlightRibbon) {
      scene.remove(explainState.highlightRibbon);
      explainState.highlightRibbon.geometry.dispose();
      explainState.highlightRibbon = null;
    }
    if (explainState.selectedRay != null && explainState.receiverRays[explainState.selectedRay]) {
      const f = explainState.receiverRays[explainState.selectedRay];
      const pts = f.geometry.coordinates.map(([x, y, z]) => toScene(x, y, z));
      if (pts.length >= 2) {
        const N = pts.length;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 2 * 3), 3));
        const idx = [];
        for (let i = 0; i < N - 1; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
        geo.setIndex(idx);
        const ribbon = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: 0xccff00, side: THREE.DoubleSide, depthTest: false, transparent: true }));
        ribbon.renderOrder = 999;
        ribbon.userData.points = pts;
        ribbon.userData.width = 8;
        scene.add(ribbon);
        explainState.highlightRibbon = ribbon;
        if (camera) explainUpdateRibbon(camera);
      }
    }
    update();
  }
  const el = document.getElementById('montagne-explain-table');
  if (el) el.querySelectorAll('tr.explain-row').forEach(tr => {
    tr.style.background = (Number(tr.dataset.ray) === explainState.selectedRay) ? 'rgba(204,255,0,.15)' : '';
  });
}

// ── KML ──
function explainDemKml(bbox) {
  const dem = explainState.dem; if (!dem || !bbox) return '';
  const { cell, xmin, ymin, nx, ny, z } = dem;
  const step = 2;
  const ix0 = Math.max(0, Math.floor((bbox[0] - xmin) / cell));
  const ix1 = Math.min(nx - 2, Math.ceil((bbox[2] - xmin) / cell));
  const iy0 = Math.max(0, Math.floor((bbox[1] - ymin) / cell));
  const iy1 = Math.min(ny - 2, Math.ceil((bbox[3] - ymin) / cell));
  const X = ix => xmin + (ix + 0.5) * cell;
  const Y = iy => ymin + (iy + 0.5) * cell;
  let out = '';
  for (let iy = iy0; iy <= iy1; iy += step) {
    for (let ix = ix0; ix <= ix1; ix += step) {
      const z00 = z[iy] ? z[iy][ix] : null;
      const z10 = z[iy] ? z[iy][ix + step] : null;
      const z01 = z[iy + step] ? z[iy + step][ix] : null;
      const z11 = z[iy + step] ? z[iy + step][ix + step] : null;
      if ([z00, z10, z01, z11].some(v => v == null)) continue;
      const ring = `${X(ix)},${Y(iy)},${z00} ${X(ix + step)},${Y(iy)},${z10} ` +
        `${X(ix + step)},${Y(iy + step)},${z11} ${X(ix)},${Y(iy + step)},${z01} ${X(ix)},${Y(iy)},${z00}`;
      out += `<Placemark><styleUrl>#dem</styleUrl><Polygon><altitudeMode>absolute</altitudeMode>` +
        `<outerBoundaryIs><LinearRing><coordinates>${ring}</coordinates></LinearRing></outerBoundaryIs>` +
        `</Polygon></Placemark>`;
    }
  }
  return out;
}

function explainBuildKml(rays, buildings) {
  const kmlColor = p => {
    const c = (explainColorPath(p, explainState.mode) || '#888888');
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c.length === 7 ? c : '#888888');
    if (!m) return 'ff888888';
    return 'ff' + m[3] + m[2] + m[1];
  };
  const rayPlacemarks = rays.map(f => {
    const p = f.properties;
    const coords = f.geometry.coordinates.map(([x, y, z]) => `${x},${y},${z}`).join(' ');
    return `<Placemark><name>ray ${explainRayType(p)} LEQ ${p.leq}</name>` +
      `<Style><LineStyle><color>${kmlColor(p)}</color><width>2</width></LineStyle></Style>` +
      `<LineString><altitudeMode>absolute</altitudeMode><coordinates>${coords}</coordinates></LineString></Placemark>`;
  }).join('');
  const bldPlacemarks = buildings.slice(0, 400).map(f => {
    const g = f.geometry; if (!g) return '';
    const height = Number(f.properties?.height) || 4;
    const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
    return polys.map(poly => {
      const ring = poly[0];
      const zs = ring.map(c => c[2]).filter(v => typeof v === 'number');
      const roof = zs.length ? zs.reduce((a, b) => a + b, 0) / zs.length : 0;
      const outer = ring.map(([x, y]) => `${x},${y},${roof}`).join(' ');
      return `<Placemark><name>building</name><Style><LineStyle><color>ffc9b29f</color></LineStyle>` +
        `<PolyStyle><color>7fc9b29f</color></PolyStyle></Style>` +
        `<Polygon><extrude>1</extrude><altitudeMode>absolute</altitudeMode>` +
        `<outerBoundaryIs><LinearRing><coordinates>${outer}</coordinates></LinearRing></outerBoundaryIs>` +
        `</Polygon></Placemark>`;
    }).join('');
  }).join('');
  const srcPlacemarks = (explainState.layers?.sources || []).map(([x, y, z]) =>
    `<Placemark><name>source</name><Point><altitudeMode>absolute</altitudeMode><coordinates>${x},${y},${z || 0}</coordinates></Point></Placemark>`).join('');
  const demPlacemarks = explainDemKml(explainBbox(rays));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>` +
    `<name>La Montagne receiver ${explainState.receiver}</name>` +
    `<Style id="dem"><LineStyle><color>ff9f8d78</color></LineStyle><PolyStyle><color>5f9f8d78</color></PolyStyle></Style>` +
    `${demPlacemarks}${bldPlacemarks}${srcPlacemarks}${rayPlacemarks}` +
    `</Document></kml>`;
}

function explainDownloadKml() {
  if (!explainState.rays) return;
  const rays = explainState.rays.features.filter(f => f.properties.receiver === explainState.receiver);
  const bbox = explainBbox(rays);
  const buildings = explainBuildingsInBbox(bbox);
  const kml = explainBuildKml(rays, buildings);
  const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `la_montagne_${explainState.version}_${explainState.campagne}_Rx${explainState.receiver}.kml`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Main render ──
async function renderMontagneExplain() {
  const section = document.getElementById('montagne-explain');
  if (!section) return;
  const version = (typeof montagneMapModel !== 'undefined' && montagneMapModel) ? montagneMapModel : null;
  const latest = (typeof montagneLatestVersion === 'function') ? montagneLatestVersion() : null;
  const entry = version ? montagneEntry(version) : null;
  // Explainability is restricted to the latest snapshot (that is where the
  // propagation rays are exported and kept in the published data).
  if (!version || version !== latest || !entry || !entry.receivers || !entry.receivers.length) {
    section.style.display = 'none';
    return;
  }

  explainState.version = version;
  explainState.receivers = entry.receivers;

  const select = document.getElementById('montagne-explain-receiver');
  const current = explainState.receiver && entry.receivers.some(r => r[0] === explainState.receiver)
    ? explainState.receiver : entry.receivers[0][0];
  explainState.receiver = current;
  const rec = entry.receivers.find(r => r[0] === current);
  explainState.campagne = rec ? (rec[6] || 'c1') : 'c1';

  const raysData = await explainLoadRays(version, explainState.campagne);
  if (!raysData || !raysData.features || !raysData.features.length) { section.style.display = 'none'; return; }
  explainState.rays = raysData;

  await explainLoadLayers();
  await explainLoadDem();

  section.style.display = '';
  document.getElementById('montagne-explain-intro').innerHTML =
    `Propagation rays are exported for the latest snapshot only (<b>${version}</b>), so this section is shown ` +
    `only when that model is selected on the map. Pick a receiver to see its rays (homogeneous scenario), ` +
    `where the sound is attenuated, and the ray contributions. 2D and 3D views; KML download for Google Earth.`;

  select.innerHTML = entry.receivers.map(r =>
    `<option value="${r[0]}"${r[0] === current ? ' selected' : ''}>#${r[0]} (${r[6] || 'c1'})</option>`).join('');
  document.getElementById('montagne-explain-model').textContent = `model ${version}`;

  explainState.selectedRay = null;
  explainRenderAll();
}

async function explainRenderAll() {
  if (!explainState.rays) return;
  const rays = explainState.rays.features.filter(f => f.properties.receiver === explainState.receiver);
  const rec = explainState.receivers.find(r => r[0] === explainState.receiver) || null;
  const recObj = rec ? { id: rec[0], measured: rec[3], corrected: rec[4], error: rec[5] } : null;
  explainState.receiverRays = rays;
  const bbox = explainBbox(rays);
  const buildings = explainBuildingsInBbox(bbox);
  explainLegend(explainState.mode);
  explainRenderSummary(rays, recObj);
  explainRenderTable(rays);
  if (explainState.view === '3d') {
    const basemap = await explainLoadBasemap(bbox);
    explainDraw3D(rays, buildings, bbox, basemap);
  } else {
    explainDraw2D(rays, buildings, explainState.mode);
  }
}

// ── UI wiring ──
function explainWire() {
  const select = document.getElementById('montagne-explain-receiver');
  if (select) select.addEventListener('change', async () => {
    explainState.receiver = Number(select.value);
    const rec = explainState.receivers.find(r => r[0] === explainState.receiver);
    const camp = rec ? (rec[6] || 'c1') : 'c1';
    if (camp !== explainState.campagne) {
      explainState.campagne = camp;
      const data = await explainLoadRays(explainState.version, camp);
      if (data) explainState.rays = data;
    }
    explainState.selectedRay = null;
    explainRenderAll();
  });
  document.querySelectorAll('#montagne-explain-modes .map-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#montagne-explain-modes .map-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      explainState.mode = btn.dataset.mode;
      explainRenderAll();
    });
  });
  document.querySelectorAll('#montagne-explain-views .map-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#montagne-explain-views .map-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      explainState.view = btn.dataset.view;
      const mapEl = document.getElementById('montagne-explain-map');
      const el3d = document.getElementById('montagne-explain-3d');
      if (mapEl) mapEl.style.display = explainState.view === '2d' ? '' : 'none';
      if (el3d) el3d.style.display = explainState.view === '3d' ? '' : 'none';
      explainRenderAll();
    });
  });
  const kml = document.getElementById('montagne-explain-kml');
  if (kml) kml.addEventListener('click', explainDownloadKml);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', explainWire);
} else {
  explainWire();
}
