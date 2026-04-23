// map-init.js — Creates and exports the Mapbox map instance

import { resolveMapboxToken } from '/js/token.js';
import {
	addBuildingLayer,
	addTreeLayer,
	addParkLayer,
	addStudyBoundaryLayer,
	addStudyClipMask,
	addContourLayer,
	addFloodLayer,
	addCsoOutfallsLayer,
	addTopographyHeatLayer,
	addBioswaleOpportunityLayer,
} from '/js/layers.js';
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
		center: [-73.9895, 40.6748],
		zoom: 13.95,
		pitch: 0,
		bearing: 0,
		antialias: true,
	});

	window._map = map;

	map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');
	map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');

	map.on('load', async () => {
		// Hide road name labels from Mapbox basemap
		for (const layer of map.getStyle().layers) {
			if (layer.type === 'symbol' && layer['source-layer'] === 'road') {
				map.setLayoutProperty(layer.id, 'visibility', 'none');
			}
		}

		// Data layers — heatmap first so the clip mask can sit on top of it
		await addBuildingLayer(map);
		await addTreeLayer(map);
		await addParkLayer(map);
		await addTopographyHeatLayer(map);
		addStudyClipMask(map);           // clips heatmap bleed at the boundary
		await addStudyBoundaryLayer(map); // boundary line sits above the mask
		await addContourLayer(map);
		await addFloodLayer(map);
		await addCsoOutfallsLayer(map);
		await addBioswaleOpportunityLayer(map);
		setupMapHandlers(map);
		wireLayerToggles(map);
		initMapIntroSequence(map);
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
		{ id: 'toggle-contours',  layers: ['contour-lines'] },
		{ id: 'toggle-flood',     layers: ['flood-vulnerability-fill'] },
		{ id: 'toggle-cso',       layers: ['cso-outfalls-circle'] },
		{ id: 'toggle-heat',      layers: ['topography-heatmap'] },
		{ id: 'toggle-bioswale',  layers: ['bioswale-corridor-glow', 'bioswale-corridor-core'] },
		{ id: 'toggle-bounding',  layers: ['study-boundary-fill', 'study-boundary-line'] },
	];

	for (const { id, layers } of toggles) {
		const el = document.getElementById(id);
		if (!el) continue;
		const applyVisibility = () => {
			const vis = el.checked ? 'visible' : 'none';
			for (const layerId of layers) {
				if (map.getLayer(layerId)) {
					map.setLayoutProperty(layerId, 'visibility', vis);
				}
			}
		};
		el.addEventListener('change', () => {
			applyVisibility();
		});
		applyVisibility();
	}
}

function initMapIntroSequence(map) {
	const existingPanel = document.getElementById('story-existing');
	const bioswalePanel = document.getElementById('story-bioswale');
	const toggleIds = ['toggle-heat', 'toggle-contours', 'toggle-flood', 'toggle-bioswale'];

	if (existingPanel) existingPanel.classList.add('active');
	if (bioswalePanel) bioswalePanel.classList.remove('active');

	map.scrollZoom.disable();

	let stage = 0;
	let transitioning = false;

	const setChecked = (id, checked) => {
		const input = document.getElementById(id);
		if (!input) return;
		if (input.checked !== checked) {
			input.checked = checked;
			input.dispatchEvent(new Event('change'));
		}
	};

	const applyStage = () => {
		if (stage === 0) {
			setChecked('toggle-bounding', true);
			setChecked('toggle-buildings', false);
			setChecked('toggle-trees', false);
			setChecked('toggle-park', false);
			setChecked('toggle-flood', false);
			setChecked('toggle-cso', false);
			setChecked('toggle-heat', false);
			setChecked('toggle-bioswale', false);
			setChecked('toggle-contours', false);
			if (existingPanel) existingPanel.classList.add('active');
			if (bioswalePanel) bioswalePanel.classList.remove('active');
			return;
		}

		setChecked('toggle-bounding', true);
		setChecked('toggle-contours', true);
		setChecked('toggle-heat', true);
		setChecked('toggle-bioswale', true);
		setChecked('toggle-flood', false);
		setChecked('toggle-cso', false);
		if (existingPanel) existingPanel.classList.remove('active');
		if (bioswalePanel) bioswalePanel.classList.add('active');
	};

	applyStage();

	map.getCanvas().addEventListener('wheel', (event) => {
		event.preventDefault();
		if (transitioning) return;

		if (stage === 0) {
			transitioning = true;
			stage = 1;
			applyStage();
			map.easeTo({
				pitch: 0,
				bearing: -40,
				zoom: 14.55,
				duration: 1200,
				easing: (t) => t * (2 - t),
			});
			window.setTimeout(() => { transitioning = false; }, 1250);
			return;
		}

		const direction = event.deltaY > 0 ? -1 : 1;
		const nextBearing = map.getBearing() + direction * 4;
		map.easeTo({ pitch: 0, bearing: nextBearing, duration: 220 });
	}, { passive: false });
}
