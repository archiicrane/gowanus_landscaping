async function loadTreeData() {
  const response = await fetch('/data/gowanus_trees.json');

  if (!response.ok) {
    throw new Error(`Failed to load tree data: ${response.status} ${response.statusText}`);
  }

  const rawText = await response.text();
  const cleanedText = rawText.replace(/\bNaN\b/g, 'null');
  return JSON.parse(cleanedText);
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function titleCase(str) {
  if (!str) return 'Unknown';
  return String(str)
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatNumber(value, digits = 0) {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function countBy(items, accessor) {
  const counts = {};
  for (const item of items) {
    const key = accessor(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function sumBy(items, accessor) {
  return items.reduce((sum, item) => sum + accessor(item), 0);
}

function sortEntriesDesc(obj) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]);
}

function getBoundingBoxAreaKm2(trees) {
  const valid = trees.filter((t) => safeNumber(t.lat) !== null && safeNumber(t.lon) !== null);

  if (!valid.length) return 0;

  const lats = valid.map((t) => safeNumber(t.lat));
  const lons = valid.map((t) => safeNumber(t.lon));

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const meanLatRad = ((minLat + maxLat) / 2) * (Math.PI / 180);

  const latKm = (maxLat - minLat) * 111.32;
  const lonKm = (maxLon - minLon) * 111.32 * Math.cos(meanLatRad);

  return Math.abs(latKm * lonKm);
}

/* ---------------------------------
   CANOPY + WATER RETENTION ESTIMATE
---------------------------------- */

// If DBH is missing, use a fallback canopy diameter.
function estimateCanopyDiameterMeters(dbhInches) {
  if (!Number.isFinite(dbhInches) || dbhInches <= 0) return 12;
  return Math.max(6, Math.min(18, 4 + dbhInches * 0.35));
}

function estimateCanopyAreaM2(dbhInches) {
  const diameter = estimateCanopyDiameterMeters(dbhInches);
  const radius = diameter / 2;
  return Math.PI * radius * radius;
}

// Assumptions
const EFFECTIVE_SOIL_DEPTH_M = 0.9144; // 3 ft
const AVAILABLE_WATER_FRACTION = 0.20; // conceptual holding capacity

function estimateWaterRetentionM3(dbhInches) {
  const canopyArea = estimateCanopyAreaM2(dbhInches);
  return canopyArea * EFFECTIVE_SOIL_DEPTH_M * AVAILABLE_WATER_FRACTION;
}

function renderMetric(id, value, subtitle = '') {
  const el = document.getElementById(id);
  if (!el) return;

  el.innerHTML = `
    <div class="metric-value">${value}</div>`;
}
