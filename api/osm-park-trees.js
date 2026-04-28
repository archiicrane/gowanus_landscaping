export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const minLon = Number(req.query.minLon);
  const minLat = Number(req.query.minLat);
  const maxLon = Number(req.query.maxLon);
  const maxLat = Number(req.query.maxLat);

  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) {
    return res.status(400).json({ error: 'Invalid bbox query params' });
  }

  const overpassQuery = `[out:json][timeout:60];(node["natural"="tree"](${minLat},${minLon},${maxLat},${maxLon}););out body;`;

  // Primary + fallback Overpass instances for resilience.
  const endpoints = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
  ];

  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'gowanus-landscaping-mapbox-fixed/1.0',
        },
        body: new URLSearchParams({ data: overpassQuery }),
      });

      if (!response.ok) {
        lastError = `HTTP ${response.status} from ${endpoint}`;
        continue;
      }

      const data = await response.json();
      const rows = (data.elements || [])
        .filter((el) => el.type === 'node' && Number.isFinite(el.lon) && Number.isFinite(el.lat))
        .map((el) => ({
          id: el.id,
          lon: el.lon,
          lat: el.lat,
          species: el.tags?.species || null,
          genus: el.tags?.genus || null,
          taxon: el.tags?.taxon || null,
          leafType: el.tags?.leaf_type || null,
          leafCycle: el.tags?.leaf_cycle || null,
          source: 'osm_overpass',
        }));

      res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=86400');
      return res.status(200).json({
        count: rows.length,
        rows,
      });
    } catch (err) {
      lastError = String(err?.message || err);
    }
  }

  return res.status(502).json({ error: 'Failed to fetch OSM trees', details: lastError });
}
