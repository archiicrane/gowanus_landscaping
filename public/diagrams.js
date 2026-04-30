// diagrams.js - Gowanus Environmental Analysis Dashboard
// Sources: gowanus_trees_clean.json, gowanus-buildings.geojson,
//          flood-vulnerability.geojson, Citywide_Outfalls_20260416.geojson,
//          gowanus_existing/proposed_flora_fauna.csv, planting-bands.geojson

async function loadTreeData() {
  const response = await fetch('/data/gowanus_trees_clean.json');
  if (!response.ok) {
    throw new Error(`Failed to load tree data: ${response.status} ${response.statusText}`);
  }
  const rawText = await response.text();
  const cleanedText = rawText.replace(/\bNaN\b/g, 'null');
  return JSON.parse(cleanedText);
}

// ── Generic loaders ───────────────────────────────────────────────────────

async function loadGeoJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

async function loadCSV(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load CSV ${url}: ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim().replace(/^"|"$/g, ''); });
    return obj;
  });
}

// ── Spatial helpers ───────────────────────────────────────────────────────

// Bounding box for the Gowanus study corridor (WGS84)
const GOWANUS_BBOX = { minLon: -74.003, minLat: 40.662, maxLon: -73.973, maxLat: 40.692 };

function inGowanusBox(lon, lat) {
  return lon >= GOWANUS_BBOX.minLon && lon <= GOWANUS_BBOX.maxLon
      && lat >= GOWANUS_BBOX.minLat && lat <= GOWANUS_BBOX.maxLat;
}

