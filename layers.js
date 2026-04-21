// layers.js - All map overlays and sources

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
