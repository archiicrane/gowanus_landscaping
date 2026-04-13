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
    center: [-73.9895, 40.6745],
    zoom: 16.1,
    pitch: 60,
    bearing: -45,
    antialias: true
  });

  map.addControl(new mapboxgl.NavigationControl());
  map.scrollZoom.disable();

  attachMapHandlers();
}

let currentStage = 0;
let isAnimating = false;

const STUDY_BOUNDS = {
  west: -74.006007,
  south: 40.6621176,
  east: -73.974199,
  north: 40.6852681
};

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
    map.setPaintProperty('existing-buildings', 'fill-extrusion-height', existingHeightExpression);
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-height', 0);
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-opacity', 0);
    window.TreeRenderer?.hideTrees?.(map);
  }

  if (stage === 2) {
    map.setPaintProperty('existing-buildings', 'fill-extrusion-height', existingHeightExpression);
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-height', 0);
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-opacity', 0);
    window.TreeRenderer?.showTrees?.(map);
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
        ['*', t, existingHeightExpression]
      );
      map.setPaintProperty('proposed-buildings', 'fill-extrusion-height', 0);
      map.setPaintProperty('proposed-buildings', 'fill-extrusion-opacity', 0);
      window.TreeRenderer?.hideTrees?.(map);
    }

    if (stage === 2) {
      map.setPaintProperty('existing-buildings', 'fill-extrusion-height', existingHeightExpression);
      map.setPaintProperty('proposed-buildings', 'fill-extrusion-height', 0);
      map.setPaintProperty('proposed-buildings', 'fill-extrusion-opacity', 0);

      if (raw > 0.2) {
        window.TreeRenderer?.showTrees?.(map);
      }
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

  map.setTerrain({
    source: 'mapbox-dem',
    exaggeration: 1.35
  });

  if (!map.getLayer('terrain-hillshade')) {
    map.addLayer({
      id: 'terrain-hillshade',
      type: 'hillshade',
      source: 'mapbox-dem',
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
  if (map.getLayer('site-lines')) return;

  const response = await fetch('./models/site.txt');
  if (!response.ok) {
    throw new Error(`Site text fetch failed: ${response.status} ${response.statusText}`);
  }

  const rawText = await response.text();
  const segments = parseSiteSegments(rawText);
  if (!segments.length) {
    throw new Error('No coordinate segments found in site text.');
  }

  const segmentOrder = [2, 0, 1];

  const features = segmentOrder.map((segmentIndex, zoneIndex) => {
    const segment = segments[segmentIndex];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const [x, y] of segment) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    const bounds = {
      minX,
      minY,
      dx: Math.max(maxX - minX, 1),
      dy: Math.max(maxY - minY, 1)
    };

    return {
      type: 'Feature',
      properties: { zone: zoneIndex + 1 },
      geometry: {
        type: 'LineString',
        coordinates: segment.map((point) => localToLngLat(point, bounds, SITE_SEGMENT_QUADS[zoneIndex]))
      }
    };
  });

  if (!map.getSource('site-lines')) {
    map.addSource('site-lines', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features
      }
    });
  }

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
      'line-color': '#0d4f8b',
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        14, 1.8,
        16, 2.8,
        18, 4.2
      ],
      'line-opacity': 0.95
    }
  });
}

function addFloodLayer(floodData) {
  if (map.getSource('flood-vulnerability')) return;

  map.addSource('flood-vulnerability', {
    type: 'geojson',
    data: floodData
  });

  const gowanusClipBounds = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [STUDY_BOUNDS.west, STUDY_BOUNDS.south],
        [STUDY_BOUNDS.east, STUDY_BOUNDS.south],
        [STUDY_BOUNDS.east, STUDY_BOUNDS.north],
        [STUDY_BOUNDS.west, STUDY_BOUNDS.north],
        [STUDY_BOUNDS.west, STUDY_BOUNDS.south]
      ]]
    }
  };

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
  return (
    point.lng >= STUDY_BOUNDS.west &&
    point.lng <= STUDY_BOUNDS.east &&
    point.lat >= STUDY_BOUNDS.south &&
    point.lat <= STUDY_BOUNDS.north
  );
}

