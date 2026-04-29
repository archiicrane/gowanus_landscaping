// map-init.js - Creates and exports the Mapbox map instance

import { resolveMapboxToken } from './js/token.js';
import {
	addBuildingLayer,
	addTreeLayer,
	addParkLayer,
	STUDY_RING,
	addStudyBoundaryLayer,
	addStudyClipMask,
	addContourLayer,
	addFloodLayer,
	addCsoOutfallsLayer,
	addTopographyHeatLayer,
	addBioswaleOpportunityLayer,
	addRemediationSitesLayer,
	addNearbyParksLayer,
	addDistanceRingsLayer,
} from './js/layers.js';
import { setupMapHandlers } from './js/handlers.js';

export async function initMap() {
	const mapPage = document.body?.dataset.mapPage || 'analysis';
	const isPreceedencePage = mapPage === 'preceedence' || mapPage === 'map';
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

	const initialPadding = getInitialFitPadding();
	// Wider initial bounds shows the full analysis context on first load
	const contextBounds = [[-74.040, 40.642], [-73.936, 40.704]];

	const map = new mapboxgl.Map({
		container: 'map',
		style: 'mapbox://styles/mapbox/light-v11',
		bounds: contextBounds,
		fitBoundsOptions: {
			padding: initialPadding,
			maxZoom: 13.2,
		},
		pitch: 0,
		bearing: 0,
		antialias: true,
	});

	window._map = map;

	map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');
	map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');

	map.on('load', async () => {
		let resolvedParksData = null;
		// Hide road name labels from Mapbox basemap
		for (const layer of map.getStyle().layers) {
			if (layer.type === 'symbol' && layer['source-layer'] === 'road') {
				map.setLayoutProperty(layer.id, 'visibility', 'none');
			}
		}

		if (isPreceedencePage) {
			// Preceedence page: surrounding parks context only.
			resolvedParksData = await addNearbyParksLayer(map);
			await addDistanceRingsLayer(map, resolvedParksData);
		} else {
			// Site Analysis page: site analysis layers only (no surrounding parks).
			await addBuildingLayer(map);
			await addTreeLayer(map);
			await addParkLayer(map);
			await addTopographyHeatLayer(map);
			addStudyClipMask(map);
			await addStudyBoundaryLayer(map);
			await addContourLayer(map);
			await addFloodLayer(map);
			await addCsoOutfallsLayer(map);
			await addRemediationSitesLayer(map);
			await addBioswaleOpportunityLayer(map);
		}
		setupMapHandlers(map, resolvedParksData);
		wireLayerToggles(map);
		applyPageProfile(mapPage);
		wireObservableOverlay(map);
	});

	map.on('error', (e) => {
		console.error('[MAP] Mapbox error:', e.error || e);
	});

	return map;

	function applyPageProfile(page) {
		const parksPanel = document.getElementById('story-parks');
		const existingPanel = document.getElementById('story-existing');
		const bioswalePanel = document.getElementById('story-bioswale');

		const setChecked = (id, checked) => {
			const input = document.getElementById(id);
			if (!input) return;
			if (input.checked !== checked) {
				input.checked = checked;
				input.dispatchEvent(new Event('change'));
			}
		};

		if (page === 'preceedence' || page === 'map') {
			// Context map view: parks + distance only.
			setChecked('toggle-nearby-parks', true);
			setChecked('toggle-distance-rings', true);
			setChecked('toggle-buildings', false);
			setChecked('toggle-trees', false);
			setChecked('toggle-park', false);
			setChecked('toggle-contours', false);
			setChecked('toggle-flood', false);
			setChecked('toggle-cso', false);
			setChecked('toggle-remediation', false);
			setChecked('toggle-heat', false);
			setChecked('toggle-bioswale', false);
			setChecked('toggle-bounding', false);

			if (parksPanel) parksPanel.classList.add('active');
			if (existingPanel) existingPanel.classList.remove('active');
			if (bioswalePanel) bioswalePanel.classList.remove('active');
			return;
		}

		// Site analysis page: analysis overlays, no surrounding-park context overlays.
		setChecked('toggle-nearby-parks', false);
		setChecked('toggle-distance-rings', false);
		setChecked('toggle-buildings', false);
		setChecked('toggle-trees', false);
		setChecked('toggle-park', true);
		setChecked('toggle-contours', true);
		setChecked('toggle-flood', true);
		setChecked('toggle-cso', true);
		setChecked('toggle-remediation', true);
		setChecked('toggle-heat', true);
		setChecked('toggle-bioswale', true);
		setChecked('toggle-bounding', true);
		setChecked('toggle-observable', false);

		if (parksPanel) parksPanel.classList.remove('active');
		if (existingPanel) existingPanel.classList.add('active');
		if (bioswalePanel) bioswalePanel.classList.remove('active');
	}
}

