document.addEventListener('DOMContentLoaded', () => {
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

  // Create and append the Three.js canvas
  const canvas = document.createElement('canvas');
  canvas.className = 'site-plan-canvas';
  container.appendChild(canvas);

  // Show loading message
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

  try {
    const data = await loadSitePlanData();
    // Remove loading message
    loading.remove();
    // Initialize renderer
    new SitePlanRenderer(canvas, data);
  } catch (err) {
    loading.textContent = 'Failed to load site plan.';
    console.error('Site Plan error:', err);
  }
});
