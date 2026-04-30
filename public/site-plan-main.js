// site-plan-main.js
// Mapbox-based architectural site plan with bioswale analytics

import { resolveMapboxToken } from '/js/token.js';

const TREE_SPACING_SQFT = 150;
const CANOPY_RADIUS_FT = 12;
const GALLONS_PER_SQFT = 7.48;

const INITIAL_VIEW = {
  center: [-73.992, 40.675],
  zoom: 14.9,
  pitch: 38,
  bearing: -18,
};

const ARCHITECT_STYLE = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'paper',
      type: 'background',
      paint: {
        'background-color': '#f6f2ea',
      },
    },
  ],
};

function formatNumber(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatAcres(value) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}`);
  return response.json();
}

function toTreeFeatureCollection(rawTrees) {
  if (rawTrees?.type === 'FeatureCollection') return rawTrees;

  if (Array.isArray(rawTrees)) {
    return {
      type: 'FeatureCollection',
      features: rawTrees
        .filter((tree) => Number.isFinite(tree.lon) && Number.isFinite(tree.lat))
        .map((tree, index) => ({
          type: 'Feature',
          id: tree.tree_id || index,
          properties: {
            species: tree.species || tree.spc_common || 'Tree',
          },
          geometry: {
            type: 'Point',
            coordinates: [tree.lon, tree.lat],
          },
        })),
    };
  }

  return { type: 'FeatureCollection', features: [] };
}

function calculateBioswaleStats(bioswaleGeojson) {
  const turf = window.turf;
  if (!turf || !bioswaleGeojson?.features) {
    return {
      totalAreaSqFt: 0,
      totalAreaAcres: 0,
      estimatedTrees: 0,
      estimatedCanopySqFt: 0,
      stormwaterGallons: 0,
    };
  }

  let totalAreaSqFt = 0;
  bioswaleGeojson.features.forEach((feature, idx) => {
    const areaSqM = turf.area(feature);
    const areaSqFt = areaSqM * 10.7639;
    const areaAcres = areaSqFt / 43560;
    totalAreaSqFt += areaSqFt;

    feature.properties = feature.properties || {};
    feature.properties.id = feature.properties.id || `bioswale-${idx + 1}`;
    feature.properties.name = feature.properties.name || `Bioswale ${idx + 1}`;
    feature.properties.zone = feature.properties.zone || 'Proposed';
    feature.properties.area_sqft = Number(areaSqFt.toFixed(2));
    feature.properties.area_acres = Number(areaAcres.toFixed(4));
  });

  const totalAreaAcres = totalAreaSqFt / 43560;
  const estimatedTrees = Math.floor(totalAreaSqFt / TREE_SPACING_SQFT);
  const estimatedCanopySqFt = estimatedTrees * Math.PI * CANOPY_RADIUS_FT * CANOPY_RADIUS_FT;
  const stormwaterGallons = totalAreaSqFt * GALLONS_PER_SQFT;

  return {
    totalAreaSqFt,
    totalAreaAcres,
    estimatedTrees,
    estimatedCanopySqFt,
    stormwaterGallons,
  };
}

function renderStats(stats) {
  const areaEl = document.getElementById('stat-area');
  const treesEl = document.getElementById('stat-trees');
  const canopyEl = document.getElementById('stat-canopy');
  const stormwaterEl = document.getElementById('stat-stormwater');

  if (!areaEl || !treesEl || !canopyEl || !stormwaterEl) return;

  areaEl.textContent = `${formatNumber(stats.totalAreaSqFt)} sq ft (${formatAcres(stats.totalAreaAcres)} ac)`;
  treesEl.textContent = `${formatNumber(stats.estimatedTrees)} trees`;
  canopyEl.textContent = `${formatNumber(stats.estimatedCanopySqFt)} sq ft`;
  stormwaterEl.textContent = `${formatNumber(stats.stormwaterGallons)} gal`;
}

function addArchitecturalLayers(map, datasets) {
  map.addSource('roads', { type: 'geojson', data: datasets.roads });
  map.addLayer({
    id: 'roads-line',
    type: 'line',
    source: 'roads',
    paint: {
      'line-color': '#d8d2c8',
      'line-width': 1.2,
      'line-opacity': 0.9,
    },
  });

  map.addSource('buildings', { type: 'geojson', data: datasets.buildings });
  map.addLayer({
    id: 'buildings-fill',
    type: 'fill',
    source: 'buildings',
    paint: {
      'fill-color': '#b5b0a8',
      'fill-opacity': 0.62,
    },
  });
  map.addLayer({
    id: 'buildings-outline',
    type: 'line',
    source: 'buildings',
    paint: {
      'line-color': '#8c877f',
      'line-width': 0.85,
      'line-opacity': 0.9,
    },
  });

  map.addSource('trees', { type: 'geojson', data: datasets.trees });
  map.addLayer({
    id: 'trees-circle',
    type: 'circle',
    source: 'trees',
    paint: {
      'circle-color': '#7fa07f',
      'circle-opacity': 0.55,
      'circle-stroke-color': '#6f8f6f',
      'circle-stroke-width': 0.6,
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        13,
        1.6,
        16,
        3.8,
      ],
    },
  });

  map.addSource('bioswales', { type: 'geojson', data: datasets.bioswales });
  map.addLayer({
    id: 'bioswales-fill',
    type: 'fill',
    source: 'bioswales',
    paint: {
      'fill-color': '#4f8b4f',
      'fill-opacity': 0.24,
    },
  });
  map.addLayer({
    id: 'bioswales-outline',
    type: 'line',
    source: 'bioswales',
    paint: {
      'line-color': '#356b35',
      'line-width': 2,
      'line-opacity': 0.9,
    },
  });
}

function enableAltOnlyScrollZoom(map, container) {
  map.scrollZoom.disable();
  let disableTimer = null;

  container.addEventListener(
    'wheel',
    (event) => {
      if (event.altKey) {
        map.scrollZoom.enable();
        if (disableTimer) clearTimeout(disableTimer);
        disableTimer = setTimeout(() => map.scrollZoom.disable(), 180);
      } else {
        map.scrollZoom.disable();
      }
    },
    { capture: true }
  );
}

document.addEventListener('DOMContentLoaded', async () => {
  const mapContainer = document.getElementById('site-plan-map');
  if (!mapContainer) {
    console.error('Site Plan: map container not found.');
    return;
  }

  if (!window.mapboxgl) {
    console.error('Site Plan: Mapbox GL JS is unavailable.');
    return;
  }

  const token = await resolveMapboxToken();
  if (!token) {
    mapContainer.innerHTML = '<p style="padding:16px;color:#6e665b">Map unavailable: MAPBOX_TOKEN is missing.</p>';
    return;
  }

  mapboxgl.accessToken = token;

  const [buildings, roads, treesRaw, bioswales] = await Promise.all([
    fetchJson('/data/gowanus-buildings.geojson'),
    fetchJson('/data/roads.geojson'),
    fetchJson('/data/gowanus_trees_clean.json'),
    fetchJson('/data/bioswales.geojson'),
  ]);

  const treeFeatures = toTreeFeatureCollection(treesRaw);
  const stats = calculateBioswaleStats(bioswales);
  renderStats(stats);

  const map = new mapboxgl.Map({
    container: 'site-plan-map',
    style: ARCHITECT_STYLE,
    center: INITIAL_VIEW.center,
    zoom: INITIAL_VIEW.zoom,
    pitch: INITIAL_VIEW.pitch,
    bearing: INITIAL_VIEW.bearing,
    antialias: true,
    attributionControl: false,
    dragRotate: false,
    touchZoomRotate: false,
  });

  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();
  map.doubleClickZoom.disable();

  enableAltOnlyScrollZoom(map, mapContainer);

  map.on('load', () => {
    addArchitecturalLayers(map, {
      buildings,
      roads,
      trees: treeFeatures,
      bioswales,
    });

    map.resize();
  });

  window.addEventListener('resize', () => {
    map.resize();
  });

  requestAnimationFrame(() => map.resize());
});
