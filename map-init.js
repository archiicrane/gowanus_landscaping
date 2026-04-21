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
    });
    map.on('style.load', () => {
      console.log('[MAP EVENT] Style loaded');
    });
    map.on('error', (e) => {
      console.error('[MAP EVENT] Map error:', e);
    });

    // TODO: Import and call setupLayers(map) from layers.js
    // TODO: Import and call attachMapHandlers(map) from utils.js

  } catch (err) {
    console.error('[MAP INIT] Map creation error:', err);
  }
}
