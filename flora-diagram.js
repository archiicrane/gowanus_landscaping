// flora-diagram.js (Redesigned: No wavy bands, no random scatter)

const BANDS = [
  { key: 'wet', label: 'Wet Edge', color: '#7bb6a9' },
  { key: 'woodland', label: 'Woodland Core', color: '#b7cfa2' },
  { key: 'pollinator', label: 'Pollinator Edge', color: '#e6e7b7' }
];

const SYMBOLS = {
  canopy: { r: 32, color: '#7e9e6c', stroke: '#3a4632' },
  shrub: { r: 18, color: '#b7cfa2', stroke: '#3a4632' },
  pollinator: { r: 10, color: '#e6e7b7', stroke: '#3a4632' }
};

// Structured clusters for each band (x, band, type, label)
const CLUSTERS = [
  // Wet Edge
  { band: 'wet', x: 0.18, type: 'canopy', label: 'Swamp White Oak' },
  { band: 'wet', x: 0.32, type: 'canopy' },
  { band: 'wet', x: 0.25, type: 'shrub', label: 'Buttonbush' },
  { band: 'wet', x: 0.40, type: 'shrub' },
  { band: 'wet', x: 0.55, type: 'canopy' },
  { band: 'wet', x: 0.68, type: 'shrub' },
  { band: 'wet', x: 0.80, type: 'canopy', label: 'Bald Cypress' },
  // Woodland Core
  { band: 'woodland', x: 0.13, type: 'canopy', label: 'Red Maple' },
  { band: 'woodland', x: 0.22, type: 'shrub' },
  { band: 'woodland', x: 0.30, type: 'canopy' },
  { band: 'woodland', x: 0.38, type: 'shrub', label: 'Serviceberry' },
  { band: 'woodland', x: 0.48, type: 'canopy' },
  { band: 'woodland', x: 0.60, type: 'shrub' },
  { band: 'woodland', x: 0.72, type: 'canopy', label: 'Pin Oak' },
  { band: 'woodland', x: 0.82, type: 'shrub' },
  // Pollinator Edge
  { band: 'pollinator', x: 0.10, type: 'pollinator', label: 'Milkweed' },
  { band: 'pollinator', x: 0.22, type: 'pollinator' },
  { band: 'pollinator', x: 0.34, type: 'shrub', label: 'Blueberry' },
  { band: 'pollinator', x: 0.48, type: 'pollinator' },
  { band: 'pollinator', x: 0.60, type: 'pollinator' },
  { band: 'pollinator', x: 0.72, type: 'shrub' },
  { band: 'pollinator', x: 0.84, type: 'pollinator', label: 'Bee Balm' }
];

window.addEventListener('DOMContentLoaded', () => {
  const svg = document.getElementById('flora-diagram-svg');
  renderFloraDiagram(svg);
});

function renderFloraDiagram(svg) {
  // SVG dimensions
  const width = svg.parentElement.offsetWidth || 900;
  const height = svg.parentElement.offsetHeight || 420;
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.innerHTML = '';

  // Draw 3 clean horizontal bands
  const bandHeight = height / 3;
  BANDS.forEach((band, i) => {
    const y = i * bandHeight;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', 0);
    rect.setAttribute('y', y);
    rect.setAttribute('width', width);
    rect.setAttribute('height', bandHeight);
    rect.setAttribute('fill', band.color);
    rect.setAttribute('opacity', 0.13);
    svg.appendChild(rect);
    // Draw band separator
    if (i > 0) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', 0);
      line.setAttribute('y1', y);
      line.setAttribute('x2', width);
      line.setAttribute('y2', y);
      line.setAttribute('stroke', '#bdbdbd');
      line.setAttribute('stroke-width', 1.2);
      line.setAttribute('opacity', 0.32);
      svg.appendChild(line);
    }
  });

  // Draw structured clusters
  CLUSTERS.forEach(pt => {
    const bandIdx = BANDS.findIndex(b => b.key === pt.band);
    const y = (bandIdx + 0.5) * bandHeight;
    const x = pt.x * width;
    const symbol = SYMBOLS[pt.type];
    // Draw circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', symbol.r);
    circle.setAttribute('fill', symbol.color);
    circle.setAttribute('stroke', symbol.stroke);
    circle.setAttribute('stroke-width', 2.2);
    svg.appendChild(circle);
    // Draw label if present
    if (pt.label) {
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', x);
      label.setAttribute('y', y - symbol.r - 10);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', 16);
      label.setAttribute('fill', '#3a4632');
      label.setAttribute('opacity', 0.92);
      label.textContent = pt.label;
      svg.appendChild(label);
    }
  });
}
