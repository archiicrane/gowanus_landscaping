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
//   remediation-superfund-fill
//   remediation-brownfield-fill

export const STUDY_RING = [
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

function getStudyBbox(ring) {
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

	return { minLng, minLat, maxLng, maxLat };
}

function normalizeProgramLabel(value) {
	return String(value || '').trim().toLowerCase();
}

function getCleanupType(programRaw) {
	const program = normalizeProgramLabel(programRaw);
	if (program.includes('brownfield')) return 'brownfield';
	if (program.includes('superfund')) return 'superfund';
	return null;
}

async function fetchRemediationSitesForStudyArea() {
	const { minLng, minLat, maxLng, maxLat } = getStudyBbox(STUDY_RING);
	const query = new URLSearchParams({
		where: '1=1',
		geometry: `${minLng},${minLat},${maxLng},${maxLat}`,
		geometryType: 'esriGeometryEnvelope',
		inSR: '4326',
		spatialRel: 'esriSpatialRelIntersects',
		outFields: 'SITECODE,SITENAME,PROGRAM,SITECLASS,DETAIL_URL',
		outSR: '4326',
		f: 'geojson',
	});

	const url = `https://gisservices.dec.ny.gov/arcgis/rest/services/der/RemediationSpills/MapServer/3/query?${query.toString()}`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const data = await res.json();

	const features = (data.features || [])
		.map((feature) => {
			const cleanupType = getCleanupType(feature?.properties?.PROGRAM);
			if (!cleanupType) return null;
			return {
				...feature,
				properties: {
					...(feature.properties || {}),
					cleanup_type: cleanupType,
					program_clean: String(feature?.properties?.PROGRAM || '').trim(),
				},
			};
		})
		.filter(Boolean);

	return {
		type: 'FeatureCollection',
		features,
	};
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

	// Use circle layer instead of heatmap — heatmap density saturates to one
	// color when points are dense. Circles colored directly by elev value give
	// a reliable red (high) → purple (low) gradient across the study area.
	// Use reduce instead of spread to avoid stack overflow on large arrays.
	let elevMin = Infinity, elevMax = -Infinity;
	for (const f of sourceData.features) {
		const e = f.properties.elev;
		if (e < elevMin) elevMin = e;
		if (e > elevMax) elevMax = e;
	}
	if (!sourceData.features.length) { elevMin = 0; elevMax = 10; }
	const elevSpanQ = Math.max(elevMax - elevMin, 1);
	const elevRange = {
		min:  elevMin,
		q25:  elevMin + elevSpanQ * 0.25,
		q50:  elevMin + elevSpanQ * 0.50,
		q75:  elevMin + elevSpanQ * 0.75,
		max:  elevMax,
	};

	map.addLayer({
		id: 'topography-heatmap',
		type: 'circle',
		source: 'topography-heat',
		paint: {
			'circle-radius': [
				'interpolate', ['linear'], ['zoom'],
				12, 22,
				16, 44,
			],
			'circle-blur': 1,
			'circle-opacity': 0.55,
			'circle-color': [
				'interpolate', ['linear'], ['get', 'elev'],
				elevRange.min,  'rgba(50,0,115,1)',    // lowest → deep purple
				elevRange.q25,  'rgba(110,20,165,1)',  // mid-low → purple
				elevRange.q50,  'rgba(175,30,110,1)',  // mid → magenta
				elevRange.q75,  'rgba(215,48,30,1)',   // mid-high → red-orange
				elevRange.max,  'rgba(215,80,20,1)',   // highest → red
			],
		},
	});
}

// ─── Study area clip mask (hides heatmap bleed outside boundary) ────────────

export function addStudyClipMask(map) {
	// Inverted polygon: world box minus study ring = masks everything outside boundary
	const outerRing = [
		[-180, -85.051], [180, -85.051], [180, 85.051], [-180, 85.051], [-180, -85.051],
	];
	// Hole must be clockwise (reverse of the counterclockwise exterior ring)
	const holeRing = [...STUDY_RING].reverse();

	const maskData = {
		type: 'FeatureCollection',
		features: [{
			type: 'Feature',
			properties: {},
			geometry: { type: 'Polygon', coordinates: [outerRing, holeRing] },
		}],
	};

	if (map.getLayer('study-clip-mask')) map.removeLayer('study-clip-mask');
	if (map.getSource('study-clip-mask')) map.removeSource('study-clip-mask');

	map.addSource('study-clip-mask', { type: 'geojson', data: maskData });
	map.addLayer({
		id: 'study-clip-mask',
		type: 'fill',
		source: 'study-clip-mask',
		paint: {
			'fill-color': '#ece7df',
			'fill-opacity': 0.84,
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

// ─── Nearby Parks (context layer) ────────────────────────────────────────────

export async function addNearbyParksLayer(map) {
	let data;
	try {
		const res = await fetch('/data/nearby-parks.geojson');
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		data = await res.json();
	} catch (err) {
		console.error('[LAYERS] Failed to load nearby parks GeoJSON:', err);
		return;
	}

	// Fetch real OSM boundaries from Nominatim for parks that have an osm_id
	const osmFeatures = data.features.filter(f => f.properties.osm_id);
	if (osmFeatures.length > 0) {
		try {
			const ids = osmFeatures.map(f => f.properties.osm_id).join(',');
			const nominatimRes = await fetch(
				`https://nominatim.openstreetmap.org/lookup?osm_ids=${ids}&format=geojson&polygon_geojson=1`,
				{ headers: { 'Accept': 'application/json' } }
			);
			if (nominatimRes.ok) {
				const nominatimData = await nominatimRes.json();
				// Build a lookup map: osm_id string → geometry
				const geomByOsmId = {};
				for (const nf of (nominatimData.features || [])) {
					const key = `${nf.properties.osm_type[0].toUpperCase()}${nf.properties.osm_id}`;
					geomByOsmId[key] = nf.geometry;
				}
				// Replace geometry for matched features
				for (const feature of data.features) {
					if (feature.properties.osm_id && geomByOsmId[feature.properties.osm_id]) {
						feature.geometry = geomByOsmId[feature.properties.osm_id];
					}
				}
			}
		} catch (e) {
			console.warn('[LAYERS] Nominatim boundary fetch failed, using fallback coords:', e);
		}
	}

	const layerIds = ['nearby-parks-label', 'nearby-parks-outline-hover', 'nearby-parks-outline', 'nearby-parks-fill'];
	for (const id of layerIds) {
		if (map.getLayer(id)) map.removeLayer(id);
	}
	if (map.getSource('nearby-parks')) map.removeSource('nearby-parks');

	map.addSource('nearby-parks', { type: 'geojson', data });

	map.addLayer({
		id: 'nearby-parks-fill',
		type: 'fill',
		source: 'nearby-parks',
		paint: {
			'fill-color': '#5a9e6f',
			'fill-opacity': 0.07,
		},
	});

	map.addLayer({
		id: 'nearby-parks-outline',
		type: 'line',
		source: 'nearby-parks',
		paint: {
			'line-color': '#4c8a5e',
			'line-width': [
				'interpolate', ['linear'], ['zoom'],
				11, 1.2,
				16, 2.2,
			],
			'line-opacity': 0.85,
			'line-dasharray': [3, 1.6],
		},
	});

	// Hover highlight outline — only visible on the hovered feature
	map.addLayer({
		id: 'nearby-parks-outline-hover',
		type: 'line',
		source: 'nearby-parks',
		filter: ['==', ['get', 'id'], ''],
		paint: {
			'line-color': '#2a7245',
			'line-width': 2.8,
			'line-opacity': 0.95,
		},
	});

	map.addLayer({
		id: 'nearby-parks-label',
		type: 'symbol',
		source: 'nearby-parks',
		minzoom: 13,
		layout: {
			'text-field': ['get', 'name'],
			'text-size': [
				'interpolate', ['linear'], ['zoom'],
				13, 10,
				16, 13,
			],
			'text-font': ['Open Sans SemiBold', 'Arial Unicode MS Bold'],
			'text-offset': [0, 0],
			'text-anchor': 'center',
			'text-max-width': 8,
		},
		paint: {
			'text-color': '#2a5e3a',
			'text-halo-color': 'rgba(242, 238, 231, 0.88)',
			'text-halo-width': 1.4,
		},
	});

	// Return the resolved data (with Nominatim-updated geometries) so callers
	// (e.g. addDistanceRingsLayer) can compute accurate centroids without a
	// second fetch that would get stale fallback polygons.
	return data;
}

// ─── Distance Rings from Gowanus Site Center ─────────────────────────────────

// Center of the Gowanus study area (approx centroid of STUDY_RING)
const SITE_CENTER = [-73.9923, 40.6750];

// Generate a circle polygon (lon,lat) given center, radius in km, and step count
function makeCircleGeoJSON(centerLon, centerLat, radiusKm, steps = 96) {
	const coords = [];
	const toRad = (d) => (d * Math.PI) / 180;
	const toDeg = (r) => (r * 180) / Math.PI;
	const R = 6371; // Earth radius km
	const lat1 = toRad(centerLat);
	const lon1 = toRad(centerLon);
	const d = radiusKm / R;
	for (let i = 0; i <= steps; i++) {
		const bearing = toRad((360 / steps) * i);
		const lat2 = Math.asin(
			Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing),
		);
		const lon2 =
			lon1 +
			Math.atan2(
				Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
				Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
			);
		coords.push([toDeg(lon2), toDeg(lat2)]);
	}
	return coords;
}

// Point on a given circle at bearing 90° (east) — used for label placement
function circleLabelPoint(radiusKm) {
	const toRad = (d) => (d * Math.PI) / 180;
	const toDeg = (r) => (r * 180) / Math.PI;
	const R = 6371;
	const lat1 = toRad(SITE_CENTER[1]);
	const lon1 = toRad(SITE_CENTER[0]);
	const d = radiusKm / R;
	const bearing = toRad(90); // east
	const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing));
	const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
	return [toDeg(lon2), toDeg(lat2)];
}

// Centroid of a GeoJSON Polygon or MultiPolygon feature's outer ring
function featureCentroid(geom) {
	let ring = null;
	if (geom.type === 'Polygon') ring = geom.coordinates[0];
	else if (geom.type === 'MultiPolygon') ring = geom.coordinates[0][0];
	if (!ring || !ring.length) return null;
	const lon = ring.reduce((s, c) => s + c[0], 0) / ring.length;
	const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
	return [lon, lat];
}

export async function addDistanceRingsLayer(map, parksData = null) {
	// Ring radii in km (≈ 0.25 mi, 0.5 mi, 1 mi, 1.5 mi, 2 mi)
	const rings = [
		{ km: 0.40, miles: '¼ mi' },
		{ km: 0.80, miles: '½ mi' },
		{ km: 1.61, miles: '1 mi' },
		{ km: 2.41, miles: '1½ mi' },
		{ km: 3.22, miles: '2 mi' },
	];

	// Build ring polygon features
	const ringFeatures = rings.map((r) => ({
		type: 'Feature',
		properties: { label: `${r.miles}  ·  ${r.km.toFixed(1)} km` },
		geometry: { type: 'Polygon', coordinates: [makeCircleGeoJSON(SITE_CENTER[0], SITE_CENTER[1], r.km)] },
	}));

	// Label points on the east edge of each ring
	const labelFeatures = rings.map((r) => ({
		type: 'Feature',
		properties: { label: `${r.miles}` },
		geometry: { type: 'Point', coordinates: circleLabelPoint(r.km) },
	}));

	// Use Nominatim-resolved park data passed from addNearbyParksLayer.
	// Fallback: fetch fresh (gets fallback polygon geometry, not Nominatim-updated).
	if (!parksData) {
		try {
			const res = await fetch('/data/nearby-parks.geojson');
			if (res.ok) parksData = await res.json();
		} catch (_) { /* spoke layer optional */ }
	}

	// Build spoke lines: site center → each park centroid
	const spokeFeatures = [];
	if (parksData) {
		for (const feature of parksData.features) {
			const centroid = featureCentroid(feature.geometry);
			if (!centroid) continue;
			const distKm = Math.sqrt(
				((centroid[0] - SITE_CENTER[0]) * 111.32 * Math.cos((SITE_CENTER[1] * Math.PI) / 180)) ** 2 +
				((centroid[1] - SITE_CENTER[1]) * 110.57) ** 2,
			);
			const distMi = distKm * 0.6214;
			spokeFeatures.push({
				type: 'Feature',
				properties: {
					name: feature.properties.name,
					dist_label: `${distMi.toFixed(2)} mi`,
				},
				geometry: { type: 'LineString', coordinates: [SITE_CENTER, centroid] },
			});
		}
	}

	// Remove old layers/sources if re-adding
	for (const id of ['distance-ring-labels', 'distance-rings-line', 'distance-spoke-labels', 'distance-spokes']) {
		if (map.getLayer(id)) map.removeLayer(id);
	}
	for (const id of ['distance-rings', 'distance-ring-label-pts', 'distance-spokes']) {
		if (map.getSource(id)) map.removeSource(id);
	}

	// Rings source + layer
	map.addSource('distance-rings', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: ringFeatures },
	});
	map.addLayer({
		id: 'distance-rings-line',
		type: 'line',
		source: 'distance-rings',
		paint: {
			'line-color': '#8a7a6a',
			'line-width': 1,
			'line-opacity': 0.5,
			'line-dasharray': [4, 3],
		},
	});

	// Ring label points source + layer
	map.addSource('distance-ring-label-pts', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: labelFeatures },
	});
	map.addLayer({
		id: 'distance-ring-labels',
		type: 'symbol',
		source: 'distance-ring-label-pts',
		layout: {
			'text-field': ['get', 'label'],
			'text-size': 10,
			'text-anchor': 'left',
			'text-offset': [0.4, 0],
			'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
		},
		paint: {
			'text-color': '#7a6e62',
			'text-halo-color': 'rgba(242,238,231,0.85)',
			'text-halo-width': 1.2,
		},
	});

	// Spokes source + layers
	if (spokeFeatures.length) {
		map.addSource('distance-spokes', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: spokeFeatures },
		});
		map.addLayer({
			id: 'distance-spokes',
			type: 'line',
			source: 'distance-spokes',
			paint: {
				'line-color': '#4c8a5e',
				'line-width': 0.8,
				'line-opacity': 0.45,
				'line-dasharray': [2, 2],
			},
		});
		map.addLayer({
			id: 'distance-spoke-labels',
			type: 'symbol',
			source: 'distance-spokes',
			layout: {
				'text-field': ['get', 'dist_label'],
				'text-size': 9.5,
				'symbol-placement': 'line-center',
				'text-font': ['Open Sans Italic', 'Arial Unicode MS Regular'],
				'text-rotation-alignment': 'map',
			},
			paint: {
				'text-color': '#4c8a5e',
				'text-halo-color': 'rgba(242,238,231,0.9)',
				'text-halo-width': 1.2,
			},
		});
	}
}

