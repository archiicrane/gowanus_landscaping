// handlers.js — Hover and click interactions for all map layers

// ─── Park info panel ──────────────────────────────────────────────────────────
function openParkPanel(props) {
	const panel      = document.getElementById('park-info-panel');
	const imgEl      = document.getElementById('park-panel-image');
	const imgPhEl    = document.getElementById('park-panel-image-placeholder');
	const nameEl     = document.getElementById('park-panel-name');
	const distEl     = document.getElementById('park-panel-distance');
	const areaEl     = document.getElementById('park-panel-area');
	const estEl      = document.getElementById('park-panel-established');
	const descEl     = document.getElementById('park-panel-desc');
	const ecoEl      = document.getElementById('park-panel-ecology');
	const wildlifeEl = document.getElementById('park-panel-wildlife');
	const programsEl = document.getElementById('park-panel-programs');
	const linkEl     = document.getElementById('park-panel-link');

	if (!panel) return;

	nameEl.textContent = props.name || 'Park';
	distEl.textContent = props.distance_label || '';
	areaEl.textContent = props.area_acres ? `${props.area_acres} acres` : '';
	estEl.textContent  = props.established ? `Est. ${props.established}` : '';
	descEl.textContent = props.description || '';
	ecoEl.textContent  = props.ecology_note || '';

	if (linkEl) {
		linkEl.href = props.link || '#';
		linkEl.style.display = props.link ? 'inline-block' : 'none';
	}

	// Image: show if image_url present, else show placeholder
	const imageUrl = props.image_url && props.image_url !== 'null' ? props.image_url : null;
	if (imgEl && imgPhEl) {
		if (imageUrl) {
			imgEl.src = imageUrl;
			imgEl.alt = props.name || '';
			imgEl.classList.remove('hidden');
			imgPhEl.classList.add('hidden');
		} else {
			imgEl.src = '';
			imgEl.classList.add('hidden');
			imgPhEl.classList.remove('hidden');
		}
	}

	// Wildlife chips — Mapbox serialises array properties as JSON strings
	if (wildlifeEl) {
		wildlifeEl.innerHTML = '';
		let wildlife = [];
		try { wildlife = typeof props.wildlife === 'string' ? JSON.parse(props.wildlife) : (props.wildlife || []); } catch (_) {}
		for (const s of wildlife) {
			const li = document.createElement('li');
			li.textContent = s;
			wildlifeEl.appendChild(li);
		}
	}

	// Programs list
	if (programsEl) {
		programsEl.innerHTML = '';
		let programs = [];
		try { programs = typeof props.programs === 'string' ? JSON.parse(props.programs) : (props.programs || []); } catch (_) {}
		for (const p of programs) {
			const li = document.createElement('li');
			li.textContent = p;
			programsEl.appendChild(li);
		}
	}

	panel.classList.add('active');
}

