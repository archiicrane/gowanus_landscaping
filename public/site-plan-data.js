// site-plan-data.js
// Loads and normalizes data for the Site Plan renderer

const BUILDINGS_URL = 'data/gowanus-buildings.geojson';
const PARK_URL = 'data/park.geojson';
const TREES_URL = 'data/gowanus_trees_clean.json';
const ROADS_URL = 'data/roads.geojson';
const SIDEWALKS_URL = 'data/sidewalks.geojson';
const HARDSCAPE_URL = 'data/hardscape.geojson';

async function fetchOptionalJSON(url, label) {
  let res;
  try {
    res = await fetch(url);
    if (!res.ok) {
      console.warn(`[SitePlan] ${label.toLowerCase()} not found at ${url}`);
      return null;
    }
    return await res.json();
  } catch (error) {
    console.warn(`[SitePlan] ${label.toLowerCase()} source missing: ${url}`);
    return null;
  }
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return await res.json();
}

function normalizeFeatures(geojson) {
  if (!geojson || !geojson.features) return [];
  return geojson.features.map((feature) => ({
    id: feature.id || feature.properties?.id || null,
    geometry: feature.geometry,
    properties: feature.properties || {}
  }));
}

async function loadBuildings() {
  const geojson = await fetchJSON(BUILDINGS_URL);
  return normalizeFeatures(geojson);
}

async function loadParks() {
  const geojson = await fetchJSON(PARK_URL);
  return geojson.features.map((feature) => ({
    id: feature.id || feature.properties?.id || null,
    polygon: feature.geometry.coordinates,
    properties: feature.properties || {}
  }));
}

async function loadTrees() {
  const data = await fetchJSON(TREES_URL);
  if (Array.isArray(data)) {
    return data.map((tree) => ({
      id: tree.tree_id || null,
      species: tree.species || 'Tree',
      position: [tree.lon, tree.lat],
      canopy: tree.canopy_diameter || 7,
      properties: tree
    }));
  }

  if (data.features) {
    return data.features.map((feature) => ({
      id: feature.id || feature.properties?.tree_id || null,
      species: feature.properties?.spc_common || feature.properties?.species || 'Tree',
      position: feature.geometry.coordinates,
      canopy: feature.properties?.canopy_diameter || 7,
      properties: feature.properties || {}
    }));
  }

  throw new Error('Unrecognized tree data format');
}

export async function loadSitePlanData() {
  const [buildings, parks, trees, roadsRaw, sidewalksRaw, hardscapeRaw] = await Promise.all([
    loadBuildings(),
    loadParks(),
    loadTrees(),
    fetchOptionalJSON(ROADS_URL, 'Roads'),
    fetchOptionalJSON(SIDEWALKS_URL, 'Sidewalks'),
    fetchOptionalJSON(HARDSCAPE_URL, 'Hardscape')
  ]);

  return {
    buildings,
    parks,
    trees,
    roads: normalizeFeatures(roadsRaw),
    sidewalks: normalizeFeatures(sidewalksRaw),
    hardscape: normalizeFeatures(hardscapeRaw)
  };
}
