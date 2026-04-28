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

function updateParkList(elId, items, emptyLabel = 'No data yet') {
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
		li.textContent = item;
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
			fitFeatureToFramedViewport(map, feature);
			openParkPanel(props);
			try {
				await analyzePreceedenceParkTrees(map, feature);
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


	const fauna = parseArrayProp(props.wildlife);
	updateParkList('park-fauna-list', fauna, 'No fauna list');

	panel.classList.add('active');
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
	updateParkList('park-tree-list', floraFromTrees, 'No tree species available');
	updateParkList('park-flora-list', [...floraProfile, ...floraFromTrees], 'No plant profile available');
	updateParkList('park-fauna-list', parseArrayProp(feature?.properties?.wildlife), 'No fauna list');
}

export function setupMapHandlers(map, nearbyParksData = null) {
	const pageType = document.body?.dataset.mapPage || '';
	const isPreceedencePage = pageType === 'preceedence' || pageType === 'map';

	if (isPreceedencePage) {
		resolveNearbyParksForCallouts(nearbyParksData)
			.then((parksData) => {
				if (parksData?.features?.length) setupPreceedenceParkCallouts(map, parksData);
			})
			.catch((err) => console.warn('[HANDLERS] Could not initialize park callouts:', err));
	}

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
			if (panel) panel.classList.remove('active');
		});
	}

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

			new mapboxgl.Popup({ offset: 8, className: 'arch-popup' })
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

			new mapboxgl.Popup({ offset: 8, className: 'arch-popup' })
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

			new mapboxgl.Popup({ offset: 8, className: 'arch-popup' })
				.setLngLat(e.lngLat)
				.setHTML(html)
				.addTo(map);
		});
	}
}
