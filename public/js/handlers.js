// handlers.js - Hover and click interactions for all map layers

// ─── Park Tree Data Enrichment ────────────────────────────────────────────────
// Published tree inventory data for parks with comprehensive catalogues.
// Source: Park alliances and historical records (TreeKeeper, published inventories).
// Used to supplement/validate OSM data when mapping is incomplete.
const PARK_TREE_ENRICHMENT = {
	'prospect-park': {
		expectedTreeCount: 16152, // TreeKeeper database (Prospect Park Alliance)
		dataSource: 'TreeKeeper',
		commonSpecies: [
			{ species: 'Quercus', count: 2400 },  // ~15% oaks
			{ species: 'Acer', count: 1800 },     // ~11% maples
			{ species: 'Carpinus betulus', count: 1200 }, // European hornbeam
			{ species: 'Fraxinus', count: 900 },  // ash
			{ species: 'Ulmus', count: 700 },     // elm
			{ species: 'Platanus', count: 600 },  // sycamore
		],
	},
	'green-wood-cemetery': {
		expectedTreeCount: 9048, // Green-Wood Living Tree Collection (ArcGIS FeatureServer)
		dataSource: 'Green-Wood Living Tree Collection',
		commonSpecies: [
			{ species: 'Acer platanoides', count: 1000 }, // Norway maple
			{ species: 'Quercus alba', count: 800 },      // white oak
			{ species: 'Pinus strobus', count: 600 },     // white pine
			{ species: 'Fagus grandifolia', count: 500 }, // American beech
		],
	},
	'carroll-park': {
		expectedTreeCount: 180,
		dataSource: 'Park records',
		commonSpecies: [
			{ species: 'Platanus acerifolia', count: 100 },  // London plane
			{ species: 'Gleditsia triacanthos', count: 60 }, // Honey locust
		],
	},
	'coffey-park': {
		expectedTreeCount: 220,
		dataSource: 'Park records',
		commonSpecies: [
			{ species: 'Quercus', count: 100 },
			{ species: 'Ulmus', count: 80 },
		],
	},
};

const STATIC_PARK_TREE_SOURCES = {
	'prospect-park': '/data/prospect-park-trees.geojson',
	'green-wood-cemetery': '/data/green-wood-trees.geojson',
};

const PARK_CALLOUT_OFFSETS = {
	'thomas-greene': [0.0062, 0.0005],
	'carroll-park': [0.0068, -0.0014],
	'coffey-park': [-0.0065, -0.0008],
	'prospect-park': [0.0068, -0.0022],
	'green-wood-cemetery': [-0.0075, -0.0018],
	'red-hook-recreation': [-0.0064, 0.0018],
	'governors-island': [0.0066, 0.0011],
};

const RACCOON_SVG_PATH = '/assets/fauna/racoon.svg';
let parkCalloutMarkers = [];
const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection', features: [] };

const PARK_FLORA_PROFILES = {
	'prospect-park': ['Black Cherry', 'Sweetgum', 'Serviceberry', 'River Birch'],
	'green-wood-cemetery': ['Dawn Redwood', 'American Beech', 'White Oak', 'Kentucky Coffeetree'],
	'governors-island': ['Meadow Grasses', 'Beach Plum', 'Switchgrass', 'Bayberry'],
	'carroll-park': ['London Plane', 'Honey Locust', 'Red Maple', 'American Elm'],
	'coffey-park': ['Oak', 'Elm', 'Sweetgum', 'Dogwood'],
	'red-hook-recreation': ['Salt Tolerant Grass', 'Beach Rose', 'Bayberry', 'Willow'],
	'thomas-greene': ['Street Tree Mix', 'Honey Locust', 'Sycamore', 'Ornamental Cherry'],
};

function parseArrayProp(value) {
	if (Array.isArray(value)) return value;
	if (typeof value !== 'string') return [];
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed : [];
	} catch (_) {
		return [];
	}
}

function dedupeKeepOrder(items) {
	const seen = new Set();
	const out = [];
	for (const raw of items || []) {
		const val = String(raw || '').trim();
		if (!val) continue;
		const key = val.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(val);
	}
	return out;
}

const SPECIES_SVG_FOLDER = '/assets/species';
const FAUNA_SVG_FOLDER = '/assets/fauna';
const PLACEHOLDER_SVG = '/assets/placeholder.svg';
const DEFAULT_FAUNA_RANGE_M = 800;

const FAUNA_PROFILE_RULES = [
	{ pattern: /heron|cormorant|tern|gull|osprey|sandpiper|scaup|merganser|bufflehead|dunlin|turtle|slider/i, habitat: 'waterfront', color: '#3b8ea5', rangeM: 2200 },
	{ pattern: /hawk|falcon|kestrel|owl|eagle/i, habitat: 'canopy edge', color: '#b26b3b', rangeM: 3200 },
	{ pattern: /warbler|oriole|grosbeak|hummingbird|thrush|sparrow|catbird|wren|robin|starling|grackle|dove|parakeet|blackpoll|wood thrush|ovenbird/i, habitat: 'woodland canopy', color: '#5b8f58', rangeM: 1300 },
	{ pattern: /squirrel|rabbit|cottontail|fox|raccoon|opossum/i, habitat: 'woodland ground', color: '#7a6f58', rangeM: 1100 },
	{ pattern: /butterfly|monarch|painted lady|pollinator/i, habitat: 'meadow / pollinator band', color: '#9a7ec2', rangeM: 900 },
];

const HABITAT_ANCHORS = {
	'waterfront': [0.82, 0.78],
	'canopy edge': [0.68, 0.32],
	'woodland canopy': [0.35, 0.35],
	'woodland ground': [0.42, 0.58],
	'meadow / pollinator band': [0.58, 0.54],
	default: [0.5, 0.5],
};

