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
  if (!window.Chart || !Chart.getChart) return;
  const chart = Chart.getChart(canvasId);
  if (chart) chart.destroy();
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}, text = '') {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text) node.textContent = text;
  return node;
}

function createDrawingField(containerId, height = 320) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  const width = Math.max(720, container.clientWidth || 960);
  container.innerHTML = '';

  const svg = svgEl('svg', {
    class: 'arch-svg',
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: 'none'
  });

  container.appendChild(svg);
  return { svg, width, height };
}

function addDatum(svg, width, baselineY, left = 36, right = 26) {
  svg.appendChild(svgEl('line', {
    class: 'arch-datum-line',
    x1: left,
    y1: baselineY,
    x2: width - right,
    y2: baselineY
  }));
}

function addGuide(svg, x1, y1, x2, y2) {
  svg.appendChild(svgEl('line', {
    class: 'arch-guide-line',
    x1, y1, x2, y2
  }));
}

function addText(svg, x, y, text, className = 'arch-label', anchor = 'start') {
  svg.appendChild(svgEl('text', {
    class: className,
    x,
    y,
    'text-anchor': anchor,
    'dominant-baseline': 'middle'
  }, text));
}

function drawPlantGlyph(svg, x, baselineY, height, crownWidth, fillClass = 'arch-fill-green') {
  svg.appendChild(svgEl('line', {
    class: 'arch-stem',
    x1: x,
    y1: baselineY,
    x2: x,
    y2: baselineY - height
  }));

  svg.appendChild(svgEl('ellipse', {
    class: `${fillClass} arch-outline`,
    cx: x,
    cy: baselineY - height,
    rx: crownWidth,
    ry: Math.max(10, crownWidth * 0.72)
  }));
}

function renderPlantingSection(containerId, items, options = {}) {
  const field = createDrawingField(containerId, options.height || 320);
  if (!field) return;

  const { svg, width, height } = field;
  const baselineY = height - 54;
  const left = 52;
  const right = 32;
  const top = 26;
  const maxValue = Math.max(...items.map((item) => item.value), 1);
  const innerWidth = width - left - right;
  const step = innerWidth / Math.max(items.length, 1);

  addDatum(svg, width, baselineY, left, right);
  addText(svg, left - 20, baselineY - 4, options.scaleLabel || 'datum', 'arch-scale-text', 'start');

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const x = left + step * index + step * 0.5;
    const plantHeight = 42 + ((baselineY - top - 60) * item.value / maxValue);
    const crownWidth = Math.max(12, step * 0.18 + (item.value / maxValue) * step * 0.14);

    addGuide(svg, x, baselineY, x, top + 10);
    drawPlantGlyph(svg, x, baselineY, plantHeight, crownWidth, item.fillClass || 'arch-fill-green');

    const labelY = Math.max(top + 12, baselineY - plantHeight - crownWidth - 18);
    svg.appendChild(svgEl('path', {
      class: 'arch-leader',
      d: `M ${x + 8} ${labelY + 4} L ${x + crownWidth * 0.55} ${baselineY - plantHeight - 4}`
    }));

    addText(svg, x + 12, labelY, item.label, 'arch-label');
    if (item.note) addText(svg, x + 12, labelY + 14, item.note, 'arch-title-note');
  }
}

function renderPaletteClusters(containerId, items, options = {}) {
  const field = createDrawingField(containerId, options.height || 300);
  if (!field) return;
  const { svg, width } = field;
  const left = 40;
  const top = 34;
  const rowGap = 82;
  const maxValue = Math.max(...items.map((item) => item.value), 1);

  items.forEach((item, index) => {
    const y = top + index * rowGap;
    const clusterX = left + 84;
    const count = Math.max(3, Math.min(12, Math.round((item.value / maxValue) * 12)));

    addText(svg, left, y - 18, item.label, 'arch-label');
    addText(svg, left, y - 4, item.note, 'arch-title-note');

    for (let i = 0; i < count; i += 1) {
      const cx = clusterX + (i % 6) * 18 + ((Math.floor(i / 6) % 2) * 8);
      const cy = y + Math.floor(i / 6) * 18;
      svg.appendChild(svgEl('circle', {
        class: `${item.fillClass || 'arch-fill-green'} arch-outline`,
        cx,
        cy,
        r: 7 + (item.value / maxValue) * 5
      }));
    }

    addText(svg, width - 24, y + 8, formatNumber(item.value), 'arch-scale-text', 'end');
  });
}

