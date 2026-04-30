/* flora-diagram.js
   Renders the Flora & Fauna diagram in three modes:
     baseline  - reads gowanus_existing_flora_fauna.csv
     proposed  - reads gowanus_proposed_flora_fauna.csv
     growth    - reads gowanus_growth_timeline.csv (with year sub-tabs)
*/

// ── Constants ─────────────────────────────────────────────────────────────

const BANDS = [
  { key: 'Wet Edge',       slug: 'wet',         subtitle: 'Tidal margin · stormwater edge' },
  { key: 'Woodland Core',  slug: 'woodland',     subtitle: 'Interior canopy · understory structure' },
  { key: 'Pollinator Edge',slug: 'pollinator',   subtitle: 'Open edge · flowering corridor' },
];

const LAYERS = [
  { key: 'canopy',          label: 'Canopy' },
  { key: 'understory_tree', label: 'Understory Tree' },
  { key: 'shrub',           label: 'Shrub Layer' },
  { key: 'ground',          label: 'Ground / Perennial' },
];

// fauna rendered inside ground column as separate section
const SIZE_MAP = {
  small:  'sz-small',
  medium: 'sz-medium',
  large:  'sz-large',
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

const FAUNA_TEST_SVGS = [
  '/assets/fauna/Northern Mockingbird.svg',
  '/assets/fauna/Yellow Warbler.svg'
];

const FAUNA_SVG_MAP = {
  gull: '/assets/fauna/Northern Mockingbird.svg',
  sparrow: '/assets/fauna/Northern Mockingbird.svg',
  pigeon: '/assets/fauna/Northern Mockingbird.svg',
  songbird: '/assets/fauna/Northern Mockingbird.svg',
  'red-winged blackbird': '/assets/fauna/Northern Mockingbird.svg',
  bee: '/assets/fauna/Yellow Warbler.svg',
  'native bee': '/assets/fauna/Yellow Warbler.svg',
  butterfly: '/assets/fauna/Yellow Warbler.svg',
  'monarch butterfly': '/assets/fauna/Yellow Warbler.svg',
  dragonfly: '/assets/fauna/Yellow Warbler.svg'
};

const SPECIES_BOARD_ITEMS = [
  { name: 'Bald Cypress', path: '/assets/species/bald-cypress.svg' },
  { name: 'Serviceberry', path: '/assets/species/serviceberry.svg' },
  { name: 'Northern Red Oak', path: '/assets/species/northern-red-oak.svg' },
  { name: 'Black Gum', path: '/assets/species/black-gum.svg' },
  { name: 'Sweetgum', path: '/assets/species/sweetgum.svg' },
  { name: 'Eastern Redcedar', path: '/assets/species/eastern-redcedar.svg' },
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

let sankeyGraphIndex = null;
let currentSankeySubgraph = null;

const TOKEN_STOPWORDS = new Set([
  'and', 'the', 'for', 'with', 'from', 'over', 'into', 'of', 'to',
  'edge', 'core', 'conditions', 'process', 'connected', 'stable', 'cooler'
]);

const TOKEN_SYNONYMS = {
  bird: ['birds'],
  birds: ['bird'],
  bee: ['bees', 'pollinator'],
  bees: ['bee', 'pollinator'],
  butterfly: ['butterflies', 'pollinator'],
  butterflies: ['butterfly', 'pollinator'],
  pollinator: ['pollination', 'bees', 'butterflies'],
  pollination: ['pollinator'],
  stormwater: ['water', 'wet'],
  water: ['stormwater', 'wet'],
  woodland: ['forest'],
  forest: ['woodland'],
  understory: ['shrub'],
  shrub: ['understory']
};

const LAYER_TOKEN_MAP = {
  canopy: ['canopy', 'tree'],
  understory_tree: ['understory', 'shrub'],
  shrub: ['shrub', 'understory'],
  ground: ['ground', 'perennial', 'soil', 'stormwater', 'water'],
  fauna: ['fauna', 'bird', 'bee', 'butterfly', 'amphibian', 'food', 'pollinator']
};

const BAND_TOKEN_MAP = {
  wet: ['wet', 'stormwater', 'canal', 'flooding', 'soil', 'amphibian'],
  woodland: ['woodland', 'forest', 'understory', 'shade'],
  pollinator: ['pollinator', 'bee', 'butterfly', 'nectar', 'flower']
};

// ── CSV parser ────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ''; });
    return row;
  });
}