function slugifyName(name) {
	return String(name).toLowerCase().replace(/[()\[\]]/g, '').trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function getFaunaProfile(name) {
	const label = String(name || '').trim();
	for (const rule of FAUNA_PROFILE_RULES) {
		if (rule.pattern.test(label)) {
			return {
				habitat: rule.habitat,
				color: rule.color,
				rangeM: rule.rangeM,
			};
		}
	}
	return {
		habitat: 'mixed urban edge',
		color: '#6f7d90',
		rangeM: DEFAULT_FAUNA_RANGE_M,
	};
}

function makeColorDotSvgDataUri(color) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="12" fill="${color}"/><circle cx="20" cy="20" r="16" fill="none" stroke="${color}" stroke-opacity="0.38" stroke-width="2"/></svg>`;
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function faunaIconResolver(name) {
	return makeColorDotSvgDataUri(getFaunaProfile(name).color);
}

function renderGroupedFaunaList(elId, items, emptyLabel = 'No fauna list') {
	const el = document.getElementById(elId);
	if (!el) return;
	el.innerHTML = '';

	const fauna = dedupeKeepOrder(items).slice(0, 20);
	if (!fauna.length) {
		const li = document.createElement('li');
		li.textContent = emptyLabel;
		el.appendChild(li);
		return;
	}

	const groups = new Map();
	for (const animal of fauna) {
		const profile = getFaunaProfile(animal);
		const key = `${profile.color}|${profile.habitat}`;
		if (!groups.has(key)) {
			groups.set(key, {
				color: profile.color,
				habitat: profile.habitat,
				items: [],
			});
		}
		groups.get(key).items.push(animal);
	}

	for (const group of groups.values()) {
		const title = document.createElement('li');
		title.className = 'park-list-group-title';
		title.innerHTML = `<span class="park-group-dot" style="--group-dot:${group.color};"></span>${group.habitat}`;
		el.appendChild(title);

		for (const animal of group.items) {
			const li = document.createElement('li');
			li.className = 'park-list-item';
			const img = document.createElement('img');
			img.className = 'park-list-svg';
			img.alt = '';
			img.loading = 'lazy';
			img.src = faunaIconResolver(animal);
			const span = document.createElement('span');
			span.textContent = animal;
			li.appendChild(img);
			li.appendChild(span);
			el.appendChild(li);
		}
	}
}

function updateParkList(elId, items, emptyLabel = 'No data yet', svgFolder = null, iconResolver = null) {
	const el = document.getElementById(elId);
	if (!el) return;
	el.innerHTML = '';
	const values = dedupeKeepOrder(items).slice(0, 16);
	if (!values.length) {
		const li = document.createElement('li');
		li.textContent = emptyLabel;
		el.appendChild(li);
		return;
	}
	for (const item of values) {
		const li = document.createElement('li');
		li.className = 'park-list-item';
		const img = document.createElement('img');
		img.className = 'park-list-svg';
		img.alt = '';
		img.loading = 'lazy';
		if (typeof iconResolver === 'function') {
			img.src = iconResolver(item);
		} else if (svgFolder) {
			const slug = slugifyName(item);
			img.src = `${svgFolder}/${slug}.svg`;
			img.onerror = () => { img.src = PLACEHOLDER_SVG; img.onerror = null; };
		} else {
			img.src = PLACEHOLDER_SVG;
		}
		const span = document.createElement('span');
		span.textContent = item;
		li.appendChild(img);
		li.appendChild(span);
		el.appendChild(li);
	}
}

function fitFeatureToFramedViewport(map, feature) {
	const geom = feature?.geometry;
	if (!geom) return;
	const b = geometryBounds(geom);
	if (!Number.isFinite(b.minLon) || !Number.isFinite(b.minLat) || !Number.isFinite(b.maxLon) || !Number.isFinite(b.maxLat)) return;

	const isCompact = window.innerWidth <= 980;
	const padding = isCompact
		? { top: 270, right: 30, bottom: 30, left: 30 }
		: { top: 96, right: 600, bottom: 40, left: 350 };

	map.fitBounds(
		[[b.minLon, b.minLat], [b.maxLon, b.maxLat]],
		{
			padding,
			duration: 900,
			maxZoom: 16.2,
		}
	);
}
function getGeometryCentroid(geom) {
	if (!geom) return null;
	let ring = null;
	if (geom.type === 'Polygon') ring = geom.coordinates?.[0] || null;
	if (geom.type === 'MultiPolygon') ring = geom.coordinates?.[0]?.[0] || null;
	if (!Array.isArray(ring) || ring.length < 3) return null;

	let x = 0;
	let y = 0;
	let area = 0;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const xi = ring[i][0];
		const yi = ring[i][1];
		const xj = ring[j][0];
		const yj = ring[j][1];
		const f = xi * yj - xj * yi;
		x += (xi + xj) * f;
		y += (yi + yj) * f;
		area += f;
	}

	if (Math.abs(area) < 1e-12) {
		const avgLon = ring.reduce((s, c) => s + c[0], 0) / ring.length;
		const avgLat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
		return [avgLon, avgLat];
	}

	const factor = 1 / (3 * area);
	return [x * factor, y * factor];
}

function clearParkCallouts() {
	for (const marker of parkCalloutMarkers) marker.remove();
	parkCalloutMarkers = [];
}

function waitForMapIdle(map, timeoutMs = 1400) {
	return new Promise((resolve) => {
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			map.off('idle', finish);
			resolve();
		};

		map.once('idle', finish);
		window.setTimeout(finish, timeoutMs);
	});
}

function getParkContextLayerIds(map) {
	const styleLayers = map.getStyle?.().layers || [];
	const waterLayerIds = [];
	const pathLayerIds = [];

	for (const layer of styleLayers) {
		if (!layer?.id || layer.layout?.visibility === 'none') continue;
		const id = String(layer.id).toLowerCase();
		const sourceLayer = String(layer['source-layer'] || '').toLowerCase();
		const type = layer.type;

		const looksLikeWater = id.includes('water') || sourceLayer.includes('water');
		if (looksLikeWater && (type === 'line' || type === 'fill')) {
			waterLayerIds.push(layer.id);
			continue;
		}

		const looksLikePath = id.includes('path')
			|| sourceLayer.includes('path')
			|| id.includes('pedestrian')
			|| sourceLayer.includes('pedestrian')
			|| id.includes('steps')
			|| sourceLayer.includes('steps');
		if (looksLikePath && type === 'line') {
			pathLayerIds.push(layer.id);
		}
	}

	return { waterLayerIds, pathLayerIds };
}

function geometryTouchesPark(geom, parkGeom) {
	if (!geom || !parkGeom) return false;
	const samplePoints = [];
	const visit = (coords) => {
		for (const coord of coords || []) {
			if (Array.isArray(coord?.[0])) {
				visit(coord);
			} else if (Number.isFinite(coord?.[0]) && Number.isFinite(coord?.[1])) {
				samplePoints.push([coord[0], coord[1]]);
			}
		}
	};
	visit(geom.coordinates);
	if (!samplePoints.length) return false;
	return samplePoints.some((point) => pointInGeometry(point, parkGeom));
}

function clipLineToBbox(coords, bbox) {
	const { minLon, minLat, maxLon, maxLat } = bbox;
	const inBox = (pt) => pt[0] >= minLon && pt[0] <= maxLon && pt[1] >= minLat && pt[1] <= maxLat;
	const segments = [];
	let current = [];
	for (const pt of coords) {
		if (inBox(pt)) {
			current.push(pt);
		} else {
			if (current.length >= 2) segments.push(current);
			current = [];
		}
	}
	if (current.length >= 2) segments.push(current);
	return segments;
}

function clipGeometryToBbox(geom, bbox) {
	if (!geom || !bbox) return geom;
	if (geom.type === 'LineString') {
		const segs = clipLineToBbox(geom.coordinates, bbox);
		if (!segs.length) return null;
		return segs.length === 1
			? { type: 'LineString', coordinates: segs[0] }
			: { type: 'MultiLineString', coordinates: segs };
	}
	if (geom.type === 'MultiLineString') {
		const all = geom.coordinates.flatMap((line) => clipLineToBbox(line, bbox));
		if (!all.length) return null;
		return { type: 'MultiLineString', coordinates: all };
	}
	if (geom.type === 'Polygon') {
		const { minLon, minLat, maxLon, maxLat } = bbox;
		const filtered = (geom.coordinates[0] || []).filter(
			(pt) => pt[0] >= minLon && pt[0] <= maxLon && pt[1] >= minLat && pt[1] <= maxLat
		);
		if (filtered.length < 3) return null;
		return { type: 'Polygon', coordinates: [filtered] };
	}
	if (geom.type === 'MultiPolygon') {
		const { minLon, minLat, maxLon, maxLat } = bbox;
		const polys = geom.coordinates
			.map((poly) => {
				const filtered = (poly[0] || []).filter(
					(pt) => pt[0] >= minLon && pt[0] <= maxLon && pt[1] >= minLat && pt[1] <= maxLat
				);
				return filtered.length >= 3 ? [filtered] : null;
			})
			.filter(Boolean);
		if (!polys.length) return null;
		return { type: 'MultiPolygon', coordinates: polys };
	}
	return geom;
}

function dedupeRenderedFeatures(features, bbox) {
	const seen = new Set();
	const unique = [];
	for (const feature of features || []) {
		const idPart = feature.id ?? feature.properties?.id ?? feature.properties?.name ?? '';
		const coordsPart = JSON.stringify(feature.geometry?.coordinates || null);
		const key = `${feature.layer?.id || ''}:${feature.geometry?.type || ''}:${idPart}:${coordsPart}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const geometry = bbox ? clipGeometryToBbox(feature.geometry, bbox) : feature.geometry;
		if (!geometry) continue;
		unique.push({
			type: 'Feature',
			properties: { ...(feature.properties || {}) },
			geometry,
		});
	}
	return unique;
}

