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

function roundWhole(value) {
  return Math.round(value);
}

function sumObjectValues(obj) {
  return Object.values(obj).reduce((sum, n) => sum + n, 0);
}

const PROJECT_INPUTS = {
  areasSqFt: {
    site: 116563,
    pollinator: 20386,
    forest: 47996,
    wet: 20583
  },
  treeDensitySqFt: {
    forest: 400,
    wet: 500,
    pollinator: 800
  },
  shrubDensitySqFt: {
    forest: 100,
    wet: 120,
    pollinator: 150
  },
  groundDensitySqFt: {
    forest: 8,
    wet: 6,
    pollinator: 4
  },
  futureCanopyPerTreeSqFt: {
    forest: 350,
    wet: 300,
    pollinator: 200
  },
  conceptualBenefitWeights: {
    forest: {
      canopy: 1.0,
      birdHabitat: 0.9,
      cooling: 1.0,
      stormwater: 0.5,
      pollinator: 0.4,
      amphibianInsect: 0.0
    },
    wet: {
      canopy: 0.7,
      birdHabitat: 0.6,
      cooling: 0.6,
      stormwater: 1.0,
      pollinator: 0.5,
      amphibianInsect: 1.0
    },
    pollinator: {
      canopy: 0.3,
      birdHabitat: 0.5,
      cooling: 0.3,
      stormwater: 0.4,
      pollinator: 1.0,
      amphibianInsect: 0.0
    }
  }
};

function calculateParkContribution() {
  const { areasSqFt, treeDensitySqFt, shrubDensitySqFt, groundDensitySqFt, futureCanopyPerTreeSqFt, conceptualBenefitWeights } = PROJECT_INPUTS;

  const treesRaw = {
    forest: areasSqFt.forest / treeDensitySqFt.forest,
    wet: areasSqFt.wet / treeDensitySqFt.wet,
    pollinator: areasSqFt.pollinator / treeDensitySqFt.pollinator
  };

  const shrubsRaw = {
    forest: areasSqFt.forest / shrubDensitySqFt.forest,
    wet: areasSqFt.wet / shrubDensitySqFt.wet,
    pollinator: areasSqFt.pollinator / shrubDensitySqFt.pollinator
  };

  const groundRaw = {
    forest: areasSqFt.forest / groundDensitySqFt.forest,
    wet: areasSqFt.wet / groundDensitySqFt.wet,
    pollinator: areasSqFt.pollinator / groundDensitySqFt.pollinator
  };

  const futureCanopyRawSqFt = {
    forest: treesRaw.forest * futureCanopyPerTreeSqFt.forest,
    wet: treesRaw.wet * futureCanopyPerTreeSqFt.wet,
    pollinator: treesRaw.pollinator * futureCanopyPerTreeSqFt.pollinator
  };

  const treesDisplay = {
    forest: roundWhole(treesRaw.forest),
    wet: roundWhole(treesRaw.wet),
    pollinator: roundWhole(treesRaw.pollinator)
  };
  const shrubsDisplay = {
    forest: roundWhole(shrubsRaw.forest),
    wet: roundWhole(shrubsRaw.wet),
    pollinator: roundWhole(shrubsRaw.pollinator)
  };
  const groundDisplay = {
    forest: roundWhole(groundRaw.forest),
    wet: roundWhole(groundRaw.wet),
    pollinator: roundWhole(groundRaw.pollinator)
  };

  return {
    id: 'park',
    label: 'Park Intervention',
    available: true,
    scopeNote: 'Calculated from explicit park band areas and planting-density assumptions.',
    areasSqFt: {
      site: areasSqFt.site,
      intervention: areasSqFt.forest + areasSqFt.wet + areasSqFt.pollinator,
      forest: areasSqFt.forest,
      wet: areasSqFt.wet,
      pollinator: areasSqFt.pollinator
    },
    trees: {
      rawByBand: treesRaw,
      byBand: treesDisplay,
      total: sumObjectValues(treesDisplay)
    },
    shrubs: {
      rawByBand: shrubsRaw,
      byBand: shrubsDisplay,
      total: sumObjectValues(shrubsDisplay)
    },
    ground: {
      rawByBand: groundRaw,
      byBand: groundDisplay,
      total: sumObjectValues(groundDisplay)
    },
    futureCanopySqFt: {
      rawByBand: futureCanopyRawSqFt,
      rawTotal: sumObjectValues(futureCanopyRawSqFt),
      displayTotal: roundWhole(sumObjectValues(futureCanopyRawSqFt))
    },
    conceptualBenefitByBand: conceptualBenefitWeights,
    growthSeries: [
      { label: '0-2 yrs', factor: 0.35 },
      { label: '3-5 yrs', factor: 0.7 },
      { label: '5-10 yrs', factor: 1.0 }
    ]
  };
}

