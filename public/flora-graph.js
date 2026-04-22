// flora-graph.js
// Gowanus Ecological Timeline Graphic (Structured Scatter)

const bands = [
  { key: 'pollinator', label: 'Pollinator Edge', y: 0.22, color: '#c7d7a2' },
  { key: 'woodland', label: 'Woodland Core', y: 0.5, color: '#7e9e6c' },
  { key: 'wet', label: 'Wet Edge', y: 0.78, color: '#4e7c6c' }
];

const years = [2030, 2050, 2070];
const widthPx = 1200;
const heightPx = 420;

// Structured data: clusters, not random
const floraPoints = [
  // Wet Edge (dense, large, compact)
  ...cluster(0.10, 0.78, 0.18, 0.09, 7, 18, 'wet', 'tree', '#4e7c6c'),
  ...cluster(0.25, 0.78, 0.13, 0.07, 5, 12, 'wet', 'shrub', '#7bb6a9'),
  ...cluster(0.40, 0.78, 0.15, 0.08, 4, 10, 'wet', 'fauna', '#e6a96c'),
  // Woodland Core (balanced, layered)
  ...cluster(0.18, 0.5, 0.22, 0.10, 6, 16, 'woodland', 'tree', '#7e9e6c'),
  ...cluster(0.38, 0.5, 0.18, 0.09, 5, 12, 'woodland', 'shrub', '#b7cfa2'),
  ...cluster(0.60, 0.5, 0.20, 0.10, 4, 10, 'woodland', 'fauna', '#e67c5c'),
  // Pollinator Edge (light, small, spaced)
  ...cluster(0.22, 0.22, 0.20, 0.10, 5, 8, 'pollinator', 'pollinator', '#e6e7b7'),
  ...cluster(0.48, 0.22, 0.18, 0.09, 4, 7, 'pollinator', 'shrub', '#c7d7a2'),
  ...cluster(0.70, 0.22, 0.22, 0.10, 3, 6, 'pollinator', 'fauna', '#e67c5c'),
];

function cluster(cx, cy, w, h, n, maxSize, band, type, color) {
  // Structured cluster: n points, slight jitter
  const arr = [];
  for (let i = 0; i < n; i++) {
    const px = cx + (i / (n - 1) - 0.5) * w + (Math.random() - 0.5) * w * 0.18;
    const py = cy + (Math.random() - 0.5) * h * 0.18;
    const size = maxSize * (0.7 + 0.6 * Math.random());
    arr.push({
      x: px,
      band,
      size,
      type,
      color
    });
  }
  return arr;
}

window.addEventListener('DOMContentLoaded', () => {
  const svg = document.getElementById('flora-graph-svg');
  renderFloraGraph(svg);
});

function renderFloraGraph(svg) {
  // Responsive SVG size
  const width = svg.parentElement.offsetWidth || widthPx;
  const height = svg.parentElement.offsetHeight || heightPx;
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.innerHTML = '';

  // Draw grid
  drawGrid(svg, width, height);

  // Draw bands
  bands.forEach(band => {
    const y = band.y * height;
    const bandHeight = height / 3.2;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', 0);
    rect.setAttribute('y', y - bandHeight / 2);
    rect.setAttribute('width', width);
    rect.setAttribute('height', bandHeight);
    rect.setAttribute('fill', band.color);
    rect.setAttribute('opacity', 0.10);
    svg.appendChild(rect);
  });

  // Draw points
  floraPoints.forEach(pt => {
    const x = pt.x * width;
    const bandObj = bands.find(b => b.key === pt.band);
    const y = bandObj.y * height + (Math.random() - 0.5) * (height / 18);
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', pt.size);
    circle.setAttribute('fill', pt.color);
    circle.setAttribute('opacity', pt.type === 'fauna' ? 0.7 : 0.82);
    circle.setAttribute('stroke', '#3a4632');
    circle.setAttribute('stroke-width', pt.type === 'fauna' ? 1.2 : 0.7);
    svg.appendChild(circle);
    // Optional: add minimal icon for fauna
    if (pt.type === 'fauna') {
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      icon.setAttribute('x', x);
      icon.setAttribute('y', y + pt.size * 0.35);
      icon.setAttribute('text-anchor', 'middle');
      icon.setAttribute('font-size', pt.size * 0.9);
      icon.setAttribute('fill', '#e67c5c');
      icon.setAttribute('opacity', 0.85);
      icon.textContent = '•';
      svg.appendChild(icon);
    }
  });
}

function drawGrid(svg, width, height) {
  // ...grid drawing code...
}