function collectRenderedParkContextFeatures(map, parkFeature, layerIds) {
	if (!Array.isArray(layerIds) || !layerIds.length) return [];
	const bbox = geometryBounds(parkFeature?.geometry);
	if (!Number.isFinite(bbox.minLon) || !Number.isFinite(bbox.minLat) || !Number.isFinite(bbox.maxLon) || !Number.isFinite(bbox.maxLat)) {
		return [];
	}

	const points = [
		map.project([bbox.minLon, bbox.maxLat]),
		map.project([bbox.maxLon, bbox.minLat]),
	];
	const rendered = map.queryRenderedFeatures(points, { layers: layerIds });
	const filtered = rendered.filter((feature) => geometryTouchesPark(feature.geometry, parkFeature.geometry));
	return dedupeRenderedFeatures(filtered, bbox);
}

function ensureParkContextOverlayLayers(map) {
	if (!map.getSource('selected-park-water')) {
		map.addSource('selected-park-water', {
			type: 'geojson',
			data: EMPTY_FEATURE_COLLECTION,
		});
	}

	if (!map.getSource('selected-park-paths')) {
		map.addSource('selected-park-paths', {
			type: 'geojson',
			data: EMPTY_FEATURE_COLLECTION,
		});
	}

	if (!map.getLayer('selected-park-water-fill')) {
		map.addLayer({
			id: 'selected-park-water-fill',
			type: 'fill',
			source: 'selected-park-water',
			paint: {
				'fill-color': '#4b8fe8',
				'fill-opacity': 0.18,
			},
		}, 'nearby-parks-label');
	}

	if (!map.getLayer('selected-park-water-outline')) {
		map.addLayer({
			id: 'selected-park-water-outline',
			type: 'line',
			source: 'selected-park-water',
			paint: {
				'line-color': '#2f78de',
				'line-width': 2,
				'line-opacity': 0.95,
			},
		}, 'nearby-parks-label');
	}

	if (!map.getLayer('selected-park-paths-outline')) {
		map.addLayer({
			id: 'selected-park-paths-outline',
			type: 'line',
			source: 'selected-park-paths',
			layout: {
				'line-join': 'round',
				'line-cap': 'round',
			},
			paint: {
				'line-color': '#d94135',
				'line-width': [
					'interpolate', ['linear'], ['zoom'],
					11, 1.3,
					16, 2.6,
				],
				'line-opacity': 0.95,
			},
		}, 'nearby-parks-label');
	}
}

function clearSelectedParkContext(map) {
	const waterSource = map.getSource('selected-park-water');
	const pathSource = map.getSource('selected-park-paths');
	const faunaRangeSource = map.getSource('preceedence-fauna-ranges');
	const faunaPointSource = map.getSource('preceedence-fauna-points');
	if (waterSource) waterSource.setData(EMPTY_FEATURE_COLLECTION);
	if (pathSource) pathSource.setData(EMPTY_FEATURE_COLLECTION);
	if (faunaRangeSource) faunaRangeSource.setData(EMPTY_FEATURE_COLLECTION);
	if (faunaPointSource) faunaPointSource.setData(EMPTY_FEATURE_COLLECTION);
}

async function updateSelectedParkContext(map, parkFeature) {
	if (!parkFeature?.geometry) return;
	ensureParkContextOverlayLayers(map);
	await waitForMapIdle(map);
	const { waterLayerIds, pathLayerIds } = getParkContextLayerIds(map);
	const waterFeatures = collectRenderedParkContextFeatures(map, parkFeature, waterLayerIds);
	const pathFeatures = collectRenderedParkContextFeatures(map, parkFeature, pathLayerIds);
	const waterSource = map.getSource('selected-park-water');
	const pathSource = map.getSource('selected-park-paths');
	if (waterSource) waterSource.setData({ type: 'FeatureCollection', features: waterFeatures });
	if (pathSource) pathSource.setData({ type: 'FeatureCollection', features: pathFeatures });
}

async function resolveNearbyParksForCallouts(fallbackData = null) {
	if (fallbackData?.features?.length) return fallbackData;

	const source = window._map?.getSource?.('nearby-parks');
	const sourceData = source?._data;
	if (sourceData?.features?.length) return sourceData;

	try {
		const res = await fetch('/data/nearby-parks.geojson');
		if (!res.ok) return null;
		const data = await res.json();
		return data?.features?.length ? data : null;
	} catch (err) {
		console.warn('[HANDLERS] Nearby parks fallback load failed:', err);
		return null;
	}
}

function setupPreceedenceParkCallouts(map, parksData) {
	if (!parksData?.features?.length) return;

	clearParkCallouts();

	if (map.getLayer('nearby-parks-label')) {
		map.setLayoutProperty('nearby-parks-label', 'visibility', 'none');
	}

	const lineFeatures = [];

	for (const feature of parksData.features) {
		const props = feature?.properties || {};
		const id = String(props.id || '');
		const centroid = getGeometryCentroid(feature?.geometry);
		if (!centroid) continue;

		const [dx, dy] = PARK_CALLOUT_OFFSETS[id] || [0.0048, 0.0012];
		const labelLngLat = [centroid[0] + dx, centroid[1] + dy];

		lineFeatures.push({
			type: 'Feature',
			properties: { id },
			geometry: {
				type: 'LineString',
				coordinates: [centroid, labelLngLat],
			},
		});

		const wildlife = Array.isArray(props.wildlife) ? props.wildlife : [];
		const wildlifePreview = wildlife.slice(0, 2).join(', ');

		const el = document.createElement('button');
		el.type = 'button';
		el.className = 'park-callout';
		el.innerHTML = `
			<div class="park-callout-head">
				<span class="park-callout-title">${props.name || 'Park'}</span>
				<img class="park-callout-icon" src="${RACCOON_SVG_PATH}" alt="Racoon icon" loading="lazy">
			</div>
			<div class="park-callout-meta">${props.distance_label || ''}</div>
			<div class="park-callout-meta">${props.area_acres || '?'} ac</div>
			${wildlifePreview ? `<div class="park-callout-meta">${wildlifePreview}</div>` : ''}
		`;

		el.addEventListener('click', async () => {
			el.style.display = 'none';
			fitFeatureToFramedViewport(map, feature);
			openParkPanel(props);
			try {
				await Promise.all([
					updateSelectedParkContext(map, feature),
					analyzePreceedenceParkTrees(map, feature),
				]);
			} catch (err) {
				console.warn('[HANDLERS] Callout analysis failed:', err);
			}
		});

		const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
			.setLngLat(labelLngLat)
			.addTo(map);
		parkCalloutMarkers.push(marker);
	}

	if (map.getLayer('park-callout-lines')) map.removeLayer('park-callout-lines');
	if (map.getSource('park-callout-lines')) map.removeSource('park-callout-lines');

	map.addSource('park-callout-lines', {
		type: 'geojson',
		data: {
			type: 'FeatureCollection',
			features: lineFeatures,
		},
	});

	const beforeLayerId = map.getLayer('distance-rings-line') ? 'distance-rings-line' : undefined;

	map.addLayer({
		id: 'park-callout-lines',
		type: 'line',
		source: 'park-callout-lines',
		paint: {
			'line-color': 'rgba(58, 116, 82, 0.68)',
			'line-width': 1.3,
			'line-dasharray': [2.2, 1.2],
		},
	}, beforeLayerId);
}

