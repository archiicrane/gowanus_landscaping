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
const satelliteDotCache = new Map();

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

function hashString(seed) {
	let h = 2166136261;
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

function seededRandom(seed) {
	let t = seed >>> 0;
	return () => {
		t += 0x6d2b79f5;
		let v = Math.imul(t ^ (t >>> 15), t | 1);
		v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
		return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
	};
}

function generateEstimatedDots(geom, count, seedKey) {
	const dots = [];
	const bbox = geometryBounds(geom);
	const rand = seededRandom(hashString(seedKey));
	const maxAttempts = Math.max(500, count * 20);
	let attempts = 0;

	while (dots.length < count && attempts < maxAttempts) {
		attempts += 1;
		const lon = bbox.minLon + rand() * (bbox.maxLon - bbox.minLon);
		const lat = bbox.minLat + rand() * (bbox.maxLat - bbox.minLat);
		if (!pointInGeometry([lon, lat], geom)) continue;
		dots.push({
			type: 'Feature',
			properties: { species: 'Estimated canopy' },
			geometry: { type: 'Point', coordinates: [lon, lat] },
		});
	}

	return dots;
}

function loadImageBitmap(url) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error('Failed to load satellite image'));
		img.src = url;
	});
}

function pixelIsCanopy(r, g, b) {
	// RGB canopy heuristic tuned to reject water and shadow-heavy pixels.
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const saturation = max > 0 ? (max - min) / max : 0;
	const greenExcess = g - Math.max(r, b);
	const vegetationScore = (1.25 * g) - (0.85 * r) - (0.7 * b);
	const looksLikeWater = b > g + 8 && b > r + 8;
	return !looksLikeWater && g > 58 && saturation > 0.12 && greenExcess > 10 && vegetationScore > 10;
}

function getWaterLayerIds(map) {
	return (map.getStyle()?.layers || [])
		.filter((layer) => layer.type === 'fill' && layer['source-layer'] === 'water')
		.map((layer) => layer.id);
}

function pointHitsWaterLayer(map, lngLat, waterLayerIds) {
	if (!waterLayerIds.length) return false;
	const p = map.project(lngLat);
	const hits = map.queryRenderedFeatures([p.x, p.y], { layers: waterLayerIds });
	return hits.length > 0;
}