async function loadCSV(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`CSV load failed: ${path}`);
  return parseCSV(await res.text());
}

// ── Rendering helpers ─────────────────────────────────────────────────────

function el(tag, cls, attrs = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  return e;
}

function speciesSymbol(layerClass, sizeClass) {
  const s = el('span', `species-symbol ${layerClass} ${sizeClass}`);
  return s;
}

function layerClassFor(canopy_class) {
  const map = {
    canopy: 'lc-canopy',
    understory_tree: 'lc-understory-tree',
    understory: 'lc-shrub',
    shrub: 'lc-shrub',
    ground: 'lc-ground',
    fauna: 'lc-fauna',
  };
  return map[canopy_class] || 'lc-ground';
}

function sizeClassFor(diagram_size) {
  return SIZE_MAP[diagram_size] || 'sz-small';
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function normalizeToken(token) {
  let t = normalizeName(token).replace(/[^a-z0-9]/g, '');
  if (t.endsWith('ies') && t.length > 4) t = `${t.slice(0, -3)}y`;
  else if (t.endsWith('s') && t.length > 3) t = t.slice(0, -1);
  return t;
}

function tokenizeText(text) {
  const raw = normalizeName(text)
    .split(/[^a-z0-9]+/)
    .map(normalizeToken)
    .filter((token) => token && !TOKEN_STOPWORDS.has(token));

  const expanded = new Set(raw);
  raw.forEach((token) => {
    (TOKEN_SYNONYMS[token] || []).forEach((alias) => expanded.add(normalizeToken(alias)));
  });
  return expanded;
}

function faunaFallbackSvgPath(name) {
  const normalized = normalizeName(name);
  if (!FAUNA_TEST_SVGS.length) return null;
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash + normalized.charCodeAt(i)) % FAUNA_TEST_SVGS.length;
  }
  return FAUNA_TEST_SVGS[hash];
}

function getSpeciesSvgPath(name, options = {}) {
  const normalized = normalizeName(name);
  const direct = SPECIES_SVG_MAP[normalized];
  if (direct) return direct;

  if (options.isFauna) {
    return FAUNA_SVG_MAP[normalized] || faunaFallbackSvgPath(normalized);
  }

  return null;
}

function speciesSvgThumb(path, alt) {
  if (!path) return null;
  const frame = el('span', 'species-svg-thumb');
  const img = el('img', '', { src: path, alt: alt || '' });
  frame.appendChild(img);
  return frame;
}

function buildSpeciesItem(name, role, layerCls, sizeCls, extra, svgPath = null) {
  const item = el('div', 'species-item');
  item.dataset.speciesName = normalizeName(name);
  item.dataset.speciesRole = normalizeName(role || '');
  item.appendChild(speciesSymbol(layerCls, sizeCls));
  const thumb = speciesSvgThumb(svgPath, `${capitalise(name)} silhouette`);
  if (thumb) item.appendChild(thumb);
  const info = el('div', 'species-info');
  const nm = el('span', 'species-name');
  nm.textContent = capitalise(name);
  info.appendChild(nm);
  if (role) {
    const r = el('span', 'species-role');
    r.textContent = role;
    info.appendChild(r);
  }
  if (extra) info.appendChild(extra);
  item.appendChild(info);
  return item;
}

function phaseBadge(phase) {
  if (!phase) return null;
  const cls = phase === 'phase_1' ? 'phase-badge ph1' :
              phase === 'phase_2' ? 'phase-badge ph2' : 'phase-badge ph3';
  const b = el('span', cls);
  b.textContent = phase.replace('_', ' ');
  return b;
}

function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Band row builder ───────────────────────────────────────────────────────