// Normalize species names by parsing common OSM patterns
function normalizeSpeciesName(row) {
	if (!row) return 'Unknown';
	
	// Use explicit species if present
	if (row.species) {
		const sp = String(row.species).trim();
		if (sp && sp.length < 60 && sp !== 'Unknown') return sp;
	}
	
	// Fall back to genus
	if (row.genus) return String(row.genus).trim() || 'Unknown';
	
	// Taxon as last resort
	if (row.taxon) return String(row.taxon).trim() || 'Unknown';
	
	return 'Unknown';
}

function isMobileDrawerViewport() {
	return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
}

function setMobileDrawerExpanded(panel, expanded) {
	if (!panel || !isMobileDrawerViewport()) return;
	panel.classList.toggle('is-expanded', !!expanded);
	panel.classList.toggle('is-collapsed', !expanded);
	const header = document.getElementById('mobile-info-drawer-header');
	if (header) header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function ensureMobileDrawerWiring() {
	const panel = document.getElementById('park-info-panel');
	const header = document.getElementById('mobile-info-drawer-header');
	const toggle = document.getElementById('mobile-info-drawer-toggle');
	if (!panel || !header || !toggle || header.dataset.drawerBound === '1') return;

	const toggleDrawer = (event) => {
		if (event) event.preventDefault();
		if (!isMobileDrawerViewport()) return;
		if (!panel.classList.contains('active')) panel.classList.add('active');
		const shouldExpand = !panel.classList.contains('is-expanded');
		setMobileDrawerExpanded(panel, shouldExpand);
	};

	header.addEventListener('click', toggleDrawer);
	header.addEventListener('keydown', (event) => {
		if (event.key === 'Enter' || event.key === ' ') {
			toggleDrawer(event);
		}
	});
	toggle.addEventListener('click', (event) => {
		event.stopPropagation();
		toggleDrawer(event);
	});
	toggle.addEventListener('pointerup', (event) => {
		event.stopPropagation();
		toggleDrawer(event);
	});

	header.dataset.drawerBound = '1';
}

// ─── Park info panel ──────────────────────────────────────────────────────────
function openParkPanel(props) {
	const panel      = document.getElementById('park-info-panel');
	const imgEl      = document.getElementById('park-panel-image');
	const imgPhEl    = document.getElementById('park-panel-image-placeholder');
	const nameEl     = document.getElementById('park-panel-name');
	const distEl     = document.getElementById('park-panel-distance');
	const areaEl     = document.getElementById('park-panel-area');
	const estEl      = document.getElementById('park-panel-established');
	const descEl     = document.getElementById('park-panel-desc');
	const ecoEl      = document.getElementById('park-panel-ecology');
	const wildlifeEl = document.getElementById('park-panel-wildlife');
	const programsEl = document.getElementById('park-panel-programs');
	const linkEl     = document.getElementById('park-panel-link');

	if (!panel) return;

	if (nameEl) nameEl.textContent = props.name || 'Park';
	if (distEl) distEl.textContent = props.distance_label || '';
	if (areaEl) areaEl.textContent = props.area_acres ? `${props.area_acres} ac` : '';
	if (estEl) estEl.textContent  = props.established ? `Est. ${props.established}` : '';
	if (descEl) descEl.textContent = props.description || '';
	if (ecoEl) ecoEl.textContent  = props.ecology_note || '';

	if (linkEl) {
		linkEl.href = props.link || '#';
		linkEl.style.display = props.link ? 'inline-block' : 'none';
	}

	const mobileTitle = document.getElementById('mobile-drawer-title');
	const mobileSubtitle = document.getElementById('mobile-drawer-subtitle');
	if (mobileTitle) mobileTitle.textContent = props.name || 'Park details';
	if (mobileSubtitle) {
		const distanceText = props.distance_label || props.established ? `${props.distance_label || ''}${props.distance_label && props.established ? ' · ' : ''}${props.established ? `Est. ${props.established}` : ''}` : 'Tap Info to expand details';
		mobileSubtitle.textContent = distanceText;
	}


	const fauna = parseArrayProp(props.wildlife);
	renderGroupedFaunaList('park-fauna-list', fauna, 'No fauna list');

	panel.classList.add('active');
	ensureMobileDrawerWiring();
	if (isMobileDrawerViewport()) {
		setMobileDrawerExpanded(panel, false);
	} else {
		panel.classList.remove('is-collapsed', 'is-expanded');
	}
}

const osmDotCache = new Map();
const parkInventoryCache = new Map();
const estimatedDotCache = new Map();
const mappedDotCache = new Map();

function pointInRing(point, ring) {
	const x = point[0];
	const y = point[1];
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const xi = ring[i][0];
		const yi = ring[i][1];
		const xj = ring[j][0];
		const yj = ring[j][1];
		const intersects = ((yi > y) !== (yj > y))
			&& (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
		if (intersects) inside = !inside;
	}
	return inside;
}

function pointInGeometry(point, geom) {
	if (!geom) return false;

	if (geom.type === 'Polygon') {
		const [outer, ...holes] = geom.coordinates || [];
		if (!outer || !pointInRing(point, outer)) return false;
		for (const hole of holes) {
			if (hole && pointInRing(point, hole)) return false;
		}
		return true;
	}

	if (geom.type === 'MultiPolygon') {
		for (const polygon of (geom.coordinates || [])) {
			const [outer, ...holes] = polygon || [];
			if (!outer || !pointInRing(point, outer)) continue;
			let inHole = false;
			for (const hole of holes) {
				if (hole && pointInRing(point, hole)) {
					inHole = true;
					break;
				}
			}
			if (!inHole) return true;
		}
	}

	return false;
}

function geometryBounds(geom) {
	let minLon = Infinity;
	let minLat = Infinity;
	let maxLon = -Infinity;
	let maxLat = -Infinity;

	const visit = (coords) => {
		for (const c of coords) {
			if (Array.isArray(c[0])) visit(c);
			else {
				const lon = c[0];
				const lat = c[1];
				if (lon < minLon) minLon = lon;
				if (lon > maxLon) maxLon = lon;
				if (lat < minLat) minLat = lat;
				if (lat > maxLat) maxLat = lat;
			}
		}
	};

	if (geom?.coordinates) visit(geom.coordinates);
	return { minLon, minLat, maxLon, maxLat };
}

function ringAreaSqMeters(ring) {
	if (!ring || ring.length < 3) return 0;
	const lat0 = ring[0][1] * Math.PI / 180;
	const mPerDegLon = 111320 * Math.cos(lat0);
	const mPerDegLat = 110540;
	let sum = 0;
	for (let i = 0; i < ring.length - 1; i++) {
		const x1 = ring[i][0] * mPerDegLon;
		const y1 = ring[i][1] * mPerDegLat;
		const x2 = ring[i + 1][0] * mPerDegLon;
		const y2 = ring[i + 1][1] * mPerDegLat;
		sum += x1 * y2 - x2 * y1;
	}
	return Math.abs(sum) * 0.5;
}

function ringPerimeterMeters(ring) {
	if (!ring || ring.length < 2) return 0;
	let total = 0;
	for (let i = 0; i < ring.length - 1; i++) {
		const [lon1, lat1] = ring[i];
		const [lon2, lat2] = ring[i + 1];
		const avgLat = ((lat1 + lat2) * 0.5) * Math.PI / 180;
		const dx = (lon2 - lon1) * 111320 * Math.cos(avgLat);
		const dy = (lat2 - lat1) * 110540;
		total += Math.hypot(dx, dy);
	}
	return total;
}

function geometryAreaPerimeter(geom) {
	let area = 0;
	let perimeter = 0;
	if (!geom) return { area, perimeter };

	if (geom.type === 'Polygon') {
		const [outer] = geom.coordinates || [];
		area += ringAreaSqMeters(outer);
		perimeter += ringPerimeterMeters(outer);
	}

	if (geom.type === 'MultiPolygon') {
		for (const polygon of (geom.coordinates || [])) {
			const [outer] = polygon || [];
			area += ringAreaSqMeters(outer);
			perimeter += ringPerimeterMeters(outer);
		}
	}

	return { area, perimeter };
}

function ensurePreceedenceTreeLayer(map) {
	if (!map.getSource('preceedence-park-tree-dots')) {
		map.addSource('preceedence-park-tree-dots', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] },
		});
	}

	if (!map.getLayer('preceedence-park-tree-dots')) {
		map.addLayer({
			id: 'preceedence-park-tree-dots',
			type: 'circle',
			source: 'preceedence-park-tree-dots',
			paint: {
				'circle-radius': [
					'interpolate', ['linear'], ['zoom'],
					10, 1.5,
					13, 2.4,
					16, 3.2,
				],
				'circle-color': '#1f6f45',
				'circle-opacity': 0.75,
				'circle-stroke-color': 'rgba(255,255,255,0.55)',
				'circle-stroke-width': 0.6,
			},
			layout: { visibility: 'visible' },
		}, 'nearby-parks-label');
	}
}

