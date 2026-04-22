// flora-diagram.js
// Gowanus Site Plan Flora/Fauna Band Diagram

const floraData = {
  wet: { density: 0.8, sizeRange: [4, 10] },
  woodland: { density: 0.5, sizeRange: [3, 8] },
  pollinator: { density: 0.3, sizeRange: [2, 6] }
};

const bandColors = {
  wet: 'url(#wet-gradient)',
  woodland: 'url(#woodland-gradient)',
  pollinator: 'url(#pollinator-gradient)'
};

const bandOrder = ['pollinator', 'woodland', 'wet'];

window.addEventListener('DOMContentLoaded', () => {
  const svg = document.getElementById('flora-diagram-svg');
  renderFloraDiagram(svg);
});

function renderFloraDiagram(svg) {
  // Responsive SVG size
  const width = svg.parentElement.offsetWidth;
  const height = svg.parentElement.offsetHeight;
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.innerHTML = '';

  // Gradients
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <linearGradient id="wet-gradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4e7c6c"/>
      <stop offset="100%" stop-color="#7bb6a9"/>
    </linearGradient>
    <linearGradient id="woodland-gradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7e9e6c"/>
      <stop offset="100%" stop-color="#b7cfa2"/>
    </linearGradient>
    <linearGradient id="pollinator-gradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e6e7b7"/>
      <stop offset="100%" stop-color="#c7d7a2"/>
    </linearGradient>
  `;
  svg.appendChild(defs);

  // Band heights
  const bandHeight = height / 3;
  const bandPadding = bandHeight * 0.08;

  bandOrder.forEach((band, i) => {
    const y = i * bandHeight;
    // Draw soft organic band shape
    const bandPath = createOrganicBandPath(width, bandHeight, y, bandPadding, i);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', bandPath);
    path.setAttribute('fill', bandColors[band]);
    path.setAttribute('opacity', 0.97);
    svg.appendChild(path);
    // Scatter points
    scatterFloraPoints(svg, band, width, bandHeight, y, floraData[band]);
  });
}

function createOrganicBandPath(width, bandHeight, y, pad, seed) {
  // Create a wavy top and bottom edge using Perlin-like noise
  const points = 24;
  let d = '';
  // Top edge
  for (let i = 0; i <= points; i++) {
    const x = (i / points) * width;
    const noise = Math.sin((i + seed * 3) * 0.6) * pad * 1.1 + Math.cos((i + seed) * 0.9) * pad * 0.7;
    const yTop = y + noise + (seed === 0 ? pad * 0.7 : 0);
    d += i === 0 ? `M${x},${yTop}` : `L${x},${yTop}`;
  }
  // Bottom edge
  for (let i = points; i >= 0; i--) {
    const x = (i / points) * width;
    const noise = Math.sin((i + seed * 2.2) * 0.7) * pad * 1.2 + Math.cos((i + seed * 1.3) * 0.8) * pad * 0.6;
    const yBot = y + bandHeight - noise - (seed === 2 ? pad * 0.7 : 0);
    d += `L${x},${yBot}`;
  }
  d += 'Z';
  return d;
}

function scatterFloraPoints(svg, band, width, bandHeight, y, { density, sizeRange }) {
  const area = width * bandHeight;
  const count = Math.floor(area * density * 0.0022); // tune for visual density
  for (let i = 0; i < count; i++) {
    const rx = Math.random();
    const ry = Math.random();
    // Irregular clustering for wet edge
    let px = rx * width;
    let py = y + ry * bandHeight;
    if (band === 'wet') {
      px += Math.sin(ry * 8 + Math.random() * 2) * 12;
      py += Math.cos(rx * 7 + Math.random() * 2) * 8;
    } else if (band === 'woodland') {
      px += Math.sin(ry * 5 + Math.random()) * 8;
      py += Math.cos(rx * 4 + Math.random()) * 6;
    } else if (band === 'pollinator') {
      px += Math.sin(ry * 3 + Math.random()) * 6;
      py += Math.cos(rx * 2 + Math.random()) * 4;
    }
    const size = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', px);
    dot.setAttribute('cy', py);
    dot.setAttribute('r', size);
    dot.setAttribute('fill', band === 'wet' ? '#3e5c4c' : band === 'woodland' ? '#7e9e6c' : '#c7d7a2');
    dot.setAttribute('opacity', band === 'wet' ? 0.22 + Math.random() * 0.18 : band === 'woodland' ? 0.18 + Math.random() * 0.13 : 0.13 + Math.random() * 0.10);
    svg.appendChild(dot);
  }
}
