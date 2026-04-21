// site-plan-data.js
// Loads and normalizes data for the Site Plan renderer

// Data sources
const BUILDINGS_URL = 'models/buildings.geojson';
const PARK_URL = 'models/park.geojson';
const TREES_URL = 'data/gowanus_trees.json';

// Helper: fetch and parse JSON
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return await res.json();
}

// Normalize building footprints
async function loadBuildings() {
  const geojson = await fetchJSON(BUILDINGS_URL);
  return geojson.features.map(f => ({
    id: f.id || f.properties?.id || null,
    polygon: f.geometry.coordinates,
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

// Normalize trees
async function loadTrees() {
  const data = await fetchJSON(TREES_URL);
  return data.features.map(f => ({
    id: f.id || f.properties?.tree_id || null,
    species: f.properties?.spc_common || 'Tree',
    position: f.geometry.coordinates,
    canopy: f.properties?.canopy_diameter || 7,
    properties: f.properties || {},
  }));
}

// Main loader
export async function loadSitePlanData() {
  const [buildings, parks, trees] = await Promise.all([
    loadBuildings(),
    loadParks(),
    loadTrees(),
  ]);
  return { buildings, parks, trees };
}
