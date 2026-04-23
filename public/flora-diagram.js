/* flora-diagram.js
   Data sources unchanged:
     baseline  — gowanus_existing_flora_fauna.csv
     proposed  — gowanus_proposed_flora_fauna.csv
     growth    — gowanus_growth_timeline.csv
   Only the visual representation is architectural / board-like.
*/

const BANDS = [
  { key: 'Wet Edge', slug: 'wet', subtitle: 'Tidal margin · stormwater edge' },
  { key: 'Woodland Core', slug: 'woodland', subtitle: 'Interior canopy · understory structure' },
  { key: 'Pollinator Edge', slug: 'pollinator', subtitle: 'Open edge · flowering corridor' },
];

const SIZE_MAP = {
  small: 'sz-small',
  medium: 'sz-medium',
  large: 'sz-large',
  xlarge: 'sz-xlarge',
};

const SPECIES_SVG_MAP = {
  'bald cypress': '/assets/species/bald-cypress.svg',
  'serviceberry': '/assets/species/serviceberry.svg',
  'northern red oak': '/assets/species/northern-red-oak.svg',
  'swamp white oak': '/assets/species/northern-red-oak.svg',
  'red oak': '/assets/species/northern-red-oak.svg',
  'black gum': '/assets/species/black-gum.svg',
  'sweetgum': '/assets/species/sweetgum.svg',
  'eastern redcedar': '/assets/species/eastern-redcedar.svg',
};

const SPECIES_BOARD_LANES = [
  {
    title: 'Canopy',
    items: [
      { name: 'Bald Cypress', path: '/assets/species/bald-cypress.svg', className: 'canopy' },
      { name: 'Northern Red Oak', path: '/assets/species/northern-red-oak.svg', className: 'canopy' },
      { name: 'Black Gum', path: '/assets/species/black-gum.svg', className: 'canopy' },
      { name: 'Sweetgum', path: '/assets/species/sweetgum.svg', className: 'canopy' },
    ]
  },
  {
    title: 'Midstory',
    items: [
      { name: 'Serviceberry', path: '/assets/species/serviceberry.svg', className: 'midstory' },
      { name: 'Eastern Redcedar', path: '/assets/species/eastern-redcedar.svg', className: 'midstory' },
    ]
  },
  {
    title: 'Groundcover',
    items: [
      { name: 'Milkweed', path: '/assets/species/serviceberry.svg', className: 'ground' },
      { name: 'Bee Balm', path: '/assets/species/serviceberry.svg', className: 'ground' },
      { name: 'Soft Rush', path: '/assets/species/serviceberry.svg', className: 'ground' },
    ]
  }
];

const SANKEY_GROUP_COLORS = {
  source: '#66778e',
  band: '#7d8470',
  'tree-wet': '#687f69',
  'layer-wet': '#7d8a8c',
  'tree-woodland': '#5f7860',
  'layer-woodland': '#81796f',
  'tree-pollinator': '#726c87',
  'layer-pollinator': '#8a8398',
  fauna: '#726c87',
  process: '#7a736b',
  outcome: '#6c806e',
};

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(',').map((v) => v.trim());
    const row = {};
    headers.forEach((h, i) => {
      row[h] = vals[i] || '';
    });
    return row;
  });
}

async function loadCSV(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`CSV load failed: ${path}`);
  return parseCSV(await res.text());
}

