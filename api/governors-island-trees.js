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

    const knownCounts = new Map(
      topSpecies.map((item) => [item.species.toLowerCase(), item.count])
    );
    const allSpecies = (speciesField?.values || [])
      .map((item) => String(item?.alias || '').trim())
      .filter(Boolean)
      .map((species) => ({
        species,
        count: knownCounts.get(species.toLowerCase()) ?? null,
      }));

    // De-duplicate and keep a stable sort with known counts first.
    const unique = new Map();
    for (const item of allSpecies) {
      const key = item.species.toLowerCase();
      if (!unique.has(key)) unique.set(key, item);
    }
    const speciesBreakdown = [...unique.values()].sort((a, b) => {
      const aKnown = Number.isFinite(a.count) ? 1 : 0;
      const bKnown = Number.isFinite(b.count) ? 1 : 0;
      if (aKnown !== bKnown) return bKnown - aKnown;
      if (aKnown && bKnown) return b.count - a.count;
      return a.species.localeCompare(b.species);
    });

    const eco = config?.aggregateData?.ecobens || {};

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=86400');
    return res.status(200).json({
      source: 'governors_treeplotter_config',
      treeCount,
      topSpecies,
      speciesBreakdown,
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