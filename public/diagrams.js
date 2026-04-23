// diagrams.js — Gowanus Tree Baseline Analysis
// Data source: /data/gowanus_trees_clean.json
// All metrics and charts are derived from the existing Gowanus street tree dataset.

async function loadTreeData() {
  const response = await fetch('/data/gowanus_trees_clean.json');
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
  return String(str).toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
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

// ── Bounding box study area ──────────────────────────────────────────────

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

// ── Canopy + water retention estimates ──────────────────────────────────

function estimateCanopyDiameterMeters(dbhInches) {
  if (!Number.isFinite(dbhInches) || dbhInches <= 0) return 12;
  return Math.max(6, Math.min(18, 4 + dbhInches * 0.35));
}

function estimateCanopyAreaM2(dbhInches) {
  const diameter = estimateCanopyDiameterMeters(dbhInches);
  const radius = diameter / 2;
  return Math.PI * radius * radius;
}

const EFFECTIVE_SOIL_DEPTH_M = 0.9144;    // 3 ft
const AVAILABLE_WATER_FRACTION = 0.20;

function estimateWaterRetentionM3(dbhInches) {
  const canopyArea = estimateCanopyAreaM2(dbhInches);
  return canopyArea * EFFECTIVE_SOIL_DEPTH_M * AVAILABLE_WATER_FRACTION;
}

// ── DOM helpers ──────────────────────────────────────────────────────────

function renderMetric(id, value, subtitle = '') {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `
    <div class="metric-value">${value}</div>
    ${subtitle ? `<div class="metric-subtitle">${subtitle}</div>` : ''}
  `;
}

// ── Chart palette helpers ────────────────────────────────────────────────

function chartFontColor() { return '#4f4538'; }
function chartGridColor() { return 'rgba(86,73,53,0.18)'; }

function baseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: chartFontColor() } },
      tooltip: {
        backgroundColor: 'rgba(250,247,241,0.98)',
        titleColor: '#2f2a24',
        bodyColor: '#4f4538',
        borderColor: 'rgba(86,73,53,0.2)',
        borderWidth: 1
      }
    },
    scales: {
      x: { ticks: { color: chartFontColor() }, grid: { color: chartGridColor() } },
      y: { beginAtZero: true, ticks: { color: chartFontColor() }, grid: { color: chartGridColor() } }
    }
  };
}

function destroyChart(canvasId) {
  const chart = Chart.getChart(canvasId);
  if (chart) chart.destroy();
}

// ── Charts ───────────────────────────────────────────────────────────────

function makeSpeciesChart(speciesCounts) {
  const topSpecies = sortEntriesDesc(speciesCounts).slice(0, 10);
  const labels = topSpecies.map(([name]) => titleCase(name));
  const values = topSpecies.map(([, count]) => count);

  destroyChart('speciesChart');
  new Chart(document.getElementById('speciesChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Tree Count',
        data: values,
        backgroundColor: [
          '#b8d7a5','#b7e1c2','#a8d5ba','#9fcfb2','#d6e3b2',
          '#8fbba1','#f2e3ab','#9dc8ba','#e9c8b8','#d6c8de'
        ],
        borderColor: 'rgba(86,73,53,0.25)',
        borderWidth: 1
      }]
    },
    options: {
      ...baseChartOptions(),
      plugins: { ...baseChartOptions().plugins, legend: { display: false } }
    }
  });
}

function makeHealthChart(healthCounts) {
  const order = ['Good', 'Fair', 'Poor', 'Unknown'];
  const labels = order.filter((k) => healthCounts[k] != null);
  const values = labels.map((k) => healthCounts[k]);

  destroyChart('healthChart');
  new Chart(document.getElementById('healthChart'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ['#b7e1c2', '#f2e3ab', '#e7b8b3', '#c7c4be'],
        borderColor: '#f2eee7',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: chartFontColor() } },
        tooltip: {
          backgroundColor: 'rgba(250,247,241,0.98)',
          titleColor: '#2f2a24',
          bodyColor: '#4f4538',
          borderColor: 'rgba(86,73,53,0.2)',
          borderWidth: 1
        }
      }
    }
  });
}

function makeWaterRetentionChart(speciesRetentionEntries) {
  const top = speciesRetentionEntries.slice(0, 8);
  const labels = top.map(([name]) => titleCase(name));
  const values = top.map(([, retentionM3]) => Number(retentionM3.toFixed(1)));

  destroyChart('waterRetentionChart');
  new Chart(document.getElementById('waterRetentionChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Estimated Retention (m³)',
        data: values,
        backgroundColor: '#b7c7a0',
        borderColor: 'rgba(86,73,53,0.25)',
        borderWidth: 1
      }]
    },
    options: {
      ...baseChartOptions(),
      indexAxis: 'y',
      plugins: { ...baseChartOptions().plugins, legend: { display: false } }
    }
  });
}

