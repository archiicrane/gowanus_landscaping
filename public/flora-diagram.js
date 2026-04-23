/* flora-diagram.js
   Renders the Flora & Fauna diagram in three modes:
     baseline  — reads gowanus_existing_flora_fauna.csv
     proposed  — reads gowanus_proposed_flora_fauna.csv
     growth    — reads gowanus_growth_timeline.csv (with year sub-tabs)
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

function buildSpeciesItem(name, role, layerCls, sizeCls, extra) {
  const item = el('div', 'species-item');
  item.appendChild(speciesSymbol(layerCls, sizeCls));
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

  // Label column
  const lc = el('div', `band-label-col ${band.slug}`);
  const name = el('p', 'band-name'); name.textContent = band.key;
  const sub  = el('p', 'band-subtitle'); sub.textContent = band.subtitle;
  lc.appendChild(name);
  lc.appendChild(sub);
  row.appendChild(lc);

  // Content grid — 4 layer columns + fauna
  const content = el('div', 'band-content');
  content.style.gridTemplateColumns = 'repeat(4, 1fr) 1fr';

  LAYERS.forEach(layer => {
    const col = el('div', 'layer-col');
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
        extra
      );
      if (item.status === 'target_fauna') si.classList.add('target-fauna');
      col.appendChild(si);
    });

    content.appendChild(col);
  });

  // Fauna column
  const faunaCol = el('div', 'layer-col');
  const fhd = el('p', 'layer-heading'); fhd.textContent = 'Fauna';
  faunaCol.appendChild(fhd);
  faunaData.forEach(item => {
    const extra = showPhase ? phaseBadge(item.phase) : null;
    const si = buildSpeciesItem(
      item.name,
      item.ecological_role,
      'lc-fauna',
      sizeClassFor(item.diagram_size),
      extra
    );
    if (item.status === 'target_fauna') si.classList.add('target-fauna');
    faunaCol.appendChild(si);
  });
  content.appendChild(faunaCol);

  row.appendChild(content);
  return row;
}

// ── Mode: Baseline ────────────────────────────────────────────────────────

function renderBaseline(rows, container) {
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
    container.appendChild(buildBandRow(band, layerData, faunaData, false));
  });
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
  si.appendChild(speciesSymbol(layerCls, sizeCls));
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

// ── Init ──────────────────────────────────────────────────────────────────

async function init() {
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
