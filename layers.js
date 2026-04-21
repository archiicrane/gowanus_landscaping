// layers.js - All map overlays and sources

// --- Ensure STUDY_RING and pointInStudyPolygon are defined on window ---
if (!window.STUDY_RING) {
  // Coordinates from main_pre_split_utf8.js (lng, lat pairs)
  window.STUDY_RING = [
    [-73.98963594611494, 40.683945676183654],
    [-73.98084416376932, 40.680669969224006],
    [-73.98368161027763, 40.67628724578089],
    [-73.99274143083169, 40.665495232798115],
    [-73.99607305804426, 40.667988596328655],
    [-73.99889524234268, 40.67260255106102],
    [-73.9964465299067, 40.67744610487334],
    [-73.99461997552936, 40.67663528353369],
    [-73.98963594611494, 40.683945676183654]
  ];
}

if (!window.pointInStudyPolygon) {
  window.pointInStudyPolygon = function(point) {
    const x = point[0];
    const y = point[1];
    const ring = window.STUDY_RING;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersects = ((yi > y) !== (yj > y)) &&
        (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  };
}

export function setupMapLayers(map) {
      // --- Building Heights Overlay (b_heights.geojson) ---
      (async () => {
        try {
          const res = await fetch('./models/b_heights.geojson');
          if (!res.ok) throw new Error(`b_heights.geojson fetch failed: ${res.status} ${res.statusText}`);
          const bHeightsData = await res.json();
          if (!map.getSource('b-heights')) {
            map.addSource('b-heights', { type: 'geojson', data: bHeightsData });
          } else {
            map.getSource('b-heights').setData(bHeightsData);
          }
          if (!map.getLayer('b-heights-fill')) {
            map.addLayer({
              id: 'b-heights-fill',
              type: 'fill',
              source: 'b-heights',
              paint: {
                'fill-color': [
                  'interpolate', ['linear'], ['get', 'height'],
                  0, '#e0e0e0',
                  10, '#b0b0b0',
                  20, '#888888',
                  30, '#555555',
                  40, '#222222'
                ],
                'fill-opacity': 0.5
              }
            });
          }
          if (!map.getLayer('b-heights-outline')) {
            map.addLayer({
              id: 'b-heights-outline',
              type: 'line',
              source: 'b-heights',
              paint: {
                'line-color': '#222',
                'line-width': 1.1
              }
            });
          }
        } catch (err) {
          console.error('[LAYERS] b_heights error:', err);
        }
      })();

      // --- Contour Lines Overlay (con_lines_gowanus_1ft.geojson) ---
      (async () => {
        try {
          const res = await fetch('./models/con_lines_gowanus_1ft.geojson');
          if (!res.ok) throw new Error(`con_lines_gowanus_1ft.geojson fetch failed: ${res.status} ${res.statusText}`);
          const contourData = await res.json();
          if (!map.getSource('contour-lines')) {
            map.addSource('contour-lines', { type: 'geojson', data: contourData });
          } else {
            map.getSource('contour-lines').setData(contourData);
          }
          if (!map.getLayer('contour-lines')) {
            map.addLayer({
              id: 'contour-lines',
              type: 'line',
              source: 'contour-lines',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': '#9ca3af',
                'line-width': [
                  'case',
                    ['==', ['%', ['round', ['get', 'ELEV']], 5], 0], 1.2,
                    0.72
                ],
                'line-opacity': 0.7
              }
            });
          }
        } catch (err) {
          console.error('[LAYERS] contour lines error:', err);
        }
      })();
    // --- Park Outline and Hatch Fill ---
    (async () => {
      try {
        // Load park outline and area
        const response = await fetch('./models/park.geojson');
        if (!response.ok) throw new Error(`Park outline fetch failed: ${response.status} ${response.statusText}`);
        const parkData = await response.json();
        const features = Array.isArray(parkData?.features) ? parkData.features : [];
        // Build polygons from lines
        const equalPoint = (a, b, eps = 1e-8) => (Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps);
        const closeEnough = (a, b, eps = 1e-6) => (Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps);
        const rings = [];
        let current = [];
        const finalizeCurrent = () => {
          if (current.length < 4) { current = []; return; }
          const first = current[0];
          const last = current[current.length - 1];
          if (!equalPoint(first, last)) {
            if (closeEnough(first, last)) {
              current.push([first[0], first[1]]);
            } else { current = []; return; }
          }
          rings.push(current); current = [];
        };
        for (const feature of features) {
          const coords = feature?.geometry?.type === 'LineString' ? feature.geometry.coordinates : [];
          if (coords.length < 2) continue;
          const a = [Number(coords[0][0]), Number(coords[0][1])];
          const b = [Number(coords[coords.length - 1][0]), Number(coords[coords.length - 1][1])];
          if (!current.length) { current = [a, b]; continue; }
          const tail = current[current.length - 1];
          if (equalPoint(tail, a)) { current.push(b); }
          else if (equalPoint(tail, b)) { current.push(a); }
          else { finalizeCurrent(); current = [a, b]; }
        }
        finalizeCurrent();
        const parkAreaFeatures = rings.map((ring, index) => ({
          type: 'Feature',
          properties: { name: `park-area-${index + 1}` },
          geometry: { type: 'Polygon', coordinates: [ring] }
        }));
        if (!map.getSource('park-outline')) {
          map.addSource('park-outline', { type: 'geojson', data: parkData });
        } else {
          map.getSource('park-outline').setData(parkData);
        }
        if (!map.getSource('park-area')) {
          map.addSource('park-area', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: parkAreaFeatures }
          });
        } else {
          map.getSource('park-area').setData({ type: 'FeatureCollection', features: parkAreaFeatures });
        }
        // Add hatch pattern
        if (!map.hasImage('park-hatch-red')) {
          const hatchCanvas = document.createElement('canvas');
          hatchCanvas.width = 24; hatchCanvas.height = 24;
          const ctx = hatchCanvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, 24, 24);
            ctx.strokeStyle = 'rgba(220,38,38,0.40)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-6, 24); ctx.lineTo(12, 6);
            ctx.moveTo(0, 30); ctx.lineTo(18, 12);
            ctx.moveTo(6, 36); ctx.lineTo(24, 18);
            ctx.stroke();
            map.addImage('park-hatch-red', ctx.getImageData(0, 0, 24, 24), { pixelRatio: 2 });
          }
        }
        if (!map.getLayer('park-hatch-fill')) {
          map.addLayer({
            id: 'park-hatch-fill',
            type: 'fill',
            source: 'park-area',
            layout: { visibility: 'visible' },
            paint: { 'fill-pattern': 'park-hatch-red', 'fill-opacity': 0.62 }
          });
        }
        if (!map.getLayer('park-outline')) {
          map.addLayer({
            id: 'park-outline',
            type: 'line',
            source: 'park-outline',
            layout: { visibility: 'visible', 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#dc2626',
              'line-width': [ 'interpolate', ['linear'], ['zoom'], 14, 1.6, 16, 2.6, 18, 3.9 ],
              'line-dasharray': [1.4, 1.1],
              'line-opacity': 0.96
            }
          });
        }
        map.setPaintProperty('park-hatch-fill', 'fill-pattern', 'park-hatch-red');
        map.setPaintProperty('park-hatch-fill', 'fill-opacity', 0.62);
        map.setPaintProperty('park-outline', 'line-color', '#dc2626');
        map.setPaintProperty('park-outline', 'line-width', [ 'interpolate', ['linear'], ['zoom'], 14, 1.6, 16, 2.6, 18, 3.9 ]);
        map.setPaintProperty('park-outline', 'line-dasharray', [1.4, 1.1]);
        map.setPaintProperty('park-outline', 'line-opacity', 0.96);
      } catch (err) {
        console.error('[LAYERS] Park outline error:', err);
      }
    })();
  // --- Hide default Mapbox labels, POIs, and color noise ---
  const style = map.getStyle();
  style.layers.forEach(layer => {
    if (!map.getLayer(layer.id)) return;
    if (layer.id === 'trees-layer') return;
    try {
      if (
        layer.type === 'symbol' ||
        layer.id.includes('label') ||
        layer.id.includes('poi') ||
        layer.id.includes('road-label') ||
        layer.id.includes('transit')
      ) {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      }
    } catch (e) {}
    try {
      if (layer.type === 'fill' && (layer.id.includes('landuse') || layer.id.includes('park'))) {
        map.setPaintProperty(layer.id, 'fill-color', '#f7f7f7');
        map.setPaintProperty(layer.id, 'fill-opacity', 1);
      }
    } catch (e) {}
    try {
      if (layer.id.includes('water')) {
        map.setPaintProperty(layer.id, 'fill-color', '#e6f0fa');
        map.setPaintProperty(layer.id, 'fill-opacity', 1);
      }
    } catch (e) {}
    try {
      if (layer.id.includes('building')) {
        map.setPaintProperty(layer.id, 'fill-color', '#e0e0e0');
        map.setPaintProperty(layer.id, 'fill-outline-color', '#bdbdbd');
        map.setPaintProperty(layer.id, 'fill-opacity', 1);
      }
    } catch (e) {}
    try {
      if (layer.type === 'line' && layer.id.includes('road')) {
        map.setPaintProperty(layer.id, 'line-color', '#f7f7f7');
        map.setPaintProperty(layer.id, 'line-width', 1.2);
        map.setPaintProperty(layer.id, 'line-opacity', 1);
      }
    } catch (e) {}
  });

  // --- Add custom architectural layers (buildings, roads, blocks) ---
  map.addSource('arch-buildings', {
    type: 'geojson',
    data: 'models/footprints.geojson'
  });
  map.addLayer({
    id: 'arch-buildings-fill',
    type: 'fill',
    source: 'arch-buildings',
    paint: {
      'fill-color': [
        'case',
          ['boolean', ['get', 'yellow'], false],
          '#b0b0b0',
          '#e0e0e0'
      ],
      'fill-opacity': 1
    }
  }, 'waterway-label');
  map.addLayer({
    id: 'arch-buildings-outline',
    type: 'line',
    source: 'arch-buildings',
    paint: {
      'line-color': '#bdbdbd',
      'line-width': 1.1
    }
  }, 'arch-buildings-fill');

  // --- Flood vulnerability layer ---
  map.addSource('flood-vulnerability', {
    type: 'geojson',
    data: 'data/flood-vulnerability.geojson'
  });
  map.addLayer({
    id: 'flood-vulnerability-fill',
    type: 'fill',
    source: 'flood-vulnerability',
    paint: {
      'fill-color': '#4fc3f7',
      'fill-opacity': 0.28
    },
    filter: ['within', { type: 'Polygon', coordinates: [window.STUDY_RING] }]
  }, 'arch-buildings-outline');

  // --- CSO Outfalls ---
  fetch('models/Citywide_Outfalls_20260416.geojson')
    .then(res => res.json())
    .then(citywideCSO => {
      const filtered = citywideCSO.features.filter(f => {
        if (!f.geometry || f.geometry.type !== 'Point') return false;
        return window.pointInStudyPolygon(f.geometry.coordinates);
      });
      const gowanusCSO = {
        type: 'FeatureCollection',
        features: filtered
      };
      map.addSource('cso-outfalls', {
        type: 'geojson',
        data: gowanusCSO
      });
      map.addLayer({
        id: 'cso-outfalls-circle',
        type: 'circle',
        source: 'cso-outfalls',
        paint: {
          'circle-radius': 7,
          'circle-color': '#ff9800',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
          'circle-opacity': 0.95
        }
      }, 'flood-vulnerability-fill');
    });
}
