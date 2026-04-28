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

let preceedenceTreesPromise = null;

function pointInRing(point, ring) {
	const x = point[0];
	const y = point[1];
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const xi = ring[i][0];
		const yi = ring[i][1];
		const xj = ring[j][0];
		const yj = ring[j][1];
		const intersects = ((yi > y) !== (yj > y))
			&& (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
		if (intersects) inside = !inside;
	}
	return inside;
}

function pointInGeometry(point, geom) {
	if (!geom) return false;

	if (geom.type === 'Polygon') {
		const [outer, ...holes] = geom.coordinates || [];
		if (!outer || !pointInRing(point, outer)) return false;
		for (const hole of holes) {
			if (hole && pointInRing(point, hole)) return false;
		}
		return true;
	}

	if (geom.type === 'MultiPolygon') {
		for (const polygon of (geom.coordinates || [])) {
			const [outer, ...holes] = polygon || [];
			if (!outer || !pointInRing(point, outer)) continue;
			let inHole = false;
			for (const hole of holes) {
				if (hole && pointInRing(point, hole)) {
					inHole = true;
					break;
				}
			}
			if (!inHole) return true;
		}
	}

	return false;
}

function geometryBounds(geom) {
	let minLon = Infinity;
	let minLat = Infinity;
	let maxLon = -Infinity;
	let maxLat = -Infinity;

	const visit = (coords) => {
		for (const c of coords) {
			if (Array.isArray(c[0])) visit(c);
			else {
				const lon = c[0];
				const lat = c[1];
				if (lon < minLon) minLon = lon;
				if (lon > maxLon) maxLon = lon;
				if (lat < minLat) minLat = lat;
				if (lat > maxLat) maxLat = lat;
			}
		}
	};

	if (geom?.coordinates) visit(geom.coordinates);
	return { minLon, minLat, maxLon, maxLat };
}

function ringAreaSqMeters(ring) {
	if (!ring || ring.length < 3) return 0;
	const lat0 = ring[0][1] * Math.PI / 180;
	const mPerDegLon = 111320 * Math.cos(lat0);
	const mPerDegLat = 110540;
	let sum = 0;
	for (let i = 0; i < ring.length - 1; i++) {
		const x1 = ring[i][0] * mPerDegLon;
		const y1 = ring[i][1] * mPerDegLat;
		const x2 = ring[i + 1][0] * mPerDegLon;
		const y2 = ring[i + 1][1] * mPerDegLat;
		sum += x1 * y2 - x2 * y1;
	}
	return Math.abs(sum) * 0.5;
}

function ringPerimeterMeters(ring) {
	if (!ring || ring.length < 2) return 0;
	let total = 0;
	for (let i = 0; i < ring.length - 1; i++) {
		const [lon1, lat1] = ring[i];
		const [lon2, lat2] = ring[i + 1];
		const avgLat = ((lat1 + lat2) * 0.5) * Math.PI / 180;
		const dx = (lon2 - lon1) * 111320 * Math.cos(avgLat);
		const dy = (lat2 - lat1) * 110540;
		total += Math.hypot(dx, dy);
	}
	return total;
}

function geometryAreaPerimeter(geom) {
	let area = 0;
	let perimeter = 0;
	if (!geom) return { area, perimeter };

	if (geom.type === 'Polygon') {
		const [outer] = geom.coordinates || [];
		area += ringAreaSqMeters(outer);
		perimeter += ringPerimeterMeters(outer);
	}

	if (geom.type === 'MultiPolygon') {
		for (const polygon of (geom.coordinates || [])) {
			const [outer] = polygon || [];
			area += ringAreaSqMeters(outer);
			perimeter += ringPerimeterMeters(outer);
		}
	}

	return { area, perimeter };
}

async function loadPreceedenceTrees() {
	if (!preceedenceTreesPromise) {
		preceedenceTreesPromise = fetch('/data/gowanus_trees_clean.json')
			.then((res) => (res.ok ? res.json() : []))
			.then((rows) => rows.filter((r) => Number.isFinite(r.lon) && Number.isFinite(r.lat)));
	}
	return preceedenceTreesPromise;
}

function ensurePreceedenceTreeLayer(map) {
	if (!map.getSource('preceedence-park-tree-dots')) {
		map.addSource('preceedence-park-tree-dots', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] },
		});
	}

	if (!map.getLayer('preceedence-park-tree-dots')) {
		map.addLayer({
			id: 'preceedence-park-tree-dots',
			type: 'circle',
			source: 'preceedence-park-tree-dots',
			paint: {
				'circle-radius': [
					'interpolate', ['linear'], ['zoom'],
					10, 1.5,
					13, 2.4,
					16, 3.2,
				],
				'circle-color': '#1f6f45',
				'circle-opacity': 0.75,
				'circle-stroke-color': 'rgba(255,255,255,0.55)',
				'circle-stroke-width': 0.6,
			},
			layout: { visibility: 'visible' },
		}, 'nearby-parks-label');
	}
}