function buildBandRow(band, layerData, faunaData, showPhase = false) {
  const row = el('div', 'band-row');
  row.dataset.bandName = normalizeName(band.key);

  // Label column
  const lc = el('div', `band-label-col ${band.slug}`);
  lc.dataset.bandName = normalizeName(band.key);
  const name = el('p', 'band-name'); name.textContent = band.key;
  const sub  = el('p', 'band-subtitle'); sub.textContent = band.subtitle;
  lc.appendChild(name);
  lc.appendChild(sub);
  row.appendChild(lc);

  // Content grid - 4 layer columns + fauna
  const content = el('div', 'band-content');
  content.style.gridTemplateColumns = 'repeat(4, 1fr) 1fr';

  LAYERS.forEach(layer => {
    const col = el('div', 'layer-col');
    col.dataset.layerName = normalizeName(layer.label);
    col.dataset.layerKey = normalizeName(layer.key);
    const hd = el('p', 'layer-heading'); hd.textContent = layer.label;
    col.appendChild(hd);

    const items = layerData[layer.key] || [];
    items.forEach(item => {
      const extra = showPhase ? phaseBadge(item.phase) : null;
      const isFauna = false;
      const si = buildSpeciesItem(
        item.name,
        item.ecological_role,
        layerClassFor(item.canopy_class || layer.key),
        sizeClassFor(item.diagram_size),
        extra,
        getSpeciesSvgPath(item.name)
      );
      if (item.status === 'target_fauna') si.classList.add('target-fauna');
      col.appendChild(si);
    });

    content.appendChild(col);
  });

  // Fauna column
  const faunaCol = el('div', 'layer-col');
  faunaCol.dataset.layerName = 'fauna';
  faunaCol.dataset.layerKey = 'fauna';
  const fhd = el('p', 'layer-heading'); fhd.textContent = 'Fauna';
  faunaCol.appendChild(fhd);
  faunaData.forEach(item => {
    const extra = showPhase ? phaseBadge(item.phase) : null;
    const si = buildSpeciesItem(
      item.name,
      item.ecological_role,
      'lc-fauna',
      sizeClassFor(item.diagram_size),
      extra,
      getSpeciesSvgPath(item.name, { isFauna: true })
    );
    if (item.status === 'target_fauna') si.classList.add('target-fauna');
    faunaCol.appendChild(si);
  });
  content.appendChild(faunaCol);

  row.appendChild(content);
  return row;
}

// ── Mode: Baseline ────────────────────────────────────────────────────────
// Baseline shows all existing flora/fauna in a single unified view by layer
// (not split by design zones — those zones are a proposed design intent, not
// how the existing plants actually grow on site).

function renderBaseline(rows, container) {
  container.innerHTML = '';

  // Header note explaining the view
  const note = el('div', 'baseline-note');
  note.textContent = 'All existing and contextually present species shown by ecological layer — not separated by design zone, as the proposed zones reflect future intent.';
  container.appendChild(note);

  // Single unified band-row spanning all rows
  const row = el('div', 'band-row');

  // Label column
  const lc = el('div', 'band-label-col wet');
  const nm = el('p', 'band-name'); nm.textContent = 'Existing Ecology';
  const sub = el('p', 'band-subtitle'); sub.textContent = 'All species present on or adjacent to site';
  lc.appendChild(nm);
  lc.appendChild(sub);
  row.appendChild(lc);

  const content = el('div', 'band-content');
  content.style.gridTemplateColumns = 'repeat(4, 1fr) 1fr';

  LAYERS.forEach(layer => {
    const col = el('div', 'layer-col');
    col.dataset.layerName = normalizeName(layer.label);
    col.dataset.layerKey = normalizeName(layer.key);
    const hd = el('p', 'layer-heading'); hd.textContent = layer.label;
    col.appendChild(hd);

    const items = rows.filter(r =>
      r.category !== 'fauna' && (
        r.canopy_class === layer.key ||
        (layer.key === 'shrub' && r.canopy_class === 'understory') ||
        (layer.key === 'understory_tree' && r.canopy_class === 'understory_tree')
      )
    );
    items.forEach(item => {
      const si = buildSpeciesItem(
        item.name,
        item.ecological_role,
        layerClassFor(item.canopy_class || layer.key),
        sizeClassFor(item.diagram_size),
        null,
        getSpeciesSvgPath(item.name)
      );
      // Tag which zone this plant is associated with as a subtle label
      const zoneLbl = el('span', 'baseline-zone-tag');
      zoneLbl.textContent = item.zone || '';
      si.querySelector('.species-info').appendChild(zoneLbl);
      col.appendChild(si);
    });

    content.appendChild(col);
  });

  // Fauna column
  const faunaCol = el('div', 'layer-col');
  faunaCol.dataset.layerName = 'fauna';
  faunaCol.dataset.layerKey = 'fauna';
  const fhd = el('p', 'layer-heading'); fhd.textContent = 'Fauna';
  faunaCol.appendChild(fhd);
  rows.filter(r => r.category === 'fauna').forEach(item => {
    const si = buildSpeciesItem(
      item.name,
      item.ecological_role,
      'lc-fauna',
      sizeClassFor(item.diagram_size),
      null,
      getSpeciesSvgPath(item.name, { isFauna: true })
    );
    faunaCol.appendChild(si);
  });
  content.appendChild(faunaCol);

  row.appendChild(content);
  container.appendChild(row);
}

