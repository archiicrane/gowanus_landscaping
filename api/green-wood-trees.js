const GREEN_WOOD_FEATURE_LAYER_URL = 'https://gardens.green-wood.com/server/rest/services/Plant_Center_for_Tree_Finder/FeatureServer/0/query';
const QUERY_FIELDS = [
	'OBJECTID',
	'PlantCenterID',
	'PrimaryCommonName',
	'ScientificName',
	'Genus',
	'SpecificEpithet',
	'Latitude',
	'Longitude',
];

async function fetchArcGisQuery(params) {
	const body = new URLSearchParams({
		f: 'json',
		...params,
	});

	const response = await fetch(GREEN_WOOD_FEATURE_LAYER_URL, {
		method: 'POST',
		headers: {
			'Accept': 'application/json',
			'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
			'User-Agent': 'gowanus-landscaping-mapbox-fixed/1.0',
		},
		body,
	});

	if (!response.ok) {
		throw new Error(`ArcGIS request failed: HTTP ${response.status}`);
	}

	const data = await response.json();
	if (data?.error) {
		const msg = data.error?.message || 'ArcGIS error';
		throw new Error(msg);
	}

	return data;
}

function toRow(feature) {
	const attrs = feature?.attributes || {};
	const geom = feature?.geometry || {};

	let lon = Number(geom.x);
	let lat = Number(geom.y);

	if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
		lon = Number(attrs.Longitude);
		lat = Number(attrs.Latitude);
	}

	if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
		return null;
	}

	const commonName = typeof attrs.PrimaryCommonName === 'string'
		? attrs.PrimaryCommonName.trim()
		: '';
	const scientificName = typeof attrs.ScientificName === 'string'
		? attrs.ScientificName.trim()
		: '';

	return {
		id: attrs.PlantCenterID || attrs.OBJECTID || null,
		lon,
		lat,
		species: commonName || scientificName || null,
		genus: attrs.Genus || null,
		taxon: scientificName || null,
		source: 'greenwood_feature_service',
		plantCenterId: attrs.PlantCenterID || null,
	};
}

export default async function handler(req, res) {
	if (req.method !== 'GET') {
		return res.status(405).json({ error: 'Method not allowed' });
	}

	try {
		const features = [];
		const pageSize = 2000;
		let offset = 0;
		let safety = 0;

		while (safety < 20) {
			safety += 1;
			const data = await fetchArcGisQuery({
				where: '1=1',
				outFields: QUERY_FIELDS.join(','),
				returnGeometry: 'true',
				outSR: '4326',
				orderByFields: 'OBJECTID ASC',
				resultOffset: String(offset),
				resultRecordCount: String(pageSize),
			});

			const batch = Array.isArray(data?.features) ? data.features : [];
			if (!batch.length) break;

			features.push(...batch);
			offset += batch.length;

			if (!data?.exceededTransferLimit) break;
		}

		const rows = features.map(toRow).filter(Boolean);

		res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=86400');
		return res.status(200).json({
			count: rows.length,
			rows,
		});
	} catch (err) {
		return res.status(502).json({
			error: 'Failed to fetch Green-Wood tree data',
			details: String(err?.message || err),
		});
	}
}