async function generateSatelliteCanopyDots(map, geom, parkKey, areaAcres) {
	if (satelliteDotCache.has(parkKey)) return satelliteDotCache.get(parkKey);
	if (!window.mapboxgl?.accessToken) return [];

	const bbox = geometryBounds(geom);
	if (!Number.isFinite(bbox.minLon) || !Number.isFinite(bbox.minLat) || !Number.isFinite(bbox.maxLon) || !Number.isFinite(bbox.maxLat)) {
		return [];
	}

	const width = 640;
	const height = 640;
	const token = encodeURIComponent(window.mapboxgl.accessToken);
	const bboxStr = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
	const url = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/[${bboxStr}]/${width}x${height}?access_token=${token}&logo=false&attribution=false`;
	const waterLayerIds = getWaterLayerIds(map);

	try {
		const img = await loadImageBitmap(url);
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		ctx.drawImage(img, 0, 0, width, height);
		const imageData = ctx.getImageData(0, 0, width, height).data;

		const rand = seededRandom(hashString(`${parkKey}-sat`));
		const attempts = Math.max(600, Math.min(8500, Math.round(areaAcres * 28)));
		const dots = [];
		for (let i = 0; i < attempts; i++) {
			const lon = bbox.minLon + rand() * (bbox.maxLon - bbox.minLon);
			const lat = bbox.minLat + rand() * (bbox.maxLat - bbox.minLat);
			if (!pointInGeometry([lon, lat], geom)) continue;
			if (pointHitsWaterLayer(map, { lng: lon, lat }, waterLayerIds)) continue;

			const px = Math.max(0, Math.min(width - 1, Math.floor(((lon - bbox.minLon) / (bbox.maxLon - bbox.minLon || 1e-9)) * (width - 1))));
			const py = Math.max(0, Math.min(height - 1, Math.floor(((bbox.maxLat - lat) / (bbox.maxLat - bbox.minLat || 1e-9)) * (height - 1))));
			const idx = (py * width + px) * 4;
			const r = imageData[idx];
			const g = imageData[idx + 1];
			const b = imageData[idx + 2];

			if (pixelIsCanopy(r, g, b)) {
				dots.push({
					type: 'Feature',
					properties: { species: 'Satellite canopy proxy' },
					geometry: { type: 'Point', coordinates: [lon, lat] },
				});
			}
		}

		const capped = dots.slice(0, 2200);
		satelliteDotCache.set(parkKey, capped);
		return capped;
	} catch (err) {
		console.warn('[HANDLERS] Satellite canopy sampling failed:', err);
		return [];
	}
}

function renderPreceedenceDiagram({ treeCount, areaAcres, densityPerAcre, compactness, topSpecies, mode }) {
	const metricsEl = document.getElementById('park-tree-metrics');
	const barsEl = document.getElementById('park-tree-type-bars');
	const noteEl = document.getElementById('park-tree-note');
	if (!metricsEl || !barsEl || !noteEl) return;
	const dataLabel = mode === 'estimated' ? 'Estimated' : mode === 'satellite' ? 'Satellite' : 'Observed';

	metricsEl.innerHTML = `
		<div class="park-tree-metric"><span>Trees (${dataLabel})</span><strong>${treeCount}</strong></div>
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
		: '<p class="park-tree-empty">Street-tree species breakdown is unavailable for this park in the source dataset.</p>';

	noteEl.textContent = mode === 'satellite'
		? 'Dots are generated from Mapbox satellite imagery using a canopy-color proxy inside the park polygon. Species bars still use street-tree records only.'
		: mode === 'estimated'
			? 'This park has no street-tree points in the NYC street-tree dataset. Dot pattern is an estimated canopy-density proxy based on park footprint area.'
			: 'Dots on map represent observed street-tree records in this park. More dots = higher observed street-tree density.';
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
	let dotFeatures = selected.map((row) => ({
		type: 'Feature',
		properties: { species: row.species || 'Unknown' },
		geometry: { type: 'Point', coordinates: [row.lon, row.lat] },
	}));

	ensurePreceedenceTreeLayer(map);
	const fallbackAreaAcres = (geometryAreaPerimeter(geom).area || 0) / 4046.8564224;
	const areaAcres = Number.isFinite(Number(feature?.properties?.area_acres))
		? Number(feature.properties.area_acres)
		: fallbackAreaAcres;

	let mode = 'observed';
	let effectiveTreeCount = selected.length;

	const parkKey = String(feature?.properties?.id || feature?.properties?.name || 'park');
	const satelliteDots = areaAcres > 0 ? await generateSatelliteCanopyDots(map, geom, parkKey, areaAcres) : [];
	if (satelliteDots.length > 0) {
		mode = 'satellite';
		dotFeatures = satelliteDots;
		effectiveTreeCount = satelliteDots.length;
	} else if (selected.length === 0 && areaAcres > 0) {
		mode = 'estimated';
		effectiveTreeCount = Math.round(Math.min(900, Math.max(24, areaAcres * 16)));
		dotFeatures = generateEstimatedDots(geom, effectiveTreeCount, parkKey);
	}

	const source = map.getSource('preceedence-park-tree-dots');
	if (source) {
		source.setData({ type: 'FeatureCollection', features: dotFeatures });
	}

	const densityPerAcre = areaAcres > 0 ? effectiveTreeCount / areaAcres : 0;

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
		treeCount: effectiveTreeCount,
		areaAcres,
		densityPerAcre,
		compactness,
		topSpecies,
		mode,
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
