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