function ensurePreceedenceFaunaLayers(map) {
	if (!map.getSource('preceedence-fauna-ranges')) {
		map.addSource('preceedence-fauna-ranges', {
			type: 'geojson',
			data: EMPTY_FEATURE_COLLECTION,
		});
	}

	if (!map.getSource('preceedence-fauna-points')) {
		map.addSource('preceedence-fauna-points', {
			type: 'geojson',
			data: EMPTY_FEATURE_COLLECTION,
		});
	}

	if (!map.getLayer('preceedence-fauna-ranges-fill')) {
		map.addLayer({
			id: 'preceedence-fauna-ranges-fill',
			type: 'fill',
			source: 'preceedence-fauna-ranges',
			paint: {
				'fill-color': ['get', 'color'],
				'fill-opacity': 0.08,
			},
		}, 'nearby-parks-label');
	}

	if (!map.getLayer('preceedence-fauna-ranges-line')) {
		map.addLayer({
			id: 'preceedence-fauna-ranges-line',
			type: 'line',
			source: 'preceedence-fauna-ranges',
			paint: {
				'line-color': ['get', 'color'],
				'line-width': 1.6,
				'line-opacity': 0.68,
			},
		}, 'nearby-parks-label');
	}

	if (!map.getLayer('preceedence-fauna-points')) {
		map.addLayer({
			id: 'preceedence-fauna-points',
			type: 'circle',
			source: 'preceedence-fauna-points',
			paint: {
				'circle-color': ['get', 'color'],
				'circle-radius': [
					'interpolate', ['linear'], ['zoom'],
					10, 4,
					14, 6,
					17, 8,
				],
				'circle-opacity': 0.95,
				'circle-stroke-color': 'rgba(255,255,255,0.75)',
				'circle-stroke-width': 0.8,
			},
		}, 'nearby-parks-label');
	}
}

function buildRangePolygon(center, radiusM, steps = 48) {
	const [lon, lat] = center;
	const latRad = (lat * Math.PI) / 180;
	const mPerDegLat = 110540;
	const mPerDegLon = Math.max(1e-6, 111320 * Math.cos(latRad));
	const coords = [];
	for (let i = 0; i <= steps; i += 1) {
		const theta = (i / steps) * Math.PI * 2;
		const dLon = (Math.cos(theta) * radiusM) / mPerDegLon;
		const dLat = (Math.sin(theta) * radiusM) / mPerDegLat;
		coords.push([lon + dLon, lat + dLat]);
	}
	return {
		type: 'Polygon',
		coordinates: [coords],
	};
}

function getHabitatPointForAnimal(geom, animalName, habitat) {
	const bbox = geometryBounds(geom);
	if (!Number.isFinite(bbox.minLon) || !Number.isFinite(bbox.minLat) || !Number.isFinite(bbox.maxLon) || !Number.isFinite(bbox.maxLat)) {
		return getGeometryCentroid(geom) || [0, 0];
	}

	const anchor = HABITAT_ANCHORS[habitat] || HABITAT_ANCHORS.default;
	const w = bbox.maxLon - bbox.minLon;
	const h = bbox.maxLat - bbox.minLat;
	const rand = seededRandom(hashString(`${animalName}:${habitat}`));

	for (let i = 0; i < 44; i += 1) {
		const jitterX = (rand() - 0.5) * 0.22;
		const jitterY = (rand() - 0.5) * 0.22;
		const x = Math.min(0.92, Math.max(0.08, anchor[0] + jitterX));
		const y = Math.min(0.92, Math.max(0.08, anchor[1] + jitterY));
		const lon = bbox.minLon + w * x;
		const lat = bbox.minLat + h * y;
		if (pointInGeometry([lon, lat], geom)) return [lon, lat];
	}

	return getGeometryCentroid(geom) || [bbox.minLon + w * 0.5, bbox.minLat + h * 0.5];
}