function createUnavailableContributor(id, label) {
  return {
    id,
    label,
    available: false,
    scopeNote: `${label} quantities not entered yet. Add source quantities later to activate this scope.`,
    areasSqFt: {
      site: PROJECT_INPUTS.areasSqFt.site,
      intervention: null,
      forest: null,
      wet: null,
      pollinator: null
    },
    trees: { byBand: { forest: null, wet: null, pollinator: null }, total: null },
    shrubs: { byBand: { forest: null, wet: null, pollinator: null }, total: null },
    ground: { byBand: { forest: null, wet: null, pollinator: null }, total: null },
    futureCanopySqFt: { rawByBand: { forest: null, wet: null, pollinator: null }, rawTotal: null, displayTotal: null },
    conceptualBenefitByBand: null,
    growthSeries: [
      { label: '0-2 yrs', factor: 0 },
      { label: '3-5 yrs', factor: 0 },
      { label: '5-10 yrs', factor: 0 }
    ]
  };
}

function buildProjectScopes() {
  const park = calculateParkContribution();
  const bioswales = createUnavailableContributor('bioswales', 'Bioswales');
  const streetTrees = createUnavailableContributor('streetTrees', 'Street Trees');

  const contributors = [park, bioswales, streetTrees];
  const active = contributors.filter((c) => c.available);

  const projectTotal = {
    id: 'projectTotal',
    label: 'Project Total',
    available: active.length > 0,
    isPartial: active.length < contributors.length,
    scopeNote: active.length < contributors.length
      ? 'Partial total: currently includes Park only. Bioswales and Street Trees are pending input.'
      : 'Complete total including all intervention contributors.',
    areasSqFt: {
      site: PROJECT_INPUTS.areasSqFt.site,
      intervention: active.reduce((sum, c) => sum + (c.areasSqFt.intervention || 0), 0),
      forest: active.reduce((sum, c) => sum + (c.areasSqFt.forest || 0), 0),
      wet: active.reduce((sum, c) => sum + (c.areasSqFt.wet || 0), 0),
      pollinator: active.reduce((sum, c) => sum + (c.areasSqFt.pollinator || 0), 0)
    },
    trees: {
      byBand: {
        forest: active.reduce((sum, c) => sum + (c.trees.byBand.forest || 0), 0),
        wet: active.reduce((sum, c) => sum + (c.trees.byBand.wet || 0), 0),
        pollinator: active.reduce((sum, c) => sum + (c.trees.byBand.pollinator || 0), 0)
      }
    },
    shrubs: {
      byBand: {
        forest: active.reduce((sum, c) => sum + (c.shrubs.byBand.forest || 0), 0),
        wet: active.reduce((sum, c) => sum + (c.shrubs.byBand.wet || 0), 0),
        pollinator: active.reduce((sum, c) => sum + (c.shrubs.byBand.pollinator || 0), 0)
      }
    },
    ground: {
      byBand: {
        forest: active.reduce((sum, c) => sum + (c.ground.byBand.forest || 0), 0),
        wet: active.reduce((sum, c) => sum + (c.ground.byBand.wet || 0), 0),
        pollinator: active.reduce((sum, c) => sum + (c.ground.byBand.pollinator || 0), 0)
      }
    },
    futureCanopySqFt: {
      displayTotal: roundWhole(active.reduce((sum, c) => sum + (c.futureCanopySqFt.rawTotal || 0), 0))
    },
    conceptualBenefitByBand: active.length ? PROJECT_INPUTS.conceptualBenefitWeights : null,
    growthSeries: [
      { label: '0-2 yrs', factor: 0.35 },
      { label: '3-5 yrs', factor: 0.7 },
      { label: '5-10 yrs', factor: 1.0 }
    ]
  };

  projectTotal.trees.total = sumObjectValues(projectTotal.trees.byBand);
  projectTotal.shrubs.total = sumObjectValues(projectTotal.shrubs.byBand);
  projectTotal.ground.total = sumObjectValues(projectTotal.ground.byBand);

  return { park, bioswales, streetTrees, projectTotal };
}

