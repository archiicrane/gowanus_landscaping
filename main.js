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

// Existing building height from OSM GeoJSON
// OSM height is usually stored as text, so we convert it to number
const existingHeightExpression = [
  '*',
  1.3,
  ['coalesce',
    ['to-number', ['get', 'height']],
    ['*', 3.2, ['to-number', ['get', 'building:levels']]],
    12
  ]
];

// Proposed rezoning building height
const proposedHeightExpression = [
  'coalesce',
  ['to-number', ['get', 'proposed_height']],
  0
];

function setStageInstant(stage) {
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

map.on('load', async () => {
  const [existingResponse, proposedResponse] = await Promise.all([
    fetch('./data/gowanus-buildings.geojson'),
    fetch('./data/rezoning-buildings.geojson')
  ]);

  const existingData = await existingResponse.json();
  const proposedData = await proposedResponse.json();

  console.log('Existing building count:', existingData.features.length);
  console.log('Sample existing props:', existingData.features.slice(0, 5).map(f => f.properties));

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

  setStageInstant(0);
});

// Scroll = change stages
// Alt + Scroll = zoom
window.addEventListener('wheel', (event) => {
  if (event.altKey) {
    map.scrollZoom.enable();
    return;
  }

  map.scrollZoom.disable();
  event.preventDefault();

  if (isAnimating) return;

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