function updatePreceedenceFaunaOverlays(map, feature, faunaItems) {
	if (!feature?.geometry) return;
	ensurePreceedenceFaunaLayers(map);

	const fauna = dedupeKeepOrder(faunaItems).slice(0, 20);
	const pointFeatures = [];
	const groupAccumulator = new Map();

	for (const animal of fauna) {
		const profile = getFaunaProfile(animal);
		const center = getHabitatPointForAnimal(feature.geometry, animal, profile.habitat);
		const rangeM = Number.isFinite(profile.rangeM) ? profile.rangeM : DEFAULT_FAUNA_RANGE_M;
		const groupKey = `${profile.color}|${profile.habitat}`;

		pointFeatures.push({
			type: 'Feature',
			properties: {
				animal,
				habitat: profile.habitat,
				color: profile.color,
				range_m: rangeM,
			},
			geometry: {
				type: 'Point',
				coordinates: center,
			},
		});

		if (!groupAccumulator.has(groupKey)) {
			groupAccumulator.set(groupKey, {
				color: profile.color,
				habitat: profile.habitat,
				rangeM,
				centers: [],
			});
		}
		const group = groupAccumulator.get(groupKey);
		group.rangeM = Math.max(group.rangeM, rangeM);
		group.centers.push(center);
	}

	const rangeFeatures = [];
	for (const group of groupAccumulator.values()) {
		const count = group.centers.length || 1;
		const avgLon = group.centers.reduce((sum, c) => sum + c[0], 0) / count;
		const avgLat = group.centers.reduce((sum, c) => sum + c[1], 0) / count;
		rangeFeatures.push({
			type: 'Feature',
			properties: {
				habitat: group.habitat,
				color: group.color,
				range_m: group.rangeM,
			},
			geometry: buildRangePolygon([avgLon, avgLat], group.rangeM),
		});
	}

	const rangeSource = map.getSource('preceedence-fauna-ranges');
	const pointSource = map.getSource('preceedence-fauna-points');
	if (rangeSource) rangeSource.setData({ type: 'FeatureCollection', features: rangeFeatures });
	if (pointSource) pointSource.setData({ type: 'FeatureCollection', features: pointFeatures });
}

function hashString(seed) {
	let h = 2166136261;
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

function seededRandom(seed) {
	let t = seed >>> 0;
	return () => {
		t += 0x6d2b79f5;
		let v = Math.imul(t ^ (t >>> 15), t | 1);
		v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
		return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
	};
}

function generateEstimatedDots(geom, count, seedKey) {
	const dots = [];
	const bbox = geometryBounds(geom);
	const rand = seededRandom(hashString(seedKey));
	const maxAttempts = Math.max(500, count * 20);
	let attempts = 0;

	while (dots.length < count && attempts < maxAttempts) {
		attempts += 1;
		const lon = bbox.minLon + rand() * (bbox.maxLon - bbox.minLon);
		const lat = bbox.minLat + rand() * (bbox.maxLat - bbox.minLat);
		if (!pointInGeometry([lon, lat], geom)) continue;
		dots.push({
			type: 'Feature',
			properties: { species: 'Estimated canopy' },
			geometry: { type: 'Point', coordinates: [lon, lat] },
		});
	}

	return dots;
}

function sampleRowsDeterministic(rows, limit, seedKey) {
	if (!Array.isArray(rows) || rows.length <= limit) return rows || [];
	const rand = seededRandom(hashString(`${seedKey}:${rows.length}:${limit}`));
	const pool = rows.slice();
	for (let i = pool.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		const temp = pool[i];
		pool[i] = pool[j];
		pool[j] = temp;
	}
	return pool.slice(0, limit);
}

function getMappedDotsCached(rows, maxDots, seedKey) {
	const key = `${seedKey}:${rows.length}:${maxDots}`;
	if (mappedDotCache.has(key)) return mappedDotCache.get(key);
	const subset = sampleRowsDeterministic(rows, maxDots, seedKey);
	const dots = subset.map((row) => ({
		type: 'Feature',
		properties: { species: normalizeSpeciesName(row) },
		geometry: { type: 'Point', coordinates: [row.lon, row.lat] },
	}));
	mappedDotCache.set(key, dots);
	return dots;
}

function getEstimatedDotsCached(geom, count, seedKey) {
	const key = `${seedKey}:${count}`;
	if (estimatedDotCache.has(key)) return estimatedDotCache.get(key);
	const dots = generateEstimatedDots(geom, count, seedKey);
	estimatedDotCache.set(key, dots);
	return dots;
}

async function loadOsmTreesForGeometry(geom, parkKey) {
	if (osmDotCache.has(parkKey)) return osmDotCache.get(parkKey);

	const bbox = geometryBounds(geom);
	if (!Number.isFinite(bbox.minLon) || !Number.isFinite(bbox.minLat) || !Number.isFinite(bbox.maxLon) || !Number.isFinite(bbox.maxLat)) {
		return [];
	}

	const staticSource = STATIC_PARK_TREE_SOURCES[parkKey];
	if (staticSource) {
		try {
			const res = await fetch(staticSource);
			if (res.ok) {
				const data = await res.json();
				let rows = (data?.features || [])
					.filter((f) => f?.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates))
					.map((f) => {
						const [lon, lat] = f.geometry.coordinates;
						const p = f.properties || {};
						return {
							id: p.id || null,
							lon,
							lat,
							species: p.species || null,
							genus: p.genus || null,
							taxon: p.taxon || null,
							source: p.source || 'static_geojson',
						};
					})
					.filter((row) => Number.isFinite(row.lon) && Number.isFinite(row.lat));

				// Keep Prospect points constrained to the clicked park bbox.
				if (parkKey === 'prospect-park') {
					rows = rows.filter((row) => (
						row.lon >= bbox.minLon
						&& row.lon <= bbox.maxLon
						&& row.lat >= bbox.minLat
						&& row.lat <= bbox.maxLat
					));
				}

				osmDotCache.set(parkKey, rows);
				return rows;
			}
		} catch (err) {
			console.warn('[HANDLERS] Static park tree source failed, falling back to API:', err);
		}
	}

	const params = new URLSearchParams({
		minLon: String(bbox.minLon),
		minLat: String(bbox.minLat),
		maxLon: String(bbox.maxLon),
		maxLat: String(bbox.maxLat),
	});

	try {
		const isProspectPark = parkKey === 'prospect-park';
		const isGreenWood = parkKey === 'green-wood-cemetery';
		const apiUrl = isProspectPark
			? '/api/prospect-park-trees'
			: isGreenWood
				? '/api/green-wood-trees'
			: `/api/osm-park-trees?${params.toString()}`;
		const res = await fetch(apiUrl);
		if (!res.ok) return [];
		const data = await res.json();
		const shouldTrustParkSpecificSource = isProspectPark || isGreenWood;
		const rows = shouldTrustParkSpecificSource
			? (data.rows || [])
			: (data.rows || []).filter((row) => pointInGeometry([row.lon, row.lat], geom));
		osmDotCache.set(parkKey, rows);
		return rows;
	} catch (err) {
		console.warn('[HANDLERS] Tree data fetch failed:', err);
		return [];
	}
}

async function loadGovernorsIslandInventory() {
	const cacheKey = 'governors-island';
	if (parkInventoryCache.has(cacheKey)) return parkInventoryCache.get(cacheKey);

	try {
		const res = await fetch('/api/governors-island-trees');
		if (!res.ok) return null;
		const data = await res.json();
		parkInventoryCache.set(cacheKey, data);
		return data;
	} catch (err) {
		console.warn('[HANDLERS] Governors inventory fetch failed:', err);
		return null;
	}
}

