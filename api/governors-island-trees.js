const GOVERNORS_TREE_CONFIG_URL = 'https://cem.pg-cloud.com/customers/GovernorsIsland/tree_map_config.json';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch(GOVERNORS_TREE_CONFIG_URL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'gowanus-landscaping-mapbox-fixed/1.0',
      },
    });

    if (!response.ok) {
      return res.status(502).json({
        error: 'Failed to fetch Governors Island tree config',
        details: `HTTP ${response.status}`,
      });
    }

    const config = await response.json();
    const treeCount = Number(config?.aggregateData?.treeCount || 0);
    const speciesField = (config?.fields || []).find((f) => f?.name === 'species_common');
    const topSpecies = (speciesField?.topFive || [])
      .map((item) => ({
        species: String(item?.alias || 'Unknown').trim() || 'Unknown',
        count: Number(item?.count || 0),
      }))
      .filter((item) => item.count > 0);

    const eco = config?.aggregateData?.ecobens || {};

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=86400');
    return res.status(200).json({
      source: 'governors_treeplotter_config',
      treeCount,
      topSpecies,
      benefits: {
        overallValueUsd: Number(eco?.overall_value_usd || 0),
        stormwaterValueUsd: Number(eco?.hydro_runoff_avoided_value_usd || 0),
        airQualityValueUsd: Number(eco?.overall_pollution_value_usd || 0),
        carbonValueUsd: Number(eco?.overall_carbon_value_usd || 0),
      },
      rows: [],
    });
  } catch (err) {
    return res.status(502).json({
      error: 'Failed to fetch Governors Island tree data',
      details: String(err?.message || err),
    });
  }
}