function renderPreceedenceDiagram({ treeCount, areaAcres, densityPerAcre, compactness, topSpecies }) {
	const metricsEl = document.getElementById('park-tree-metrics');
	const barsEl = document.getElementById('park-tree-type-bars');
	const noteEl = document.getElementById('park-tree-note');
	if (!metricsEl || !barsEl || !noteEl) return;

	metricsEl.innerHTML = `
		<div class="park-tree-metric"><span>Trees</span><strong>${treeCount}</strong></div>
		<div class="park-tree-metric"><span>Density</span><strong>${densityPerAcre.toFixed(1)} / acre</strong></div>
		<div class="park-tree-metric"><span>Area</span><strong>${areaAcres.toFixed(1)} ac</strong></div>
		<div class="park-tree-metric"><span>Shape</span><strong>${compactness.toFixed(2)}</strong></div>
	`;

	const max = Math.max(1, ...topSpecies.map((d) => d.count));
	barsEl.innerHTML = topSpecies.length
		? topSpecies.map((d) => `
			<div class="park-tree-bar-row">
				<span class="park-tree-bar-label">${d.species}</span>
				<div class="park-tree-bar-track"><span class="park-tree-bar-fill" style="width:${(d.count / max) * 100}%"></span></div>
				<span class="park-tree-bar-value">${d.count}</span>
			</div>
		`).join('')
		: '<p class="park-tree-empty">No tree records found in this park from the loaded dataset.</p>';

	noteEl.textContent = 'Dots on map represent tree records in this park. More dots = higher observed density.';
}

async function analyzePreceedenceParkTrees(map, feature) {
	const metricsEl = document.getElementById('park-tree-metrics');
	if (!metricsEl) return;

	const geom = feature?.geometry;
	if (!geom) return;

	const rows = await loadPreceedenceTrees();
	const bbox = geometryBounds(geom);
	const selected = rows.filter((row) => {
		if (row.lon < bbox.minLon || row.lon > bbox.maxLon || row.lat < bbox.minLat || row.lat > bbox.maxLat) {
			return false;
		}
		return pointInGeometry([row.lon, row.lat], geom);
	});

	ensurePreceedenceTreeLayer(map);
	const source = map.getSource('preceedence-park-tree-dots');
	if (source) {
		source.setData({
			type: 'FeatureCollection',
			features: selected.map((row) => ({
				type: 'Feature',
				properties: { species: row.species || 'Unknown' },
				geometry: { type: 'Point', coordinates: [row.lon, row.lat] },
			})),
		});
	}

	const fallbackAreaAcres = (geometryAreaPerimeter(geom).area || 0) / 4046.8564224;
	const areaAcres = Number.isFinite(Number(feature?.properties?.area_acres))
		? Number(feature.properties.area_acres)
		: fallbackAreaAcres;
	const densityPerAcre = areaAcres > 0 ? selected.length / areaAcres : 0;

	const counts = new Map();
	for (const row of selected) {
		const key = String(row.species || 'Unknown').trim() || 'Unknown';
		counts.set(key, (counts.get(key) || 0) + 1);
	}
	const topSpecies = [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 6)
		.map(([species, count]) => ({ species, count }));

	const { area, perimeter } = geometryAreaPerimeter(geom);
	const compactness = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;

	renderPreceedenceDiagram({
		treeCount: selected.length,
		areaAcres,
		densityPerAcre,
		compactness,
		topSpecies,
	});
}

export function setupMapHandlers(map) {
	const pageType = document.body?.dataset.mapPage || '';
	const isPreceedencePage = pageType === 'preceedence' || pageType === 'map';

	// ─── Nearby Parks: click → side panel ────────────────────────────────────
	if (map.getLayer('nearby-parks-fill')) {
		map.on('click', 'nearby-parks-fill', async (e) => {
			const feature = e.features && e.features[0];
			if (!feature) return;
			openParkPanel(feature.properties);
			if (isPreceedencePage) {
				try {
					await analyzePreceedenceParkTrees(map, feature);
				} catch (err) {
					console.warn('[HANDLERS] Failed to analyze park trees:', err);
				}
			}
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
	}

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
	if (map.getLayer('trees-circles')) {
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
	}

	// ─── Trees: click popup ───────────────────────────────────────────────────
	if (map.getLayer('trees-circles')) {
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
	}

	// ─── Buildings: click popup ───────────────────────────────────────────────
	if (map.getLayer('buildings-extrusion')) {
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
	}

	// ─── CSO Outfalls: hover + popup ─────────────────────────────────────────
	if (map.getLayer('cso-outfalls-circle')) {
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
}
