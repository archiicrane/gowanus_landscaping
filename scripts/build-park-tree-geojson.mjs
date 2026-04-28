import fs from 'node:fs/promises';
import path from 'node:path';

const PROSPECT_WFS_URL = 'https://geocom.daveytreekeeper.com/geoserver/Treekeeper/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=Treekeeper:ProspectParkNY_Trees&outputFormat=application/json&srsName=EPSG:4326';
const GREEN_WOOD_QUERY_URL = 'https://gardens.green-wood.com/server/rest/services/Plant_Center_for_Tree_Finder/FeatureServer/0/query';

async function fetchProspectFeatures() {
  const res = await fetch(PROSPECT_WFS_URL, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Prospect fetch failed: HTTP ${res.status}`);
  const data = await res.json();
  const features = (data.features || [])
    .filter((f) => f?.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates))
    .map((f) => {
      const [lon, lat] = f.geometry.coordinates;
      return {
        type: 'Feature',
        properties: {
          id: f?.properties?.site_id || f.id || null,
          species: null,
          genus: null,
          taxon: null,
          source: 'treekeeper_wfs_static',
        },
        geometry: {
          type: 'Point',
          coordinates: [lon, lat],
        },
      };
    })
    .filter((f) => Number.isFinite(f.geometry.coordinates[0]) && Number.isFinite(f.geometry.coordinates[1]));

  return {
    type: 'FeatureCollection',
    features,
  };
}

async function postArcGisQuery(params) {
  const body = new URLSearchParams({ f: 'json', ...params });
  const res = await fetch(GREEN_WOOD_QUERY_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body,
  });
  if (!res.ok) throw new Error(`Green-Wood fetch failed: HTTP ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(data.error?.message || 'Green-Wood ArcGIS error');
  return data;
}

async function fetchGreenWoodFeatures() {
  const outFields = [
    'OBJECTID',
    'PlantCenterID',
    'PrimaryCommonName',
    'ScientificName',
    'Genus',
    'SpecificEpithet',
    'Latitude',
    'Longitude',
  ].join(',');

  const all = [];
  const pageSize = 2000;
  let offset = 0;
  let safety = 0;

  while (safety < 20) {
    safety += 1;
    const data = await postArcGisQuery({
      where: '1=1',
      outFields,
      returnGeometry: 'true',
      outSR: '4326',
      orderByFields: 'OBJECTID ASC',
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
    });

    const batch = Array.isArray(data?.features) ? data.features : [];
    if (!batch.length) break;
    all.push(...batch);
    offset += batch.length;
    if (!data?.exceededTransferLimit) break;
  }

  const features = all
    .map((feature) => {
      const attrs = feature?.attributes || {};
      const geom = feature?.geometry || {};
      let lon = Number(geom.x);
      let lat = Number(geom.y);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        lon = Number(attrs.Longitude);
        lat = Number(attrs.Latitude);
      }
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

      const common = typeof attrs.PrimaryCommonName === 'string' ? attrs.PrimaryCommonName.trim() : '';
      const sci = typeof attrs.ScientificName === 'string' ? attrs.ScientificName.trim() : '';

      return {
        type: 'Feature',
        properties: {
          id: attrs.PlantCenterID || attrs.OBJECTID || null,
          species: common || sci || null,
          genus: attrs.Genus || null,
          taxon: sci || null,
          source: 'greenwood_feature_service_static',
        },
        geometry: {
          type: 'Point',
          coordinates: [lon, lat],
        },
      };
    })
    .filter(Boolean);

  return {
    type: 'FeatureCollection',
    features,
  };
}

async function main() {
  const repoRoot = process.cwd();
  const publicDataDir = path.join(repoRoot, 'public', 'data');
  await fs.mkdir(publicDataDir, { recursive: true });

  const [prospect, greenWood] = await Promise.all([
    fetchProspectFeatures(),
    fetchGreenWoodFeatures(),
  ]);

  const prospectPath = path.join(publicDataDir, 'prospect-park-trees.geojson');
  const greenWoodPath = path.join(publicDataDir, 'green-wood-trees.geojson');

  await fs.writeFile(prospectPath, JSON.stringify(prospect), 'utf8');
  await fs.writeFile(greenWoodPath, JSON.stringify(greenWood), 'utf8');

  console.log(`Wrote ${prospect.features.length} features -> ${prospectPath}`);
  console.log(`Wrote ${greenWood.features.length} features -> ${greenWoodPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