// ─── Toxic Soil Cleanup Sites (NYS DEC) ────────────────────────────────────

export async function addRemediationSitesLayer(map) {
	let data;
	try {
		data = await fetchRemediationSitesForStudyArea();
	} catch (err) {
		console.error('[LAYERS] Failed to load remediation site borders:', err);
		return;
	}

	if (map.getLayer('remediation-sites-labels')) map.removeLayer('remediation-sites-labels');
	if (map.getLayer('remediation-superfund-line')) map.removeLayer('remediation-superfund-line');
	if (map.getLayer('remediation-superfund-fill')) map.removeLayer('remediation-superfund-fill');
	if (map.getLayer('remediation-brownfield-line')) map.removeLayer('remediation-brownfield-line');
	if (map.getLayer('remediation-brownfield-fill')) map.removeLayer('remediation-brownfield-fill');
	if (map.getSource('remediation-sites')) map.removeSource('remediation-sites');

	map.addSource('remediation-sites', { type: 'geojson', data });

	map.addLayer({
		id: 'remediation-brownfield-fill',
		type: 'fill',
		source: 'remediation-sites',
		filter: ['==', ['get', 'cleanup_type'], 'brownfield'],
		paint: {
			'fill-color': '#d1843b',
			'fill-opacity': 0.18,
		},
	});

	map.addLayer({
		id: 'remediation-brownfield-line',
		type: 'line',
		source: 'remediation-sites',
		filter: ['==', ['get', 'cleanup_type'], 'brownfield'],
		paint: {
			'line-color': '#b06420',
			'line-width': 1.3,
			'line-opacity': 0.9,
		},
	});

	map.addLayer({
		id: 'remediation-superfund-fill',
		type: 'fill',
		source: 'remediation-sites',
		filter: ['==', ['get', 'cleanup_type'], 'superfund'],
		paint: {
			'fill-color': '#c23d3d',
			'fill-opacity': 0.24,
		},
	});

	map.addLayer({
		id: 'remediation-superfund-line',
		type: 'line',
		source: 'remediation-sites',
		filter: ['==', ['get', 'cleanup_type'], 'superfund'],
		paint: {
			'line-color': '#8d1f1f',
			'line-width': 1.7,
			'line-opacity': 0.95,
		},
	});

	map.addLayer({
		id: 'remediation-sites-labels',
		type: 'symbol',
		source: 'remediation-sites',
		minzoom: 15,
		layout: {
			'text-field': ['get', 'SITENAME'],
			'text-size': 10,
			'text-font': ['Open Sans SemiBold', 'Arial Unicode MS Bold'],
			'text-offset': [0, 0.9],
			'text-anchor': 'top',
		},
		paint: {
			'text-color': '#3f2f25',
			'text-halo-color': '#f6f3ee',
			'text-halo-width': 1,
		},
	});
}
