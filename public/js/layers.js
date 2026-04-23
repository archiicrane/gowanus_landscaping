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
//   contour-lines
//   flood-vulnerability-fill
//   cso-outfalls-circle

const STUDY_RING = [
	[-73.98963594611494, 40.683945676183654],
	[-73.98084416376932, 40.680669969224006],
	[-73.98368161027763, 40.67628724578089],
	[-73.99274143083169, 40.665495232798115],
	[-73.99607305804426, 40.667988596328655],
	[-73.99889524234268, 40.67260255106102],
	[-73.9964465299067, 40.67744610487334],
	[-73.99461997552936, 40.67663528353369],
	[-73.98963594611494, 40.683945676183654],
];

function pointInStudyPolygon(point) {
	const x = point[0];
	const y = point[1];
	let inside = false;
	for (let i = 0, j = STUDY_RING.length - 1; i < STUDY_RING.length; j = i++) {
		const xi = STUDY_RING[i][0];
		const yi = STUDY_RING[i][1];
		const xj = STUDY_RING[j][0];
		const yj = STUDY_RING[j][1];
		const intersects = ((yi > y) !== (yj > y))
			&& (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
		if (intersects) inside = !inside;
	}
	return inside;
}

function polygonCentroid(ring) {
	if (!Array.isArray(ring) || !ring.length) return null;
	let x = 0;
	let y = 0;
	let n = 0;
	for (const coord of ring) {
		if (!Array.isArray(coord) || coord.length < 2) continue;
		x += Number(coord[0]);
		y += Number(coord[1]);
		n += 1;
	}
	if (!n) return null;
	return [x / n, y / n];
}

function floodFeatureToPoint(feature) {
	const geom = feature?.geometry;
	if (!geom) return null;
	if (geom.type === 'Point') return geom.coordinates;
	if (geom.type === 'Polygon') return polygonCentroid(geom.coordinates?.[0] || []);
	if (geom.type === 'MultiPolygon') {
		const firstRing = geom.coordinates?.[0]?.[0] || [];
		return polygonCentroid(firstRing);
	}
	return null;
}

function flattenLineCoordinates(geometry) {
	if (!geometry) return [];
	if (geometry.type === 'LineString') return geometry.coordinates || [];
	if (geometry.type === 'MultiLineString') {
		return (geometry.coordinates || []).flatMap((segment) => segment || []);
	}
	return [];
}

function contourFeaturesToLowPointGeoJSON(features) {
	const elevations = features
		.map((feature) => Number(feature?.properties?.ELEV))
		.filter((value) => Number.isFinite(value));

	if (!elevations.length) {
		return { type: 'FeatureCollection', features: [] };
	}

	const minElev = Math.min(...elevations);
	const maxElev = Math.max(...elevations);
	const elevSpan = Math.max(maxElev - minElev, 1);
	const heatFeatures = [];

	for (const feature of features) {
		const elev = Number(feature?.properties?.ELEV);
		if (!Number.isFinite(elev)) continue;

		const coords = flattenLineCoordinates(feature.geometry);
		if (!coords.length) continue;

		const intensity = Math.max(0.08, ((maxElev - elev) / elevSpan) ** 1.35);
		const step = coords.length > 24 ? 6 : coords.length > 10 ? 3 : 1;

		for (let index = 0; index < coords.length; index += step) {
			const coord = coords[index];
			if (!Array.isArray(coord) || coord.length < 2 || !pointInStudyPolygon(coord)) continue;
			heatFeatures.push({
				type: 'Feature',
				properties: {
					elev,
					intensity,
				},
				geometry: { type: 'Point', coordinates: coord },
			});
		}
	}

	return { type: 'FeatureCollection', features: heatFeatures };
}

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

export async function addStudyBoundaryLayer(map) {
	const boundary = {
		type: 'FeatureCollection',
		features: [{
			type: 'Feature',
			properties: {},
			geometry: { type: 'Polygon', coordinates: [STUDY_RING] },
		}],
	};

	if (map.getSource('study-boundary')) map.removeSource('study-boundary');
	map.addSource('study-boundary', { type: 'geojson', data: boundary });

	map.addLayer({
		id: 'study-boundary-fill',
		type: 'fill',
		source: 'study-boundary',
		paint: {
			'fill-color': '#d2a78f',
			'fill-opacity': 0.1,
		},
	});

	map.addLayer({
		id: 'study-boundary-line',
		type: 'line',
		source: 'study-boundary',
		paint: {
			'line-color': '#b26f57',
			'line-width': 2,
			'line-opacity': 0.95,
			'line-dasharray': [2, 1.4],
		},
	});
}


export async function addTopographyHeatLayer(map) {
	let data;
	try {
		const res = await fetch('/data/con_lines_gowanus_clipped.geojson');
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		data = await res.json();
	} catch (err) {
		console.error('[LAYERS] Failed to load contour data for low-point heatmap:', err);
		return;
	}

	const sourceData = contourFeaturesToLowPointGeoJSON(data.features || []);

	if (map.getLayer('topography-heatmap')) map.removeLayer('topography-heatmap');
	if (map.getSource('topography-heat')) map.removeSource('topography-heat');

	map.addSource('topography-heat', { type: 'geojson', data: sourceData });

	map.addLayer({
		id: 'topography-heatmap',
		type: 'heatmap',
		source: 'topography-heat',
		paint: {
			'heatmap-intensity': [
				'interpolate', ['linear'], ['zoom'],
				12, 0.55,
				16, 1.15,
			],
			'heatmap-weight': ['coalesce', ['get', 'intensity'], 0.1],
			'heatmap-radius': [
				'interpolate', ['linear'], ['zoom'],
				12, 18,
				17, 34,
			],
			'heatmap-opacity': 0.68,
			'heatmap-color': [
				'interpolate', ['linear'], ['heatmap-density'],
				0, 'rgba(250,247,241,0)',
				0.2, 'rgba(196,214,206,0.2)',
				0.42, 'rgba(145,174,160,0.34)',
				0.65, 'rgba(108,138,123,0.54)',
				0.82, 'rgba(84,110,96,0.68)',
				1, 'rgba(60,83,72,0.82)',
			],
		},
	});
}

export async function addBioswaleOpportunityLayer(map) {
	const roadFilter = [
		'all',
		['within', { type: 'Polygon', coordinates: [STUDY_RING] }],
		['match', ['get', 'class'], ['primary', 'secondary', 'tertiary', 'street', 'service', 'residential'], true, false],
	];

	if (map.getLayer('bioswale-corridor-core')) map.removeLayer('bioswale-corridor-core');
	if (map.getLayer('bioswale-corridor-glow')) map.removeLayer('bioswale-corridor-glow');

	map.addLayer({
		id: 'bioswale-corridor-glow',
		type: 'line',
		source: 'composite',
		'source-layer': 'road',
		filter: roadFilter,
		paint: {
			'line-color': '#95b29c',
			'line-width': [
				'interpolate', ['linear'], ['zoom'],
				12, 5,
				17, 14,
			],
			'line-opacity': 0.2,
			'line-blur': 0.8,
		},
	}, 'building');

	map.addLayer({
		id: 'bioswale-corridor-core',
		type: 'line',
		source: 'composite',
		'source-layer': 'road',
		filter: roadFilter,
		layout: {
			'line-cap': 'round',
			'line-join': 'round',
		},
		paint: {
			'line-color': '#6f8a78',
			'line-width': [
				'interpolate', ['linear'], ['zoom'],
				12, 1.4,
				17, 4.2,
			],
			'line-opacity': 0.9,
			'line-dasharray': [2, 1.4],
		},
	}, 'building');
}

// ─── 1ft Contours ───────────────────────────────────────────────────────────

export async function addContourLayer(map) {
	let data;
	try {
		const res = await fetch('/data/con_lines_gowanus_clipped.geojson');
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		data = await res.json();
	} catch (err) {
		console.error('[LAYERS] Failed to load clipped contour lines:', err);
		return;
	}

	if (map.getSource('contour-lines')) map.removeSource('contour-lines');
	map.addSource('contour-lines', { type: 'geojson', data });

	map.addLayer({
		id: 'contour-lines',
		type: 'line',
		source: 'contour-lines',
		layout: { 'line-join': 'round', 'line-cap': 'round' },
		paint: {
			'line-color': '#8e959f',
			'line-width': [
				'case',
				['==', ['%', ['round', ['coalesce', ['get', 'ELEV'], 0]], 5], 0], 1.1,
				0.6,
			],
			'line-opacity': 0.72,
		},
		filter: ['within', { type: 'Polygon', coordinates: [STUDY_RING] }],
	});
}

// ─── Flood Vulnerability ───────────────────────────────────────────────────

export async function addFloodLayer(map) {
	let data;
	try {
		const res = await fetch('/data/flood-vulnerability.geojson');
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		data = await res.json();
	} catch (err) {
		console.error('[LAYERS] Failed to load flood vulnerability layer:', err);
		return;
	}

	if (map.getSource('flood-vulnerability')) map.removeSource('flood-vulnerability');
	map.addSource('flood-vulnerability', { type: 'geojson', data });

	map.addLayer({
		id: 'flood-vulnerability-fill',
		type: 'fill',
		source: 'flood-vulnerability',
		paint: {
			'fill-color': '#8da8b3',
			'fill-opacity': 0.10,
		},
		filter: ['within', { type: 'Polygon', coordinates: [STUDY_RING] }],
	});
}

// ─── CSO Outfalls (clipped from citywide) ─────────────────────────────────

export async function addCsoOutfallsLayer(map) {
	let citywide;
	try {
		const res = await fetch('/data/Citywide_Outfalls_20260416.geojson');
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		citywide = await res.json();
	} catch (err) {
		console.error('[LAYERS] Failed to load CSO outfalls:', err);
		return;
	}

	const features = (citywide.features || []).filter((f) => {
		if (f?.geometry?.type !== 'Point') return false;
		return pointInStudyPolygon(f.geometry.coordinates);
	});

	const clipped = { type: 'FeatureCollection', features };

	if (map.getSource('cso-outfalls')) map.removeSource('cso-outfalls');
	map.addSource('cso-outfalls', { type: 'geojson', data: clipped });

	map.addLayer({
		id: 'cso-outfalls-circle',
		type: 'circle',
		source: 'cso-outfalls',
		paint: {
			'circle-radius': [
				'interpolate', ['linear'], ['zoom'],
				13, 4,
				17, 7,
			],
			'circle-color': '#c9863f',
			'circle-stroke-width': 1.5,
			'circle-stroke-color': '#f6f3ee',
			'circle-opacity': 0.95,
		},
	});
}
