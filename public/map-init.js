// map-init.js — Creates and exports the Mapbox map instance

import { resolveMapboxToken } from '/js/token.js';
import { addBuildingLayer, addTreeLayer, addParkLayer } from '/js/layers.js';
import { setupMapHandlers } from '/js/handlers.js';

export async function initMap() {
	const mapDiv = document.getElementById('map');
	if (!mapDiv) {
		console.error('[MAP INIT] #map container not found');
		return;
	}

	if (typeof mapboxgl === 'undefined') {
		console.error('[MAP INIT] Mapbox GL JS is not loaded. Check the <script> tag in index.html.');
		mapDiv.innerHTML = '<p style="color:#e05;padding:2rem">Mapbox GL JS failed to load. Check console.</p>';
		return;
	}

	const token = await resolveMapboxToken();
	if (!token) {
		mapDiv.innerHTML = '<p style="color:#e05;padding:2rem">Mapbox token missing. Add your token to the &lt;meta name="mapbox-token"&gt; tag in index.html.</p>';
		return;
	}

	mapboxgl.accessToken = token;

	const map = new mapboxgl.Map({
		container: 'map',
		style: 'mapbox://styles/mapbox/light-v11',
		center: [-73.9895, 40.6745],
		zoom: 15.25,
		pitch: 0,
		bearing: -42,
		antialias: true,
	});

	window._map = map;

	map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');
	map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');

	map.on('load', () => {
		addBuildingLayer(map);
		addTreeLayer(map);
		addParkLayer(map);
		setupMapHandlers(map);
		wireLayerToggles(map);
	});

	map.on('error', (e) => {
		console.error('[MAP] Mapbox error:', e.error || e);
	});

	return map;
}

function wireLayerToggles(map) {
	const toggles = [
		{ id: 'toggle-buildings', layers: ['buildings-extrusion'] },
		{ id: 'toggle-trees',     layers: ['trees-circles', 'trees-labels'] },
		{ id: 'toggle-park',      layers: ['park-outline'] },
	];

	for (const { id, layers } of toggles) {
		const el = document.getElementById(id);
		if (!el) continue;
		el.addEventListener('change', () => {
			const vis = el.checked ? 'visible' : 'none';
			for (const layerId of layers) {
				if (map.getLayer(layerId)) {
					map.setLayoutProperty(layerId, 'visibility', vis);
				}
			}
		});
	}
}