function wireLayerToggles(map) {
	const toggles = [
		{ id: 'toggle-nearby-parks', layers: ['nearby-parks-fill', 'nearby-parks-outline', 'nearby-parks-outline-hover', 'nearby-parks-label'] },
		{ id: 'toggle-distance-rings', layers: ['distance-rings-line', 'distance-ring-labels', 'distance-spokes', 'distance-spoke-labels'] },
		{ id: 'toggle-buildings', layers: ['buildings-extrusion'] },
		{ id: 'toggle-trees',     layers: ['trees-circles', 'trees-labels'] },
		{ id: 'toggle-park',      layers: ['park-outline'] },
		{ id: 'toggle-contours',  layers: ['contour-lines'] },
		{ id: 'toggle-flood',     layers: ['flood-vulnerability-fill'] },
		{ id: 'toggle-cso',       layers: ['cso-outfalls-circle'] },
		{ id: 'toggle-remediation', layers: ['remediation-brownfield-fill', 'remediation-brownfield-line', 'remediation-superfund-fill', 'remediation-superfund-line', 'remediation-sites-labels'] },
		{ id: 'toggle-heat',      layers: ['topography-heatmap', 'study-clip-mask'] },
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

function wireObservableOverlay(map) {
	const toggle = document.getElementById('toggle-observable');
	const overlay = document.getElementById('observable-overlay');
	const frame = overlay ? overlay.querySelector('.observable-overlay-frame') : null;
	if (!toggle || !overlay || !frame) return;

	// Geographic bounding box matching the Observable SVG viewBox exactly.
	// SVG viewBox = "985230 184895 2025 912" in EPSG:2263 (NY State Plane feet),
	// converted to WGS84 using pyproj. This ensures the iframe covers the same
	// geographic extent as the SVG canvas so all drawn features align precisely.
	const SITE_NW = [-73.99646691, 40.67667396];
	const SITE_NE = [-73.98916640, 40.67667350];
	const SITE_SE = [-73.98916681, 40.67417027];
	const SITE_SW = [-73.99646705, 40.67417072];

	let renderListener = null;

	function positionFrame() {
		const nw = map.project(SITE_NW);
		const ne = map.project(SITE_NE);
		const se = map.project(SITE_SE);
		const sw = map.project(SITE_SW);
		const xs = [nw.x, ne.x, se.x, sw.x];
		const ys = [nw.y, ne.y, se.y, sw.y];
		const minX = Math.min(...xs);
		const maxX = Math.max(...xs);
		const minY = Math.min(...ys);
		const maxY = Math.max(...ys);
		frame.style.left   = minX + 'px';
		frame.style.top    = minY + 'px';
		frame.style.width  = (maxX - minX) + 'px';
		frame.style.height = (maxY - minY) + 'px';
	}

	const setChecked = (id, checked) => {
		const input = document.getElementById(id);
		if (!input) return;
		if (input.checked !== checked) {
			input.checked = checked;
			input.dispatchEvent(new Event('change'));
		}
	};

	const activateOverlay = () => {
		overlay.classList.add('active');
		setChecked('toggle-buildings', true);
		setChecked('toggle-park', true);
		map.easeTo({
			center: [-73.99300255771038, 40.67590074647642],
			zoom: 16.2,
			pitch: 0,
			bearing: 0,
			duration: 1100,
		});
		// Re-position every render frame so it tracks map moves
		if (!renderListener) {
			renderListener = () => positionFrame();
			map.on('render', renderListener);
		}
		positionFrame();
	};

	const deactivateOverlay = () => {
		overlay.classList.remove('active');
		if (renderListener) {
			map.off('render', renderListener);
			renderListener = null;
		}
		map.easeTo({
			pitch: 0,
			bearing: 0,
			duration: 650,
		});
	};

	toggle.addEventListener('change', () => {
		if (toggle.checked) activateOverlay();
		else deactivateOverlay();
	});

	if (toggle.checked) activateOverlay();
	else deactivateOverlay();
}

function initMapIntroSequence(map) {
	const parksPanel    = document.getElementById('story-parks');
	const existingPanel = document.getElementById('story-existing');
	const bioswalePanel = document.getElementById('story-bioswale');
	const studyBounds   = getStudyBounds(STUDY_RING);
	const heatToggle    = document.getElementById('toggle-heat');

	if (parksPanel)    parksPanel.classList.add('active');
	if (existingPanel) existingPanel.classList.remove('active');
	if (bioswalePanel) bioswalePanel.classList.remove('active');

	map.scrollZoom.disable();

	// Fixed zoom level for the topography close-up (Stage 2)
	const stageZoom = 14.8;

	let stage = 0;
	let transitioning = false;
	let userHeatPreference = null;

	if (heatToggle) {
		heatToggle.addEventListener('change', (event) => {
			if (event.isTrusted) {
				userHeatPreference = heatToggle.checked;
			}
		});
	}

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
			// Stage 0 - context view: surrounding parks highlighted, site hidden
			setChecked('toggle-nearby-parks', true);
			setChecked('toggle-bounding', false);
			setChecked('toggle-buildings', false);
			setChecked('toggle-trees', false);
			setChecked('toggle-park', false);
			setChecked('toggle-flood', false);
			setChecked('toggle-cso', false);
			setChecked('toggle-heat', false);
			setChecked('toggle-bioswale', false);
			setChecked('toggle-contours', false);
			setChecked('toggle-remediation', false);
			if (parksPanel)    parksPanel.classList.add('active');
			if (existingPanel) existingPanel.classList.remove('active');
			if (bioswalePanel) bioswalePanel.classList.remove('active');
			return;
		}

		if (stage === 1) {
			// Stage 1 - enter study site: boundary revealed, parks remain
			setChecked('toggle-nearby-parks', true);
			setChecked('toggle-bounding', true);
			setChecked('toggle-contours', false);
			setChecked('toggle-heat', false);
			setChecked('toggle-bioswale', false);
			setChecked('toggle-flood', false);
			setChecked('toggle-cso', false);
			if (parksPanel)    parksPanel.classList.remove('active');
			if (existingPanel) existingPanel.classList.add('active');
			if (bioswalePanel) bioswalePanel.classList.remove('active');
			return;
		}

		if (stage === 2) {
			// Stage 2 - topography reading: contours + heat
			setChecked('toggle-bounding', true);
			setChecked('toggle-contours', true);
			setChecked('toggle-heat', userHeatPreference ?? true);
			setChecked('toggle-bioswale', false);
			setChecked('toggle-flood', false);
			setChecked('toggle-cso', false);
			if (parksPanel)    parksPanel.classList.remove('active');
			if (existingPanel) existingPanel.classList.add('active');
			if (bioswalePanel) bioswalePanel.classList.remove('active');
			return;
		}

		// Stage 3+ - bioswale corridors revealed
		setChecked('toggle-bounding', true);
		setChecked('toggle-contours', true);
		setChecked('toggle-heat', userHeatPreference ?? true);
		setChecked('toggle-bioswale', true);
		setChecked('toggle-flood', false);
		setChecked('toggle-cso', false);
		if (parksPanel)    parksPanel.classList.remove('active');
		if (existingPanel) existingPanel.classList.remove('active');
		if (bioswalePanel) bioswalePanel.classList.add('active');
	};

	applyStage();

	map.getCanvas().addEventListener('wheel', (event) => {
		event.preventDefault();
		if (transitioning) return;

		if (stage === 0) {
			// First scroll: fly into study area
			transitioning = true;
			stage = 1;
			applyStage();
			map.fitBounds(studyBounds, {
				padding: getInitialFitPadding(),
				bearing: -40,
				pitch: 0,
				duration: 1500,
				easing: (t) => t * (2 - t),
			});
			window.setTimeout(() => { transitioning = false; }, 1550);
			return;
		}

		if (stage === 1) {
			// Second scroll: zoom in, reveal topography
			transitioning = true;
			stage = 2;
			applyStage();
			map.easeTo({
				pitch: 0,
				bearing: -40,
				zoom: stageZoom,
				duration: 1200,
				easing: (t) => t * (2 - t),
			});
			window.setTimeout(() => { transitioning = false; }, 1250);
			return;
		}

		if (stage === 2) {
			// Third scroll: reveal bioswale corridors
			transitioning = true;
			stage = 3;
			applyStage();
			map.fitBounds(studyBounds, {
				padding: getCenteredStagePadding(),
				bearing: -40,
				pitch: 0,
				duration: 980,
				easing: (t) => t * (2 - t),
			});
			window.setTimeout(() => { transitioning = false; }, 1020);
			return;
		}

		// Stage 3+: free pan/rotate with scroll
		const direction = event.deltaY > 0 ? -1 : 1;
		const nextBearing = map.getBearing() + direction * 4;
		map.easeTo({ pitch: 0, bearing: nextBearing, duration: 220 });
	}, { passive: false });
}

