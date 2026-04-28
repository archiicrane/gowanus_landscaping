const TREEKEEPER_WFS_URL = 'https://geocom.daveytreekeeper.com/geoserver/Treekeeper/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=Treekeeper:ProspectParkNY_Trees&outputFormat=application/json&srsName=EPSG:4326';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch(TREEKEEPER_WFS_URL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'gowanus-landscaping-mapbox-fixed/1.0',
      },
    });

    if (!response.ok) {
      return res.status(502).json({
        error: 'Failed to fetch TreeKeeper WFS',
        details: `HTTP ${response.status}`,
      });
    }

    const data = await response.json();
    const rows = (data.features || [])
      .filter((f) => f?.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates))
      .map((f) => {
        const [lon, lat] = f.geometry.coordinates;
        return {
          id: f?.properties?.site_id || f.id,
          lon,
          lat,
          species: null,
          genus: null,
          taxon: null,
          source: 'treekeeper_wfs',
          treeType: f?.properties?.tree_type ?? null,
        };
      })
      .filter((row) => Number.isFinite(row.lon) && Number.isFinite(row.lat));

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=86400');
    return res.status(200).json({
      count: rows.length,
      rows,
    });
  } catch (err) {
    return res.status(502).json({
      error: 'Failed to fetch TreeKeeper trees',
      details: String(err?.message || err),
    });
  }
}