function renderPendingMetric(id, label = 'Pending input') {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `
    <div class="metric-value">--</div>
    <div class="metric-subtitle">${label}</div>
  `;
}

function makeBenefitBandChart(scope) {
  destroyChart('benefitBandChart');

  const canvas = document.getElementById('benefitBandChart');
  if (!canvas) return;

  if (!scope.conceptualBenefitByBand) {
    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['Canopy', 'Bird Habitat', 'Cooling', 'Stormwater', 'Pollinator', 'Amphibian/Insect'],
        datasets: [
          {
            label: 'Pending data',
            data: [0, 0, 0, 0, 0, 0],
            backgroundColor: 'rgba(170,160,145,0.45)',
            borderColor: 'rgba(130,120,105,0.45)',
            borderWidth: 1
          }
        ]
      },
      options: {
        ...baseChartOptions(),
        plugins: {
          ...baseChartOptions().plugins,
          legend: { display: false },
          tooltip: {
            ...baseChartOptions().plugins.tooltip,
            callbacks: {
              label: () => 'Awaiting bioswale/street-tree assumptions'
            }
          }
        }
      }
    });
    return;
  }

  const labels = ['Canopy', 'Bird Habitat', 'Cooling', 'Stormwater', 'Pollinator', 'Amphibian/Insect'];
  const keyMap = ['canopy', 'birdHabitat', 'cooling', 'stormwater', 'pollinator', 'amphibianInsect'];

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Forest Band',
          data: keyMap.map((k) => scope.conceptualBenefitByBand.forest[k] || 0),
          backgroundColor: 'rgba(79,127,99,0.58)',
          borderColor: 'rgba(79,127,99,0.9)',
          borderWidth: 1
        },
        {
          label: 'Wet Band',
          data: keyMap.map((k) => scope.conceptualBenefitByBand.wet[k] || 0),
          backgroundColor: 'rgba(112,143,168,0.58)',
          borderColor: 'rgba(112,143,168,0.9)',
          borderWidth: 1
        },
        {
          label: 'Pollinator Band',
          data: keyMap.map((k) => scope.conceptualBenefitByBand.pollinator[k] || 0),
          backgroundColor: 'rgba(178,157,98,0.58)',
          borderColor: 'rgba(178,157,98,0.9)',
          borderWidth: 1
        }
      ]
    },
    options: {
      ...baseChartOptions(),
      scales: {
        x: {
          ...baseChartOptions().scales.x,
          stacked: false
        },
        y: {
          ...baseChartOptions().scales.y,
          min: 0,
          max: 1,
          ticks: {
            color: chartFontColor(),
            stepSize: 0.2
          }
        }
      }
    }
  });
}

function makeImprovementGrowthChart(scope) {
  destroyChart('improvementGrowthChart');

  const canvas = document.getElementById('improvementGrowthChart');
  if (!canvas) return;

  const labels = scope.growthSeries.map((s) => s.label);
  const treesSeries = scope.growthSeries.map((s) =>
    scope.trees.total != null ? roundWhole(scope.trees.total * s.factor) : 0
  );
  const canopySeries = scope.growthSeries.map((s) =>
    scope.futureCanopySqFt.displayTotal != null
      ? Number(((scope.futureCanopySqFt.displayTotal * s.factor) / 1000).toFixed(1))
      : 0
  );
  const shrubSeries = scope.growthSeries.map((s) =>
    scope.shrubs.total != null ? roundWhole(scope.shrubs.total * s.factor) : 0
  );
  const groundSeries = scope.growthSeries.map((s) =>
    scope.ground.total != null ? roundWhole(scope.ground.total * s.factor) : 0
  );

  new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Trees (count)',
          data: treesSeries,
          borderColor: '#4f7f63',
          backgroundColor: 'rgba(79,127,99,0.1)',
          tension: 0.25,
          pointRadius: 3
        },
        {
          label: 'Canopy (thousand sq ft)',
          data: canopySeries,
          borderColor: '#6d8ca7',
          backgroundColor: 'rgba(109,140,167,0.1)',
          tension: 0.25,
          pointRadius: 3
        },
        {
          label: 'Shrubs (count)',
          data: shrubSeries,
          borderColor: '#9a7a52',
          backgroundColor: 'rgba(154,122,82,0.1)',
          tension: 0.25,
          pointRadius: 3
        },
        {
          label: 'Ground / Perennials (count)',
          data: groundSeries,
          borderColor: '#b29d62',
          backgroundColor: 'rgba(178,157,98,0.1)',
          tension: 0.25,
          pointRadius: 3
        }
      ]
    },
    options: {
      ...baseChartOptions(),
      interaction: {
        mode: 'index',
        intersect: false
      }
    }
  });
}

