const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  center: [-73.9895, 40.6745],
  zoom: 15.3,
  pitch: 65,
  bearing: -20,
  antialias: true
});

map.addControl(new maplibregl.NavigationControl());
map.scrollZoom.disable();

let currentStage = 0;
let isAnimating = false;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

const existingHeightExpression = [
  '*',
  1.3,
  [
    'coalesce',
    ['to-number', ['get', 'height']],
    ['*', 3.2, ['to-number', ['get', 'building:levels']]],
    ['*', 3.2, ['to-number', ['get', 'levels']]],
    12
  ]
];

const proposedHeightExpression = [
  'coalesce',
  ['to-number', ['get', 'proposed_height']],
  ['to-number', ['get', 'height']],
  0
];

function setStageInstant(stage) {
  if (!map.getLayer('existing-buildings') || !map.getLayer('proposed-buildings')) return;

  if (stage === 0) {
    map.setPaintProperty('existing-buildings', 'fill-extrusion-height', 0);
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-height', 0);
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-opacity', 0);
  }

  if (stage === 1) {
    map.setPaintProperty('existing-buildings', 'fill-extrusion-height', existingHeightExpression);
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-height', 0);
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-opacity', 0);
  }

  if (stage === 2) {
    map.setPaintProperty('existing-buildings', 'fill-extrusion-height', existingHeightExpression);
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-height', proposedHeightExpression);
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-opacity', 0.95);
  }
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
    }

    if (stage === 1) {
      map.setPaintProperty(
        'existing-buildings',
        'fill-extrusion-height',
        ['*', t, existingHeightExpression]
      );
      map.setPaintProperty('proposed-buildings', 'fill-extrusion-height', 0);
      map.setPaintProperty('proposed-buildings', 'fill-extrusion-opacity', 0);
    }

    if (stage === 2) {
      map.setPaintProperty('existing-buildings', 'fill-extrusion-height', existingHeightExpression);
      map.setPaintProperty(
        'proposed-buildings',
        'fill-extrusion-height',
        ['*', t, proposedHeightExpression]
      );
      map.setPaintProperty('proposed-buildings', 'fill-extrusion-opacity', t * 0.95);
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

function treesToGeoJSON(treesData) {
  return {
    type: 'FeatureCollection',
    features: treesData
      .filter(tree => tree.lat != null && tree.lon != null)
      .map(tree => ({
        type: 'Feature',
        properties: {
          tree_id: tree.tree_id || null,
          species: tree.species || '',
          dbh: tree.dbh || null,
          health: tree.health || ''
        },
        geometry: {
          type: 'Point',
          coordinates: [Number(tree.lon), Number(tree.lat)]
        }
      }))
  };
}

map.on('load', async () => {
  try {
    const [existingResponse, proposedResponse, treesResponse, parksResponse] = await Promise.all([
      fetch('./data/gowanus-buildings.geojson'),
      fetch('./data/rezoning-buildings.geojson'),
      fetch('./data/gowanus_trees.json'),
      fetch('./data/parks.geojson')
    ]);

    if (!existingResponse.ok) throw new Error('Could not load gowanus-buildings.geojson');
    if (!proposedResponse.ok) throw new Error('Could not load rezoning-buildings.geojson');
    if (!treesResponse.ok) throw new Error('Could not load gowanus_trees.json');
    if (!parksResponse.ok) throw new Error('Could not load parks.geojson');

    const existingData = await existingResponse.json();
    const proposedData = await proposedResponse.json();
    const treesData = await treesResponse.json();
    const parksData = await parksResponse.json();

    const treesGeoJSON = treesToGeoJSON(treesData);

    console.log('Existing building count:', existingData.features?.length || 0);
    console.log('Existing sample props:', existingData.features?.[0]?.properties || {});
    console.log('Proposed building count:', proposedData.features?.length || 0);
    console.log('Tree count:', treesData.length);

    map.addSource('existing', {
      type: 'geojson',
      data: existingData
    });

    map.addLayer({
      id: 'existing-buildings',
      type: 'fill-extrusion',
      source: 'existing',
      paint: {
        'fill-extrusion-color': '#8b5cf6',
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

    map.addSource('parks', {
      type: 'geojson',
      data: parksData
    });

    map.addLayer({
      id: 'parks-fill',
      type: 'fill',
      source: 'parks',
      paint: {
        'fill-color': '#3a5a40',
        'fill-opacity': 0.45
      }
    });

    map.addLayer({
      id: 'parks-outline',
      type: 'line',
      source: 'parks',
      paint: {
        'line-color': '#a3b18a',
        'line-width': 2
      }
    });

    map.addSource('trees', {
      type: 'geojson',
      data: treesGeoJSON
    });

    map.addLayer({
      id: 'trees-layer',
      type: 'circle',
      source: 'trees',
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12, 1.5,
          16, 4
        ],
        'circle-color': '#6fcf97',
        'circle-stroke-width': 1,
        'circle-stroke-color': '#1b4332',
        'circle-opacity': 0.9
      }
    });

    setStageInstant(1);
    currentStage = 1;

  } catch (error) {
    console.error('Map data loading error:', error);
  }
});

window.addEventListener('wheel', (event) => {
  if (event.altKey) {
    map.scrollZoom.enable();
    return;
  }

  map.scrollZoom.disable();
  event.preventDefault();

  if (isAnimating) return;
  if (!map.getLayer('existing-buildings') || !map.getLayer('proposed-buildings')) return;

  if (event.deltaY > 0) {
    currentStage = clamp(currentStage + 1, 0, 2);
  } else {
    currentStage = clamp(currentStage - 1, 0, 2);
  }

  animateStage(currentStage);
}, { passive: false });

window.addEventListener('keyup', (event) => {
  if (event.key === 'Alt') {
    map.scrollZoom.disable();
  }
});