function renderPreceedenceDiagram({ treeCount, areaAcres, densityPerAcre, compactness, topSpecies, mode, parkEnrichment }) {
	const metricsEl = document.getElementById('park-tree-metrics');
	const barsEl = document.getElementById('park-tree-type-bars');
	const noteEl = document.getElementById('park-tree-note');
	if (!metricsEl || !barsEl || !noteEl) return;
	
	let dataLabel = 'Observed';
	let noteText = 'Dots represent observed street-tree records in this park.';
	
	if (mode === 'osm') {
		dataLabel = 'Mapped';
		noteText = 'Dots are researched mapped tree locations from OpenStreetMap/Overpass inside this park boundary. Density reflects mapped tree points.';
	} else if (mode === 'treekeeper') {
		dataLabel = 'Mapped';
		noteText = 'Dots are direct mapped tree points from Prospect Park TreeKeeper (GeoServer WFS), filtered to park boundary.';
	} else if (mode === 'greenwood_official') {
		dataLabel = 'Mapped';
		noteText = 'Dots are direct mapped tree points from Green-Wood\'s official Living Tree Collection ArcGIS layer, filtered to park boundary.';
	} else if (mode === 'governors_inventory') {
		dataLabel = 'Published';
		noteText = 'Counts and species come from Governors Island TreePlotter. Dot distribution is modeled as a representative sample for faster interaction because their public endpoint provides inventory metrics but not raw per-tree point export.';
	} else if (mode === 'osm_with_reference') {
		dataLabel = 'Mapped';
		const source = parkEnrichment?.dataSource || 'Published';
		noteText = `Dots are mapped tree locations from OpenStreetMap/Overpass. ${source} inventory (${parkEnrichment?.expectedTreeCount} total trees) may show additional documented trees not yet mapped in OSM.`;
	} else if (mode === 'enriched') {
		dataLabel = 'Published';
		const source = parkEnrichment?.dataSource || 'Published';
		noteText = `Data from ${source}: ${parkEnrichment?.expectedTreeCount} catalogued trees. Dot distribution is modeled. Actual tree locations will be more precise once mapped in OpenStreetMap.`;
	} else if (mode === 'estimated') {
		dataLabel = 'Estimated';
		noteText = 'No mapped tree points were returned for this park. Dot pattern is an estimated fallback based on park area.';
	}

	metricsEl.innerHTML = `
		<div class="park-tree-metric"><span>Trees (${dataLabel})</span><strong>${treeCount}</strong></div>
		<div class="park-tree-metric"><span>Density</span><strong>${densityPerAcre.toFixed(1)} / acre</strong></div>
		<div class="park-tree-metric"><span>Area</span><strong>${areaAcres.toFixed(1)} ac</strong></div>
		<div class="park-tree-metric"><span>Shape</span><strong>${compactness.toFixed(2)}</strong></div>
	`;

	const countValues = topSpecies
		.map((d) => Number(d.count))
		.filter((v) => Number.isFinite(v) && v > 0);
	const max = countValues.length ? Math.max(...countValues) : 1;
	barsEl.innerHTML = topSpecies.length
		? topSpecies.map((d) => `
			<div class="park-tree-bar-row">
				<span class="park-tree-bar-label">${d.species}</span>
				<div class="park-tree-bar-track"><span class="park-tree-bar-fill" style="width:${Number.isFinite(Number(d.count)) && Number(d.count) > 0 ? (Number(d.count) / max) * 100 : 0}%"></span></div>
				<span class="park-tree-bar-value">${Number.isFinite(Number(d.count)) && Number(d.count) > 0 ? Number(d.count) : 'n/a'}</span>
			</div>
		`).join('')
		: '<p class="park-tree-empty">Species breakdown not available for this park in the source dataset.</p>';

	noteEl.textContent = noteText;
}

async function analyzePreceedenceParkTrees(map, feature) {
	const metricsEl = document.getElementById('park-tree-metrics');
	if (!metricsEl) return;

	const geom = feature?.geometry;
	if (!geom) return;

	const parkKey = String(feature?.properties?.id || feature?.properties?.name || 'park');
	const mappedTrees = await loadOsmTreesForGeometry(geom, parkKey);
	let dotFeatures = [];

	ensurePreceedenceTreeLayer(map);
	const fallbackAreaAcres = (geometryAreaPerimeter(geom).area || 0) / 4046.8564224;
	const areaAcres = Number.isFinite(Number(feature?.properties?.area_acres))
		? Number(feature.properties.area_acres)
		: fallbackAreaAcres;

	const parkId = feature?.properties?.id || '';
	const parkEnrichment = PARK_TREE_ENRICHMENT[parkId];
	let governorsInventory = null;
	if (parkId === 'governors-island') {
		governorsInventory = await loadGovernorsIslandInventory();
	}
	
	let mode = 'osm';
	let effectiveTreeCount = mappedTrees.length;
	let useEnrichedData = false;
	const hasTreeKeeperSource = mappedTrees.some((row) => String(row.source || '').startsWith('treekeeper_wfs'));
	const hasGreenWoodOfficialSource = mappedTrees.some((row) => String(row.source || '').startsWith('greenwood_feature_service'));

	if (hasTreeKeeperSource && mappedTrees.length > 0) {
		mode = 'treekeeper';
	} else if (hasGreenWoodOfficialSource && mappedTrees.length > 0) {
		mode = 'greenwood_official';
	}

	if (mappedTrees.length > 0) {
		const maxRenderDots = (mode === 'treekeeper' || mode === 'greenwood_official')
			? mappedTrees.length
			: 1600;
		dotFeatures = getMappedDotsCached(mappedTrees, maxRenderDots, `${parkId || parkKey}-${mode}`);
	}

	// If OSM data is sparse, check for published inventory
	if (mappedTrees.length === 0 && governorsInventory?.treeCount > 0 && parkId === 'governors-island') {
		mode = 'governors_inventory';
		effectiveTreeCount = governorsInventory.treeCount;
		useEnrichedData = true;
		const displayDotCount = Math.min(900, effectiveTreeCount);
		dotFeatures = getEstimatedDotsCached(geom, displayDotCount, `${parkId}-published`);
	} else if (mappedTrees.length === 0 && parkEnrichment && parkEnrichment.expectedTreeCount > 0) {
		mode = 'enriched';
		effectiveTreeCount = parkEnrichment.expectedTreeCount;
		useEnrichedData = true;
		// Generate dots from enriched data with park-specific bias
		dotFeatures = getEstimatedDotsCached(geom, effectiveTreeCount, parkId);
	} else if (mappedTrees.length === 0 && areaAcres > 0) {
		mode = 'estimated';
		effectiveTreeCount = Math.round(Math.min(900, Math.max(24, areaAcres * 16)));
		dotFeatures = getEstimatedDotsCached(geom, effectiveTreeCount, parkId);
	} else if (mappedTrees.length > 0 && parkEnrichment) {
		// OSM has good coverage; use it but note published inventory is available
		effectiveTreeCount = mappedTrees.length;
		mode = 'osm_with_reference';
	}

	const source = map.getSource('preceedence-park-tree-dots');
	if (source) {
		source.setData({ type: 'FeatureCollection', features: dotFeatures });
	}

	const densityPerAcre = areaAcres > 0 ? effectiveTreeCount / areaAcres : 0;

	// Species breakdown: use mapped trees or enriched data
	const counts = new Map();
	let topSpecies = [];
	
	if (mode === 'governors_inventory' && Array.isArray(governorsInventory?.topSpecies)) {
		topSpecies = Array.isArray(governorsInventory?.speciesBreakdown)
			? governorsInventory.speciesBreakdown
			: governorsInventory.topSpecies;
	} else if (useEnrichedData && parkEnrichment?.commonSpecies) {
		// Use enriched species distribution from published inventory
		topSpecies = parkEnrichment.commonSpecies.slice(0, 6);
	} else if (mappedTrees.length > 0) {
		// Count species from mapped trees
		for (const row of mappedTrees) {
			const key = normalizeSpeciesName(row);
			counts.set(key, (counts.get(key) || 0) + 1);
		}
		topSpecies = [...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 6)
			.map(([species, count]) => ({ species, count }));
	}

	const { area, perimeter } = geometryAreaPerimeter(geom);
	const compactness = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;

	renderPreceedenceDiagram({
		treeCount: effectiveTreeCount,
		areaAcres,
		densityPerAcre,
		compactness,
		topSpecies,
		mode,
		parkEnrichment,
	});

	const floraProfile = PARK_FLORA_PROFILES[parkId] || [];
	const floraFromTrees = topSpecies.map((s) => s.species);
	updateParkList('park-tree-list', floraFromTrees, 'No tree species available', SPECIES_SVG_FOLDER);
	updateParkList('park-flora-list', [...floraProfile, ...floraFromTrees], 'No plant profile available', SPECIES_SVG_FOLDER);
	const faunaItems = parseArrayProp(feature?.properties?.wildlife);
	renderGroupedFaunaList('park-fauna-list', faunaItems, 'No fauna list');
	updatePreceedenceFaunaOverlays(map, feature, faunaItems);
}

