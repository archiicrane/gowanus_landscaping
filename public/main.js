// main.js (root) — legacy entry point, kept for compatibility
// New entry point is /js/main.js (loaded by index.html)
import { initMap } from '/map-init.js';

document.addEventListener('DOMContentLoaded', () => {
	initMap();
});