function renderTemporalBands(containerId, seriesCollection, labels) {
  const field = createDrawingField(containerId, 340);
  if (!field) return;
  const { svg, width } = field;
  const left = 50;
  const top = 38;
  const bandHeight = 64;
  const innerWidth = width - left - 36;

  labels.forEach((label, index) => {
    const y = top + index * (bandHeight + 20);
    addText(svg, left - 8, y + bandHeight / 2, label, 'arch-label', 'end');
    svg.appendChild(svgEl('rect', {
      class: 'arch-fill-neutral',
      x: left,
      y,
      width: innerWidth,
      height: bandHeight
    }));
  });

  seriesCollection.forEach((series, seriesIndex) => {
    const maxValue = Math.max(...series.values, 1);
    series.values.forEach((value, index) => {
      const y = top + index * (bandHeight + 20) + 8 + seriesIndex * 11;
      const widthValue = (innerWidth - 100) * (value / maxValue);
      svg.appendChild(svgEl('rect', {
        class: `${series.fillClass} arch-outline`,
        x: left + 18,
        y,
        width: Math.max(8, widthValue),
        height: 8
      }));
      addText(svg, left + 24 + Math.max(8, widthValue) + 8, y + 4, `${series.label}: ${formatNumber(value)}${series.suffix || ''}`, 'arch-title-note');
    });
  });
}

function renderBandBenefitField(containerId, scope) {
  const field = createDrawingField(containerId, 360);
  if (!field) return;
  const { svg, width, height } = field;

  if (!scope.conceptualBenefitByBand) {
    addText(svg, 40, height / 2, 'Pending contributor input', 'arch-label');
    addText(svg, 40, height / 2 + 18, 'Bioswales and street-tree assumptions can be inserted later.', 'arch-title-note');
    return;
  }

  const labels = [
    { key: 'canopy', label: 'Canopy' },
    { key: 'birdHabitat', label: 'Bird Habitat' },
    { key: 'cooling', label: 'Cooling' },
    { key: 'stormwater', label: 'Stormwater' },
    { key: 'pollinator', label: 'Pollinator' },
    { key: 'amphibianInsect', label: 'Amphib./Insect' }
  ];

  const bands = [
    { key: 'forest', label: 'Forest Band', fillClass: 'arch-fill-green-strong' },
    { key: 'wet', label: 'Wet Band', fillClass: 'arch-fill-plum' },
    { key: 'pollinator', label: 'Pollinator Band', fillClass: 'arch-fill-green' }
  ];

  const left = 70;
  const right = 24;
  const baselineY = height - 58;
  const top = 44;
  const step = (width - left - right) / labels.length;

  addDatum(svg, width, baselineY, left, right);

  bands.forEach((band, bandIndex) => {
    const bandY = top + bandIndex * 96;
    addText(svg, 24, bandY + 26, band.label, 'arch-label');

    labels.forEach((metric, index) => {
      const x = left + step * index + step * 0.5;
      const value = scope.conceptualBenefitByBand[band.key][metric.key] || 0;
      const heightValue = 18 + value * 40;

      addGuide(svg, x, baselineY - 6, x, bandY + 8);
      svg.appendChild(svgEl('rect', {
        class: `${band.fillClass} arch-outline`,
        x: x - 8,
        y: bandY + 52 - heightValue,
        width: 16,
        height: heightValue
      }));

      if (bandIndex === bands.length - 1) {
        addText(svg, x, baselineY + 18, metric.label, 'arch-title-note', 'middle');
      }
    });
  });
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
  renderBandBenefitField('benefitBandChart', scope);
}

function makeImprovementGrowthChart(scope) {
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

  renderTemporalBands('improvementGrowthChart', [
    { label: 'Trees', values: treesSeries, fillClass: 'arch-fill-green-strong' },
    { label: 'Canopy', values: canopySeries, fillClass: 'arch-fill-plum', suffix: 'k sq ft' },
    { label: 'Shrubs', values: shrubSeries, fillClass: 'arch-fill-neutral' },
    { label: 'Ground', values: groundSeries, fillClass: 'arch-fill-green' }
  ], labels);
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
  const topSpecies = sortEntriesDesc(speciesCounts).slice(0, 6).map(([name, value]) => ({
    label: titleCase(name),
    note: 'baseline species count',
    value,
    fillClass: 'arch-fill-green'
  }));
  renderPaletteClusters('speciesChart', topSpecies, { height: 300 });
}

function makeHealthChart(healthCounts) {
  const order = ['Good', 'Fair', 'Poor', 'Unknown'];
  const fills = {
    Good: 'arch-fill-green-strong',
    Fair: 'arch-fill-green',
    Poor: 'arch-fill-plum-strong',
    Unknown: 'arch-fill-neutral'
  };
  renderPaletteClusters('healthChart', order.map((label) => ({
    label,
    note: 'health share',
    value: healthCounts[label] || 0,
    fillClass: fills[label]
  })), { height: 300 });
}

function makeWaterRetentionChart(speciesRetentionEntries) {
  const top = speciesRetentionEntries.slice(0, 6).map(([name, retentionM3]) => ({
    label: titleCase(name),
    note: `${Number(retentionM3.toFixed(1))} m3`,
    value: retentionM3,
    fillClass: 'arch-fill-plum'
  }));
  renderPlantingSection('waterRetentionChart', top, {
    height: 310,
    scaleLabel: 'retention section'
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

  renderPlantingSection('densityChart', labels.map((label, index) => ({
    label: `${label} / block`,
    note: `${values[index]} blocks`,
    value: values[index],
    fillClass: index > 2 ? 'arch-fill-plum' : 'arch-fill-green'
  })), {
    height: 310,
    scaleLabel: 'block section'
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
