// site-plan-main.js
// Mapbox-based architectural site plan with bioswale analytics

import { resolveMapboxToken } from '/js/token.js';
import {
  calculateBioswaleMetrics,
  canopyProgressFromBioswales,
  formatCompact,
  loadBioswaleGeoJSON,
} from '/js/bioswale-metrics.js';

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

function renderStats(stats) {
  const areaEl = document.getElementById('stat-area');
  const treesEl = document.getElementById('stat-trees');
  const canopyEl = document.getElementById('stat-canopy');
  const stormwaterEl = document.getElementById('stat-stormwater');

  if (!areaEl || !treesEl || !canopyEl || !stormwaterEl) return;

  areaEl.textContent = `${formatNumber(stats.totalAreaSqFt)} sq ft (${formatAcres(stats.totalAreaAcres)} ac)`;
  treesEl.textContent = `${formatNumber(stats.estimatedTrees)} trees`;
  canopyEl.textContent = `${formatNumber(stats.addedCanopySqFt)} sq ft`;
  stormwaterEl.textContent = `${formatNumber(stats.stormwaterGallons)} gal`;
}

function renderMiniDashboard(stats, progress) {
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setText('mini-area', `${formatCompact(stats.totalAreaSqFt)} sq ft`);
  setText('mini-trees', `${formatCompact(stats.estimatedTrees)} trees`);
  setText('mini-canopy', `${formatCompact(stats.addedCanopySqFt)} sq ft`);
  setText('mini-water', `${formatCompact(stats.stormwaterGallons)} gal`);
  setText('mini-existing', `${progress.existingPct.toFixed(1)}%`);
  setText('mini-proposed', `${progress.proposedPct.toFixed(1)}%`);

  const fill = document.getElementById('mini-progress-fill');
  if (fill) fill.style.width = `${Math.max(0, Math.min(100, progress.proposedPct))}%`;
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

function fitArchitecturalBounds(map, featureCollections) {
  if (!window.turf) return;

  const features = featureCollections
    .filter(Boolean)
    .flatMap((fc) => (fc.features || []));
  if (!features.length) return;

  const merged = { type: 'FeatureCollection', features };
  const [minX, minY, maxX, maxY] = window.turf.bbox(merged);
  const bounds = new mapboxgl.LngLatBounds([minX, minY], [maxX, maxY]);

  const padding = { top: 52, right: 52, bottom: 52, left: 52 };
  map.fitBounds(bounds, {
    padding,
    bearing: INITIAL_VIEW.bearing,
    pitch: INITIAL_VIEW.pitch,
    duration: 0,
    maxZoom: 15.7,
  });

  // If projected bounds still exceed the available frame, step zoom out.
  const container = map.getContainer();
  const fits = () => {
    const nw = map.project([minX, maxY]);
    const se = map.project([maxX, minY]);
    const contentW = container.clientWidth;
    const contentH = container.clientHeight;
    return nw.x >= 24 && nw.y >= 24 && se.x <= contentW - 24 && se.y <= contentH - 24;
  };

  let guard = 0;
  while (!fits() && guard < 5) {
    map.zoomTo(map.getZoom() - 0.35, { duration: 0 });
    guard += 1;
  }
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

  const [buildings, roads, treesRaw, bioswalesRaw] = await Promise.all([
    fetchJson('/data/gowanus-buildings.geojson'),
    fetchJson('/data/roads.geojson'),
    fetchJson('/data/gowanus_trees_clean.json'),
    loadBioswaleGeoJSON(),
  ]);

  const treeFeatures = toTreeFeatureCollection(treesRaw);
  const bioswaleResults = calculateBioswaleMetrics(bioswalesRaw);
  const bioswales = bioswaleResults.featureCollection;
  const stats = bioswaleResults.totals;
  renderStats(stats);

  // Study area approximation from buildings + roads extents.
  let studySqFt = 0;
  if (window.turf) {
    const studyFeatureCollection = {
      type: 'FeatureCollection',
      features: [...(buildings.features || []), ...(roads.features || [])],
    };
    const studyBbox = window.turf.bbox(studyFeatureCollection);
    const studyPoly = window.turf.bboxPolygon(studyBbox);
    studySqFt = window.turf.area(studyPoly) * 10.7639;
  }

  const progress = canopyProgressFromBioswales(4.1, studySqFt, stats.addedCanopySqFt);
  renderMiniDashboard(stats, progress);

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

    fitArchitecturalBounds(map, [buildings, bioswales, roads]);
    map.resize();
  });

  window.addEventListener('resize', () => {
    fitArchitecturalBounds(map, [buildings, bioswales, roads]);
    map.resize();
  });

  requestAnimationFrame(() => {
    fitArchitecturalBounds(map, [buildings, bioswales, roads]);
    map.resize();
  });
});
