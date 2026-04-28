console.log('[MAIN] main.js loaded, about to call initMap');
import { initMap } from './map-init.js';
import { currentTheme, setTheme } from './theme.js';

document.addEventListener('DOMContentLoaded', () => {
	console.log('[MAIN] DOMContentLoaded, calling initMap');
	const modeToggle = document.getElementById('mode-toggle');
	if (modeToggle) {
		modeToggle.addEventListener('change', () => {
			const checked = document.querySelector('input[name="mode"]:checked');
			if (!checked) return;
			setTheme(checked.value);
			window.location.reload();
		});
	}

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