// ── Mode: Proposed ────────────────────────────────────────────────────────

function renderProposed(rows, container) {
  container.innerHTML = '';
  BANDS.forEach(band => {
    const bandRows = rows.filter(r => r.zone === band.key);
    const layerData = {};
    LAYERS.forEach(l => {
      layerData[l.key] = bandRows.filter(r =>
        r.category !== 'fauna' && (
          r.canopy_class === l.key ||
          (l.key === 'shrub' && r.canopy_class === 'understory') ||
          (l.key === 'understory_tree' && r.canopy_class === 'understory_tree')
        )
      );
    });
    const faunaData = bandRows.filter(r => r.category === 'fauna');
    container.appendChild(buildBandRow(band, layerData, faunaData, true));
  });
}

// ── Mode: Growth ──────────────────────────────────────────────────────────

function buildGrowthSpeciesItem(item) {
  const sizeCls = sizeClassFor(item.future_size);
  const layerCls = item.category === 'fauna' ? 'lc-fauna' :
                   item.category === 'tree'  ? 'lc-canopy' :
                   item.category === 'shrub' ? 'lc-shrub'  : 'lc-ground';

  const si = el('div', 'species-item');
  si.dataset.speciesName = normalizeName(item.name);
  si.dataset.speciesRole = normalizeName(item.notes || item.visual_change || '');
  si.appendChild(speciesSymbol(layerCls, sizeCls));
  const thumb = speciesSvgThumb(
    getSpeciesSvgPath(item.name, { isFauna: item.category === 'fauna' }),
    `${capitalise(item.name)} silhouette`
  );
  if (thumb) si.appendChild(thumb);
  const info = el('div', 'species-info');
  const nm = el('span', 'species-name'); nm.textContent = capitalise(item.name);
  const role = el('span', 'species-role'); role.textContent = item.notes || '';
  const badge = el('span', 'growth-role-badge');
  badge.textContent = (item.visual_change || '').replace(/_/g, ' ');
  info.appendChild(nm);
  info.appendChild(role);
  info.appendChild(badge);
  si.appendChild(info);
  return si;
}

function renderGrowth(rows, yearRange, container) {
  container.innerHTML = '';
  const yearRows = rows.filter(r => r.year_range === yearRange);

  BANDS.forEach(band => {
    const bandRows = yearRows.filter(r => r.zone === band.key);
    if (!bandRows.length) return;

    const row = el('div', 'band-row');

    const lc = el('div', `band-label-col ${band.slug}`);
    const nm = el('p', 'band-name'); nm.textContent = band.key;
    const yr = el('p', 'growth-year-note'); yr.textContent = `Year ${yearRange}`;
    lc.appendChild(nm);
    lc.appendChild(yr);
    row.appendChild(lc);

    const content = el('div', 'band-content');
    content.style.gridTemplateColumns = 'repeat(auto-fill, minmax(160px, 1fr))';

    bandRows.forEach(item => {
      const col = el('div', 'layer-col');
      col.appendChild(buildGrowthSpeciesItem(item));
      content.appendChild(col);
    });

    row.appendChild(content);
    container.appendChild(row);
  });

  if (!container.children.length) {
    const note = el('p', 'flora-intro');
    note.textContent = `No data for ${yearRange} year range.`;
    note.style.marginTop = '16px';
    container.appendChild(note);
  }
}

// ── Tab wiring ────────────────────────────────────────────────────────────

function setActiveTab(tabs, active) {
  tabs.forEach(t => {
    t.classList.toggle('active', t === active);
    t.setAttribute('aria-selected', t === active ? 'true' : 'false');
  });
}