// Tree Density by Block — bucket trees into ~100m lat/lon grid cells
// (rounds lat/lon to 3 decimal places ≈ one city block)
function makeDensityByBlockChart(trees) {
  const blockCounts = {};
  for (const t of trees) {
    const lat = safeNumber(t.lat);
    const lon = safeNumber(t.lon);
    if (lat === null || lon === null) continue;
    const blockKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    blockCounts[blockKey] = (blockCounts[blockKey] || 0) + 1;
  }

  // Bin blocks into density categories
  const bins = { '1': 0, '2-3': 0, '4-6': 0, '7-10': 0, '11+': 0 };
  for (const count of Object.values(blockCounts)) {
    if (count === 1)       bins['1']++;
    else if (count <= 3)   bins['2-3']++;
    else if (count <= 6)   bins['4-6']++;
    else if (count <= 10)  bins['7-10']++;
    else                   bins['11+']++;
  }

  const labels = Object.keys(bins);
  const values = Object.values(bins);

  destroyChart('densityChart');
  new Chart(document.getElementById('densityChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Number of blocks',
        data: values,
        backgroundColor: ['#d6e3b2','#b8d7a5','#8fbba1','#6fa088','#4f8070'],
        borderColor: 'rgba(86,73,53,0.25)',
        borderWidth: 1
      }]
    },
    options: {
      ...baseChartOptions(),
      plugins: {
        ...baseChartOptions().plugins,
        legend: { display: false },
        tooltip: {
          ...baseChartOptions().plugins.tooltip,
          callbacks: {
            title: (items) => `${items[0].label} trees per block`,
            label: (item) => `${item.raw} block${item.raw !== 1 ? 's' : ''}`
          }
        }
      },
      scales: {
        x: {
          ...baseChartOptions().scales.x,
          title: { display: true, text: 'Trees per block', color: chartFontColor() }
        },
        y: {
          ...baseChartOptions().scales.y,
          title: { display: true, text: 'Number of blocks', color: chartFontColor() }
        }
      }
    }
  });
}

// ── Main ─────────────────────────────────────────────────────────────────

async function buildGowanusTreeDashboard() {
  try {
    const trees = await loadTreeData();

    const validTrees = trees.filter(
      (t) => safeNumber(t.lat) !== null && safeNumber(t.lon) !== null
    );
    const totalTrees = validTrees.length;

    const healthCountsRaw = countBy(validTrees, (t) => titleCase(t.health || 'Unknown'));
    const healthCounts = {
      Good:    healthCountsRaw.Good    || 0,
      Fair:    healthCountsRaw.Fair    || 0,
      Poor:    healthCountsRaw.Poor    || 0,
      Unknown: healthCountsRaw.Unknown || 0
    };

    const speciesCounts = countBy(validTrees, (t) => String(t.species || 'Unknown').trim());

    const studyAreaKm2    = getBoundingBoxAreaKm2(validTrees);
    const densityPerKm2   = studyAreaKm2 > 0 ? totalTrees / studyAreaKm2 : 0;

    const totalEstimatedCanopyM2 = sumBy(validTrees, (t) =>
      estimateCanopyAreaM2(safeNumber(t.dbh))
    );
    const totalEstimatedCanopyHa = totalEstimatedCanopyM2 / 10000;
    const studyAreaM2 = studyAreaKm2 * 1_000_000;
    const canopyCoveragePct = studyAreaM2 > 0
      ? (totalEstimatedCanopyM2 / studyAreaM2) * 100
      : 0;

    const totalEstimatedRetentionM3 = sumBy(validTrees, (t) =>
      estimateWaterRetentionM3(safeNumber(t.dbh))
    );

    const speciesRetention = {};
    for (const tree of validTrees) {
      const species   = String(tree.species || 'Unknown').trim();
      const retention = estimateWaterRetentionM3(safeNumber(tree.dbh));
      speciesRetention[species] = (speciesRetention[species] || 0) + retention;
    }
    const speciesRetentionEntries = sortEntriesDesc(speciesRetention);

    // Metrics
    renderMetric('totalTreesMetric',
      formatNumber(totalTrees),
      'Street trees in study area');

    renderMetric('canopyMetric',
      `${formatNumber(canopyCoveragePct, 1)}%`,
      `${formatNumber(totalEstimatedCanopyHa, 1)} ha estimated canopy`);

    renderMetric('densityMetric',
      formatNumber(densityPerKm2, 0),
      'Trees per km²');

    renderMetric('waterMetric',
      `${formatNumber(totalEstimatedRetentionM3, 0)} m³`,
      `${formatNumber(totalEstimatedRetentionM3 * 1000, 0)} L estimated storage`);

    renderMetric('studyAreaMetric',
      `${formatNumber(studyAreaKm2, 2)} km²`,
      'Bounding study area');

    const goodPct = totalTrees ? (healthCounts.Good / totalTrees) * 100 : 0;
    renderMetric('healthMetric',
      `${formatNumber(goodPct, 0)}%`,
      'Trees in good health');

    // Charts
    makeSpeciesChart(speciesCounts);
    makeHealthChart(healthCounts);
    makeWaterRetentionChart(speciesRetentionEntries);
    makeDensityByBlockChart(validTrees);

  } catch (error) {
    console.error('Failed to build diagrams page:', error);
    const errorBox = document.getElementById('diagramError');
    if (errorBox) {
      errorBox.textContent = `Could not load tree charts: ${error.message}`;
      errorBox.style.display = 'block';
    }
  }
}

document.addEventListener('DOMContentLoaded', buildGowanusTreeDashboard);
