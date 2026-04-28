// site-plan-main.js
// Entry point for the Site Plan page

import { loadSitePlanData } from './site-plan-data.js';
import { SitePlanRenderer } from './site-plan-renderer.js';

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('site-plan-canvas-container');
  if (!container) {
    console.error('Site Plan: Canvas container not found.');
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'site-plan-canvas';
  container.appendChild(canvas);

  function resizeCanvasToDisplaySize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  resizeCanvasToDisplaySize();
  window.addEventListener('resize', resizeCanvasToDisplaySize);

  const loading = document.createElement('div');
  loading.textContent = 'Loading site plan...';
  loading.style.position = 'absolute';
  loading.style.top = '50%';
  loading.style.left = '50%';
  loading.style.transform = 'translate(-50%, -50%)';
  loading.style.color = '#6e665b';
  loading.style.fontSize = '1rem';
  loading.style.letterSpacing = '0.08em';
  loading.style.textTransform = 'uppercase';
  loading.id = 'site-plan-loading';
  container.appendChild(loading);

  try {
    const data = await loadSitePlanData();
    loading.remove();
    new SitePlanRenderer(canvas, data);
  } catch (err) {
    loading.textContent = 'Failed to load site plan.';
    console.error('Site Plan error:', err);
  }
});
