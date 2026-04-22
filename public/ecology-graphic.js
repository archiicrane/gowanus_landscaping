// ecology-graphic.js
// Gowanus Ecological Infographic (Grid-based, Structured)

const ZONES = [
  { key: 'wet', label: 'Wet Edge', color: '#7bb6a9', y: 2 },
  { key: 'woodland', label: 'Woodland Core', color: '#7e9e6c', y: 1 },
  { key: 'pollinator', label: 'Pollinator Edge', color: '#e6e7b7', y: 0 }
];

const SYMBOLS = {
  canopy: { r: 38, color: '#7e9e6c', stroke: '#3a4632' },
  shrub: { r: 22, color: '#b7cfa2', stroke: '#3a4632' },
  pollinator: { r: 13, color: '#e6e7b7', stroke: '#3a4632' }
};

// Structured clusters for each zone (x, y, type, label, icon)
const CLUSTERS = [
  // Wet Edge
  { zone: 'wet', x: 0.18, type: 'canopy', label: 'Swamp White Oak' },
  { zone: 'wet', x: 0.32, type: 'canopy' },
  { zone: 'wet', x: 0.25, type: 'shrub', label: 'Buttonbush' },
  { zone: 'wet', x: 0.40, type: 'shrub' },
  { zone: 'wet', x: 0.55, type: 'canopy', icon: '🦆' },
  { zone: 'wet', x: 0.68, type: 'shrub' },
  { zone: 'wet', x: 0.80, type: 'canopy', label: 'Bald Cypress' },
  // Woodland Core
  { zone: 'woodland', x: 0.13, type: 'canopy', label: 'Red Maple' },
  { zone: 'woodland', x: 0.22, type: 'shrub' },
  { zone: 'woodland', x: 0.30, type: 'canopy' },
  { zone: 'woodland', x: 0.38, type: 'shrub', label: 'Serviceberry' },
  { zone: 'woodland', x: 0.48, type: 'canopy', icon: '🦉' },
  { zone: 'woodland', x: 0.60, type: 'shrub' },
  { zone: 'woodland', x: 0.72, type: 'canopy', label: 'Pin Oak' },
  { zone: 'woodland', x: 0.82, type: 'shrub' },
  // Pollinator Edge
  { zone: 'pollinator', x: 0.10, type: 'pollinator', label: 'Milkweed' },
  { zone: 'pollinator', x: 0.22, type: 'pollinator' },
  { zone: 'pollinator', x: 0.34, type: 'shrub', label: 'Blueberry' },
  { zone: 'pollinator', x: 0.48, type: 'pollinator', icon: '🦋' },
  { zone: 'pollinator', x: 0.60, type: 'pollinator' },
  { zone: 'pollinator', x: 0.72, type: 'shrub' },
  { zone: 'pollinator', x: 0.84, type: 'pollinator', label: 'Bee Balm' }
];

window.addEventListener('DOMContentLoaded', () => {
  const svg = document.getElementById('ecology-graphic-svg');
  renderEcologyGraphic(svg);
});

function renderEcologyGraphic(svg) {
  // SVG dimensions
  const width = svg.parentElement.offsetWidth || 900;
  const height = svg.parentElement.offsetHeight || 420;
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.innerHTML = '';

  // Draw grid
  drawGrid(svg, width, height);

  // Draw zone separators
  for (let i = 1; i < ZONES.length; i++) {
    const y = (i / ZONES.length) * height;
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

  // Draw clusters
  CLUSTERS.forEach((pt, i) => {
    const zoneIdx = ZONES.findIndex(z => z.key === pt.zone);
    const y = ((zoneIdx + 0.5) / ZONES.length) * height;
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
    // Draw icon if present
    if (pt.icon) {
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      icon.setAttribute('x', x);
      icon.setAttribute('y', y + 8);
      icon.setAttribute('text-anchor', 'middle');
      icon.setAttribute('font-size', symbol.r * 1.1);
      icon.setAttribute('fill', '#7a5c2c');
      icon.setAttribute('opacity', 0.92);
      icon.textContent = pt.icon;
      svg.appendChild(icon);
    }
  });
}

function drawGrid(svg, width, height) {
  // ...grid drawing code...
}
