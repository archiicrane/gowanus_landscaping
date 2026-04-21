// site-plan-main.js
// Entry point for the Site Plan page

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('site-plan-canvas-container');
  if (!container) {
    console.error('Site Plan: Canvas container not found.');
    return;
  }

  // Create and append the Three.js canvas
  const canvas = document.createElement('canvas');
  canvas.className = 'site-plan-canvas';
  container.appendChild(canvas);

  // Placeholder: Show loading message
  const loading = document.createElement('div');
  loading.textContent = 'Loading site plan...';
  loading.style.position = 'absolute';
  loading.style.top = '50%';
  loading.style.left = '50%';
  loading.style.transform = 'translate(-50%, -50%)';
  loading.style.color = '#888';
  loading.style.fontSize = '1.2em';
  loading.id = 'site-plan-loading';
  container.appendChild(loading);

  // Next steps: load data, initialize renderer, etc.
  // (To be implemented in later steps)
});