function el(tag, cls, attrs = {}) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function capitalise(value) {
  const text = String(value || '');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function getSpeciesSvgPath(name) {
  return SPECIES_SVG_MAP[normalizeName(name)] || null;
}

function sizeClassFor(size) {
  return SIZE_MAP[size] || 'sz-small';
}

function layerClassFor(layer) {
  const map = {
    canopy: 'lc-canopy',
    understory_tree: 'lc-understory-tree',
    understory: 'lc-understory-tree',
    shrub: 'lc-understory-tree',
    ground: 'lc-ground',
    fauna: 'lc-fauna',
  };
  return map[layer] || 'lc-ground';
}

function speciesHead(layerCls, sizeCls, name, svgPath) {
  const head = el('div', 'species-head');

  if (svgPath) {
    const thumb = el('span', 'species-svg-thumb');
    const img = el('img', '', { src: svgPath, alt: `${capitalise(name)} silhouette` });
    thumb.appendChild(img);
    head.appendChild(thumb);
  } else {
    head.appendChild(el('span', `species-symbol ${layerCls} ${sizeCls}`));
  }

  return head;
}

function buildSpeciesItem(item, options = {}) {
  const { role, layerCls, sizeCls, extraText, svgPath } = options;
  const node = el('div', 'species-item');
  if (item.status === 'target_fauna') node.classList.add('target-fauna');

  node.appendChild(speciesHead(layerCls, sizeCls, item.name, svgPath));

  const info = el('div', 'species-info');
  const name = el('span', 'species-name');
  name.textContent = capitalise(item.name);
  info.appendChild(name);

  if (role) {
    const roleNode = el('span', 'species-role');
    roleNode.textContent = role;
    info.appendChild(roleNode);
  }

  if (extraText) {
    const extra = el('span', options.extraClass || 'phase-badge');
    extra.textContent = extraText;
    info.appendChild(extra);
  }

  node.appendChild(info);
  return node;
}

function buildLayerLane(title, items) {
  const lane = el('div', 'layer-lane');
  const heading = el('p', 'layer-heading');
  heading.textContent = title;
  lane.appendChild(heading);

  const row = el('div', 'layer-species-row');
  items.forEach((item) => row.appendChild(item));
  lane.appendChild(row);
  return lane;
}

function mapRowsToLanes(rows, showPhase = false) {
  const canopy = [];
  const midstory = [];
  const ground = [];
  const fauna = [];

  rows.forEach((item) => {
    const layerCls = layerClassFor(item.canopy_class || item.category);
    const sizeCls = sizeClassFor(item.diagram_size || item.future_size);
    const extraText = showPhase && item.phase
      ? item.phase.replace('_', ' ')
      : item.visual_change
        ? item.visual_change.replace(/_/g, ' ')
        : '';

    const built = buildSpeciesItem(item, {
      role: item.ecological_role || item.notes || '',
      layerCls,
      sizeCls,
      extraText,
      extraClass: item.phase ? 'phase-badge' : 'growth-role-badge',
      svgPath: getSpeciesSvgPath(item.name)
    });

    if (item.category === 'fauna' || item.canopy_class === 'fauna') {
      fauna.push(built);
    } else if (item.canopy_class === 'canopy' || item.category === 'tree') {
      canopy.push(built);
    } else if (item.canopy_class === 'understory_tree' || item.canopy_class === 'understory' || item.category === 'shrub') {
      midstory.push(built);
    } else {
      ground.push(built);
    }
  });

  return { canopy, midstory, ground, fauna };
}

function buildBandBoard(band, laneItems, growthNote = '') {
  const section = el('section', 'flora-band-board');
  const labelCol = el('div', `band-label-col ${band.slug}`);

  const name = el('p', 'band-name');
  name.textContent = band.key;
  labelCol.appendChild(name);

  const subtitle = el('p', growthNote ? 'growth-year-note' : 'band-subtitle');
  subtitle.textContent = growthNote || band.subtitle;
  labelCol.appendChild(subtitle);

  const field = el('div', 'flora-band-field');
  field.appendChild(buildLayerLane('Canopy', laneItems.canopy));
  field.appendChild(buildLayerLane('Midstory', laneItems.midstory));
  field.appendChild(buildLayerLane('Groundcover', laneItems.ground));
  field.appendChild(buildLayerLane('Fauna / Pollinators', laneItems.fauna));

  section.appendChild(labelCol);
  section.appendChild(field);
  return section;
}

function renderBaseline(rows, container) {
  container.innerHTML = '';
  BANDS.forEach((band) => {
    const bandRows = rows.filter((row) => row.zone === band.key);
    const lanes = mapRowsToLanes(bandRows, false);
    container.appendChild(buildBandBoard(band, lanes));
  });
}

function renderProposed(rows, container) {
  container.innerHTML = '';
  BANDS.forEach((band) => {
    const bandRows = rows.filter((row) => row.zone === band.key);
    const lanes = mapRowsToLanes(bandRows, true);
    container.appendChild(buildBandBoard(band, lanes));
  });
}

function renderGrowth(rows, yearRange, container) {
  container.innerHTML = '';
  const yearRows = rows.filter((row) => row.year_range === yearRange);

  BANDS.forEach((band) => {
    const bandRows = yearRows.filter((row) => row.zone === band.key);
    if (!bandRows.length) return;
    const lanes = mapRowsToLanes(bandRows, false);
    container.appendChild(buildBandBoard(band, lanes, `Year ${yearRange}`));
  });

  if (!container.children.length) {
    const note = el('p', 'flora-intro');
    note.textContent = `No data for ${yearRange} year range.`;
    container.appendChild(note);
  }
}

function setActiveTab(tabs, active) {
  tabs.forEach((tab) => {
    const selected = tab === active;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
}

function renderSpeciesBoard(currentMode) {
  const board = document.getElementById('species-board-grid');
  const wrap = board?.closest('.species-board');
  if (!board || !wrap) return;

  wrap.style.display = currentMode === 'baseline' ? 'none' : 'block';
  board.innerHTML = '';

  SPECIES_BOARD_LANES.forEach((lane) => {
    const laneEl = el('section', 'species-lane');
    const title = el('p', 'species-lane-title');
    title.textContent = lane.title;
    laneEl.appendChild(title);

    const field = el('div', 'species-lane-field');
    lane.items.forEach((item) => {
      const itemEl = el('div', `species-lane-item ${item.className}`);
      const img = el('img', '', { src: item.path, alt: `${item.name} silhouette` });
      const label = el('span', 'species-lane-label');
      label.textContent = item.name;
      itemEl.appendChild(img);
      itemEl.appendChild(label);
      field.appendChild(itemEl);
    });

    laneEl.appendChild(field);
    board.appendChild(laneEl);
  });
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const value = clean.length === 3 ? clean.split('').map((ch) => ch + ch).join('') : clean;
  const num = Number.parseInt(value, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function nodeColor(group) {
  return SANKEY_GROUP_COLORS[group] || '#7a736b';
}

async function loadProposalSankeyData() {
  const res = await fetch('/data/proposal_sankey.json');
  if (!res.ok) throw new Error(`Sankey data load failed: ${res.status}`);
  return res.json();
}

function drawProposalSankey(svgEl, rawData) {
  if (!svgEl || !window.d3 || !window.d3.sankey) return;

  const container = svgEl.parentElement;
  const width = Math.max(980, container.clientWidth - 4);
  const height = Math.max(460, Math.min(680, width * 0.42));
  const margin = { top: 20, right: 130, bottom: 18, left: 130 };

  svgEl.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  const nodeById = new Map(rawData.nodes.map((node) => [node.id, { ...node }]));
  const nodes = rawData.nodes.map((node) => ({ ...node }));
  const links = rawData.links.map((link) => {
    const sourceNode = nodeById.get(link.source);
    return {
      ...link,
      color: hexToRgba(nodeColor(sourceNode?.group), 0.34)
    };
  });

  const sankey = d3.sankey()
    .nodeId((d) => d.id)
    .nodeWidth(12)
    .nodePadding(24)
    .nodeSort((a, b) => d3.ascending(a.label, b.label))
    .linkSort((a, b) => b.value - a.value)
    .extent([
      [margin.left, margin.top],
      [width - margin.right, height - margin.bottom]
    ])
    .iterations(48);

  const graph = {
    nodes: nodes.map((node) => ({ ...node, layer: node.column })),
    links: links.map((link) => ({ ...link }))
  };

  sankey(graph);

  const linkPath = d3.sankeyLinkHorizontal();

  svg.append('g')
    .selectAll('path')
    .data(graph.links)
    .join('path')
    .attr('class', 'sankey-link')
    .attr('d', linkPath)
    .attr('stroke', (d) => d.color)
    .attr('stroke-width', (d) => Math.max(1, d.width));

  const node = svg.append('g')
    .selectAll('g')
    .data(graph.nodes)
    .join('g')
    .attr('class', 'sankey-node');

  node.append('rect')
    .attr('x', (d) => d.x0)
    .attr('y', (d) => d.y0)
    .attr('height', (d) => Math.max(1, d.y1 - d.y0))
    .attr('width', (d) => d.x1 - d.x0)
    .attr('fill', (d) => nodeColor(d.group));

  node.append('text')
    .attr('class', 'sankey-label')
    .attr('x', (d) => (d.x0 < width * 0.56 ? d.x1 + 8 : d.x0 - 8))
    .attr('y', (d) => (d.y0 + d.y1) / 2)
    .attr('text-anchor', (d) => (d.x0 < width * 0.56 ? 'start' : 'end'))
    .text((d) => d.label);
}

async function initProposalSankey() {
  const svg = document.getElementById('proposalSankeySvg');
  if (!svg) return;

  try {
    const data = await loadProposalSankeyData();
    drawProposalSankey(svg, data);

    let raf = null;
    const observer = new ResizeObserver(() => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => drawProposalSankey(svg, data));
    });
    observer.observe(svg.parentElement);
  } catch (error) {
    const frame = svg.parentElement;
    if (frame) {
      frame.innerHTML = `<p style="padding:16px;color:#7e2a18;">Unable to render proposal Sankey: ${error.message}</p>`;
    }
  }
}

async function init() {
  initProposalSankey();

  const wrap = document.getElementById('flora-diagram-wrap');
  const modeTabs = Array.from(document.querySelectorAll('.mode-tab'));
  const timeTabs = Array.from(document.querySelectorAll('.time-tab'));
  const timeTabsEl = document.getElementById('time-tabs');

  let baselineData = null;
  let proposedData = null;
  let growthData = null;
  let currentMode = 'baseline';
  let currentYear = '0-2';

  async function getBaseline() {
    if (!baselineData) baselineData = await loadCSV('/data/gowanus_existing_flora_fauna.csv');
    return baselineData;
  }

  async function getProposed() {
    if (!proposedData) proposedData = await loadCSV('/data/gowanus_proposed_flora_fauna.csv');
    return proposedData;
  }

  async function getGrowth() {
    if (!growthData) growthData = await loadCSV('/data/gowanus_growth_timeline.csv');
    return growthData;
  }

  async function render() {
    wrap.style.opacity = '0.5';
    try {
      if (currentMode === 'baseline') {
        renderBaseline(await getBaseline(), wrap);
      } else if (currentMode === 'proposed') {
        renderProposed(await getProposed(), wrap);
      } else {
        renderGrowth(await getGrowth(), currentYear, wrap);
      }
    } catch (error) {
      wrap.innerHTML = `<p style="color:#7e2a18;padding:16px;">Error loading diagram data: ${error.message}</p>`;
    }

    renderSpeciesBoard(currentMode);
    wrap.style.opacity = '1';
  }

  modeTabs.forEach((tab) => {
    tab.addEventListener('click', async () => {
      currentMode = tab.dataset.mode;
      setActiveTab(modeTabs, tab);
      timeTabsEl.classList.toggle('hidden', currentMode !== 'growth');
      await render();
    });
  });

  timeTabs.forEach((tab) => {
    tab.addEventListener('click', async () => {
      currentYear = tab.dataset.year;
      setActiveTab(timeTabs, tab);
      await render();
    });
  });

  await render();
}

document.addEventListener('DOMContentLoaded', init);
