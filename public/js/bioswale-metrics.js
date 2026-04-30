const TREE_SPACING_SQFT = 150;
const CANOPY_RADIUS_FT = 12;
const GALLONS_PER_SQFT = 7.48;
const SOIL_REMEDIATION_RATIO = 0.65;

export const BIOSWALE_CONSTANTS = {
  TREE_SPACING_SQFT,
  CANOPY_RADIUS_FT,
  GALLONS_PER_SQFT,
  SOIL_REMEDIATION_RATIO,
};

export async function loadBioswaleGeoJSON() {
  const response = await fetch('/data/bioswales.geojson');
  if (!response.ok) {
    throw new Error(`Failed to load bioswales.geojson: ${response.status}`);
  }
  return response.json();
}

export function calculateBioswaleMetrics(bioswaleGeojson, options = {}) {
  const turf = window.turf;
  if (!turf || !bioswaleGeojson?.features) {
    return {
      featureCollection: bioswaleGeojson || { type: 'FeatureCollection', features: [] },
      totals: {
        totalAreaSqFt: 0,
        totalAreaAcres: 0,
        stormwaterGallons: 0,
        estimatedTrees: 0,
        addedCanopySqFt: 0,
        soilRemediationSqFt: 0,
        soilRemediationAcres: 0,
      },
    };
  }

  const treeSpacingSqFt = options.treeSpacingSqFt ?? TREE_SPACING_SQFT;
  const canopyRadiusFt = options.canopyRadiusFt ?? CANOPY_RADIUS_FT;
  const gallonsPerSqFt = options.gallonsPerSqFt ?? GALLONS_PER_SQFT;
  const soilRemediationRatio = options.soilRemediationRatio ?? SOIL_REMEDIATION_RATIO;

  let totalAreaSqFt = 0;
  let stormwaterGallons = 0;
  let estimatedTrees = 0;

  bioswaleGeojson.features.forEach((feature, idx) => {
    const areaSqM = turf.area(feature);
    const areaSqFt = areaSqM * 10.7639;
    const areaAcres = areaSqFt / 43560;
    const treesForFeature = Math.floor(areaSqFt / treeSpacingSqFt);
    const canopyForFeatureSqFt = treesForFeature * Math.PI * canopyRadiusFt * canopyRadiusFt;
    const stormwaterForFeature = areaSqFt * gallonsPerSqFt;
    const remediationAreaSqFt = areaSqFt * soilRemediationRatio;

    totalAreaSqFt += areaSqFt;
    stormwaterGallons += stormwaterForFeature;
    estimatedTrees += treesForFeature;

    feature.properties = feature.properties || {};
    feature.properties.id = feature.properties.id || `bioswale-${idx + 1}`;
    feature.properties.name = feature.properties.name || `Bioswale ${idx + 1}`;
    feature.properties.zone = feature.properties.zone || 'Proposed';
    feature.properties.area_sqft = Number(areaSqFt.toFixed(2));
    feature.properties.area_acres = Number(areaAcres.toFixed(4));
    feature.properties.estimated_trees = treesForFeature;
    feature.properties.added_canopy_sqft = Number(canopyForFeatureSqFt.toFixed(2));
    feature.properties.stormwater_gallons = Number(stormwaterForFeature.toFixed(2));
    feature.properties.soil_remediation_sqft = Number(remediationAreaSqFt.toFixed(2));
  });

  const totalAreaAcres = totalAreaSqFt / 43560;
  const addedCanopySqFt = estimatedTrees * Math.PI * canopyRadiusFt * canopyRadiusFt;
  const soilRemediationSqFt = totalAreaSqFt * soilRemediationRatio;
  const soilRemediationAcres = soilRemediationSqFt / 43560;

  return {
    featureCollection: bioswaleGeojson,
    totals: {
      totalAreaSqFt,
      totalAreaAcres,
      stormwaterGallons,
      estimatedTrees,
      addedCanopySqFt,
      soilRemediationSqFt,
      soilRemediationAcres,
    },
  };
}

export function canopyProgressFromBioswales(existingCanopyPct, studyAreaSqFt, addedCanopySqFt) {
  if (!Number.isFinite(studyAreaSqFt) || studyAreaSqFt <= 0) {
    return {
      existingPct: existingCanopyPct,
      proposedPct: existingCanopyPct,
      gainPct: 0,
      targetPct: 30,
    };
  }

  const gainPct = (addedCanopySqFt / studyAreaSqFt) * 100;
  const proposedPct = Math.min(100, existingCanopyPct + gainPct);

  return {
    existingPct: existingCanopyPct,
    proposedPct,
    gainPct,
    targetPct: 30,
  };
}

export function formatCompact(value, digits = 0) {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
