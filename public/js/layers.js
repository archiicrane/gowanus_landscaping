// layers.js — Adds all GeoJSON layers to the Mapbox map
//
// Data sources (must be accessible at these paths in the deployment):
//   /data/gowanus-buildings.geojson  — OSM polygons with `height` property
//   /data/gowanus_trees_clean.json   — array of { tree_id, species, health, lat, lon }
//   /data/park.geojson               — CAD-exported LineStrings for the park outline
//
// Layer IDs:
//   buildings-extrusion
//   trees-circles
//   trees-labels
//   park-outline

// Species → color mapping (architectural palette)
const SPECIES_COLORS = [
	['Kentucky coffeetree',    '#a3b18a'],
	['swamp white oak',        '#588157'],
	['black walnut',           '#3a5a40'],
	['sweetgum',               '#dad7cd'],
	['American sycamore',      '#b7c4bb'],
	['green ash',              '#7d9b76'],
	['red maple',              '#c9ada7'],
	['honey locust',           '#e9c46a'],
	['London plane',           '#90a4ae'],
	['pin oak',                '#5c7a5e'],
	['other',                  '#78909c'],
];

// Build a flat expression for circle-color: ["match", ["get", "species"], s1, c1, s2, c2, ..., fallback]
function buildSpeciesColorExpression() {
	const expr = ['match', ['get', 'species']];
	for (const [species, color] of SPECIES_COLORS.slice(0, -1)) {
		expr.push(species, color);
	}
	expr.push(SPECIES_COLORS[SPECIES_COLORS.length - 1][1]); // fallback
	return expr;
}

// Convert the trees JSON array (lat/lon) to a GeoJSON FeatureCollection
function treesToGeoJSON(trees) {
	return {
		type: 'FeatureCollection',
		features: trees
			.filter((t) => Number.isFinite(t.lat) && Number.isFinite(t.lon))
			.map((t) => ({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [t.lon, t.lat] },
				properties: {
					tree_id: t.tree_id,
					species:  t.species  || 'Unknown',
					health:   t.health   || '—',
					dbh:      t.dbh      || null,
				},
			})),
	};
}

// ─── Buildings ───────────────────────────────────────────────────────────────

export async function addBuildingLayer(map) {
	let data;
	try {
		const res = await fetch('/data/gowanus-buildings.geojson');
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		data = await res.json();
	} catch (err) {
		console.error('[LAYERS] Failed to load buildings GeoJSON:', err);
		return;
	}

	if (map.getSource('buildings')) map.removeSource('buildings');

	map.addSource('buildings', { type: 'geojson', data });

	map.addLayer({
		id: 'buildings-extrusion',
		type: 'fill-extrusion',
		source: 'buildings',
		paint: {
			'fill-extrusion-color': '#2e3540',
			'fill-extrusion-height': [
				'coalesce',
				['to-number', ['get', 'height'], 0],
				['*', ['to-number', ['get', 'building:levels'], 3], 3.2],
				10,
			],
			'fill-extrusion-base': 0,
			'fill-extrusion-opacity': [
				'interpolate', ['linear'], ['zoom'],
				13, 0,
				14, 0.85,
			],
		},
	});
}

// ─── Trees ───────────────────────────────────────────────────────────────────

export async function addTreeLayer(map) {
	let rawTrees;
	try {
		const res = await fetch('/data/gowanus_trees_clean.json');
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		rawTrees = await res.json();
	} catch (err) {
		console.error('[LAYERS] Failed to load trees JSON:', err);
		return;
	}

	const geojson = treesToGeoJSON(Array.isArray(rawTrees) ? rawTrees : rawTrees.features ?? []);

	if (map.getSource('trees')) map.removeSource('trees');

	map.addSource('trees', { type: 'geojson', data: geojson, cluster: false });

	// Circle layer
	map.addLayer({
		id: 'trees-circles',
		type: 'circle',
		source: 'trees',
		paint: {
			'circle-color': buildSpeciesColorExpression(),
			'circle-radius': [
				'interpolate', ['linear'], ['zoom'],
				12, 3,
				15, 6,
				18, 10,
			],
			'circle-opacity': 0.85,
			'circle-stroke-width': 0.5,
			'circle-stroke-color': 'rgba(0,0,0,0.3)',
		},
	});

	// Species label (only at close zoom)
	map.addLayer({
		id: 'trees-labels',
		type: 'symbol',
		source: 'trees',
		minzoom: 16,
		layout: {
			'text-field': ['get', 'species'],
			'text-size': 10,
			'text-offset': [0, 1.2],
			'text-anchor': 'top',
		},
		paint: {
			'text-color': '#c9d4c0',
			'text-halo-color': '#121417',
			'text-halo-width': 1,
		},
	});

	buildLegend();
}

function buildLegend() {
	const container = document.getElementById('legend');
	if (!container) return;

	container.innerHTML = '<p class="legend-title">Tree Species</p>';
	for (const [species, color] of SPECIES_COLORS) {
		const row = document.createElement('div');
		row.className = 'legend-row';
		row.innerHTML = `<span class="legend-swatch" style="background:${color}"></span><span>${species}</span>`;
		container.appendChild(row);
	}
}

// ─── Park / Site outline ─────────────────────────────────────────────────────

export async function addParkLayer(map) {
	let data;
	try {
		const res = await fetch('/data/park.geojson');
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		data = await res.json();
	} catch (err) {
		console.error('[LAYERS] Failed to load park GeoJSON:', err);
		return;
	}

	if (map.getSource('park')) map.removeSource('park');

	map.addSource('park', { type: 'geojson', data });

	// The park file contains CAD LineStrings (building/site outlines), render as lines
	map.addLayer({
		id: 'park-outline',
		type: 'line',
		source: 'park',
		paint: {
			'line-color': '#4e7e5a',
			'line-width': [
				'interpolate', ['linear'], ['zoom'],
				13, 0.5,
				17, 1.5,
			],
			'line-opacity': 0.7,
		},
	});
}
