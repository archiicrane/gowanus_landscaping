// site-plan-main.js
// Architectural site plan: Mapbox Streets v8 tiles for water,
// local GeoJSON for roads, sidewalks, buildings, trees, bioswales.

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

// Build the blank architectural style — Mapbox Streets v8 as vector source for water
function buildArchitectStyle() {
  return {
    version: 8,
    glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}',
    sources: {
      'mapbox-streets': {
        type: 'vector',
        url: 'mapbox://mapbox.mapbox-streets-v8',
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#f5f3ee' },
      },
    ],
  };
}

// Create a diagonal-hatch canvas image for water fill pattern
function createWaterHatchPattern(map) {
  const size = 14;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#dbeaf2';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#a8c4d6';
  ctx.lineWidth = 0.75;
  ctx.globalAlpha = 0.7;
  const line = (x1, y1, x2, y2) => {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  };
  line(0, size, size, 0);
  line(-size, size, 0, 0);
  line(size, size, size * 2, 0);
  map.addImage('water-hatch', canvas);
}

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
  // ── Water: hatch fill + edge from Mapbox Streets v8 ────────────────────
  createWaterHatchPattern(map);

  map.addLayer({
    id: 'water-fill',
    type: 'fill',
    source: 'mapbox-streets',
    'source-layer': 'water',
    paint: { 'fill-pattern': 'water-hatch', 'fill-opacity': 1 },
  });
  map.addLayer({
    id: 'waterway-fill',
    type: 'line',
    source: 'mapbox-streets',
    'source-layer': 'waterway',
    paint: {
      'line-color': '#a8c4d6',
      'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.8, 16, 5],
      'line-opacity': 0.85,
    },
  });
  map.addLayer({
    id: 'water-outline',
    type: 'line',
    source: 'mapbox-streets',
    'source-layer': 'water',
    paint: { 'line-color': '#a8c4d6', 'line-width': 1.1, 'line-opacity': 0.9 },
  });

  // ── Sidewalks (local GeoJSON) ───────────────────────────────────────────
  map.addSource('sidewalks', { type: 'geojson', data: datasets.sidewalks });
  map.addLayer({
    id: 'sidewalk-fill',
    type: 'fill',
    source: 'sidewalks',
    paint: { 'fill-color': '#e6e3dd', 'fill-opacity': 0.92 },
  });
  map.addLayer({
    id: 'sidewalk-outline',
    type: 'line',
    source: 'sidewalks',
    paint: { 'line-color': '#ccc9c2', 'line-width': 0.5, 'line-opacity': 0.7 },
  });

  // ── Roads (local GeoJSON) — surface + casing ────────────────────────────
  map.addSource('roads', { type: 'geojson', data: datasets.roads });
  map.addLayer({
    id: 'road-fill',
    type: 'line',
    source: 'roads',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#d4d0c9',
      'line-width': ['interpolate', ['linear'], ['zoom'], 13, 3.5, 16, 9],
      'line-opacity': 1,
    },
  });
  map.addLayer({
    id: 'road-casing',
    type: 'line',
    source: 'roads',
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': '#b8b5af',
      'line-gap-width': ['interpolate', ['linear'], ['zoom'], 13, 3.5, 16, 9],
      'line-width': 0.7,
      'line-opacity': 0.55,
    },
  });

  // ── Buildings (local GeoJSON) ───────────────────────────────────────────
  map.addSource('buildings', { type: 'geojson', data: datasets.buildings });
  map.addLayer({
    id: 'buildings-fill',
    type: 'fill',
    source: 'buildings',
    paint: { 'fill-color': '#cfcac2', 'fill-opacity': 0.72 },
  });
  map.addLayer({
    id: 'buildings-outline',
    type: 'line',
    source: 'buildings',
    paint: { 'line-color': '#a09a92', 'line-width': 0.75, 'line-opacity': 0.85 },
  });

  // ── Trees (local GeoJSON) ───────────────────────────────────────────────
  map.addSource('trees', { type: 'geojson', data: datasets.trees });
  map.addLayer({
    id: 'trees-circle',
    type: 'circle',
    source: 'trees',
    paint: {
      'circle-color': '#88a98a',
      'circle-opacity': 0.48,
      'circle-stroke-color': '#6f8f6f',
      'circle-stroke-width': 0.5,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 1.4, 16, 3.2],
    },
  });

  // ── Bioswale site highlight (local GeoJSON) ─────────────────────────────
  map.addSource('bioswales', { type: 'geojson', data: datasets.bioswales });
  map.addLayer({
    id: 'bioswales-fill',
    type: 'fill',
    source: 'bioswales',
    paint: { 'fill-color': '#4f7d57', 'fill-opacity': 0.20 },
  });
  map.addLayer({
    id: 'bioswales-outline',
    type: 'line',
    source: 'bioswales',
    paint: { 'line-color': '#4f7d57', 'line-width': 2.2, 'line-opacity': 0.92 },
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

  const [buildings, roads, sidewalks, treesRaw, bioswalesRaw] = await Promise.all([
    fetchJson('/data/gowanus-buildings.geojson'),
    fetchJson('/data/roads.geojson'),
    fetchJson('/data/sidewalks.geojson'),
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
    style: buildArchitectStyle(),
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
      sidewalks,
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
