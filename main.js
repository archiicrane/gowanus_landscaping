let map;

// Google control points provided by user for site placement.
// A: south-west-ish, B: east, C: north-west-ish
const SITE_CONTROL_A = { lng: -73.99415, lat: 40.67590 };
const SITE_CONTROL_B = { lng: -73.990722, lat: 40.675821 };
const SITE_CONTROL_C = { lng: -73.994018, lat: 40.676209 };

// Three target site footprints derived from the user's red markup.
// Order: north-west parcel, south parcel, north-east parcel.
const SITE_SEGMENT_QUADS = [
  [
    [SITE_CONTROL_C.lng - 0.00135, SITE_CONTROL_C.lat + 0.00010],
    [SITE_CONTROL_C.lng - 0.00010, SITE_CONTROL_C.lat + 0.00002],
    [SITE_CONTROL_A.lng + 0.00002, SITE_CONTROL_A.lat - 0.00002],
    [SITE_CONTROL_A.lng - 0.00145, SITE_CONTROL_A.lat - 0.00016]
  ],
  [
    [SITE_CONTROL_A.lng + 0.00055, SITE_CONTROL_A.lat + 0.00002],
    [SITE_CONTROL_B.lng - 0.00022, SITE_CONTROL_B.lat - 0.00001],
    [SITE_CONTROL_B.lng - 0.00018, SITE_CONTROL_B.lat - 0.00036],
    [SITE_CONTROL_A.lng + 0.00048, SITE_CONTROL_A.lat - 0.00030]
  ],
  [
    [SITE_CONTROL_B.lng - 0.00120, SITE_CONTROL_B.lat + 0.00038],
    [SITE_CONTROL_B.lng - 0.00010, SITE_CONTROL_B.lat + 0.00034],
    [SITE_CONTROL_B.lng - 0.00008, SITE_CONTROL_B.lat + 0.00010],
    [SITE_CONTROL_B.lng - 0.00130, SITE_CONTROL_B.lat + 0.00008]
  ]
];