export function setupMapHandlers(map, nearbyParksData = null) {
	const pageType = document.body?.dataset.mapPage || '';
	const isPreceedencePage = pageType === 'preceedence' || pageType === 'map';



	// ─── Nearby Parks: click → side panel ────────────────────────────────────
	if (map.getLayer('nearby-parks-fill')) {
		map.on('click', 'nearby-parks-fill', async (e) => {
			const feature = e.features && e.features[0];
			if (!feature) return;
			fitFeatureToFramedViewport(map, feature);
			openParkPanel(feature.properties);
			if (isPreceedencePage) {
				try {
					await analyzePreceedenceParkTrees(map, feature);
				} catch (err) {
					console.warn('[HANDLERS] Failed to analyze park trees:', err);
				}
			}
		});

		// Hover highlight
		let hoveredParkId = null;
		map.on('mousemove', 'nearby-parks-fill', (e) => {
			if (!e.features || !e.features.length) return;
			const id = e.features[0].properties.id;
			if (id !== hoveredParkId) {
				hoveredParkId = id;
				if (map.getLayer('nearby-parks-outline-hover')) {
					map.setFilter('nearby-parks-outline-hover', ['==', ['get', 'id'], id]);
				}
			}
			map.getCanvas().style.cursor = 'pointer';
		});
		map.on('mouseleave', 'nearby-parks-fill', () => {
			hoveredParkId = null;
			if (map.getLayer('nearby-parks-outline-hover')) {
				map.setFilter('nearby-parks-outline-hover', ['==', ['get', 'id'], '']);
			}
			map.getCanvas().style.cursor = '';
		});
	}

	// Close park panel
	const closeBtn = document.getElementById('park-panel-close');
	if (closeBtn) {
		closeBtn.addEventListener('click', () => {
			const panel = document.getElementById('park-info-panel');
			if (!panel) return;
			if (isMobileDrawerViewport()) {
				setMobileDrawerExpanded(panel, false);
				return;
			}
			panel.classList.remove('active');
			clearSelectedParkContext(map);
		});
	}

	ensureMobileDrawerWiring();

	const tooltip = document.getElementById('map-tooltip');

	// ─── Trees: hover tooltip ─────────────────────────────────────────────────
	if (map.getLayer('trees-circles')) {
		map.on('mouseenter', 'trees-circles', (e) => {
			map.getCanvas().style.cursor = 'pointer';
			const props = e.features[0]?.properties;
			if (!props || !tooltip) return;
			tooltip.textContent = props.species || 'Unknown species';
			tooltip.style.display = 'block';
			tooltip.style.left = `${e.originalEvent.clientX + 12}px`;
			tooltip.style.top  = `${e.originalEvent.clientY - 8}px`;
		});

		map.on('mousemove', 'trees-circles', (e) => {
			if (!tooltip) return;
			tooltip.style.left = `${e.originalEvent.clientX + 12}px`;
			tooltip.style.top  = `${e.originalEvent.clientY - 8}px`;
		});

		map.on('mouseleave', 'trees-circles', () => {
			map.getCanvas().style.cursor = '';
			if (tooltip) tooltip.style.display = 'none';
		});
	}

	// ─── Trees: click popup ───────────────────────────────────────────────────
	if (map.getLayer('trees-circles')) {
		map.on('click', 'trees-circles', (e) => {
			const props = e.features[0]?.properties;
			if (!props) return;

		const rows = [
			['Species', props.species || '-'],
			['Health',  props.health  || '-'],
			['DBH',     props.dbh ? `${props.dbh} in` : '-'],
			['ID',      props.tree_id || '-'],
		];

		const html = `
			<div class="popup-inner">
				<p class="popup-title">${props.species || 'Unknown species'}</p>
				<table class="popup-table">
					${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
				</table>
			</div>`;

			new mapboxgl.Popup({ offset: 8, className: 'arch-popup', closeButton: false, focusAfterOpen: false })
				.setLngLat(e.lngLat)
				.setHTML(html)
				.addTo(map);
		});
	}

	// ─── Buildings: click popup ───────────────────────────────────────────────
	if (map.getLayer('buildings-extrusion')) {
		map.on('mouseenter', 'buildings-extrusion', () => {
			map.getCanvas().style.cursor = 'pointer';
		});
		map.on('mouseleave', 'buildings-extrusion', () => {
			map.getCanvas().style.cursor = '';
		});

		map.on('click', 'buildings-extrusion', (e) => {
			const props = e.features[0]?.properties;
			if (!props) return;

		const height = props.height || (props['building:levels'] ? `${Math.round(props['building:levels'] * 3.2)}m (est.)` : '-');
		const addr   = [props['addr:housenumber'], props['addr:street']].filter(Boolean).join(' ') || '-';

		const html = `
			<div class="popup-inner">
				<p class="popup-title">Building</p>
				<table class="popup-table">
					<tr><td>Address</td><td>${addr}</td></tr>
					<tr><td>Height</td><td>${height}</td></tr>
				</table>
			</div>`;

			new mapboxgl.Popup({ offset: 8, className: 'arch-popup', closeButton: false, focusAfterOpen: false })
				.setLngLat(e.lngLat)
				.setHTML(html)
				.addTo(map);
		});
	}

	// ─── CSO Outfalls: hover + popup ─────────────────────────────────────────
	if (map.getLayer('cso-outfalls-circle')) {
		map.on('mouseenter', 'cso-outfalls-circle', () => {
			map.getCanvas().style.cursor = 'pointer';
		});

		map.on('mouseleave', 'cso-outfalls-circle', () => {
			map.getCanvas().style.cursor = '';
		});

		map.on('click', 'cso-outfalls-circle', (e) => {
			const props = e.features[0]?.properties || {};
			const id = props.id || props.OBJECTID || props.FID || '-';
			const name = props.name || props.NAME || props.outfall || props.OUTFALL || 'CSO Outfall';

		const html = `
			<div class="popup-inner">
				<p class="popup-title">CSO Outfall</p>
				<table class="popup-table">
					<tr><td>Name</td><td>${name}</td></tr>
					<tr><td>ID</td><td>${id}</td></tr>
				</table>
			</div>`;

			new mapboxgl.Popup({ offset: 8, className: 'arch-popup', closeButton: false, focusAfterOpen: false })
				.setLngLat(e.lngLat)
				.setHTML(html)
				.addTo(map);
		});
	}
}