function buildTerrainSamplePoints(bounds) {
  const centerLng = (bounds.minLng + bounds.maxLng) * 0.5;
  const centerLat = (bounds.minLat + bounds.maxLat) * 0.5;
  const dx = Math.max((bounds.maxLng - bounds.minLng) * 0.28, 0.00015);
  const dy = Math.max((bounds.maxLat - bounds.minLat) * 0.28, 0.00015);

  const points = [
    { lng: centerLng, lat: centerLat },
    { lng: centerLng - dx, lat: centerLat },
    { lng: centerLng + dx, lat: centerLat },
    { lng: centerLng, lat: centerLat - dy },
    { lng: centerLng, lat: centerLat + dy }
  ];

  return points.filter(pointInStudyBounds);
}

function collectTerrainElevations(samplePoints) {
  const elevations = [];
  for (const point of samplePoints) {
    const value = map.queryTerrainElevation(point, { exaggerated: false });
    if (Number.isFinite(value)) elevations.push(value);
  }
  return elevations;
}

async function addBioswaleOpportunityLayer(floodData) {
  if (map.getLayer('bioswale-street-core')) return;

  const gowanusClipBounds = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [STUDY_BOUNDS.west, STUDY_BOUNDS.south],
        [STUDY_BOUNDS.east, STUDY_BOUNDS.south],
        [STUDY_BOUNDS.east, STUDY_BOUNDS.north],
        [STUDY_BOUNDS.west, STUDY_BOUNDS.north],
        [STUDY_BOUNDS.west, STUDY_BOUNDS.south]
      ]]
    }
  };

  const streetFilter = [
    'all',
    ['within', gowanusClipBounds],
    ['match', ['get', 'class'],
      ['street', 'secondary', 'tertiary', 'residential', 'service', 'trunk_link', 'primary_link'],
      true,
      false
    ]
  ];

  map.addLayer({
    id: 'bioswale-street-glow',
    type: 'line',
    source: 'composite',
    'source-layer': 'road',
    filter: streetFilter,
    layout: {
      visibility: 'visible',
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': '#bef264',
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        12, 5,
        15, 9,
        18, 16
      ],
      'line-opacity': 0.42
    }
  });

  map.addLayer({
    id: 'bioswale-street-core',
    type: 'line',
    source: 'composite',
    'source-layer': 'road',
    filter: streetFilter,
    layout: {
      visibility: 'visible',
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': '#4d7c0f',
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        12, 1.6,
        15, 2.8,
        18, 4.4
      ],
      'line-dasharray': [1.2, 0.8],
      'line-opacity': 1
    }
  });

  moveBioswaleLayersToTop();
}

function moveBioswaleLayersToTop() {
  if (map.getLayer('bioswale-street-glow')) {
    map.moveLayer('bioswale-street-glow');
  }
  if (map.getLayer('bioswale-street-core')) {
    map.moveLayer('bioswale-street-core');
  }
}

function setupLayerToggles() {
  const topoToggle = document.getElementById('toggle-topo');
  const floodToggle = document.getElementById('toggle-flood');
  const bioswaleToggle = document.getElementById('toggle-bioswale');
  const siteToggle = document.getElementById('toggle-site');
  const observableToggle = document.getElementById('toggle-observable');
  const observableOverlay = document.getElementById('observable-overlay');

  topoToggle?.addEventListener('change', (event) => {
    const visibility = event.target.checked ? 'visible' : 'none';
    if (map.getLayer('terrain-contours')) {
      map.setLayoutProperty('terrain-contours', 'visibility', visibility);
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
    if (map.getLayer('bioswale-street-glow')) {
      map.setLayoutProperty('bioswale-street-glow', 'visibility', visibility);
    }
    if (map.getLayer('bioswale-street-core')) {
      map.setLayoutProperty('bioswale-street-core', 'visibility', visibility);
    }
  });

  siteToggle?.addEventListener('change', (event) => {
    const visibility = event.target.checked ? 'visible' : 'none';
    if (map.getLayer('site-lines')) {
      map.setLayoutProperty('site-lines', 'visibility', visibility);
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

      addMapboxGroundWater();
      addMapboxGroundParks();
      await addSiteLinesFromText();
      await addBioswaleOpportunityLayer(floodData);

      map.setPaintProperty('existing-buildings', 'fill-extrusion-color', '#b7c0c8');
      map.setPaintProperty('proposed-buildings', 'fill-extrusion-color', '#a9b8ad');

      setupLayerToggles();
      await window.TreeRenderer?.initTrees?.(map);
      moveBioswaleLayersToTop();

      setStageInstant(0);
      setupStoryScrollytelling();
    } catch (err) {
      console.error('MAP LOAD ERROR:', err);
    }
  });
}

window.addEventListener('wheel', (event) => {
  if (document.getElementById('story-panel')) return;

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