export function setupMapHandlers(map) {
	// ─── Nearby Parks: click → side panel ────────────────────────────────────
	map.on('click', 'nearby-parks-fill', (e) => {
		const feature = e.features && e.features[0];
		if (!feature) return;
		openParkPanel(feature.properties);
	});

	// Hover highlight
	let hoveredParkId = null;
	map.on('mousemove', 'nearby-parks-fill', (e) => {
		if (!e.features || !e.features.length) return;
		const id = e.features[0].properties.id;
		if (id !== hoveredParkId) {
			hoveredParkId = id;
			if (map.getLayer('nearby-parks-outline-hover')) {
				map.setFilter('nearby-parks-outline-hover', ['==', ['get', 'id'], id]);
			}
		}
		map.getCanvas().style.cursor = 'pointer';
	});
	map.on('mouseleave', 'nearby-parks-fill', () => {
		hoveredParkId = null;
		if (map.getLayer('nearby-parks-outline-hover')) {
			map.setFilter('nearby-parks-outline-hover', ['==', ['get', 'id'], '']);
		}
		map.getCanvas().style.cursor = '';
	});

	// Close park panel
	const closeBtn = document.getElementById('park-panel-close');
	if (closeBtn) {
		closeBtn.addEventListener('click', () => {
			const panel = document.getElementById('park-info-panel');
			if (panel) panel.classList.remove('active');
		});
	}

	const tooltip = document.getElementById('map-tooltip');

	// ─── Trees: hover tooltip ─────────────────────────────────────────────────
	map.on('mouseenter', 'trees-circles', (e) => {
		map.getCanvas().style.cursor = 'pointer';
		const props = e.features[0]?.properties;
		if (!props || !tooltip) return;
		tooltip.textContent = props.species || 'Unknown species';
		tooltip.style.display = 'block';
		tooltip.style.left = `${e.originalEvent.clientX + 12}px`;
		tooltip.style.top  = `${e.originalEvent.clientY - 8}px`;
	});

	map.on('mousemove', 'trees-circles', (e) => {
		if (!tooltip) return;
		tooltip.style.left = `${e.originalEvent.clientX + 12}px`;
		tooltip.style.top  = `${e.originalEvent.clientY - 8}px`;
	});

	map.on('mouseleave', 'trees-circles', () => {
		map.getCanvas().style.cursor = '';
		if (tooltip) tooltip.style.display = 'none';
	});

	// ─── Trees: click popup ───────────────────────────────────────────────────
	map.on('click', 'trees-circles', (e) => {
		const props = e.features[0]?.properties;
		if (!props) return;

		const rows = [
			['Species', props.species || '—'],
			['Health',  props.health  || '—'],
			['DBH',     props.dbh ? `${props.dbh} in` : '—'],
			['ID',      props.tree_id || '—'],
		];

		const html = `
			<div class="popup-inner">
				<p class="popup-title">${props.species || 'Unknown species'}</p>
				<table class="popup-table">
					${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
				</table>
			</div>`;

		new mapboxgl.Popup({ offset: 8, className: 'arch-popup' })
			.setLngLat(e.lngLat)
			.setHTML(html)
			.addTo(map);
	});

	// ─── Buildings: click popup ───────────────────────────────────────────────
	map.on('mouseenter', 'buildings-extrusion', () => {
		map.getCanvas().style.cursor = 'pointer';
	});
	map.on('mouseleave', 'buildings-extrusion', () => {
		map.getCanvas().style.cursor = '';
	});

	map.on('click', 'buildings-extrusion', (e) => {
		const props = e.features[0]?.properties;
		if (!props) return;

		const height = props.height || (props['building:levels'] ? `${Math.round(props['building:levels'] * 3.2)}m (est.)` : '—');
		const addr   = [props['addr:housenumber'], props['addr:street']].filter(Boolean).join(' ') || '—';

		const html = `
			<div class="popup-inner">
				<p class="popup-title">Building</p>
				<table class="popup-table">
					<tr><td>Address</td><td>${addr}</td></tr>
					<tr><td>Height</td><td>${height}</td></tr>
				</table>
			</div>`;

		new mapboxgl.Popup({ offset: 8, className: 'arch-popup' })
			.setLngLat(e.lngLat)
			.setHTML(html)
			.addTo(map);
	});

	// ─── CSO Outfalls: hover + popup ─────────────────────────────────────────
	map.on('mouseenter', 'cso-outfalls-circle', () => {
		map.getCanvas().style.cursor = 'pointer';
	});

	map.on('mouseleave', 'cso-outfalls-circle', () => {
		map.getCanvas().style.cursor = '';
	});

	map.on('click', 'cso-outfalls-circle', (e) => {
		const props = e.features[0]?.properties || {};
		const id = props.id || props.OBJECTID || props.FID || '—';
		const name = props.name || props.NAME || props.outfall || props.OUTFALL || 'CSO Outfall';

		const html = `
			<div class="popup-inner">
				<p class="popup-title">CSO Outfall</p>
				<table class="popup-table">
					<tr><td>Name</td><td>${name}</td></tr>
					<tr><td>ID</td><td>${id}</td></tr>
				</table>
			</div>`;

		new mapboxgl.Popup({ offset: 8, className: 'arch-popup' })
			.setLngLat(e.lngLat)
			.setHTML(html)
			.addTo(map);
	});
}