async function resolveMapboxToken() {
  const windowToken = (window.MAPBOX_TOKEN || '').trim();
  if (windowToken) return windowToken;

  const metaToken = (document.querySelector('meta[name="mapbox-token"]')?.content || '').trim();
  if (metaToken) return metaToken;

  const res = await fetch('/api/mapbox-token');
  if (!res.ok) {
    throw new Error(`Mapbox token fetch failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const apiToken = (data?.token || '').trim();
  if (!apiToken) {
    throw new Error('Mapbox token is missing from /api/mapbox-token response.');
  }

  return apiToken;
}

async function initMap() {
  const token = await resolveMapboxToken();

  mapboxgl.accessToken = token;

  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/light-v11',
    center: PRESENTATION_CENTER,
    zoom: 15.25,
    pitch: PRESENTATION_PITCH,
    bearing: PRESENTATION_BEARING,
    antialias: true
  });

  map.addControl(new mapboxgl.NavigationControl());
  map.scrollZoom.disable();
  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();

  attachMapHandlers();
}

let currentStage = 0;
let isAnimating = false;

const STUDY_COORDINATES_LAT_LNG = [
  [40.683945676183654, -73.98963594611494],
  [40.680669969224006, -73.98084416376932],
  [40.67628724578089, -73.98368161027763],
  [40.665495232798115, -73.99274143083169],
  [40.667988596328655, -73.99607305804426],
  [40.67260255106102, -73.99889524234268],
  [40.67744610487334, -73.9964465299067],
  [40.67663528353369, -73.99461997552936]
];

const STUDY_RING = STUDY_COORDINATES_LAT_LNG.map(([lat, lng]) => [lng, lat]);

if (
  STUDY_RING.length && (
    STUDY_RING[0][0] !== STUDY_RING[STUDY_RING.length - 1][0] ||
    STUDY_RING[0][1] !== STUDY_RING[STUDY_RING.length - 1][1]
  )
) {
  STUDY_RING.push([...STUDY_RING[0]]);
}

const STUDY_BOUNDS = {
  west: Math.min(...STUDY_RING.map(([lng]) => lng)),
  south: Math.min(...STUDY_RING.map(([, lat]) => lat)),
  east: Math.max(...STUDY_RING.map(([lng]) => lng)),
  north: Math.max(...STUDY_RING.map(([, lat]) => lat))
};

function getStudyClipFeature() {
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [STUDY_RING]
    }
  };
}

function pointInStudyPolygon(point) {
  const x = point[0];
  const y = point[1];
  let inside = false;

  for (let i = 0, j = STUDY_RING.length - 1; i < STUDY_RING.length; j = i++) {
    const xi = STUDY_RING[i][0];
    const yi = STUDY_RING[i][1];
    const xj = STUDY_RING[j][0];
    const yj = STUDY_RING[j][1];

    const intersects = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);

    if (intersects) inside = !inside;
  }

  return inside;
}

const stageContent = [
  {
    title: 'Gowanus Canal',
    desc: 'Scroll to move through the stages. Use the layer controls to toggle Mapbox terrain contours and flood vulnerability.'
  },
  {
    title: 'Existing Density',
    desc: 'Existing building footprints extrude using recorded height data over live Mapbox terrain.'
  },
  {
    title: 'Street Trees',
    desc: 'Street tree locations appear while existing buildings, terrain, contours, and flood layers stay active.'
  }
];

const PRESENTATION_CENTER = [-73.9895, 40.6745];
const CANAL_CENTER = PRESENTATION_CENTER;
const PRESENTATION_BEARING = -42;
const PRESENTATION_PITCH = 58;
const SITE_POINT_A_SOURCE = [-73.995096177, 40.675844663];
const SITE_POINT_A_TARGET = [-73.994155, 40.675902];
const SITE_POINT_B_SOURCE = [-73.992624284, 40.675814489];
const SITE_POINT_B_TARGET = [-73.99071172722226, 40.675863969717426];
const SITE_LINE_FINE_SCALE = 0.965;

const SCROLL_STAGE_VIEWS = [
  {
    center: CANAL_CENTER,
    zoom: 15.25,
    pitch: PRESENTATION_PITCH,
    bearing: PRESENTATION_BEARING
  },
  {
    center: CANAL_CENTER,
    zoom: 15.7,
    pitch: PRESENTATION_PITCH,
    bearing: PRESENTATION_BEARING
  },
  {
    center: CANAL_CENTER,
    zoom: 15.7,
    pitch: PRESENTATION_PITCH,
    bearing: PRESENTATION_BEARING
  }
];

function applyCameraForStage(stage, immediate = false) {
  const view = SCROLL_STAGE_VIEWS[stage] || SCROLL_STAGE_VIEWS[0];
  if (!view) return;
  if (immediate) {
    map.jumpTo(view);
    return;
  }

  map.easeTo({
    ...view,
    duration: 900,
    essential: true
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function updateStageUI(stage) {
  const titleEl = document.getElementById('stage-title');
  const descEl = document.getElementById('stage-desc');

  if (titleEl) titleEl.innerText = stageContent[stage].title;
  if (descEl) descEl.innerText = stageContent[stage].desc;
}

const existingHeightExpression = [
  '*',
  1.3,
  ['coalesce',
    ['to-number', ['get', 'height']],
    ['*', 3.2, ['to-number', ['get', 'building:levels']]],
    12
  ]
];

const proposedHeightExpression = [
  'coalesce',
  ['to-number', ['get', 'proposed_height']],
  0
];

function setStageInstant(stage) {
  if (!map.getLayer('existing-buildings') || !map.getLayer('proposed-buildings')) {
    return;
  }

  if (stage === 0) {
    map.setPaintProperty('existing-buildings', 'fill-extrusion-height', 0);
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-height', 0);
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-opacity', 0);
    window.TreeRenderer?.hideTrees?.(map);
  }

  if (stage === 1) {
    map.setPaintProperty('existing-buildings', 'fill-extrusion-height', 0);
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-height', 0);
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-opacity', 0);
    window.TreeRenderer?.hideTrees?.(map);
  }

  if (stage === 2) {
    map.setPaintProperty('existing-buildings', 'fill-extrusion-height', existingHeightExpression);
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-height', 0);
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-opacity', 0);
    window.TreeRenderer?.hideTrees?.(map);
  }

  updateStageUI(stage);
}

function animateStage(stage) {
  if (isAnimating) return;
  if (!map.getLayer('existing-buildings') || !map.getLayer('proposed-buildings')) return;

  isAnimating = true;

  const duration = 1000;
  const startTime = performance.now();

  function step(now) {
    const raw = clamp((now - startTime) / duration, 0, 1);
    const t = easeOutCubic(raw);

    if (stage === 0) {
      map.setPaintProperty(
        'existing-buildings',
        'fill-extrusion-height',
        ['*', 1 - t, existingHeightExpression]
      );
      map.setPaintProperty('proposed-buildings', 'fill-extrusion-height', 0);
      map.setPaintProperty('proposed-buildings', 'fill-extrusion-opacity', 0);
      window.TreeRenderer?.hideTrees?.(map);
    }

    if (stage === 1) {
      map.setPaintProperty(
        'existing-buildings',
        'fill-extrusion-height',
        ['*', 1 - t, existingHeightExpression]
      );
      map.setPaintProperty('proposed-buildings', 'fill-extrusion-height', 0);
      map.setPaintProperty('proposed-buildings', 'fill-extrusion-opacity', 0);
      window.TreeRenderer?.hideTrees?.(map);
    }

    if (stage === 2) {
      map.setPaintProperty(
        'existing-buildings',
        'fill-extrusion-height',
        ['*', t, existingHeightExpression]
      );
      map.setPaintProperty('proposed-buildings', 'fill-extrusion-height', 0);
      map.setPaintProperty('proposed-buildings', 'fill-extrusion-opacity', 0);
      window.TreeRenderer?.hideTrees?.(map);
    }

    if (raw < 1) {
      requestAnimationFrame(step);
    } else {
      setStageInstant(stage);
      isAnimating = false;
    }
  }

  requestAnimationFrame(step);
}

function addMapboxTerrainAndContours() {
  if (!map.getSource('mapbox-dem')) {
    map.addSource('mapbox-dem', {
      type: 'raster-dem',
      url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
      tileSize: 512,
      maxzoom: 14
    });
  }

  if (!map.getSource('mapbox-dem-hillshade')) {
    map.addSource('mapbox-dem-hillshade', {
      type: 'raster-dem',
      url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
      tileSize: 512,
      maxzoom: 14
    });
  }

  map.setTerrain({
    source: 'mapbox-dem',
    exaggeration: 1.35
  });

  if (!map.getLayer('terrain-hillshade')) {
    map.addLayer({
      id: 'terrain-hillshade',
      type: 'hillshade',
      source: 'mapbox-dem-hillshade',
      layout: {
        visibility: 'visible'
      },
      paint: {
        'hillshade-shadow-color': '#020617',
        'hillshade-highlight-color': '#334155',
        'hillshade-accent-color': '#475569',
        'hillshade-exaggeration': 0.5
      }
    });
  }

  if (!map.getSource('mapbox-contours')) {
    map.addSource('mapbox-contours', {
      type: 'vector',
      url: 'mapbox://mapbox.mapbox-terrain-v2'
    });
  }

  if (!map.getLayer('terrain-contours')) {
    map.addLayer({
      id: 'terrain-contours',
      type: 'line',
      source: 'mapbox-contours',
      'source-layer': 'contour',
      minzoom: 10,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
        visibility: 'visible'
      },
      paint: {
        'line-color': '#c6cbd2',
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11, [
            'case',
            ['==', ['%', ['to-number', ['get', 'ele']], 50], 0],
            0.95,
            0.55
          ],
          16, [
            'case',
            ['==', ['%', ['to-number', ['get', 'ele']], 50], 0],
            1.75,
            1.0
          ]
        ],
        'line-dasharray': [1.2, 1.2],
        'line-opacity': 0.84
      }
    });
  }
}

function addMapboxGroundParks() {
  const parksFilter = [
    'any',
    ['==', ['get', 'class'], 'park'],
    ['==', ['get', 'class'], 'garden'],
    ['==', ['get', 'class'], 'recreation_ground'],
    ['==', ['get', 'class'], 'pitch'],
    ['==', ['get', 'class'], 'grass'],
    ['==', ['get', 'class'], 'golf_course'],
    ['==', ['get', 'type'], 'park']
  ];

  if (!map.getLayer('gowanus-parks-ground')) {
    map.addLayer({
      id: 'gowanus-parks-ground',
      type: 'fill',
      source: 'composite',
      'source-layer': 'landuse',
      filter: parksFilter,
      paint: {
        'fill-color': '#8fbe7d',
        'fill-opacity': 0.9
      }
    }, 'existing-buildings');
  }
}

function addMapboxGroundWater() {
  if (!map.getLayer('gowanus-water-ground')) {
    map.addLayer({
      id: 'gowanus-water-ground',
      type: 'fill',
      source: 'composite',
      'source-layer': 'water',
      paint: {
        'fill-color': '#5fa4e8',
        'fill-opacity': 0.92
      }
    }, 'existing-buildings');
  }
}

function hideBasemapLabels() {
  const style = map.getStyle();
  const layers = style?.layers || [];

  for (const layer of layers) {
    if (layer.type !== 'symbol') continue;
    if (map.getLayer(layer.id)) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  }
}

async function addParkOutline() {
  const response = await fetch('./models/park.geojson');
  if (!response.ok) {
    throw new Error(`Park outline fetch failed: ${response.status} ${response.statusText}`);
  }

  const parkData = await response.json();
  const features = Array.isArray(parkData?.features) ? parkData.features : [];
  if (!features.length) {
    throw new Error('No park outline features found in park.geojson.');
  }

  const equalPoint = (a, b, eps = 1e-8) => (
    Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps
  );

  const closeEnough = (a, b, eps = 1e-6) => (
    Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps
  );

  const rings = [];
  let current = [];

  const finalizeCurrent = () => {
    if (current.length < 4) {
      current = [];
      return;
    }

    const first = current[0];
    const last = current[current.length - 1];
    if (!equalPoint(first, last)) {
      if (closeEnough(first, last)) {
        current.push([first[0], first[1]]);
      } else {
        current = [];
        return;
      }
    }

    rings.push(current);
    current = [];
  };

  for (const feature of features) {
    const coords = feature?.geometry?.type === 'LineString' ? feature.geometry.coordinates : [];
    if (coords.length < 2) continue;

    const a = [Number(coords[0][0]), Number(coords[0][1])];
    const b = [Number(coords[coords.length - 1][0]), Number(coords[coords.length - 1][1])];

    if (!current.length) {
      current = [a, b];
      continue;
    }

    const tail = current[current.length - 1];
    if (equalPoint(tail, a)) {
      current.push(b);
    } else if (equalPoint(tail, b)) {
      current.push(a);
    } else {
      finalizeCurrent();
      current = [a, b];
    }
  }
  finalizeCurrent();

  const parkAreaFeatures = rings.map((ring, index) => ({
    type: 'Feature',
    properties: { name: `park-area-${index + 1}` },
    geometry: {
      type: 'Polygon',
      coordinates: [ring]
    }
  }));

  if (!map.getSource('park-outline')) {
    map.addSource('park-outline', {
      type: 'geojson',
      data: parkData
    });
  } else {
    map.getSource('park-outline').setData(parkData);
  }

  if (!map.getSource('park-area')) {
    map.addSource('park-area', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: parkAreaFeatures
      }
    });
  } else {
    map.getSource('park-area').setData({
      type: 'FeatureCollection',
      features: parkAreaFeatures
    });
  }

  if (!map.hasImage('park-hatch-red')) {
    const hatchCanvas = document.createElement('canvas');
    hatchCanvas.width = 24;
    hatchCanvas.height = 24;
    const ctx = hatchCanvas.getContext('2d');

    if (ctx) {
      ctx.clearRect(0, 0, 24, 24);
      ctx.strokeStyle = 'rgba(220,38,38,0.40)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-6, 24);
      ctx.lineTo(12, 6);
      ctx.moveTo(0, 30);
      ctx.lineTo(18, 12);
      ctx.moveTo(6, 36);
      ctx.lineTo(24, 18);
      ctx.stroke();
      map.addImage('park-hatch-red', ctx.getImageData(0, 0, 24, 24), { pixelRatio: 2 });
    }
  }

  if (!map.getLayer('park-hatch-fill')) {
    map.addLayer({
      id: 'park-hatch-fill',
      type: 'fill',
      source: 'park-area',
      layout: {
        visibility: 'visible'
      },
      paint: {
        'fill-pattern': 'park-hatch-red',
        'fill-opacity': 0.62
      }
    });
  }

  if (!map.getLayer('park-outline')) {
    map.addLayer({
      id: 'park-outline',
      type: 'line',
      source: 'park-outline',
      layout: {
        visibility: 'visible',
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#dc2626',
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          14, 1.6,
          16, 2.6,
          18, 3.9
        ],
        'line-dasharray': [1.4, 1.1],
        'line-opacity': 0.96
      }
    });
  }

  map.setPaintProperty('park-hatch-fill', 'fill-pattern', 'park-hatch-red');
  map.setPaintProperty('park-hatch-fill', 'fill-opacity', 0.62);

  map.setPaintProperty('park-outline', 'line-color', '#dc2626');
  map.setPaintProperty('park-outline', 'line-width', [
    'interpolate',
    ['linear'],
    ['zoom'],
    14, 1.6,
    16, 2.6,
    18, 3.9
  ]);
  map.setPaintProperty('park-outline', 'line-dasharray', [1.4, 1.1]);
  map.setPaintProperty('park-outline', 'line-opacity', 0.96);
}

function addGowanusFocusMask() {
  if (map.getLayer('gowanus-focus-mask')) return;

  if (!map.getSource('gowanus-focus-mask')) {
    map.addSource('gowanus-focus-mask', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [-180, -85],
                  [180, -85],
                  [180, 85],
                  [-180, 85],
                  [-180, -85]
                ],
                [
                  ...STUDY_RING
                ]
              ]
            }
          }
        ]
      }
    });
  }

  map.addLayer({
    id: 'gowanus-focus-mask',
    type: 'fill',
    source: 'gowanus-focus-mask',
    paint: {
      'fill-color': '#d1d5db',
      'fill-opacity': 0.82
    },
    layout: {
      visibility: 'visible'
    }
  });
}

function parseSiteSegments(rawText) {
  return rawText
    .split(/\bnone\b/gi)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const points = [];
      const matches = chunk.matchAll(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g);
      for (const match of matches) {
        points.push([Number(match[1]), Number(match[2])]);
      }
      return points;
    })
    .filter((points) => points.length > 1);
}

function localToLngLat(point, bounds, quad) {
  const [x, y] = point;
  const u = (x - bounds.minX) / bounds.dx;
  const v = 1 - (y - bounds.minY) / bounds.dy;

  const [tl, tr, br, bl] = quad;

  const lng =
    (1 - u) * (1 - v) * tl[0] +
    u * (1 - v) * tr[0] +
    u * v * br[0] +
    (1 - u) * v * bl[0];

  const lat =
    (1 - u) * (1 - v) * tl[1] +
    u * (1 - v) * tr[1] +
    u * v * br[1] +
    (1 - u) * v * bl[1];

  return [lng, lat];
}

async function addSiteLinesFromText() {
  const response = await fetch('./models/site2_geographic_coordinates.json');
  if (!response.ok) {
    throw new Error(`Site coordinate fetch failed: ${response.status} ${response.statusText}`);
  }

  const siteGeo = await response.json();
  const segments = Array.isArray(siteGeo?.segmentCoordinates) ? siteGeo.segmentCoordinates : [];
  if (!segments.length) {
    throw new Error('No geographic coordinate segments found in site2_geographic_coordinates.json.');
  }

  const metersPerDegLat = 110540;
  const metersPerDegLng = 111320 * Math.cos((SITE_POINT_A_TARGET[1] * Math.PI) / 180);

  const currentDx = (SITE_POINT_B_SOURCE[0] - SITE_POINT_A_SOURCE[0]) * metersPerDegLng;
  const currentDy = (SITE_POINT_B_SOURCE[1] - SITE_POINT_A_SOURCE[1]) * metersPerDegLat;
  const desiredDx = (SITE_POINT_B_TARGET[0] - SITE_POINT_A_TARGET[0]) * metersPerDegLng;
  const desiredDy = (SITE_POINT_B_TARGET[1] - SITE_POINT_A_TARGET[1]) * metersPerDegLat;

  const currentDistance = Math.sqrt(currentDx * currentDx + currentDy * currentDy);
  const desiredDistance = Math.sqrt(desiredDx * desiredDx + desiredDy * desiredDy);
  const scaleFactor = currentDistance > 0 ? desiredDistance / currentDistance : 1;
  const finalScale = scaleFactor * SITE_LINE_FINE_SCALE;

  const features = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => Array.isArray(segment) && segment.length > 1)
    .map(({ segment, index }) => ({
      type: 'Feature',
      properties: { zone: index + 1 },
      geometry: {
        type: 'LineString',
        coordinates: segment
          .filter((point) => Array.isArray(point) && point.length >= 2)
          .map((point) => [
            SITE_POINT_A_TARGET[0] + (Number(point[0]) - SITE_POINT_A_SOURCE[0]) * finalScale,
            SITE_POINT_A_TARGET[1] + (Number(point[1]) - SITE_POINT_A_SOURCE[1]) * finalScale
          ])
      }
    }))
    .filter((feature) => feature.geometry.coordinates.length > 1);

  if (!features.length) {
    throw new Error('No valid line features could be built from site2_geographic_coordinates.json.');
  }

  if (!map.getSource('site-lines')) {
    map.addSource('site-lines', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features
      }
    });
  } else {
    map.getSource('site-lines').setData({
      type: 'FeatureCollection',
      features
    });
  }

  const areaFeatures = features
    .map((feature, index) => {
      const ring = [...feature.geometry.coordinates];
      if (ring.length < 4) return null;

      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push([first[0], first[1]]);
      }

      return {
        type: 'Feature',
        properties: { zone: index + 1 },
        geometry: {
          type: 'Polygon',
          coordinates: [ring]
        }
      };
    })
    .filter(Boolean);

  if (!map.getSource('site-areas')) {
    map.addSource('site-areas', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: areaFeatures
      }
    });
  } else {
    map.getSource('site-areas').setData({
      type: 'FeatureCollection',
      features: areaFeatures
    });
  }

  if (!map.hasImage('site-hatch-red')) {
    const hatchCanvas = document.createElement('canvas');
    hatchCanvas.width = 24;
    hatchCanvas.height = 24;
    const ctx = hatchCanvas.getContext('2d');

    if (ctx) {
      ctx.clearRect(0, 0, 24, 24);
      ctx.strokeStyle = 'rgba(220,38,38,0.42)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-6, 24);
      ctx.lineTo(12, 6);
      ctx.moveTo(0, 30);
      ctx.lineTo(18, 12);
      ctx.moveTo(6, 36);
      ctx.lineTo(24, 18);
      ctx.stroke();
      map.addImage('site-hatch-red', ctx.getImageData(0, 0, 24, 24), { pixelRatio: 2 });
    }
  }

  if (!map.getLayer('site-hatch-fill')) {
    map.addLayer({
      id: 'site-hatch-fill',
      type: 'fill',
      source: 'site-areas',
      layout: {
        visibility: 'visible'
      },
      paint: {
        'fill-pattern': 'site-hatch-red',
        'fill-opacity': 0.65
      }
    });
  }
  map.setPaintProperty('site-hatch-fill', 'fill-pattern', 'site-hatch-red');
  map.setPaintProperty('site-hatch-fill', 'fill-opacity', 0.72);

  if (!map.getLayer('site-lines')) {
    map.addLayer({
      id: 'site-lines',
      type: 'line',
      source: 'site-lines',
      layout: {
        visibility: 'visible',
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#dc2626',
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          14, 1.8,
          16, 2.8,
          18, 4.2
        ],
        'line-dasharray': [1.4, 1.1],
        'line-opacity': 0.98
      }
    });
  }

  map.setPaintProperty('site-lines', 'line-color', '#dc2626');
  map.setPaintProperty('site-lines', 'line-width', [
    'interpolate',
    ['linear'],
    ['zoom'],
    14, 1.8,
    16, 2.8,
    18, 4.2
  ]);
  map.setPaintProperty('site-lines', 'line-dasharray', [1.4, 1.1]);
  map.setPaintProperty('site-lines', 'line-opacity', 0.98);
}

function addFloodLayer(floodData) {
  if (map.getSource('flood-vulnerability')) return;

  map.addSource('flood-vulnerability', {
    type: 'geojson',
    data: floodData
  });

  const gowanusClipBounds = getStudyClipFeature();

  map.addLayer({
    id: 'flood-fill',
    type: 'fill',
    source: 'flood-vulnerability',
    filter: ['within', gowanusClipBounds],
    paint: {
      'fill-color': [
        'interpolate',
        ['linear'],
        ['to-number', ['coalesce', ['get', 'fshri'], 0]],
        0, 'rgba(30,41,59,0)',
        1, '#1d4ed8',
        2, '#2563eb',
        3, '#0ea5e9',
        4, '#f59e0b',
        5, '#ef4444'
      ],
      'fill-opacity': 0.34
    }
  });

  map.addLayer({
    id: 'flood-outline',
    type: 'line',
    source: 'flood-vulnerability',
    filter: ['within', gowanusClipBounds],
    paint: {
      'line-color': '#93c5fd',
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        10, 0.4,
        15, 1,
        18, 1.6
      ],
      'line-opacity': 0.6
    }
  });

  const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });

  map.on('mousemove', 'flood-fill', (e) => {
    const feature = e.features?.[0];
    if (!feature) return;

    map.getCanvas().style.cursor = 'pointer';

    const p = feature.properties || {};
    const current = p.ss_cur ?? 'n/a';
    const midCentury = p.ss_50s ?? 'n/a';
    const lateCentury = p.ss_80s ?? 'n/a';
    const tract = p.geoid ?? 'Unknown';
    const index = p.fshri ?? 'n/a';

    popup
      .setLngLat(e.lngLat)
      .setHTML(`
        <div class="flood-popup">
          <strong>Flood vulnerability</strong><br>
          Census tract: ${tract}<br>
          Index score: ${index}<br>
          Current surge: ${current}<br>
          2050s surge: ${midCentury}<br>
          2080s surge: ${lateCentury}
        </div>
      `)
      .addTo(map);
  });

  map.on('mouseleave', 'flood-fill', () => {
    map.getCanvas().style.cursor = '';
    popup.remove();
  });
}

function getGeometryBounds(geometry) {
  if (!geometry?.coordinates) return null;

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  const visit = (node) => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      const lng = node[0];
      const lat = node[1];
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      return;
    }
    for (const child of node) visit(child);
  };

  visit(geometry.coordinates);

  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return null;
  return { minLng, maxLng, minLat, maxLat };
}

function pointInStudyBounds(point) {
  if (
    point[0] < STUDY_BOUNDS.west ||
    point[0] > STUDY_BOUNDS.east ||
    point[1] < STUDY_BOUNDS.south ||
    point[1] > STUDY_BOUNDS.north
  ) {
    return false;
  }

  return pointInStudyPolygon(point);
}

function boundsOverlap(a, b, padding = 0) {
  return !(
    a.maxLng < (b.minLng - padding) ||
    a.minLng > (b.maxLng + padding) ||
    a.maxLat < (b.minLat - padding) ||
    a.minLat > (b.maxLat + padding)
  );
}

function roughLineLength(coords) {
  let length = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const dx = coords[i][0] - coords[i - 1][0];
    const dy = coords[i][1] - coords[i - 1][1];
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
}

function clipLineToStudyBounds(coords) {
  const segments = [];
  let current = [];

  for (const point of coords) {
    if (pointInStudyBounds(point)) {
      current.push(point);
    } else if (current.length > 1) {
      segments.push(current);
      current = [];
    } else {
      current = [];
    }
  }

  if (current.length > 1) {
    segments.push(current);
  }

  return segments;
}

function pointInStudyBoundingBox(point) {
  return (
    point[0] >= STUDY_BOUNDS.west &&
    point[0] <= STUDY_BOUNDS.east &&
    point[1] >= STUDY_BOUNDS.south &&
    point[1] <= STUDY_BOUNDS.north
  );
}

function clipLineToStudyBoundingBox(coords) {
  const segments = [];
  let current = [];

  for (const point of coords) {
    if (pointInStudyBoundingBox(point)) {
      current.push(point);
    } else if (current.length > 1) {
      segments.push(current);
      current = [];
    } else {
      current = [];
    }
  }

  if (current.length > 1) {
    segments.push(current);
  }

  return segments;
}

function bufferLineToPolygon(coords, halfWidthMeters = 4.2) {
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const meanLat = coords.reduce((sum, p) => sum + p[1], 0) / coords.length;
  const metersPerDegLat = 110540;
  const metersPerDegLng = 111320 * Math.cos((meanLat * Math.PI) / 180);

  const toMeters = ([lng, lat]) => [lng * metersPerDegLng, lat * metersPerDegLat];
  const toLngLat = ([x, y]) => [x / metersPerDegLng, y / metersPerDegLat];

  const meters = coords.map(toMeters);
  const left = [];
  const right = [];

  for (let i = 0; i < meters.length; i += 1) {
    const prev = meters[Math.max(0, i - 1)];
    const next = meters[Math.min(meters.length - 1, i + 1)];

    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) continue;

    const nx = -dy / len;
    const ny = dx / len;
    const p = meters[i];

    left.push(toLngLat([p[0] + nx * halfWidthMeters, p[1] + ny * halfWidthMeters]));
    right.push(toLngLat([p[0] - nx * halfWidthMeters, p[1] - ny * halfWidthMeters]));
  }

  if (left.length < 2 || right.length < 2) return null;

  const ring = [...left, ...right.reverse()];
  ring.push(ring[0]);

  return {
    type: 'Polygon',
    coordinates: [ring]
  };
}

function getLineSamplePoints(coords, sampleCount = 7) {
  if (coords.length <= sampleCount) return coords;

  const points = [];
  for (let i = 0; i < sampleCount; i += 1) {
    const idx = Math.round((i / (sampleCount - 1)) * (coords.length - 1));
    points.push(coords[idx]);
  }

  return points;
}

function getLineTerrainStats(coords) {
  const elevations = [];
  const samples = getLineSamplePoints(coords, 7);

  for (const [lng, lat] of samples) {
    const value = map.queryTerrainElevation({ lng, lat }, { exaggerated: false });
    if (Number.isFinite(value)) elevations.push(value);
  }

  if (elevations.length < 3) return null;

  const avg = elevations.reduce((sum, value) => sum + value, 0) / elevations.length;
  const relief = Math.max(...elevations) - Math.min(...elevations);

  return { avg, relief };
}

function getFeatureLineCoordinates(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

function buildFloodPriorityBounds(floodData) {
  if (!floodData?.features?.length) return [];

  const bounds = [];
  for (const feature of floodData.features) {
    const floodScore = Number(feature.properties?.fshri ?? 0);
    if (floodScore < 2) continue;

    const featureBounds = getGeometryBounds(feature.geometry);
    if (featureBounds) bounds.push(featureBounds);
  }

  return bounds;
}

function buildSegmentKey(coords, roadClass, roadName = '') {
  const start = coords[0];
  const end = coords[coords.length - 1];
  const a = `${start[0].toFixed(5)}:${start[1].toFixed(5)}`;
  const b = `${end[0].toFixed(5)}:${end[1].toFixed(5)}`;
  const [u, v] = a < b ? [a, b] : [b, a];
  return `${roadClass}|${roadName}|${u}|${v}`;
}

function selectBestBioswaleSegments(segments) {
  const ranked = [...segments].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.avgElevation !== b.avgElevation) return a.avgElevation - b.avgElevation;
    return a.relief - b.relief;
  });

  const strict = ranked.filter((segment) => segment.score >= 5);
  if (strict.length >= 18) return strict.slice(0, 95);

  return ranked.filter((segment) => segment.score >= 4).slice(0, 95);
}

async function addBioswaleOpportunityLayer(floodData) {
  if (map.getLayer('bioswale-street-core-right')) return;

  await new Promise((resolve) => map.once('idle', resolve));

  const targetRoadClasses = ['street', 'secondary', 'tertiary', 'residential', 'service'];
  const roadFeatures = map.querySourceFeatures('composite', {
    sourceLayer: 'road',
    filter: ['match', ['get', 'class'], targetRoadClasses, true, false]
  });

  const floodPriorityBounds = buildFloodPriorityBounds(floodData);
  const unique = new Set();
  const candidates = [];

  for (const feature of roadFeatures) {
    const roadClass = feature.properties?.class || 'street';
    const roadName = feature.properties?.name || '';

    const lineGroups = getFeatureLineCoordinates(feature.geometry);
    for (const lineCoords of lineGroups) {
      const clippedSegments = clipLineToStudyBounds(lineCoords);
      for (const coords of clippedSegments) {
        if (coords.length < 4) continue;
        if (roughLineLength(coords) < 0.00035) continue;

        const bounds = getGeometryBounds({ coordinates: coords });
        if (!bounds) continue;

        const terrainStats = getLineTerrainStats(coords);
        if (!terrainStats) continue;

        const floodNearby = floodPriorityBounds.some((floodBounds) => boundsOverlap(bounds, floodBounds, 0.0003));
        const lowElevation = terrainStats.avg <= 8.8;
        const moderateElevation = terrainStats.avg <= 10.2;
        const gentleSlope = terrainStats.relief <= 1.25;
        const moderateSlope = terrainStats.relief <= 2.1;

        let score = 0;
        if (floodNearby) score += 2;
        if (lowElevation) score += 2;
        else if (moderateElevation) score += 1;
        if (gentleSlope) score += 2;
        else if (moderateSlope) score += 1;
        if (roadClass === 'residential' || roadClass === 'street') score += 1;

        const key = buildSegmentKey(coords, roadClass, roadName);
        if (unique.has(key)) continue;
        unique.add(key);

        candidates.push({
          type: 'Feature',
          properties: {
            class: roadClass,
            name: roadName,
            score,
            avg_elev_m: Number(terrainStats.avg.toFixed(2)),
            relief_m: Number(terrainStats.relief.toFixed(2)),
            flood_nearby: floodNearby ? 1 : 0
          },
          geometry: {
            type: 'LineString',
            coordinates: coords
          },
          score,
          avgElevation: terrainStats.avg,
          relief: terrainStats.relief
        });
      }
    }
  }

  const selected = selectBestBioswaleSegments(candidates).map((feature) => ({
    type: 'Feature',
    properties: feature.properties,
    geometry: feature.geometry
  }));

  map.addSource('bioswale-streets', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: selected
    }
  });

  const curbOffset = [
    'interpolate',
    ['linear'],
    ['zoom'],
    12,
    ['match', ['get', 'class'],
      'secondary', 3.4,
      'tertiary', 3.0,
      'residential', 2.8,
      'service', 2.4,
      'street', 2.8,
      2.8
    ],
    18,
    ['match', ['get', 'class'],
      'secondary', 9.2,
      'tertiary', 8.0,
      'residential', 7.4,
      'service', 6.6,
      'street', 7.2,
      7.2
    ]
  ];

  const negatedCurbOffset = [
    'interpolate',
    ['linear'],
    ['zoom'],
    12,
    ['match', ['get', 'class'],
      'secondary', -3.4,
      'tertiary', -3.0,
      'residential', -2.8,
      'service', -2.4,
      'street', -2.8,
      -2.8
    ],
    18,
    ['match', ['get', 'class'],
      'secondary', -9.2,
      'tertiary', -8.0,
      'residential', -7.4,
      'service', -6.6,
      'street', -7.2,
      -7.2
    ]
  ];

  map.addLayer({
    id: 'bioswale-street-glow-right',
    type: 'line',
    source: 'bioswale-streets',
    layout: {
      visibility: 'visible',
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': '#bef264',
      'line-offset': curbOffset,
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        12, 3.4,
        15, 5.4,
        18, 8.2
      ],
      'line-opacity': 0.48
    }
  });

  map.addLayer({
    id: 'bioswale-street-core-right',
    type: 'line',
    source: 'bioswale-streets',
    layout: {
      visibility: 'visible',
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': '#4d7c0f',
      'line-offset': curbOffset,
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        12, 1.25,
        15, 2.1,
        18, 3.2
      ],
      'line-dasharray': [1.2, 0.8],
      'line-opacity': 1
    }
  });

  map.addLayer({
    id: 'bioswale-street-glow-left',
    type: 'line',
    source: 'bioswale-streets',
    layout: {
      visibility: 'visible',
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': '#bef264',
      'line-offset': negatedCurbOffset,
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        12, 3.4,
        15, 5.4,
        18, 8.2
      ],
      'line-opacity': 0.48
    }
  });

  map.addLayer({
    id: 'bioswale-street-core-left',
    type: 'line',
    source: 'bioswale-streets',
    layout: {
      visibility: 'visible',
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': '#4d7c0f',
      'line-offset': negatedCurbOffset,
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        12, 1.25,
        15, 2.1,
        18, 3.2
      ],
      'line-dasharray': [1.2, 0.8],
      'line-opacity': 1
    }
  });

  moveBioswaleLayersToTop();
}

async function addElevatedRailExtrusion() {
  if (map.getLayer('elevated-rail-extrusion')) return;

  await new Promise((resolve) => map.once('idle', resolve));

  let railFeatures = [];
  try {
    railFeatures = map.querySourceFeatures('composite', {
      sourceLayer: 'road',
      filter: [
        'any',
        ['==', ['get', 'class'], 'major_rail'],
        ['==', ['get', 'class'], 'rail'],
        ['==', ['get', 'class'], 'transit']
      ]
    });
  } catch (err) {
    console.warn('Rail query failed:', err);
  }

  const unique = new Set();
  const extrusions = [];

  for (const feature of railFeatures) {
    const structure = String(feature.properties?.structure || '').toLowerCase();
    const brunnel = String(feature.properties?.brunnel || '').toLowerCase();
    const layerValue = Number(feature.properties?.layer ?? 0);

    const isElevated =
      structure === 'bridge' ||
      structure === 'elevated' ||
      structure === 'viaduct' ||
      brunnel === 'bridge' ||
      layerValue > 0;

    if (!isElevated) continue;

    const lineGroups = getFeatureLineCoordinates(feature.geometry);
    for (const lineCoords of lineGroups) {
      const clippedSegments = clipLineToStudyBoundingBox(lineCoords);
      for (const coords of clippedSegments) {
        if (coords.length < 2) continue;
        if (roughLineLength(coords) < 0.0002) continue;

        const key = buildSegmentKey(
          coords,
          feature.properties?.class || 'rail',
          feature.properties?.name || ''
        );
        if (unique.has(key)) continue;
        unique.add(key);

        const polygon = bufferLineToPolygon(coords, 2.4);
        if (!polygon) continue;

        extrusions.push({
          type: 'Feature',
          properties: {
            class: feature.properties?.class || 'rail'
          },
          geometry: polygon
        });
      }
    }
  }

  if (!extrusions.length) {
    console.warn('No elevated rail segments found in study bounding box.');
    return;
  }

  map.addSource('elevated-rail', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: extrusions
    }
  });

  map.addLayer({
    id: 'elevated-rail-extrusion',
    type: 'fill-extrusion',
    source: 'elevated-rail',
    layout: {
      visibility: 'visible'
    },
    paint: {
      'fill-extrusion-color': '#3f3f46',
      'fill-extrusion-base': 9.5,
      'fill-extrusion-height': 13.5,
      'fill-extrusion-opacity': 0.96
    }
  });
}

async function addClippedContourLines() {
  if (map.getLayer('study-contour-lines')) return;

  const response = await fetch('./models/con_lines.geojson');
  if (!response.ok) {
    throw new Error(`Failed to load con_lines.geojson: ${response.status} ${response.statusText}`);
  }

  const rawText = await response.text();
  if (rawText.startsWith('version https://git-lfs.github.com/spec/v1')) {
    console.warn('con_lines.geojson is being served as a Git LFS pointer on this deployment; contour layer skipped.');
    return;
  }

  let contourData;
  try {
    contourData = JSON.parse(rawText);
  } catch (err) {
    console.warn('Failed to parse con_lines.geojson; contour layer skipped.', err);
    return;
  }

  const clippedFeatures = [];

  for (const feature of contourData.features || []) {
    const lineGroups = getFeatureLineCoordinates(feature.geometry);
    const clippedGroups = [];

    for (const lineCoords of lineGroups) {
      const segments = clipLineToStudyBoundingBox(lineCoords);
      for (const segment of segments) {
        if (segment.length < 2) continue;
        clippedGroups.push(segment);
      }
    }

    if (!clippedGroups.length) continue;

    clippedFeatures.push({
      type: 'Feature',
      properties: {
        ...feature.properties,
        elev_m: Number(feature.properties?.ELEV ?? 0)
      },
      geometry: clippedGroups.length === 1
        ? { type: 'LineString', coordinates: clippedGroups[0] }
        : { type: 'MultiLineString', coordinates: clippedGroups }
    });
  }

  map.addSource('study-contour-lines', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: clippedFeatures
    }
  });

  map.addLayer({
    id: 'study-contour-lines',
    type: 'line',
    source: 'study-contour-lines',
    layout: {
      visibility: 'visible',
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': '#94a3b8',
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        12,
        ['case', ['==', ['%', ['round', ['get', 'elev_m']], 5], 0], 0.8, 0.45],
        16,
        ['case', ['==', ['%', ['round', ['get', 'elev_m']], 5], 0], 1.5, 0.8]
      ],
      'line-opacity': 0.8
    }
  });
}

function centroidFromLineFeatures(features) {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let found = false;

  for (const feature of features || []) {
    const geom = feature?.geometry;
    if (!geom) continue;

    if (geom.type === 'LineString') {
      for (const coord of geom.coordinates || []) {
        if (!Array.isArray(coord) || coord.length < 2) continue;
        const lng = coord[0];
        const lat = coord[1];
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        found = true;
      }
      continue;
    }

    if (geom.type === 'MultiLineString') {
      for (const line of geom.coordinates || []) {
        for (const coord of line || []) {
          if (!Array.isArray(coord) || coord.length < 2) continue;
          const lng = coord[0];
          const lat = coord[1];
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          found = true;
        }
      }
    }
  }

  if (!found) return PRESENTATION_CENTER;
  return [(minLng + maxLng) * 0.5, (minLat + maxLat) * 0.5];
}

function footprintBoundsPolygon(features) {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const feature of features || []) {
    const geom = feature?.geometry;
    if (!geom) continue;

    const lines = geom.type === 'LineString'
      ? [geom.coordinates || []]
      : (geom.type === 'MultiLineString' ? (geom.coordinates || []) : []);

    for (const line of lines) {
      for (const coord of line) {
        if (!Array.isArray(coord) || coord.length < 2) continue;
        const lng = coord[0];
        const lat = coord[1];
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }

  if (!Number.isFinite(minLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLng) || !Number.isFinite(maxLat)) {
    return null;
  }

  return {
    type: 'Polygon',
    coordinates: [[
      [minLng, minLat],
      [maxLng, minLat],
      [maxLng, maxLat],
      [minLng, maxLat],
      [minLng, minLat]
    ]]
  };
}

function applyGrayBuildingMask(maskPolygon) {
  if (!maskPolygon || !map.getLayer('existing-buildings') || !map.getLayer('existing-building-outline')) {
    return;
  }

  map.setFilter('existing-buildings', ['!', ['within', maskPolygon]]);
  map.setFilter('existing-building-outline', ['!', ['within', maskPolygon]]);
}

function addBHeightsModelOnFootprints(anchorLngLat) {
  if (map.getLayer('b-heights-model')) return;

  if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
    console.warn('Three.js or GLTFLoader not available; B_heights model skipped.');
    return;
  }

  const mercator = mapboxgl.MercatorCoordinate.fromLngLat(anchorLngLat, 0);
  const meterInMercator = mercator.meterInMercatorCoordinateUnits();

  function getTerrainElevationMeters(mapInstance) {
    if (!mapInstance || typeof mapInstance.queryTerrainElevation !== 'function') {
      return 0;
    }

    const elevation = mapInstance.queryTerrainElevation(anchorLngLat, { exaggerated: true });
    return Number.isFinite(elevation) ? elevation : 0;
  }

  const modelTransform = {
    translateX: mercator.x,
    translateY: mercator.y,
    translateZ: mercator.z,
    rotateX: Math.PI / 2,
    rotateY: 0,
    rotateZ: 0,
    scale: meterInMercator
  };

  const customLayer = {
    id: 'b-heights-model',
    type: 'custom',
    renderingMode: '3d',
    onAdd: function onAdd(mapInstance, gl) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();

      this.scene.add(new THREE.AmbientLight(0xffffff, 0.78));
      const directional = new THREE.DirectionalLight(0xffffff, 0.68);
      directional.position.set(40, -80, 120).normalize();
      this.scene.add(directional);

      const loader = new THREE.GLTFLoader();
      loader.load(
        './models/B_heights.gltf',
        (gltf) => {
          const bounds = new THREE.Box3().setFromObject(gltf.scene);
          if (!bounds.isEmpty()) {
            const center = new THREE.Vector3();
            bounds.getCenter(center);
            gltf.scene.position.set(-center.x, -bounds.min.y, -center.z);
          }

          gltf.scene.traverse((node) => {
            if (!node.isMesh) return;
            node.material = new THREE.MeshStandardMaterial({
              color: 0xfacc15,
              emissive: 0x5a4a00,
              metalness: 0.04,
              roughness: 0.8,
              transparent: true,
              opacity: 0.92
            });
          });

          this.scene.add(gltf.scene);
        },
        undefined,
        (err) => {
          console.error('Failed to load B_heights.gltf:', err);
        }
      );

      this.renderer = new THREE.WebGLRenderer({
        canvas: mapInstance.getCanvas(),
        context: gl,
        antialias: true
      });
      this.renderer.autoClear = false;
    },
    render: function render(gl, matrix) {
      const terrainElevationMeters = getTerrainElevationMeters(map);
      modelTransform.translateZ = mercator.z + (terrainElevationMeters * meterInMercator);

      const rotationX = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(1, 0, 0),
        modelTransform.rotateX
      );
      const rotationY = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(0, 1, 0),
        modelTransform.rotateY
      );
      const rotationZ = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(0, 0, 1),
        modelTransform.rotateZ
      );

      const m = new THREE.Matrix4().fromArray(matrix);
      const l = new THREE.Matrix4()
        .makeTranslation(
          modelTransform.translateX,
          modelTransform.translateY,
          modelTransform.translateZ
        )
        .scale(new THREE.Vector3(modelTransform.scale, -modelTransform.scale, modelTransform.scale))
        .multiply(rotationX)
        .multiply(rotationY)
        .multiply(rotationZ);

      this.camera.projectionMatrix = m.multiply(l);
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      map.triggerRepaint();
    }
  };

  map.addLayer(customLayer);
}

async function addZoningBuildingsLayer() {
  if (map.getLayer('zoning-footprints')) return;

  const response = await fetch('./models/footprints.geojson');
  if (!response.ok) {
    throw new Error(`Failed to load footprints.geojson: ${response.status} ${response.statusText}`);
  }

  const footprintsData = await response.json();

  map.addSource('zoning-footprints', {
    type: 'geojson',
    data: footprintsData
  });

  map.addLayer({
    id: 'zoning-footprints',
    type: 'line',
    source: 'zoning-footprints',
    layout: {
      visibility: 'visible',
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': '#f59e0b',
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        13, 1.0,
        15, 1.6,
        17, 2.4
      ],
      'line-opacity': 0.9
    }
  });

  const anchorLngLat = centroidFromLineFeatures(footprintsData.features || []);
  addBHeightsModelOnFootprints(anchorLngLat);

  const maskPolygon = footprintBoundsPolygon(footprintsData.features || []);
  applyGrayBuildingMask(maskPolygon);
}

function moveBioswaleLayersToTop() {
  if (map.getLayer('bioswale-street-glow-right')) {
    map.moveLayer('bioswale-street-glow-right');
  }
  if (map.getLayer('bioswale-street-core-right')) {
    map.moveLayer('bioswale-street-core-right');
  }
  if (map.getLayer('bioswale-street-glow-left')) {
    map.moveLayer('bioswale-street-glow-left');
  }
  if (map.getLayer('bioswale-street-core-left')) {
    map.moveLayer('bioswale-street-core-left');
  }
}

function setupLayerToggles() {
  const topoToggle = document.getElementById('toggle-topo');
  const floodToggle = document.getElementById('toggle-flood');
  const bioswaleToggle = document.getElementById('toggle-bioswale');
  const parkToggle = document.getElementById('toggle-park');
  const treesToggle = document.getElementById('toggle-trees');
  const observableToggle = document.getElementById('toggle-observable');
  const observableOverlay = document.getElementById('observable-overlay');

  topoToggle?.addEventListener('change', (event) => {
    const visibility = event.target.checked ? 'visible' : 'none';
    if (map.getLayer('terrain-contours')) {
      map.setLayoutProperty('terrain-contours', 'visibility', visibility);
    }
    if (map.getLayer('study-contour-lines')) {
      map.setLayoutProperty('study-contour-lines', 'visibility', visibility);
    }
    if (map.getLayer('terrain-hillshade')) {
      map.setLayoutProperty('terrain-hillshade', 'visibility', visibility);
    }
  });

  floodToggle?.addEventListener('change', (event) => {
    const visibility = event.target.checked ? 'visible' : 'none';
    if (map.getLayer('flood-fill')) {
      map.setLayoutProperty('flood-fill', 'visibility', visibility);
    }
    if (map.getLayer('flood-outline')) {
      map.setLayoutProperty('flood-outline', 'visibility', visibility);
    }
  });

  bioswaleToggle?.addEventListener('change', (event) => {
    const visibility = event.target.checked ? 'visible' : 'none';
    if (map.getLayer('bioswale-street-glow-right')) {
      map.setLayoutProperty('bioswale-street-glow-right', 'visibility', visibility);
    }
    if (map.getLayer('bioswale-street-core-right')) {
      map.setLayoutProperty('bioswale-street-core-right', 'visibility', visibility);
    }
    if (map.getLayer('bioswale-street-glow-left')) {
      map.setLayoutProperty('bioswale-street-glow-left', 'visibility', visibility);
    }
    if (map.getLayer('bioswale-street-core-left')) {
      map.setLayoutProperty('bioswale-street-core-left', 'visibility', visibility);
    }
  });

  parkToggle?.addEventListener('change', (event) => {
    const visibility = event.target.checked ? 'visible' : 'none';
    if (map.getLayer('park-outline')) {
      map.setLayoutProperty('park-outline', 'visibility', visibility);
    }
    if (map.getLayer('park-hatch-fill')) {
      map.setLayoutProperty('park-hatch-fill', 'visibility', visibility);
    }
  });

  treesToggle?.addEventListener('change', (event) => {
    if (event.target.checked) {
      window.TreeRenderer?.showTrees?.(map);
      if (map.getLayer('trees-layer')) map.moveLayer('trees-layer');
    } else {
      window.TreeRenderer?.hideTrees?.(map);
    }
  });

  observableToggle?.addEventListener('change', (event) => {
    const isVisible = event.target.checked;
    observableOverlay?.classList.toggle('hidden', !isVisible);
  });
}

function applyStoryChapter(chapter) {
  if (!map?.getLayer('existing-buildings') || !map?.getLayer('proposed-buildings')) return;

  const chapters = {
    intro: {
      center: [-73.9895, 40.6745],
      zoom: 16.1,
      pitch: 60,
      bearing: -45,
      stage: 1,
      proposalVisible: false,
      floodVisible: true
    },
    flood: {
      center: [-73.9952, 40.6705],
      zoom: 16.0,
      pitch: 58,
      bearing: -28,
      stage: 0,
      proposalVisible: false,
      floodVisible: true
    },
    density: {
      center: [-73.9865, 40.6776],
      zoom: 16.35,
      pitch: 64,
      bearing: -42,
      stage: 1,
      proposalVisible: false,
      floodVisible: false
    },
    trees: {
      center: [-73.9912, 40.6757],
      zoom: 16.25,
      pitch: 62,
      bearing: -50,
      stage: 2,
      proposalVisible: false,
      floodVisible: false
    },
    proposal: {
      center: [-73.9895, 40.6745],
      zoom: 16.2,
      pitch: 64,
      bearing: -45,
      stage: 2,
      proposalVisible: true,
      floodVisible: false
    }
  };

  const config = chapters[chapter] || chapters.intro;

  map.easeTo({
    center: config.center,
    zoom: config.zoom,
    pitch: config.pitch,
    bearing: config.bearing,
    duration: 1100,
    essential: true
  });

  setStageInstant(config.stage);

  map.setPaintProperty(
    'proposed-buildings',
    'fill-extrusion-height',
    config.proposalVisible ? proposedHeightExpression : 0
  );
  map.setPaintProperty(
    'proposed-buildings',
    'fill-extrusion-opacity',
    config.proposalVisible ? 0.72 : 0
  );

  const floodVisibility = config.floodVisible ? 'visible' : 'none';
  if (map.getLayer('flood-fill')) {
    map.setLayoutProperty('flood-fill', 'visibility', floodVisibility);
  }
  if (map.getLayer('flood-outline')) {
    map.setLayoutProperty('flood-outline', 'visibility', floodVisibility);
  }

  const floodToggle = document.getElementById('toggle-flood');
  if (floodToggle) {
    floodToggle.checked = config.floodVisible;
  }
}

function setupStoryScrollytelling() {
  const storyPanel = document.getElementById('story-panel');
  if (!storyPanel) return;

  const steps = Array.from(storyPanel.querySelectorAll('.story-step'));
  if (!steps.length) return;

  let activeChapter = null;

  const activateStep = (step) => {
    const chapter = step.dataset.chapter;
    if (!chapter || chapter === activeChapter) return;

    activeChapter = chapter;
    steps.forEach((el) => el.classList.toggle('active', el === step));
    applyStoryChapter(chapter);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) {
        activateStep(visible.target);
      }
    },
    {
      root: null,
      rootMargin: '-15% 0px -35% 0px',
      threshold: [0.2, 0.45, 0.7]
    }
  );

  steps.forEach((step) => observer.observe(step));
  activateStep(steps[0]);
}

function attachMapHandlers() {
  map.on('load', async () => {
    try {
      const [existingResponse, proposedResponse, floodResponse] = await Promise.all([
        fetch('./data/gowanus-buildings.geojson'),
        fetch('./data/rezoning-buildings.geojson'),
        fetch('./data/flood-vulnerability.geojson')
      ]);

      if (!existingResponse.ok) {
        throw new Error(`Existing buildings fetch failed: ${existingResponse.status} ${existingResponse.statusText}`);
      }

      if (!proposedResponse.ok) {
        throw new Error(`Proposed buildings fetch failed: ${proposedResponse.status} ${proposedResponse.statusText}`);
      }

      if (!floodResponse.ok) {
        throw new Error(`Flood data fetch failed: ${floodResponse.status} ${floodResponse.statusText}`);
      }

      const existingData = await existingResponse.json();
      const proposedData = await proposedResponse.json();
      const floodData = await floodResponse.json();

      hideBasemapLabels();

      addMapboxTerrainAndContours();
      addFloodLayer(floodData);

      map.addSource('existing', {
        type: 'geojson',
        data: existingData
      });

      map.addLayer({
        id: 'existing-buildings',
        type: 'fill-extrusion',
        source: 'existing',
        paint: {
          'fill-extrusion-color': '#9fb3c8',
          'fill-extrusion-base': 0,
          'fill-extrusion-height': 0,
          'fill-extrusion-opacity': 0.92
        }
      });

      map.addLayer({
        id: 'existing-building-outline',
        type: 'line',
        source: 'existing',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#2d3748',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13, 0.8,
            16, 1.5,
            18, 2.2
          ],
          'line-opacity': 1.0
        }
      });

      map.addSource('proposed', {
        type: 'geojson',
        data: proposedData
      });

      map.addLayer({
        id: 'proposed-buildings',
        type: 'fill-extrusion',
        source: 'proposed',
        paint: {
          'fill-extrusion-color': '#3b82f6',
          'fill-extrusion-base': 0,
          'fill-extrusion-height': 0,
          'fill-extrusion-opacity': 0
        }
      });

      map.addLayer({
        id: 'proposed-building-outline',
        type: 'line',
        source: 'proposed',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#2d3748',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13, 0.8,
            16, 1.5,
            18, 2.2
          ],
          'line-opacity': 0
        }
      });

      addMapboxGroundWater();
      addMapboxGroundParks();
      await addClippedContourLines();
      await addParkOutline();
      await addElevatedRailExtrusion();
      await addZoningBuildingsLayer();
      await addBioswaleOpportunityLayer(floodData);

      map.setPaintProperty('existing-buildings', 'fill-extrusion-color', '#b7c0c8');
      map.setPaintProperty('proposed-buildings', 'fill-extrusion-color', '#a9b8ad');

      setupLayerToggles();
      await window.TreeRenderer?.initTrees?.(map);
      if (map.getLayer('trees-layer')) map.moveLayer('trees-layer');
      moveBioswaleLayersToTop();
      addGowanusFocusMask();
      map.moveLayer('gowanus-focus-mask');

      setStageInstant(0);
      applyCameraForStage(0, true);
    } catch (err) {
      console.error('MAP LOAD ERROR:', err);
    }
  });
}

window.addEventListener('wheel', (event) => {
  if (!map) return;

  if (event.altKey) {
    map.scrollZoom.enable();
    return;
  }

  map.scrollZoom.disable();
  event.preventDefault();

  if (isAnimating) return;

  const previousStage = currentStage;

  if (event.deltaY > 0) {
    currentStage = clamp(currentStage + 1, 0, 2);
  } else {
    currentStage = clamp(currentStage - 1, 0, 2);
  }

  if (currentStage === previousStage) {
    return;
  }

  applyCameraForStage(currentStage);
  animateStage(currentStage);
}, { passive: false });

window.addEventListener('keyup', (event) => {
  if (!map) return;

  if (event.key === 'Alt') {
    map.scrollZoom.disable();
  }
});

initMap().catch((err) => {
  console.error('MAP INIT ERROR:', err);
});