// Shoelace polygon area in m² (lat/lon coords)
function polygonAreaM2(ring) {
  const RAD = Math.PI / 180;
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[j];
    const x1 = lon1 * 111320 * Math.cos(lat1 * RAD);
    const y1 = lat1 * 110540;
    const x2 = lon2 * 111320 * Math.cos(lat2 * RAD);
    const y2 = lat2 * 110540;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
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

// ── Species-specific canopy lookup (mature canopy diameter in feet) ──────
// Derived from NYC Parks tree species metadata. Keys lowercase-normalized.
const SPECIES_CANOPY_FT = {
  "'schubert' chokecherry": 25,
  'american elm': 60,
  'american linden': 65,
  'amur maackia': 60,
  'amur maple': 40,
  'ash': 65,
  'bald cypress': 50,
  'black walnut': 62,
  'blackgum': 40,
  'bur oak': 75,
  'callery pear': 40,
  'cherry': 30,
  'chinese chestnut': 50,
  'chinese elm': 45,
  'chinese fringetree': 20,
  'common hackberry': 50,
  'cornelian cherry': 20,
  'crab apple': 28,
  'crimson king maple': 40,
  'douglas-fir': 85,
  'eastern redbud': 25,
  'english oak': 85,
  'flowering dogwood': 22,
  'ginkgo': 40,
  'golden raintree': 35,
  'green ash': 60,
  'hardy rubber tree': 50,
  'honeylocust': 50,
  'japanese hornbeam': 25,
  'japanese maple': 20,
  'japanese snowbell': 25,
  'japanese tree lilac': 25,
  'japanese zelkova': 50,
  'katsura tree': 50,
  'kentucky coffeetree': 68,
  'kentucky yellowwood': 40,
  'littleleaf linden': 40,
  'london planetree': 55,
  'northern red oak': 68,
  'oklahoma redbud': 20,
  'pine': 75,
  'pin oak': 55,
  'pond cypress': 50,
  'purple-leaf plum': 20,
  'red maple': 50,
  'schumard\'s oak': 60,
  'siberian elm': 60,
  'silver birch': 40,
  'silver linden': 60,
  'silver maple': 60,
  'smoketree': 12,
  'sophora': 40,
  'sugar maple': 68,
  'swamp white oak': 55,
  'sweetgum': 68,
  'tree of heaven': 50,
  'white oak': 90,
  'willow oak': 70,
  'norway maple': 45,
};

// Water retention category per species (High = tolerates flooding / wetland adapted)
const SPECIES_WATER_CATEGORY = {
  'american elm': 'High',
  'blackgum': 'High',
  'pond cypress': 'High',
  'swamp white oak': 'High',
  'bald cypress': 'High',
  'red maple': 'High',
  'pin oak': 'High',
  'sweetgum': 'High',
  'green ash': 'High',
  'silver maple': 'High',
};

// Interception rate by category (fraction of rainfall captured annually)
const INTERCEPTION_RATE = { High: 0.20, Medium: 0.14 };
// NYC average annual rainfall: 46.5 inches
const NYC_ANNUAL_RAINFALL_FT = 46.5 / 12;

function speciesCanopyDiameterM(speciesName) {
  const key = speciesName ? speciesName.toLowerCase().trim() : '';
  const canopyFt = SPECIES_CANOPY_FT[key];
  if (canopyFt) return canopyFt * 0.3048;
  return 12; // default 12m (~40 ft) when species unknown
}

// ── Canopy + water retention estimates ──────────────────────────────────

function estimateCanopyDiameterMeters(dbhInches, speciesName) {
  if (Number.isFinite(dbhInches) && dbhInches > 0) {
    return Math.max(6, Math.min(18, 4 + dbhInches * 0.35));
  }
  return speciesCanopyDiameterM(speciesName);
}

function estimateCanopyAreaM2(dbhInches, speciesName) {
  const diameter = estimateCanopyDiameterMeters(dbhInches, speciesName);
  const radius = diameter / 2;
  return Math.PI * radius * radius;
}

const EFFECTIVE_SOIL_DEPTH_M = 0.9144;    // 3 ft
const AVAILABLE_WATER_FRACTION = 0.20;

function estimateWaterRetentionM3(dbhInches, speciesName) {
  const canopyArea = estimateCanopyAreaM2(dbhInches, speciesName);
  return canopyArea * EFFECTIVE_SOIL_DEPTH_M * AVAILABLE_WATER_FRACTION;
}

// Annual rainfall interception in gallons (i-Tree simplified model)
function estimateAnnualInterceptionGallons(speciesName, dbhInches) {
  const key = speciesName ? speciesName.toLowerCase().trim() : '';
  const category = SPECIES_WATER_CATEGORY[key] || 'Medium';
  const rate = INTERCEPTION_RATE[category];
  const canopyAreaM2 = estimateCanopyAreaM2(dbhInches, speciesName);
  const canopyAreaFt2 = canopyAreaM2 * 10.7639;
  const interceptedFt3 = canopyAreaFt2 * NYC_ANNUAL_RAINFALL_FT * rate;
  return interceptedFt3 * 7.48052; // ft³ → gallons
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

const CHART_PALETTE = {
  greenFill: 'rgba(111,131,112,0.58)',
  greenStroke: 'rgba(111,131,112,0.9)',
  sageFill: 'rgba(134,148,129,0.58)',
  sageStroke: 'rgba(134,148,129,0.9)',
  purpleFill: 'rgba(138,131,152,0.56)',
  purpleStroke: 'rgba(138,131,152,0.88)',
  grayFill: 'rgba(125,132,112,0.56)',
  grayStroke: 'rgba(125,132,112,0.88)',
  neutralFill: 'rgba(170,160,145,0.45)',
  neutralStroke: 'rgba(130,120,105,0.45)'
};

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
    scopeNote: 'Based on park band areas and planting density assumptions.',
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
    scopeNote: `${label} quantities are not entered yet.`,
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
      ? 'Partial total: Park only. Bioswales and Street Trees pending.'
      : 'Complete total across all contributors.',
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
            backgroundColor: CHART_PALETTE.neutralFill,
            borderColor: CHART_PALETTE.neutralStroke,
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
          backgroundColor: CHART_PALETTE.greenFill,
          borderColor: CHART_PALETTE.greenStroke,
          borderWidth: 1
        },
        {
          label: 'Wet Band',
          data: keyMap.map((k) => scope.conceptualBenefitByBand.wet[k] || 0),
          backgroundColor: CHART_PALETTE.purpleFill,
          borderColor: CHART_PALETTE.purpleStroke,
          borderWidth: 1
        },
        {
          label: 'Pollinator Band',
          data: keyMap.map((k) => scope.conceptualBenefitByBand.pollinator[k] || 0),
          backgroundColor: CHART_PALETTE.grayFill,
          borderColor: CHART_PALETTE.grayStroke,
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
          borderColor: '#6f8370',
          backgroundColor: 'rgba(111,131,112,0.12)',
          tension: 0.25,
          pointRadius: 3
        },
        {
          label: 'Canopy (thousand sq ft)',
          data: canopySeries,
          borderColor: '#8a8398',
          backgroundColor: 'rgba(138,131,152,0.12)',
          tension: 0.25,
          pointRadius: 3
        },
        {
          label: 'Shrubs (count)',
          data: shrubSeries,
          borderColor: '#869481',
          backgroundColor: 'rgba(134,148,129,0.12)',
          tension: 0.25,
          pointRadius: 3
        },
        {
          label: 'Ground / Perennials (count)',
          data: groundSeries,
          borderColor: '#7d8470',
          backgroundColor: 'rgba(125,132,112,0.12)',
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
      ? 'Park included; bioswales and street trees pending.'
      : 'All contributors included.'
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
          '#9cae99','#8fa28d','#869c84','#8a8398','#9a94a7',
          '#7d8470','#a2aa9a','#7a8f7b','#8d8f80','#a6a1b1'
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
        backgroundColor: ['#8fa28d', '#869481', '#8a8398', '#b9b5ad'],
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
        backgroundColor: '#9cae99',
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

// Annual Interception by Water Category - donut chart
function makeWaterCategoryChart(categoryInterception) {
  const highGal   = categoryInterception.High   || 0;
  const mediumGal = categoryInterception.Medium  || 0;
  const total = highGal + mediumGal;

  destroyChart('waterCategoryChart');
  new Chart(document.getElementById('waterCategoryChart'), {
    type: 'doughnut',
    data: {
      labels: ['Wetland-Adapted (High)', 'Deciduous Shade (Medium)'],
      datasets: [{
        data: [
          Number((highGal / 1000).toFixed(0)),
          Number((mediumGal / 1000).toFixed(0))
        ],
        backgroundColor: ['#5a8fa3', '#9cae99'],
        borderColor: 'rgba(86,73,53,0.18)',
        borderWidth: 1.5
      }]
    },
    options: {
      ...baseChartOptions(),
      cutout: '60%',
      plugins: {
        ...baseChartOptions().plugins,
        legend: { position: 'bottom', labels: { color: chartFontColor(), padding: 14, boxWidth: 14 } },
        tooltip: {
          ...baseChartOptions().plugins.tooltip,
          callbacks: {
            label: (item) => {
              const val = item.raw;
              const pct = total > 0 ? ((val / (total / 1000)) * 100).toFixed(1) : 0;
              return ` ${formatNumber(val, 0)}K gal/yr  (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// Tree Density by Block - bucket trees into ~100m lat/lon grid cells
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
        backgroundColor: ['#b7bdab','#a4ae97','#919f83','#7f9075','#6f8370'],
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

// ── Urban Fabric Charts ───────────────────────────────────────────────────

function makeBuildingHeightChart(buildings) {
  const bins = { '<5 m': 0, '5–10 m': 0, '10–20 m': 0, '20–35 m': 0, '>35 m': 0 };
  for (const feat of buildings) {
    const h = parseFloat((feat.properties || {}).height);
    if (!isFinite(h)) continue;
    if (h < 5)        bins['<5 m']++;
    else if (h < 10)  bins['5–10 m']++;
    else if (h < 20)  bins['10–20 m']++;
    else if (h < 35)  bins['20–35 m']++;
    else              bins['>35 m']++;
  }
  const palette = ['#c5bfb3', '#b3aa98', '#9f9483', '#8a7d6d', '#756858'];
  destroyChart('buildingHeightChart');
  new Chart(document.getElementById('buildingHeightChart'), {
    type: 'bar',
    data: {
      labels: Object.keys(bins),
      datasets: [{ label: 'Buildings', data: Object.values(bins),
        backgroundColor: palette, borderColor: 'rgba(86,73,53,0.18)', borderWidth: 1 }]
    },
    options: {
      ...baseChartOptions(),
      plugins: { ...baseChartOptions().plugins, legend: { display: false },
        tooltip: { ...baseChartOptions().plugins.tooltip,
          callbacks: { label: (i) => ` ${formatNumber(i.raw)} buildings` } } },
      scales: {
        x: { ...baseChartOptions().scales.x, title: { display: true, text: 'Height Class', color: chartFontColor(), font: { size: 10 } } },
        y: { ...baseChartOptions().scales.y, title: { display: true, text: 'Count', color: chartFontColor(), font: { size: 10 } } }
      }
    }
  });
}

function makeBuildingTypeChart(buildings) {
  const rawCounts = {};
  for (const feat of buildings) {
    const t = (feat.properties || {}).building || 'untagged';
    rawCounts[t] = (rawCounts[t] || 0) + 1;
  }
  // Collapse minor types
  const merged = { Industrial: 0, Residential: 0, Hotel: 0, 'Mixed / Other': 0 };
  for (const [type, count] of Object.entries(rawCounts)) {
    if (['industrial', 'warehouse'].includes(type))                       merged.Industrial += count;
    else if (['apartments', 'residential', 'yes'].includes(type))         merged.Residential += count;
    else if (type === 'hotel')                                            merged.Hotel += count;
    else                                                                  merged['Mixed / Other'] += count;
  }
  const labels = Object.keys(merged).filter(k => merged[k] > 0);
  const values = labels.map(k => merged[k]);
  const colors = ['#8a7d6d', '#9cae99', '#7a9aac', '#c5bfb3'];
  destroyChart('buildingTypeChart');
  new Chart(document.getElementById('buildingTypeChart'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length),
        borderColor: 'rgba(86,73,53,0.12)', borderWidth: 1.5 }] },
    options: {
      ...baseChartOptions(), cutout: '58%',
      plugins: { ...baseChartOptions().plugins,
        legend: { position: 'bottom', labels: { color: chartFontColor(), padding: 14, boxWidth: 14 } },
        tooltip: { ...baseChartOptions().plugins.tooltip,
          callbacks: { label: (i) => ` ${formatNumber(i.raw)} buildings (${((i.raw / buildings.length) * 100).toFixed(1)}%)` } } }
    }
  });
}

// ── Flood & Stormwater Charts ─────────────────────────────────────────────

function makeFloodRiskChart(floodFeats) {
  // ss_cur: current storm surge vulnerability 1 (low) → 5 (high)
  const labels = ['1 — Low', '2', '3', '4', '5 — High'];
  const cur   = [0, 0, 0, 0, 0];
  const fut50 = [0, 0, 0, 0, 0];
  for (const feat of floodFeats) {
    const p = feat.properties || {};
    const c = parseInt(p.ss_cur); const f = parseInt(p.ss_50s);
    if (c >= 1 && c <= 5) cur[c - 1]++;
    if (f >= 1 && f <= 5) fut50[f - 1]++;
  }
  destroyChart('floodRiskChart');
  new Chart(document.getElementById('floodRiskChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Current', data: cur, backgroundColor: 'rgba(122,154,172,0.7)', borderColor: 'rgba(122,154,172,0.9)', borderWidth: 1 },
        { label: '2050s Projection', data: fut50, backgroundColor: 'rgba(168,107,90,0.65)', borderColor: 'rgba(168,107,90,0.9)', borderWidth: 1 }
      ]
    },
    options: {
      ...baseChartOptions(),
      plugins: { ...baseChartOptions().plugins,
        legend: { labels: { color: chartFontColor(), boxWidth: 12 } },
        tooltip: { ...baseChartOptions().plugins.tooltip,
          callbacks: { title: (i) => `Risk Level ${i[0].label}`, label: (i) => ` ${i.dataset.label}: ${formatNumber(i.raw)} parcels` } } },
      scales: {
        x: { ...baseChartOptions().scales.x, stacked: false },
        y: { ...baseChartOptions().scales.y, title: { display: true, text: 'Parcels', color: chartFontColor(), font: { size: 10 } } }
      }
    }
  });
}

function makeOutfallTypesChart(outfallFeats) {
  // Filter to Gowanus bounding box
  const nearby = outfallFeats.filter(f => {
    const [lon, lat] = f.geometry.coordinates;
    return inGowanusBox(lon, lat);
  });
  const counts = {};
  for (const f of nearby) {
    const t = (f.properties || {}).outfall_ty || 'Unknown';
    counts[t] = (counts[t] || 0) + 1;
  }
  const LABELS = {
    CSO: 'Combined Sewer Overflow',
    DIRECT: 'Direct Discharge',
    MS4: 'Separate Storm Sewer',
    HIGHWAY: 'Highway Runoff',
    ABND: 'Abandoned',
    STATE: 'State-Permitted',
    PLANT: 'Treatment Plant',
  };
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const labels = entries.map(([k]) => LABELS[k] || k);
  const values = entries.map(([, v]) => v);
  const palette = ['#a86b5a', '#7a9aac', '#9cae99', '#c5bfb3', '#8a7d6d', '#b3aa98', '#9f9483'];
  destroyChart('outfallTypesChart');
  new Chart(document.getElementById('outfallTypesChart'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: palette.slice(0, labels.length),
        borderColor: 'rgba(86,73,53,0.12)', borderWidth: 1.5 }] },
    options: {
      ...baseChartOptions(), cutout: '55%',
      plugins: { ...baseChartOptions().plugins,
        legend: { position: 'bottom', labels: { color: chartFontColor(), padding: 10, boxWidth: 12, font: { size: 11 } } },
        tooltip: { ...baseChartOptions().plugins.tooltip,
          callbacks: { label: (i) => ` ${formatNumber(i.raw)} outfalls (${((i.raw / nearby.length) * 100).toFixed(1)}%)` } } }
    }
  });
}

// ── Rewilding Scenario Charts ─────────────────────────────────────────────

function makeBeforeAfterChart(existingRows, proposedRows) {
  const CATEGORIES = ['tree', 'shrub', 'perennial', 'grass', 'vine'];
  const existCounts = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  const propCounts  = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  for (const r of existingRows) { const c = (r.category || '').toLowerCase(); if (c in existCounts) existCounts[c]++; }
  for (const r of proposedRows) { const c = (r.category || '').toLowerCase(); if (c in propCounts)  propCounts[c]++; }
  const labels = CATEGORIES.map(c => c.charAt(0).toUpperCase() + c.slice(1) + 's');
  destroyChart('beforeAfterChart');
  new Chart(document.getElementById('beforeAfterChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Existing', data: CATEGORIES.map(c => existCounts[c]),
          backgroundColor: 'rgba(155,174,152,0.7)', borderColor: 'rgba(155,174,152,0.9)', borderWidth: 1 },
        { label: 'Proposed', data: CATEGORIES.map(c => propCounts[c]),
          backgroundColor: 'rgba(122,154,172,0.7)', borderColor: 'rgba(122,154,172,0.9)', borderWidth: 1 }
      ]
    },
    options: {
      ...baseChartOptions(),
      plugins: { ...baseChartOptions().plugins,
        legend: { labels: { color: chartFontColor(), boxWidth: 12 } } },
      scales: {
        x: { ...baseChartOptions().scales.x },
        y: { ...baseChartOptions().scales.y, title: { display: true, text: 'Species count', color: chartFontColor(), font: { size: 10 } },
          ticks: { ...baseChartOptions().scales.y.ticks, precision: 0 } }
      }
    }
  });
}

function makeProposedPhaseChart(proposedRows) {
  const phases = {};
  for (const r of proposedRows) {
    const p = r.phase ? r.phase.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Unphased';
    phases[p] = (phases[p] || 0) + 1;
  }
  const labels = Object.keys(phases);
  const values = Object.values(phases);
  const palette = ['#9cae99', '#7a9aac', '#c5a882', '#c5bfb3'];
  destroyChart('proposedPhaseChart');
  new Chart(document.getElementById('proposedPhaseChart'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: palette.slice(0, labels.length),
        borderColor: 'rgba(86,73,53,0.12)', borderWidth: 1.5 }] },
    options: {
      ...baseChartOptions(), cutout: '58%',
      plugins: { ...baseChartOptions().plugins,
        legend: { position: 'bottom', labels: { color: chartFontColor(), padding: 14, boxWidth: 14 } },
        tooltip: { ...baseChartOptions().plugins.tooltip,
          callbacks: { label: (i) => ` ${formatNumber(i.raw)} species` } } }
    }
  });
}

function makeEcologicalRoleChart(proposedRows) {
  const roles = {};
  for (const r of proposedRows) {
    const role = (r.ecological_role || 'other').trim()
      .replace(/\b\w/g, c => c.toUpperCase());
    roles[role] = (roles[role] || 0) + 1;
  }
  const entries = Object.entries(roles).sort((a, b) => b[1] - a[1]);
  const labels = entries.map(([k]) => k);
  const values = entries.map(([, v]) => v);
  destroyChart('ecologicalRoleChart');
  new Chart(document.getElementById('ecologicalRoleChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Proposed Species', data: values,
        backgroundColor: 'rgba(156,174,153,0.75)', borderColor: 'rgba(86,73,53,0.2)', borderWidth: 1 }]
    },
    options: {
      ...baseChartOptions(), indexAxis: 'y',
      plugins: { ...baseChartOptions().plugins, legend: { display: false },
        tooltip: { ...baseChartOptions().plugins.tooltip,
          callbacks: { label: (i) => ` ${i.raw} species` } } },
      scales: {
        x: { ...baseChartOptions().scales.x, ticks: { ...baseChartOptions().scales.x.ticks, precision: 0 } },
        y: { ...baseChartOptions().scales.y, ticks: { ...baseChartOptions().scales.y.ticks, font: { size: 11 } } }
      }
    }
  });
}

function makeZoneBreakdownChart(existingRows, proposedRows) {
  const zones = [...new Set([...existingRows, ...proposedRows].map(r => r.zone))].filter(Boolean);
  const existByZone = Object.fromEntries(zones.map(z => [z, 0]));
  const propByZone  = Object.fromEntries(zones.map(z => [z, 0]));
  for (const r of existingRows) { if (r.zone in existByZone) existByZone[r.zone]++; }
  for (const r of proposedRows)  { if (r.zone in propByZone)  propByZone[r.zone]++; }
  destroyChart('zoneBreakdownChart');
  new Chart(document.getElementById('zoneBreakdownChart'), {
    type: 'bar',
    data: {
      labels: zones,
      datasets: [
        { label: 'Existing', data: zones.map(z => existByZone[z]),
          backgroundColor: 'rgba(155,174,152,0.72)', borderColor: 'rgba(155,174,152,0.92)', borderWidth: 1 },
        { label: 'Proposed', data: zones.map(z => propByZone[z]),
          backgroundColor: 'rgba(122,154,172,0.65)', borderColor: 'rgba(122,154,172,0.92)', borderWidth: 1 }
      ]
    },
    options: {
      ...baseChartOptions(),
      plugins: { ...baseChartOptions().plugins, legend: { labels: { color: chartFontColor(), boxWidth: 12 } } },
      scales: {
        x: { ...baseChartOptions().scales.x, ticks: { ...baseChartOptions().scales.x.ticks, font: { size: 11 } } },
        y: { ...baseChartOptions().scales.y, title: { display: true, text: 'Species count', color: chartFontColor(), font: { size: 10 } },
          ticks: { ...baseChartOptions().scales.y.ticks, precision: 0 } }
      }
    }
  });
}

// ── Urban analysis orchestrator ───────────────────────────────────────────

async function buildUrbanAnalysis() {
  try {
    const [buildingGeo, floodGeo, outfallGeo, existingFlora, proposedFlora] = await Promise.all([
      loadGeoJSON('/data/gowanus-buildings.geojson'),
      loadGeoJSON('/data/flood-vulnerability.geojson'),
      loadGeoJSON('/data/Citywide_Outfalls_20260416.geojson'),
      loadCSV('/data/gowanus_existing_flora_fauna.csv'),
      loadCSV('/data/gowanus_proposed_flora_fauna.csv'),
    ]);

    const buildings    = buildingGeo.features || [];
    const floodFeats   = floodGeo.features    || [];
    const outfallFeats = outfallGeo.features   || [];

    // ── Urban fabric metrics
    const totalBuildings = buildings.length;
    const heights = buildings.map(f => parseFloat((f.properties || {}).height)).filter(isFinite);
    const avgHeight = heights.length ? heights.reduce((a, b) => a + b, 0) / heights.length : 0;
    const industrialCount = buildings.filter(f =>
      ['industrial', 'warehouse'].includes((f.properties || {}).building)
    ).length;

    renderMetric('urbanBuildingsMetric',
      formatNumber(totalBuildings),
      `avg ${formatNumber(avgHeight, 1)} m height`);
    renderMetric('urbanIndustrialMetric',
      `${formatNumber((industrialCount / totalBuildings) * 100, 1)}%`,
      `${industrialCount} industrial / warehouse`);

    // ── Flood metrics
    const highRisk = floodFeats.filter(f => {
      const v = parseInt((f.properties || {}).ss_cur);
      return v >= 4;
    }).length;
    const futureHighRisk = floodFeats.filter(f => {
      const v = parseInt((f.properties || {}).ss_50s);
      return v >= 4;
    }).length;
    renderMetric('floodHighRiskMetric',
      formatNumber(highRisk),
      `parcels at risk today (level 4–5)`);
    renderMetric('floodFutureMetric',
      formatNumber(futureHighRisk),
      'parcels at risk by 2050s');

    // ── Outfall metrics
    const nearbyOutfalls = outfallFeats.filter(f => {
      const [lon, lat] = f.geometry.coordinates;
      return inGowanusBox(lon, lat);
    });
    const csoCount = nearbyOutfalls.filter(f => (f.properties || {}).outfall_ty === 'CSO').length;
    const directCount = nearbyOutfalls.filter(f => (f.properties || {}).outfall_ty === 'DIRECT').length;
    renderMetric('outfallsTotalMetric',
      formatNumber(nearbyOutfalls.length),
      'stormwater outfalls in corridor');
    renderMetric('outfallsCSOMetric',
      formatNumber(csoCount),
      `combined sewer overflows + ${directCount} direct discharge`);

    // ── Rewilding metrics
    const existingCount = existingFlora.length;
    const proposedCount = proposedFlora.length;
    const netGain = proposedCount - existingCount;
    renderMetric('rewildingExistingMetric',
      formatNumber(existingCount),
      'baseline species in study area');
    renderMetric('rewildingProposedMetric',
      `+${formatNumber(netGain)}`,
      `${formatNumber(proposedCount)} species proposed total`);

    // ── Charts
    makeBuildingHeightChart(buildings);
    makeBuildingTypeChart(buildings);
    makeFloodRiskChart(floodFeats);
    makeOutfallTypesChart(outfallFeats);
    makeBeforeAfterChart(existingFlora, proposedFlora);
    makeProposedPhaseChart(proposedFlora);
    makeEcologicalRoleChart(proposedFlora);
    makeZoneBreakdownChart(existingFlora, proposedFlora);

  } catch (err) {
    console.error('Urban analysis failed:', err);
  }
}

function initDiagramsBackgroundParallax() {
  const page = document.body;
  if (!page || !page.classList.contains('diagrams-page')) return;

  const applyScrollShift = () => {
    const y = window.scrollY || window.pageYOffset || 0;
    page.style.setProperty('--diagram-bg-shift', `${y}px`);
  };

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      applyScrollShift();
      ticking = false;
    });
  }, { passive: true });

  applyScrollShift();
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
      estimateCanopyAreaM2(safeNumber(t.dbh), t.species)
    );
    const totalEstimatedCanopyHa = totalEstimatedCanopyM2 / 10000;
    const studyAreaM2 = studyAreaKm2 * 1_000_000;
    const canopyCoveragePct = studyAreaM2 > 0
      ? (totalEstimatedCanopyM2 / studyAreaM2) * 100
      : 0;

    const totalEstimatedRetentionM3 = sumBy(validTrees, (t) =>
      estimateWaterRetentionM3(safeNumber(t.dbh), t.species)
    );

    // Annual rainfall interception (gallons/year) using NYC precipitation data
    const totalAnnualInterceptionGal = sumBy(validTrees, (t) =>
      estimateAnnualInterceptionGallons(t.species, safeNumber(t.dbh))
    );

    const speciesRetention = {};
    const categoryInterception = { High: 0, Medium: 0 };
    for (const tree of validTrees) {
      const species   = String(tree.species || 'Unknown').trim();
      const retention = estimateWaterRetentionM3(safeNumber(tree.dbh), species);
      speciesRetention[species] = (speciesRetention[species] || 0) + retention;

      const catKey = species.toLowerCase().trim();
      const cat = SPECIES_WATER_CATEGORY[catKey] || 'Medium';
      categoryInterception[cat] = (categoryInterception[cat] || 0) +
        estimateAnnualInterceptionGallons(species, safeNumber(tree.dbh));
    }
    const speciesRetentionEntries = sortEntriesDesc(speciesRetention);

    // Metrics
    renderMetric('totalTreesMetric',
      formatNumber(totalTrees),
      'Mapped street trees');

    renderMetric('canopyMetric',
      `${formatNumber(canopyCoveragePct, 1)}%`,
      `${formatNumber(totalEstimatedCanopyHa, 1)} ha canopy`);

    renderMetric('densityMetric',
      formatNumber(densityPerKm2, 0),
      'Trees per km²');

    renderMetric('waterMetric',
      `${formatNumber(totalAnnualInterceptionGal / 1_000_000, 2)}M gal/yr`,
      `${formatNumber(totalEstimatedRetentionM3, 0)} m³ soil storage`);

    renderMetric('annualInterceptionMetric',
      `${formatNumber(totalAnnualInterceptionGal / 1_000, 0)}K gal`,
      'Intercepted annually (NYC 46.5″/yr avg)');

    renderMetric('studyAreaMetric',
      `${formatNumber(studyAreaKm2, 2)} km²`,
      'Study boundary');

    const goodPct = totalTrees ? (healthCounts.Good / totalTrees) * 100 : 0;
    renderMetric('healthMetric',
      `${formatNumber(goodPct, 0)}%`,
      'Good condition');

    // Charts
    makeSpeciesChart(speciesCounts);
    makeHealthChart(healthCounts);
    makeWaterRetentionChart(speciesRetentionEntries);
    makeDensityByBlockChart(validTrees);
    makeWaterCategoryChart(categoryInterception);

  } catch (error) {
    console.error('Failed to build diagrams page:', error);
    const errorBox = document.getElementById('diagramError');
    if (errorBox) {
      errorBox.textContent = `Could not load tree charts: ${error.message}`;
      errorBox.style.display = 'block';
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Canopy Performance Dashboard ─────────────────────────────────────────
// Spatial calculations use the existing polygonAreaM2 / inGowanusBox helpers
// ═══════════════════════════════════════════════════════════════════════════

// Point-in-axis-aligned-bbox test — sufficient for Gowanus building centroids
function inTreeBbox(lon, lat, bbox) {
  return lon >= bbox.minLon && lon <= bbox.maxLon && lat >= bbox.minLat && lat <= bbox.maxLat;
}

// Derive a bounding box from an array of {lon, lat} objects
function treeBbox(trees) {
  const lons = trees.map(t => t.lon);
  const lats = trees.map(t => t.lat);
  return { minLon: Math.min(...lons), maxLon: Math.max(...lons),
           minLat: Math.min(...lats), maxLat: Math.max(...lats) };
}

// Bounding-box area in m² using the same formula as getBoundingBoxAreaKm2
function bboxAreaM2(bbox) {
  const meanLatRad = ((bbox.minLat + bbox.maxLat) / 2) * (Math.PI / 180);
  const latM  = (bbox.maxLat - bbox.minLat) * 110540;
  const lonM  = (bbox.maxLon - bbox.minLon) * 111320 * Math.cos(meanLatRad);
  return Math.abs(latM * lonM);
}

const CANOPY_SCENARIOS = [
  { label: 'Existing Street Trees', pct: 4.1,  note: '1,017 mapped corridor trees' },
  { label: '+ Street Tree Expansion', pct: 10,   note: '+500 trees along sidewalk corridors' },
  { label: '+ Bioswale Planting',     pct: 16,   note: 'Wet-edge & riparian species, 3 bands' },
  { label: '+ Woodland Core',         pct: 22,   note: 'Dense canopy in proposed planting zones' },
  { label: 'Full Rewilding Target',   pct: 30,   note: 'NYC Urban Forest Agenda 30% goal' },
];

async function buildCanopyDashboard() {
  try {
    const [buildingGeo, outfallGeo, treesRaw] = await Promise.all([
      loadGeoJSON('/data/gowanus-buildings.geojson'),
      loadGeoJSON('/data/Citywide_Outfalls_20260416.geojson'),
      loadTreeData(),
    ]);

    const validTrees = treesRaw.filter(
      t => safeNumber(t.lat) !== null && safeNumber(t.lon) !== null
    );

    // Study area: bounding box of all mapped tree points
    const bbox      = treeBbox(validTrees);
    const studyAreaM2 = bboxAreaM2(bbox);
    const studyAreaHa = studyAreaM2 / 10000;

    // Canopy constants — 4.1% is the established NYC figure for Gowanus street trees;
    // 30% is the NYC Urban Forest Agenda target.
    const EXISTING_PCT = 4.1;
    const TARGET_PCT   = 30;
    const existingCanopyM2 = studyAreaM2 * (EXISTING_PCT / 100);
    const targetCanopyM2   = studyAreaM2 * (TARGET_PCT   / 100);
    const gapPct = TARGET_PCT - EXISTING_PCT;
    const gapHa  = (targetCanopyM2 - existingCanopyM2) / 10000;

    // Building footprints: centroid inside tree bounding box
    const buildingsInStudy = buildingGeo.features.filter(b => {
      try {
        const ring = b.geometry.coordinates[0];
        if (!ring || ring.length < 3) return false;
        const cx = ring.reduce((s, c) => s + c[0], 0) / ring.length;
        const cy = ring.reduce((s, c) => s + c[1], 0) / ring.length;
        return inTreeBbox(cx, cy, bbox);
      } catch { return false; }
    });

    // Sum building footprint areas using existing polygonAreaM2 helper
    const buildingFootprintM2 = buildingsInStudy.reduce((s, b) => {
      try {
        const ring = b.geometry.coordinates[0];
        return ring ? s + polygonAreaM2(ring) : s;
      } catch { return s; }
    }, 0);

    // Industrial buildings (OSM tags: industrial / warehouse) — contamination proxy
    const industrialBuildings = buildingsInStudy.filter(b =>
      ['industrial', 'warehouse'].includes((b.properties || {}).building)
    );
    const industrialM2 = industrialBuildings.reduce((s, b) => {
      try {
        const ring = b.geometry.coordinates[0];
        return ring ? s + polygonAreaM2(ring) : s;
      } catch { return s; }
    }, 0);

    // CSO outfalls inside study bbox — each buffered 50 m as contamination zone proxy
    const CSO_RADIUS_M = 50;
    const csoFeats = outfallGeo.features.filter(f => {
      try {
        const [lon, lat] = f.geometry.coordinates;
        return (f.properties || {}).outfall_ty === 'CSO' && inTreeBbox(lon, lat, bbox);
      } catch { return false; }
    });
    const csoZoneM2 = csoFeats.length * Math.PI * CSO_RADIUS_M * CSO_RADIUS_M;

    // Open land & suitability zones
    const openLandM2    = Math.max(0, studyAreaM2 - buildingFootprintM2);
    const remediationM2 = Math.min(industrialM2, studyAreaM2 * 0.15);
    const cappedM2      = Math.min(csoZoneM2, studyAreaM2 * 0.08);
    const suitableM2    = Math.max(0, openLandM2 - remediationM2 - cappedM2);
    const bioswaleOppM2 = suitableM2;

    // ── Metrics
    renderMetric('canopyGoalExistingMetric',   `${EXISTING_PCT}%`, 'corridor street tree canopy');
    renderMetric('canopyGoalTargetMetric',     `${TARGET_PCT}%`,   'NYC Urban Forest Agenda');
    renderMetric('canopyGoalGapMetric',        `${gapPct.toFixed(0)}%`, `${formatNumber(gapHa, 0)} ha to plant`);
    renderMetric('canopyGoalStudyMetric',      `${formatNumber(studyAreaHa, 0)} ha`, 'study corridor');
    renderMetric('canopyGoalBioswaleMetric',   `${formatNumber(bioswaleOppM2 / 10000, 0)} ha`, 'open non-industrial land');
    renderMetric('canopyGoalIndustrialMetric', `${industrialBuildings.length}`, 'industrial parcels in corridor');

    // ── Charts
    makeCanopyGapChart(EXISTING_PCT, TARGET_PCT);
    makeCanopyScenariosChart();
    makeLandCoverChart(studyAreaM2, existingCanopyM2, buildingFootprintM2);
    makePlantingSuitabilityChart(suitableM2, cappedM2, remediationM2, buildingFootprintM2);
    makeBioswaleScoreChart(bioswaleOppM2, csoZoneM2, industrialM2, buildingFootprintM2);

  } catch (err) {
    console.error('Canopy dashboard error:', err);
  }
}

// ── Canopy Gap — single horizontal stacked bar ────────────────────────────

function makeCanopyGapChart(existingPct, targetPct) {
  const gapPct    = targetPct - existingPct;
  const beyondPct = 100 - targetPct;

  // Inline plugin draws the 30% dashed target line without a separate annotation lib
  const targetLinePlugin = {
    id: 'canopyTargetLine',
    afterDraw(chart) {
      const ctx    = chart.ctx;
      const xScale = chart.scales.x;
      const meta   = chart.getDatasetMeta(0);
      if (!meta.data[0]) return;
      const bar = meta.data[0];
      const x   = xScale.getPixelForValue(targetPct);
      const top    = bar.y - bar.height / 2 - 10;
      const bottom = bar.y + bar.height / 2 + 10;
      ctx.save();
      ctx.setLineDash([5, 3]);
      ctx.strokeStyle = 'rgba(79,127,99,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(79,127,99,0.9)';
      ctx.font = "10px 'Barlow Condensed', Barlow, sans-serif";
      ctx.textAlign = 'left';
      ctx.fillText('30% target', x + 5, top + 3);
      ctx.restore();
    }
  };

  destroyChart('canopyGapChart');
  new Chart(document.getElementById('canopyGapChart'), {
    type: 'bar',
    plugins: [targetLinePlugin],
    data: {
      labels: ['Canopy coverage'],
      datasets: [
        {
          label: `Existing  ${existingPct}%`,
          data: [existingPct],
          backgroundColor: 'rgba(100,130,105,0.85)',
          borderColor: 'rgba(100,130,105,1)',
          borderWidth: 0,
          barThickness: 42,
        },
        {
          label: `Gap to 30%  (${gapPct.toFixed(1)} pp)`,
          data: [gapPct],
          backgroundColor: 'rgba(100,130,105,0.13)',
          borderColor: 'rgba(100,130,105,0.42)',
          borderWidth: 1,
          barThickness: 42,
        },
        {
          label: 'Beyond target',
          data: [beyondPct],
          backgroundColor: 'rgba(170,162,150,0.07)',
          borderWidth: 0,
          barThickness: 42,
        },
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          max: 100,
          ticks: { callback: v => `${v}%`, color: chartFontColor(), font: { size: 11 } },
          grid: { color: chartGridColor() }
        },
        y: { stacked: true, display: false }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: chartFontColor(), boxWidth: 12, padding: 16, font: { size: 11 } }
        },
        tooltip: {
          ...baseChartOptions().plugins.tooltip,
          callbacks: { label: i => ` ${i.dataset.label}` }
        }
      }
    }
  });
}

// ── Canopy Scenarios — horizontal bar per rewilding step ──────────────────

function makeCanopyScenariosChart() {
  const labels = CANOPY_SCENARIOS.map(s => s.label);
  const values = CANOPY_SCENARIOS.map(s => s.pct);
  const notes  = CANOPY_SCENARIOS.map(s => s.note);
  const alphas = [0.42, 0.54, 0.66, 0.78, 0.92];

  destroyChart('canopyScenariosChart');
  new Chart(document.getElementById('canopyScenariosChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Canopy coverage (%)',
        data: values,
        backgroundColor: alphas.map(a => `rgba(79,127,99,${a})`),
        borderColor:      alphas.map(a => `rgba(79,127,99,${Math.min(a + 0.1, 1)})`),
        borderWidth: 1,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          max: 32,
          ticks: { callback: v => `${v}%`, color: chartFontColor(), font: { size: 11 } },
          grid: { color: chartGridColor() },
          title: { display: true, text: 'Canopy Coverage (%)', color: chartFontColor(), font: { size: 10 } }
        },
        y: {
          ticks: { color: chartFontColor(), font: { size: 11 } },
          grid: { display: false }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...baseChartOptions().plugins.tooltip,
          callbacks: {
            title: items => `${items[0].raw}% canopy`,
            label: items => ` ${notes[items.dataIndex]}`
          }
        }
      }
    }
  });
}

// ── Land Cover Breakdown — donut ──────────────────────────────────────────

function makeLandCoverChart(studyAreaM2, canopyM2, buildingM2) {
  const openM2 = Math.max(0, studyAreaM2 - canopyM2 - buildingM2);
  const toHa = m2 => Math.round(m2 / 10000);
  const studyHa = studyAreaM2 / 10000;

  const labels = ['Building Footprint', 'Existing Canopy', 'Open / Permeable Land'];
  const values = [toHa(buildingM2), toHa(canopyM2), toHa(openM2)];
  const colors = ['#8a7d6d', '#9cae99', '#c5bfb3'];

  destroyChart('landCoverChart');
  new Chart(document.getElementById('landCoverChart'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderColor: '#f2eee7', borderWidth: 2 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: { position: 'bottom', labels: { color: chartFontColor(), padding: 12, boxWidth: 12 } },
        tooltip: {
          ...baseChartOptions().plugins.tooltip,
          callbacks: {
            label: i => {
              const pct = studyHa > 0 ? ((i.raw / studyHa) * 100).toFixed(1) : '—';
              return ` ${formatNumber(i.raw)} ha  (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// ── Planting Suitability — donut ──────────────────────────────────────────

function makePlantingSuitabilityChart(suitableM2, cappedM2, remediationM2, buildingM2) {
  const toHa = m2 => Math.max(0, Math.round(m2 / 10000));
  const labels = [
    'Direct Planting (Suitable)',
    'Capped / Raised Beds (Near CSO)',
    'Remediation Required (Industrial)',
    'Building Footprint (Excluded)',
  ];
  const values = [toHa(suitableM2), toHa(cappedM2), toHa(remediationM2), toHa(buildingM2)];
  const colors = ['#9cae99', '#c5a882', '#8a7d6d', '#c5bfb3'];
  const total  = values.reduce((a, b) => a + b, 0);

  destroyChart('plantingSuitabilityChart');
  new Chart(document.getElementById('plantingSuitabilityChart'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderColor: '#f2eee7', borderWidth: 2 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: { position: 'bottom', labels: { color: chartFontColor(), padding: 10, boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          ...baseChartOptions().plugins.tooltip,
          callbacks: {
            label: i => {
              const pct = total > 0 ? ((i.raw / total) * 100).toFixed(1) : '—';
              return ` ${formatNumber(i.raw)} ha  (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// ── Bioswale Opportunity — horizontal bar by zone ─────────────────────────

function makeBioswaleScoreChart(bioswaleM2, csoZoneM2, industrialM2, buildingM2) {
  const toHa = m2 => Math.max(0, parseFloat((m2 / 10000).toFixed(1)));
  const labels = [
    'Open land — direct planting',
    'CSO-adjacent — capped systems',
    'Industrial — remediate first',
    'Building footprint — excluded',
  ];
  const values = [toHa(bioswaleM2), toHa(csoZoneM2), toHa(industrialM2), toHa(buildingM2)];
  const colors = ['#9cae99', '#c5a882', '#8a7d6d', '#c5bfb3'];

  destroyChart('bioswaleScoreChart');
  new Chart(document.getElementById('bioswaleScoreChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Area (ha)',
        data: values,
        backgroundColor: colors,
        borderColor: 'rgba(86,73,53,0.18)',
        borderWidth: 1,
      }]
    },
    options: {
      ...baseChartOptions(),
      indexAxis: 'y',
      plugins: {
        ...baseChartOptions().plugins,
        legend: { display: false },
        tooltip: {
          ...baseChartOptions().plugins.tooltip,
          callbacks: { label: i => ` ${i.raw} ha` }
        }
      },
      scales: {
        x: {
          ...baseChartOptions().scales.x,
          title: { display: true, text: 'Area (ha)', color: chartFontColor(), font: { size: 10 } }
        },
        y: {
          ticks: { color: chartFontColor(), font: { size: 11 } },
          grid: { display: false }
        }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  initDiagramsBackgroundParallax();
  buildGowanusTreeDashboard();
  buildUrbanAnalysis();
  buildCanopyDashboard();
});