function renderImprovementScope(scope) {
  const scopeNote = document.getElementById('improvementScopeNote');
  if (scopeNote) {
    scopeNote.textContent = scope.scopeNote;
  }

  if (!scope.available) {
    renderPendingMetric('addedTreesMetric', 'Pending quantity assumptions');
    renderPendingMetric('addedCanopyMetric', 'Pending quantity assumptions');
    renderPendingMetric('addedShrubsMetric', 'Pending quantity assumptions');
    renderPendingMetric('addedGroundMetric', 'Pending quantity assumptions');
    renderPendingMetric('interventionAreaMetric', 'Pending area assumptions');
    renderPendingMetric('coverageStateMetric', 'Not yet included in project total');
    makeBenefitBandChart(scope);
    makeImprovementGrowthChart(scope);
    return;
  }

  renderMetric(
    'addedTreesMetric',
    formatNumber(scope.trees.total),
    `Forest ${formatNumber(scope.trees.byBand.forest)} · Wet ${formatNumber(scope.trees.byBand.wet)} · Pollinator ${formatNumber(scope.trees.byBand.pollinator)}`
  );

  renderMetric(
    'addedCanopyMetric',
    `${formatNumber(scope.futureCanopySqFt.displayTotal)} sq ft`,
    `${formatNumber(scope.futureCanopySqFt.displayTotal / 43560, 2)} acres future canopy`
  );

  renderMetric(
    'addedShrubsMetric',
    formatNumber(scope.shrubs.total),
    `Forest ${formatNumber(scope.shrubs.byBand.forest)} · Wet ${formatNumber(scope.shrubs.byBand.wet)} · Pollinator ${formatNumber(scope.shrubs.byBand.pollinator)}`
  );

  renderMetric(
    'addedGroundMetric',
    formatNumber(scope.ground.total),
    `Forest ${formatNumber(scope.ground.byBand.forest)} · Wet ${formatNumber(scope.ground.byBand.wet)} · Pollinator ${formatNumber(scope.ground.byBand.pollinator)}`
  );

  renderMetric(
    'interventionAreaMetric',
    `${formatNumber(scope.areasSqFt.intervention)} sq ft`,
    `of ${formatNumber(scope.areasSqFt.site)} sq ft site`
  );

  renderMetric(
    'coverageStateMetric',
    scope.isPartial ? 'Partial' : 'Active',
    scope.isPartial
      ? 'Total currently includes Park only (Bioswales and Street Trees pending).'
      : 'Contributor scope active in project math.'
  );

  makeBenefitBandChart(scope);
  makeImprovementGrowthChart(scope);
}

function setupImprovementToggle() {
  const scopes = buildProjectScopes();
  const tabs = Array.from(document.querySelectorAll('.improvement-tab'));
  if (!tabs.length) return;

  function setActiveTab(active) {
    tabs.forEach((tab) => {
      const isActive = tab === active;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const key = tab.dataset.scope;
      if (!scopes[key]) return;
      setActiveTab(tab);
      renderImprovementScope(scopes[key]);
    });
  });

  const initial = tabs.find((tab) => tab.dataset.scope === 'park') || tabs[0];
  setActiveTab(initial);
  renderImprovementScope(scopes[initial.dataset.scope]);
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
    setupImprovementToggle();

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
