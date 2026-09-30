// ─────────────────────────────────────────────
// DIFF MAP
// ─────────────────────────────────────────────
let diffLayer = null;
let diffMapActive = false;


function diffColor(delta) {
  if (delta < -6)  return '#2166ac';
  else if (delta < -4)  return '#4393c3';
  else if (delta < -2)return '#92c5de';
  else if (delta < 2 && delta > -2)return '#f7f7f7';
  else if (delta <  4)  return '#f4a582';
  else if (delta <  6)  return '#d6604d';
  else return '#b2182b';
}

async function drawDiffMap(vA, vB) {
  if (diffLayer) { map.removeLayer(diffLayer); diffLayer = null; }

  const info = document.getElementById('diff-map-info');
  info.style.display = 'block';
  info.textContent = 'Loading…';

  const c = findComparison(vA, vB);
  if (!c || !c.diff_map || !c.diff_map.length) {
    info.textContent = 'Data diff_map missing';
    return;
  }

  const flip = c.version_a !== vA;

  const geojson = {
    type: 'FeatureCollection',
    crs: {type:"name",properties:{name:"urn:ogc:def:crs:EPSG::2154"}},
    features: c.diff_map.map(([lon, lat, delta]) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { delta: flip ? -delta : delta }
    }))
  };
  console.log(geojson)

  const reprojected = reprojectGeojson(geojson);

  diffLayer = L.geoJSON(reprojected, {
    pointToLayer: (f, latlng) => L.circleMarker(latlng, {
      radius: 3,
      fillColor: diffColor(f.properties.delta),
      color: 'transparent',
      fillOpacity: 0.9,
      weight: 0,
    }),
    onEachFeature: (f, layer) => {
      const d = f.properties.delta;
      const sign = d >= 0 ? '+' : '';
      layer.bindTooltip(
              `Δ: ${sign}${d.toFixed(2)} dB<br>${vA} → ${vB}`,
              { className: 'leaflet-tooltip-dark', sticky: true }
      );
    }
  }).addTo(map);

  info.innerHTML = `n=${c.diff_map.length.toLocaleString()}<br>${vA} → ${vB}`;
  document.getElementById('diff-legend').style.display = 'flex';
}


function clearDiffMap() {
  if (diffLayer) { map.removeLayer(diffLayer); diffLayer = null; }
  document.getElementById('diff-legend').style.display = 'none';
  document.getElementById('diff-map-info').style.display = 'none';
}

function setupDiffMapButton() {
  const btn = document.getElementById('btn-diff-map');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    diffMapActive = !diffMapActive;

    if (diffMapActive) {
      btn.classList.add('active');
      const vA = document.getElementById('select-vA')?.value;
      const vB = document.getElementById('select-vB')?.value;
      if (!vA || !vB) {
        document.getElementById('diff-map-info').style.display = 'block';
        document.getElementById('diff-map-info').textContent = 'Select an A/B pair';
        diffMapActive = false;
        btn.classList.remove('active');
        return;
      }
      await drawDiffMap(vA, vB);
    } else {
      btn.classList.remove('active');
      clearDiffMap();
    }
  });

  ['select-vA', 'select-vB'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', async () => {
      if (!diffMapActive) return;
      const vA = document.getElementById('select-vA')?.value;
      const vB = document.getElementById('select-vB')?.value;
      if (vA && vB) await drawDiffMap(vA, vB);
    });
  });
}

