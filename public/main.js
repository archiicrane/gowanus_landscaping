console.log('[MAIN] main.js loaded, about to call initMap');
import { initMap } from '/map-init.js';
import { currentTheme, setTheme } from '/theme.js';

document.addEventListener('DOMContentLoaded', () => {
	console.log('[MAIN] DOMContentLoaded, calling initMap');
	// Theme toggle UI
	const modeToggle = document.getElementById('mode-toggle');
	if (modeToggle) {
		modeToggle.addEventListener('change', (e) => {
			const mode = document.querySelector('input[name="mode"]:checked').value;
			setTheme(mode);
			window.location.reload(); // reload to apply theme (can be improved to live update)
		});
	}
	// Set paper texture overlay if needed
	const mapDiv = document.getElementById('map');
	if (mapDiv) {
		if (currentTheme.paperTexture && currentTheme.paperTexture !== 'none') {
			mapDiv.classList.add('paper-texture');
		} else {
			mapDiv.classList.remove('paper-texture');
		}
	}
	initMap();
});
