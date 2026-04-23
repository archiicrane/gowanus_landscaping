// handlers.js — Hover and click interactions for all map layers

export function setupMapHandlers(map) {
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
