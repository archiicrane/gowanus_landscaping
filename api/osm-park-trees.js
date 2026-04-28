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

  // Enhanced query: fetch both nodes and ways, include trees with any tree-related tags.
  // natural=tree is the primary tag, but also catch:
  // - landuse=forest/wood (larger tree features)
  // - leisure=park with tree-related data
  // - nodes with heritage/species/genus tags that indicate individual trees
  const overpassQuery = `[out:json][timeout:90][bbox:${minLat},${minLon},${maxLat},${maxLon}];
(
  node["natural"="tree"];
  node["natural"~"tree|trees|vegetation|woodland"];
  way["natural"="tree"];
  way["natural"~"tree|trees|vegetation|woodland"];
);
out center geom;`;

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
      
      // Process both nodes and ways, extracting tree points
      const rows = (data.elements || [])
        .filter((el) => {
          if (el.type === 'node') return Number.isFinite(el.lon) && Number.isFinite(el.lat);
          if (el.type === 'way') return el.center && Number.isFinite(el.center.lon) && Number.isFinite(el.center.lat);
          return false;
        })
        .map((el) => {
          const lon = el.type === 'node' ? el.lon : el.center.lon;
          const lat = el.type === 'node' ? el.lat : el.center.lat;
          const tags = el.tags || {};
          
          // Extract species/genus with fallbacks
          let species = tags.species || tags.name || null;
          if (species && species.length > 60) species = null; // Ignore junk/long text
          
          return {
            id: el.id,
            lon,
            lat,
            type: el.type,
            species: species,
            genus: tags.genus || tags.genus_name || null,
            taxon: tags.taxon || tags.scientific_name || null,
            leafType: tags.leaf_type || null,
            leafCycle: tags.leaf_cycle || null,
            dbh: tags.dbh || null, // Diameter at breast height (indicator of mature tree)
            height: tags.height || null,
            ref: tags.ref || null, // Reference number if catalogued
            source: 'osm_overpass',
          };
        });

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
