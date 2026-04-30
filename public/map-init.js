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
		console.error('[MAP INIT] Mapbox GL JS is not loaded. Check the <script> tag in site-analysis.html.');
		mapDiv.innerHTML = '<p style="color:#e05;padding:2rem">Mapbox GL JS failed to load. Check console.</p>';
		return;
	}

	const token = await resolveMapboxToken();
	if (!token) {
		mapDiv.innerHTML = '<p style="color:#e05;padding:2rem">Mapbox token missing. Add your token to the &lt;meta name="mapbox-token"&gt; tag in site-analysis.html.</p>';
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
	const isAnalysisPage = (document.body?.dataset.mapPage || 'analysis') === 'analysis';
	const relatedPanel = document.getElementById('story-related');
	const existingPanel = document.getElementById('story-existing');
	const bioswalePanel = document.getElementById('story-bioswale');
	const relatedTitle = document.getElementById('related-panel-title');
	const relatedNote = document.getElementById('related-panel-note');
	const relatedIframe = document.getElementById('related-diagrams-iframe');

	const diagramByToggle = {
		'toggle-trees': {
			title: 'Tree Baseline Graphs',
			note: 'Street-tree species, health, interception, and density visuals.',
			section: 'section-supporting',
		},
		'toggle-buildings': {
			title: 'Urban Fabric Analysis',
			note: 'Building mix, industrial footprint, and structural intensity.',
			section: 'section-urban',
		},
		'toggle-park': {
			title: 'Rewilding Scenario',
			note: 'Before/after planting composition and ecological role distribution.',
			section: 'section-rewilding',
		},
		'toggle-flood': {
			title: 'Flood and Stormwater',
			note: 'Current/future flood pressure and outfall type distribution.',
			section: 'section-flood',
		},
		'toggle-cso': {
			title: 'Outfall and Flood Risk',
			note: 'CSO-linked vulnerability and stormwater network effects.',
			section: 'section-flood',
		},
		'toggle-remediation': {
			title: 'Planting Suitability',
			note: 'Contamination constraints translated into planting opportunity zones.',
			section: 'section-suitability',
		},
		'toggle-heat': {
			title: 'Suitability and Bioswale Opportunity',
			note: 'Low-point and hydrology-informed intervention potential.',
			section: 'section-suitability',
		},
		'toggle-bioswale': {
			title: 'Bioswale Opportunity',
			note: 'Open-corridor suitability scoring for bioswale deployment.',
			section: 'section-suitability',
		},
		'toggle-contours': {
			title: 'Canopy and Land-Cover Structure',
			note: 'Topographic and area context linked to canopy coverage targets.',
			section: 'section-canopy-goal',
		},
		'toggle-bounding': {
			title: 'Canopy Target Dashboard',
			note: 'Study-boundary metrics and canopy gap framing.',
			section: 'section-canopy-goal',
		},
	};

	const activateStoryPanel = (panelId) => {
		if (existingPanel) existingPanel.classList.remove('active');
		if (bioswalePanel) bioswalePanel.classList.remove('active');
		if (relatedPanel) relatedPanel.classList.remove('active');

		if (panelId === 'story-existing' && existingPanel) existingPanel.classList.add('active');
		if (panelId === 'story-bioswale' && bioswalePanel) bioswalePanel.classList.add('active');
		if (panelId === 'story-related' && relatedPanel) relatedPanel.classList.add('active');
	};

	const showRelatedDiagram = (toggleId) => {
		const config = diagramByToggle[toggleId];
		if (!config || !isAnalysisPage || !relatedPanel || !relatedIframe) return;

		if (relatedTitle) relatedTitle.textContent = config.title;
		if (relatedNote) relatedNote.textContent = config.note;

		const nextSrc = `/diagrams.html#${config.section}`;
		if (relatedIframe.getAttribute('src') !== nextSrc) {
			relatedIframe.setAttribute('src', nextSrc);
		}

		activateStoryPanel('story-related');
	};

	let lastUserToggleId = null;

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
		el.addEventListener('change', (event) => {
			applyVisibility();

			if (!isAnalysisPage || !event.isTrusted) return;

			if (el.checked && diagramByToggle[id]) {
				lastUserToggleId = id;
				showRelatedDiagram(id);
				return;
			}

			if (!el.checked && id === lastUserToggleId) {
				const nextToggleId = Object.keys(diagramByToggle).find((toggleId) => {
					const input = document.getElementById(toggleId);
					return input?.checked;
				});

				if (nextToggleId) {
					lastUserToggleId = nextToggleId;
					showRelatedDiagram(nextToggleId);
				} else {
					lastUserToggleId = null;
					activateStoryPanel('story-existing');
				}
			}
		});
		applyVisibility();
	}
}

function wireObservableOverlay(map) {
	const toggle = document.getElementById('toggle-observable');
	const modal  = document.getElementById('observable-modal');
	if (!toggle || !modal) return;

	const closeBtn = modal.querySelector('.observable-modal-close');
	const backdrop = modal.querySelector('.observable-modal-backdrop');

	const openModal = () => {
		modal.classList.add('active');
		modal.removeAttribute('aria-hidden');
		toggle.checked = true;
	};

	const closeModal = () => {
		modal.classList.remove('active');
		modal.setAttribute('aria-hidden', 'true');
		toggle.checked = false;
	};

	toggle.addEventListener('change', () => {
		if (toggle.checked) openModal();
		else closeModal();
	});

	if (closeBtn) closeBtn.addEventListener('click', closeModal);
	if (backdrop) backdrop.addEventListener('click', closeModal);

	// Close on Escape key
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
	});

	if (toggle.checked) openModal();
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
