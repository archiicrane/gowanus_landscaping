console.log('[MAIN] main.js loaded, about to call initMap');
import { initMap } from './map-init.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log('[MAIN] DOMContentLoaded, calling initMap');
  initMap();
});