function renderSpeciesBoard(currentMode) {
  const board = document.getElementById('species-board-grid');
  const boardWrap = board?.closest('.species-board');
  if (!board || !boardWrap) return;

  // Keep SVG board focused on proposed/growth views.
  boardWrap.style.display = currentMode === 'baseline' ? 'none' : 'block';
  board.innerHTML = '';

  SPECIES_BOARD_ITEMS.forEach((item) => {
    const card = el('article', 'species-card');
    const fig = el('div', 'species-figure');
    const img = el('img', '', { src: item.path, alt: `${item.name} silhouette` });
    fig.appendChild(img);
    const name = el('p', 'species-card-name');
    name.textContent = item.name;
    card.appendChild(fig);
    card.appendChild(name);
    board.appendChild(card);
  });
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const value = clean.length === 3
    ? clean.split('').map((ch) => ch + ch).join('')
    : clean;
  const num = Number.parseInt(value, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function nodeColor(group) {
  return SANKEY_GROUP_COLORS[group] || '#8a8074';
}

async function loadProposalSankeyData() {
  const res = await fetch('/data/proposal_sankey.json');
  if (!res.ok) {
    throw new Error(`Sankey data load failed: ${res.status}`);
  }
  return res.json();
}

function buildGraphIndex(rawData) {
  const nodes = rawData.nodes.map((node) => ({ ...node }));
  const links = rawData.links.map((link, idx) => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    return {
      ...link,
      source: sourceId,
      target: targetId,
      linkId: `link-${idx}-${sourceId}-${targetId}`
    };
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const linkById = new Map(links.map((link) => [link.linkId, link]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  const incoming = new Map(nodes.map((node) => [node.id, []]));

  links.forEach((link) => {
    outgoing.get(link.source)?.push(link.linkId);
    incoming.get(link.target)?.push(link.linkId);
  });

  return { nodes, links, nodeById, linkById, outgoing, incoming };
}

function getConnectedSubgraph(selection, graphIndex) {
  if (!selection) {
    return { nodeIds: new Set(), linkIds: new Set() };
  }

  const seedNodes = new Set();
  const seedLinks = new Set();

  if (selection.type === 'node') {
    seedNodes.add(selection.nodeId);
  } else if (selection.type === 'link') {
    const link = graphIndex.linkById.get(selection.linkId);
    if (link) {
      seedLinks.add(link.linkId);
      seedNodes.add(link.source);
      seedNodes.add(link.target);
    }
  }

  const nodeIds = new Set(seedNodes);
  const linkIds = new Set(seedLinks);

  // Traverse both upstream and downstream to collect the full relationship chain.
  const queue = Array.from(seedNodes);
  while (queue.length) {
    const nodeId = queue.shift();
    const outgoing = graphIndex.outgoing.get(nodeId) || [];
    const incoming = graphIndex.incoming.get(nodeId) || [];

    [...outgoing, ...incoming].forEach((linkId) => {
      if (!linkIds.has(linkId)) linkIds.add(linkId);
      const link = graphIndex.linkById.get(linkId);
      if (!link) return;

      if (!nodeIds.has(link.source)) {
        nodeIds.add(link.source);
        queue.push(link.source);
      }
      if (!nodeIds.has(link.target)) {
        nodeIds.add(link.target);
        queue.push(link.target);
      }
    });
  }

  return { nodeIds, linkIds };
}

function labelsFromSubgraph(subgraph, graphIndex) {
  if (!subgraph || !graphIndex) return new Set();
  const labels = new Set();
  subgraph.nodeIds.forEach((nodeId) => {
    const node = graphIndex.nodeById.get(nodeId);
    if (!node) return;
    labels.add(normalizeName(node.label));
  });
  return labels;
}

function buildSubgraphLexicon(subgraph, graphIndex) {
  const labels = labelsFromSubgraph(subgraph, graphIndex);
  const tokens = new Set();
  labels.forEach((label) => {
    tokenizeText(label).forEach((token) => tokens.add(token));
  });
  return { labels, tokens };
}

function matchesLexiconText(text, lexicon) {
  if (!text || !lexicon) return false;
  const normalized = normalizeName(text);
  for (const label of lexicon.labels) {
    if (label && normalized.includes(label)) return true;
  }
  const textTokens = tokenizeText(text);
  for (const token of textTokens) {
    if (lexicon.tokens.has(token)) return true;
  }
  return false;
}

function tokensMatchAny(tokens, candidates) {
  return candidates.some((candidate) => tokens.has(normalizeToken(candidate)));
}

function clearFloraBoardHighlight() {
  const wrap = document.getElementById('flora-diagram-wrap');
  if (!wrap) return;
  wrap.querySelectorAll('.band-row, .band-label-col, .layer-col, .species-item').forEach((node) => {
    node.classList.remove('flora-active');
    node.classList.remove('flora-dim');
  });
}

function applyFloraBoardHighlightFromSubgraph(subgraph, graphIndex) {
  const wrap = document.getElementById('flora-diagram-wrap');
  if (!wrap) return;

  if (!subgraph || !graphIndex || (!subgraph.nodeIds.size && !subgraph.linkIds.size)) {
    clearFloraBoardHighlight();
    return;
  }

  const lexicon = buildSubgraphLexicon(subgraph, graphIndex);
  const rows = Array.from(wrap.querySelectorAll('.band-row'));
  const bandLabels = Array.from(wrap.querySelectorAll('.band-label-col'));
  const cols = Array.from(wrap.querySelectorAll('.layer-col'));
  const items = Array.from(wrap.querySelectorAll('.species-item'));

  items.forEach((item) => {
    const speciesName = item.dataset.speciesName || '';
    const speciesRole = item.dataset.speciesRole || '';
    const active =
      matchesLexiconText(speciesName, lexicon) ||
      matchesLexiconText(speciesRole, lexicon);
    item.classList.toggle('flora-active', active);
    item.classList.toggle('flora-dim', !active);
  });

  cols.forEach((col) => {
    const layerName = col.dataset.layerName || '';
    const layerKey = col.dataset.layerKey || '';
    const hasActiveItem = !!col.querySelector('.species-item.flora-active');
    const layerTokens = LAYER_TOKEN_MAP[layerKey] || [];
    const active =
      hasActiveItem ||
      matchesLexiconText(layerName, lexicon) ||
      matchesLexiconText(layerKey, lexicon) ||
      tokensMatchAny(lexicon.tokens, layerTokens);
    col.classList.toggle('flora-active', active);
    col.classList.toggle('flora-dim', !active);
  });

  rows.forEach((row) => {
    const bandName = row.dataset.bandName || '';
    const hasActiveChild = !!row.querySelector('.layer-col.flora-active, .species-item.flora-active');
    const bandSlug = row.querySelector('.band-label-col')?.classList.contains('wet')
      ? 'wet'
      : row.querySelector('.band-label-col')?.classList.contains('woodland')
        ? 'woodland'
        : 'pollinator';
    const active =
      hasActiveChild ||
      matchesLexiconText(bandName, lexicon) ||
      tokensMatchAny(lexicon.tokens, BAND_TOKEN_MAP[bandSlug] || []);
    row.classList.toggle('flora-active', active);
    row.classList.toggle('flora-dim', !active);
  });

  bandLabels.forEach((label) => {
    const bandName = label.dataset.bandName || '';
    const row = label.closest('.band-row');
    const active = matchesLexiconText(bandName, lexicon) || !!row?.classList.contains('flora-active');
    label.classList.toggle('flora-active', active);
    label.classList.toggle('flora-dim', !active);
  });
}

function applyHighlightState(selection, views, graphIndex, subgraph = null) {
  const { nodeIds, linkIds } = subgraph || getConnectedSubgraph(selection, graphIndex);
  const hasSelection = nodeIds.size > 0 || linkIds.size > 0;

  views.forEach((view) => {
    if (!view) return;

    view.nodeSelection
      .classed('is-active', (d) => hasSelection && nodeIds.has(d.id))
      .classed('is-dim', (d) => hasSelection && !nodeIds.has(d.id));

    view.linkSelection
      .classed('is-active', (d) => hasSelection && linkIds.has(d.linkId))
      .classed('is-dim', (d) => hasSelection && !linkIds.has(d.linkId));

    view.labelSelection
      .classed('is-active', (d) => hasSelection && nodeIds.has(d.id))
      .classed('is-dim', (d) => hasSelection && !nodeIds.has(d.id));
  });
}

function clearHighlightState(views) {
  views.forEach((view) => {
    if (!view) return;
    view.nodeSelection.classed('is-active', false).classed('is-dim', false);
    view.linkSelection.classed('is-active', false).classed('is-dim', false);
    view.labelSelection.classed('is-active', false).classed('is-dim', false);
  });
}

function createSankeyGraph(rawData, nodeWidth, nodePadding) {
  const nodeById = new Map(rawData.nodes.map((node) => [node.id, { ...node }]));
  return {
    nodes: rawData.nodes.map((node) => ({ ...node, layer: node.column })),
    links: rawData.links.map((link, idx) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const sourceNode = nodeById.get(sourceId);
      return {
        ...link,
        source: sourceId,
        target: typeof link.target === 'string' ? link.target : link.target.id,
        linkId: `link-${idx}-${sourceId}-${typeof link.target === 'string' ? link.target : link.target.id}`,
        color: hexToRgba(nodeColor(sourceNode?.group), 0.42),
        nodeWidth,
        nodePadding
      };
    })
  };
}

function renderSankey(svgEl, rawData, config) {
  if (!svgEl || !window.d3 || !window.d3.sankey) return null;

  const container = svgEl.parentElement;
  const width = Math.max(config.minWidth, container.clientWidth - 2);
  const height = Math.max(config.minHeight, Math.min(config.maxHeight, width * config.heightRatio));

  svgEl.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  svg.classed('sankey-ribbon', config.ribbon);

  const sankey = d3.sankey()
    .nodeId((d) => d.id)
    .nodeWidth(config.nodeWidth)
    .nodePadding(config.nodePadding)
    .nodeSort((a, b) => d3.ascending(a.label, b.label))
    .linkSort((a, b) => b.value - a.value)
    .extent([
      [config.margin.left, config.margin.top],
      [width - config.margin.right, height - config.margin.bottom]
    ])
    .iterations(config.iterations);

  const graph = createSankeyGraph(rawData, config.nodeWidth, config.nodePadding);
  sankey(graph);

  const linkPath = d3.sankeyLinkHorizontal();

  const linkSelection = svg.append('g')
    .attr('fill', 'none')
    .selectAll('path')
    .data(graph.links)
    .join('path')
    .attr('class', 'sankey-link')
    .attr('data-link-id', (d) => d.linkId)
    .attr('d', linkPath)
    .attr('stroke', (d) => d.color)
    .attr('stroke-width', (d) => Math.max(config.ribbon ? 0.8 : 1, d.width));

  const nodeSelection = svg.append('g')
    .selectAll('g')
    .data(graph.nodes)
    .join('g')
    .attr('class', 'sankey-node')
    .attr('data-node-id', (d) => d.id);

  nodeSelection.append('rect')
    .attr('x', (d) => d.x0)
    .attr('y', (d) => d.y0)
    .attr('height', (d) => Math.max(1, d.y1 - d.y0))
    .attr('width', (d) => d.x1 - d.x0)
    .attr('fill', (d) => nodeColor(d.group));

  const labelSelection = nodeSelection.append('text')
    .attr('class', 'sankey-label')
    .attr('data-node-id', (d) => d.id)
    .attr('x', (d) => (d.x0 < width * 0.56 ? d.x1 + 8 : d.x0 - 8))
    .attr('y', (d) => (d.y0 + d.y1) / 2)
    .attr('text-anchor', (d) => (d.x0 < width * 0.56 ? 'start' : 'end'))
    .text((d) => d.label);

  if (config.ribbon) {
    labelSelection
      .attr('opacity', (d) => (d.column % 2 === 0 ? 1 : 0.7))
      .attr('dy', 0);
  }

  return { svg, nodeSelection, linkSelection, labelSelection };
}

function bindSankeyInteractions(views, graphIndex, onSubgraphChange = null) {
  const state = {
    lockedSelection: null,
    hoverSelection: null
  };

  function equalSelection(a, b) {
    if (!a || !b) return false;
    if (a.type !== b.type) return false;
    if (a.type === 'node') return a.nodeId === b.nodeId;
    return a.linkId === b.linkId;
  }

  function currentSelection() {
    return state.lockedSelection || state.hoverSelection;
  }

  function refresh() {
    const selection = currentSelection();
    if (!selection) {
      clearHighlightState(views);
      if (onSubgraphChange) onSubgraphChange(null);
      return;
    }
    const subgraph = getConnectedSubgraph(selection, graphIndex);
    applyHighlightState(selection, views, graphIndex, subgraph);
    if (onSubgraphChange) onSubgraphChange(subgraph);
  }

  function setHover(selection) {
    if (state.lockedSelection) return;
    state.hoverSelection = selection;
    refresh();
  }

  function clearHover() {
    if (state.lockedSelection) return;
    state.hoverSelection = null;
    refresh();
  }

  function toggleLock(selection) {
    if (equalSelection(state.lockedSelection, selection)) {
      state.lockedSelection = null;
    } else {
      state.lockedSelection = selection;
      state.hoverSelection = null;
    }
    refresh();
  }

  const resetBtn = document.getElementById('sankeyResetBtn');
  if (resetBtn) {
    resetBtn.onclick = () => {
      state.lockedSelection = null;
      state.hoverSelection = null;
      clearHighlightState(views);
    };
  }

  views.forEach((view) => {
    if (!view) return;

    view.nodeSelection
      .on('mouseenter', (_, d) => setHover({ type: 'node', nodeId: d.id }))
      .on('mouseleave', () => clearHover())
      .on('click', (_, d) => toggleLock({ type: 'node', nodeId: d.id }));

    view.linkSelection
      .on('mouseenter', (_, d) => setHover({ type: 'link', linkId: d.linkId }))
      .on('mouseleave', () => clearHover())
      .on('click', (_, d) => toggleLock({ type: 'link', linkId: d.linkId }));
  });

  refresh();
}

async function initProposalSankey() {
  const ribbonSvg = document.getElementById('proposalSankeyRibbonSvg');
  if (!ribbonSvg) return;

  try {
    const rawData = await loadProposalSankeyData();
    const graphIndex = buildGraphIndex(rawData);
    sankeyGraphIndex = graphIndex;

    let ribbonView = null;

    const renderRibbon = () => {
      ribbonView = renderSankey(ribbonSvg, rawData, {
        ribbon: true,
        minWidth: 980,
        minHeight: 116,
        maxHeight: 190,
        heightRatio: 0.14,
        nodeWidth: 8,
        nodePadding: 10,
        iterations: 30,
        margin: { top: 10, right: 42, bottom: 8, left: 42 }
      });

      bindSankeyInteractions([ribbonView], graphIndex, (subgraph) => {
        currentSankeySubgraph = subgraph;
        applyFloraBoardHighlightFromSubgraph(subgraph, sankeyGraphIndex);
      });
    };

    renderRibbon();

    let raf = null;
    const ro = new ResizeObserver(() => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(renderRibbon);
    });
    ro.observe(ribbonSvg.parentElement);
  } catch (err) {
    const ribbonFrame = ribbonSvg.parentElement;
    if (ribbonFrame) {
      ribbonFrame.innerHTML = `<p style="padding:16px;color:#7e2a18;">Unable to render proposal Sankey: ${err.message}</p>`;
    }
  }
}

// ── Init ──────────────────────────────────────────────────────────────────

async function init() {
  initProposalSankey();

  const wrap = document.getElementById('flora-diagram-wrap');
  const modeTabs = Array.from(document.querySelectorAll('.mode-tab'));
  const timeTabs = Array.from(document.querySelectorAll('.time-tab'));
  const timeTabsEl = document.getElementById('time-tabs');

  let baselineData = null;
  let proposedData = null;
  let growthData   = null;
  let currentMode  = 'baseline';
  let currentYear  = '0-2';

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
    wrap.style.opacity = '0.4';
    try {
      if (currentMode === 'baseline') {
        renderBaseline(await getBaseline(), wrap);
      } else if (currentMode === 'proposed') {
        renderProposed(await getProposed(), wrap);
      } else {
        renderGrowth(await getGrowth(), currentYear, wrap);
      }
    } catch (e) {
      wrap.innerHTML = `<p style="color:#7e2a18;padding:16px;">Error loading diagram data: ${e.message}</p>`;
    }
    renderSpeciesBoard(currentMode);
    applyFloraBoardHighlightFromSubgraph(currentSankeySubgraph, sankeyGraphIndex);
    wrap.style.opacity = '1';
  }

  modeTabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      currentMode = tab.dataset.mode;
      setActiveTab(modeTabs, tab);
      timeTabsEl.classList.toggle('hidden', currentMode !== 'growth');
      await render();
    });
  });

  timeTabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      currentYear = tab.dataset.year;
      setActiveTab(timeTabs, tab);
      await render();
    });
  });

  await render();
}

document.addEventListener('DOMContentLoaded', init);

