// map-init.js - Handles Mapbox map creation and event wiring
import { resolveMapboxToken } from './token.js';

export async function initMap() {
  console.log('[MAP INIT] initMap() called');
  // 1. Check for map container
  const mapDiv = document.getElementById('map');
  if (!mapDiv) {
    console.error('[MAP INIT] #map container not found!');
    return;
  }
  const rect = mapDiv.getBoundingClientRect();
  console.log('[MAP INIT] #map container found. Size:', rect.width, rect.height);

  if (!window.mapboxgl) {
    console.error('[MAP INIT] Mapbox GL JS (mapboxgl) is not loaded!');
    alert('Mapbox GL JS failed to load.');
    return;
  }

  let token;
  try {
    token = await resolveMapboxToken();
  } catch (err) {
    alert('[MAP INIT] Token fetch error: ' + String(err));
    return;
  }

  console.log('[MAP INIT] Map token exists:', !!token, 'Token value:', token && token.slice(0, 8) + '...');
  if (!token || !token.startsWith('pk.')) {
    console.error('[MAP INIT] Mapbox token is missing or invalid:', token);
    alert('Mapbox token is missing or invalid. Map will not load.');
    return;
  }

  mapboxgl.accessToken = token;

  try {
    console.log('[MAP INIT] Creating map...');
    const map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-73.9895, 40.6745], // PRESENTATION_CENTER
      zoom: 15.25,
      pitch: 0, // PRESENTATION_PITCH
      bearing: -42, // PRESENTATION_BEARING
      antialias: true
    });
    window._debugMap = map;
    console.log('[MAP INIT] Mapbox map object created:', map);

    map.on('load', () => {
      console.log('[MAP EVENT] Map loaded');
      // --- RESTORE EXISTING BUILDINGS (extruded fill and outline) ---
      fetch('./data/gowanus-buildings.geojson')
        .then(r => r.json())
        .then(existingData => {
          map.addSource('existing', {
            type: 'geojson',
            data: existingData
          });
          map.addLayer({
            id: 'existing-buildings',
            type: 'fill-extrusion',
            source: 'existing',
            paint: {
              'fill-extrusion-color': '#b7c0c8',
              'fill-extrusion-base': 0,
              'fill-extrusion-height': 0,
              'fill-extrusion-opacity': 0.92
            }
          });
          map.addLayer({
            id: 'existing-building-outline',
            type: 'line',
            source: 'existing',
            layout: {
              'line-join': 'round',
              'line-cap': 'round'
            },
            paint: {
              'line-color': '#2d3748',
              'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                13, 0.8,
                16, 1.5,
                18, 2.2
              ],
              'line-opacity': 1.0
            }
          });
        });
      // --- RESTORE PARK OUTLINE AND FILL ---
      fetch('./models/park.geojson')
        .then(r => r.json())
        .then(parkData => {
          map.addSource('park', {
            type: 'geojson',
            data: parkData
          });
          map.addLayer({
            id: 'park-hatch-fill',
            type: 'fill',
            source: 'park',
            paint: {
              'fill-color': '#e6f7e6',
              'fill-opacity': 0.45
            }
          });
        });
      fetch('./models/park_outline.geojson')
        .then(r => r.json())
        .then(parkOutlineData => {
          map.addSource('park-outline', {
            type: 'geojson',
            data: parkOutlineData
          });
          map.addLayer({
            id: 'park-outline',
            type: 'line',
            source: 'park-outline',
            paint: {
              'line-color': '#15803d',
              'line-width': 2.2,
              'line-opacity': 0.85
            }
          });
        });
      // Add more overlays as needed (topography, flood, bioswale, etc.)
      // Initialize trees overlay if available
      if (window.TreeRenderer && window.TreeRenderer.initTrees) {
        window.TreeRenderer.initTrees(map);
      }
      // Restore layer toggles
      const topoToggle = document.getElementById('toggle-topo');
      const treesToggle = document.getElementById('toggle-trees');
      topoToggle?.addEventListener('change', (event) => {
        const visibility = event.target.checked ? 'visible' : 'none';
        if (map.getLayer('zoning-footprints')) {
          map.setLayoutProperty('zoning-footprints', 'visibility', visibility);
        }
      });
      treesToggle?.addEventListener('change', (event) => {
        if (event.target.checked) {
          window.TreeRenderer?.showTrees?.(map);
        } else {
          window.TreeRenderer?.hideTrees?.(map);
        }
      });
    });
    map.on('style.load', () => {
      console.log('[MAP EVENT] Style loaded');
    });
    map.on('error', (e) => {
      console.error('[MAP EVENT] Map error:', e);
    });

  } catch (err) {
    console.error('[MAP INIT] Map creation error:', err);
  }
}