function getStudyBounds(ring) {
	let minLng = Infinity;
	let minLat = Infinity;
	let maxLng = -Infinity;
	let maxLat = -Infinity;

	for (const [lng, lat] of ring) {
		if (lng < minLng) minLng = lng;
		if (lng > maxLng) maxLng = lng;
		if (lat < minLat) minLat = lat;
		if (lat > maxLat) maxLat = lat;
	}

	return [
		[minLng, minLat],
		[maxLng, maxLat],
	];
}

function getInitialFitPadding() {
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const storyPanels = document.getElementById('map-story-panels');
	const rightPanelWidth = storyPanels ? Math.ceil(storyPanels.getBoundingClientRect().width) : 0;

	if (vw <= 800) {
		return {
			top: Math.max(76, Math.round(vh * 0.12)),
			right: 20,
			bottom: Math.max(34, Math.round(vh * 0.11)),
			left: 20,
		};
	}

	return {
		top: 94,
		right: Math.max(42, rightPanelWidth + 28),
		bottom: 42,
		left: 42,
	};
}

function getCenteredStagePadding() {
	const vw = window.innerWidth;
	const vh = window.innerHeight;

	if (vw <= 800) {
		return {
			top: Math.max(72, Math.round(vh * 0.11)),
			right: 20,
			bottom: Math.max(30, Math.round(vh * 0.08)),
			left: 20,
		};
	}

	// Equal side padding keeps the site centered on the full viewport.
	return {
		top: 86,
		right: 42,
		bottom: 36,
		left: 42,
	};
}
