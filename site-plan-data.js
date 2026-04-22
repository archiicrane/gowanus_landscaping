// site-plan-data.js
// Loads and normalizes data for the Site Plan renderer


// Data sources
const BUILDINGS_URL = 'models/buildings.geojson';
const PARK_URL = 'models/park.geojson';
const TREES_URL = 'data/gowanus_trees_clean.json';
const ROADS_URL = 'models/roads.geojson';
const SIDEWALKS_URL = 'models/sidewalks.geojson';
const HARDSCAPE_URL = 'models/hardscape.geojson';



// Helper: fetch and parse JSON, with explicit logging for optional files
async function fetchOptionalJSON(url, label) {
  console.log(`[SitePlan] trying ${label.toLowerCase()} source:`, url);
  let res;
  try {
    res = await fetch(url);
    console.log(`[SitePlan] ${label} fetch status:`, res.status, url);
    if (!res.ok) {
      console.warn(`[SitePlan] ${label.toLowerCase()}.geojson not found`);
      return null;
    }
    let parsed;
    try {
      parsed = await res.json();
      const featureCount = Array.isArray(parsed.features) ? parsed.features.length : 0;
      console.log(`[SitePlan] ${label} parse succeeded, features:`, featureCount);
      return parsed;
    } catch (err) {
      console.warn(`[SitePlan] ${label} parse failed:`, err);
      return null;
    }
  } catch (e) {
    console.warn(`[SitePlan] ${label} source missing: ${url}`);
    return null;
  }
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return await res.json();
}
// Normalize generic features (Polygon, MultiPolygon, LineString, MultiLineString)
function normalizeFeatures(geojson, label) {
  if (!geojson || !geojson.features) return [];
  const features = geojson.features.map(f => ({
    id: f.id || f.properties?.id || null,
    geometry: f.geometry,
    properties: f.properties || {},
  }));
  const geomTypes = new Set(features.map(f => f.geometry?.type));
  console.log(`[SitePlan] ${label}: loaded ${features.length} features, geometry types:`, Array.from(geomTypes));
  return features;
}

// Normalize building footprints (keep full geometry)
async function loadBuildings() {
  const geojson = await fetchJSON(BUILDINGS_URL);
  return geojson.features.map(f => ({
    id: f.id || f.properties?.id || null,
    geometry: f.geometry, // keep full geometry
    properties: f.properties || {},
  }));
}

// Normalize park/planted areas
async function loadParks() {
  const geojson = await fetchJSON(PARK_URL);
  return geojson.features.map(f => ({
    id: f.id || f.properties?.id || null,
    polygon: f.geometry.coordinates,
    properties: f.properties || {},
  }));
}


// Normalize trees (supports both array and GeoJSON FeatureCollection)
async function loadTrees() {
  const data = await fetchJSON(TREES_URL);
  if (Array.isArray(data)) {
    // Plain array format (your current format)
    return data.map(tree => ({
      id: tree.tree_id || null,
      species: tree.species || 'Tree',
      position: [tree.lon, tree.lat],
      canopy: tree.canopy_diameter || 7,
      properties: tree,
    }));
  } else if (data.features) {
    // GeoJSON FeatureCollection
    return data.features.map(f => ({
      id: f.id || f.properties?.tree_id || null,
      species: f.properties?.spc_common || f.properties?.species || 'Tree',
      position: f.geometry.coordinates,
      canopy: f.properties?.canopy_diameter || 7,
      properties: f.properties || {},
    }));
  } else {
    throw new Error('Unrecognized tree data format');
  }
}

// Main loader
export async function loadSitePlanData() {
  const [buildings, parks, trees, roadsRaw, sidewalksRaw, hardscapeRaw] = await Promise.all([
    loadBuildings(),
    loadParks(),
    loadTrees(),
    fetchOptionalJSON(ROADS_URL, 'Roads'),
    fetchOptionalJSON(SIDEWALKS_URL, 'Sidewalks'),
    fetchOptionalJSON(HARDSCAPE_URL, 'Hardscape'),
  ]);
  const roads = normalizeFeatures(roadsRaw, 'Roads');
  const sidewalks = normalizeFeatures(sidewalksRaw, 'Sidewalks');
  const hardscape = normalizeFeatures(hardscapeRaw, 'Hardscape');
  console.log(`[SitePlan] buildings loaded: ${buildings.length}`);
  console.log(`[SitePlan] parks loaded: ${parks.length}`);
  console.log(`[SitePlan] trees loaded: ${trees.length}`);
  console.log(`[SitePlan] roads loaded: ${roads.length}`);
  console.log(`[SitePlan] sidewalks loaded: ${sidewalks.length}`);
  console.log(`[SitePlan] hardscape loaded: ${hardscape.length}`);
  return { buildings, parks, trees, roads, sidewalks, hardscape };
}
