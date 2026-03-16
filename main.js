const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  center: [-73.9895, 40.6745],
  zoom: 15.3,
  pitch: 65,
  bearing: -20,
  antialias: true
});

map.scrollZoom.disable();

let currentStage = 0;
let isAnimating = false;

const stageContent = [
  {
    title: "Gowanus Canal",
    desc: "Scroll to move through the stages."
  },
  {
    title: "Existing Density",
    desc: "Building footprints extrude to their recorded heights."
  },
  {
    title: "Rewilding Gowanus",
    desc: "Street tree locations appear across the neighborhood."
  },
  {
    title: "Future Impact",
    desc: "Ecological coverage and open space improvements are highlighted."
  }
];

// Use building height property, fallback to 12 if missing
const existingHeightExpression = ['coalesce', ['to-number', ['get', 'height']], 12];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function setStageText(stage) {
  document.getElementById('stage-title').innerText = stageContent[stage].title;
  document.getElementById('stage-desc').innerText = stageContent[stage].desc;
}

function setTreeVisibility(show) {
  if (map.getLayer('trees-circle')) {
    map.setLayoutProperty('trees-circle', 'visibility', show ? 'visible' : 'none');
  }
}

function setStatsVisibility(show) {
  const stats = document.getElementById('stats-panel');
  stats.classList.toggle('hidden', !show);
}

function setBuildingHeight(multiplier) {
  if (!map.getLayer('existing-buildings')) return;

  map.setPaintProperty(
    'existing-buildings',
    'fill-extrusion-height',
    ['*', multiplier, existingHeightExpression]
  );
}

function setStageInstant(stage) {
  if (stage === 0) {
    setBuildingHeight(0);
    setTreeVisibility(false);
    setStatsVisibility(false);
  }

  if (stage === 1) {
    setBuildingHeight(1);
    setTreeVisibility(false);
    setStatsVisibility(false);
  }

  if (stage === 2) {
    setBuildingHeight(1);
    setTreeVisibility(true);
    setStatsVisibility(false);
  }

  if (stage === 3) {
    setBuildingHeight(1);
    setTreeVisibility(true);
    setStatsVisibility(true);
  }

  setStageText(stage);
}

function animateStage(stage) {
  if (isAnimating) return;
  isAnimating = true;

  const duration = 900;
  const startTime = performance.now();

  function step(now) {
    const raw = clamp((now - startTime) / duration, 0, 1);
    const t = easeOutCubic(raw);

    if (stage === 0) {
      // collapse buildings, hide trees
      setBuildingHeight(1 - t);
      setTreeVisibility(false);
      setStatsVisibility(false);
    }

    if (stage === 1) {
      // grow buildings
      setBuildingHeight(t);
      setTreeVisibility(false);
      setStatsVisibility(false);
    }

    if (stage === 2) {
      // keep buildings, show trees
      setBuildingHeight(1);
      if (raw > 0.2) setTreeVisibility(true);
      setStatsVisibility(false);
    }

    if (stage === 3) {
      // keep everything, show stats
      setBuildingHeight(1);
      setTreeVisibility(true);
      if (raw > 0.3) setStatsVisibility(true);
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

async function loadTreesAsPoints() {
  const res = await fetch('/data/gowanus_trees.json');
  const data = await res.json();

  // Convert whatever your JSON is into GeoJSON features
  const features = data
    .filter(t => t.lat != null && t.lon != null)
    .map(t => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [Number(t.lon), Number(t.lat)]
      },
      properties: {
        species: t.species || 'Unknown'
      }
    }));

  const geojson = {
    type: 'FeatureCollection',
    features
  };

  map.addSource('trees', {
    type: 'geojson',
    data: geojson
  });

  map.addLayer({
    id: 'trees-circle',
    type: 'circle',
    source: 'trees',
    layout: {
      visibility: 'none'
    },
    paint: {
      'circle-radius': 3,
      'circle-color': [
        'match',
        ['%', ['string-length', ['coalesce', ['get', 'species'], '']], 4],
        0, '#2d5a27',
        1, '#467c3a',
        2, '#3a5a40',
        3, '#588157',
        '#467c3a'
      ],
      'circle-opacity': 0.95,
      'circle-stroke-color': '#d9ffd0',
      'circle-stroke-width': 0.5
    }
  });
}

map.on('load', async () => {
  const res = await fetch('/data/gowanus-buildings.geojson');
  const existingData = await res.json();

  map.addSource('existing', {
    type: 'geojson',
    data: existingData
  });

  map.addLayer({
    id: 'existing-buildings',
    type: 'fill-extrusion',
    source: 'existing',
    paint: {
      'fill-extrusion-color': '#e0e0e0',
      'fill-extrusion-base': 0,
      'fill-extrusion-height': 0,
      'fill-extrusion-opacity': 0.9
    }
  });

  await loadTreesAsPoints();

  setStageInstant(0);
});

window.addEventListener('wheel', (event) => {
  event.preventDefault();

  if (isAnimating) return;

  const direction = event.deltaY > 0 ? 1 : -1;
  const nextStage = clamp(currentStage + direction, 0, 3);

  if (nextStage === currentStage) return;

  currentStage = nextStage;
  animateStage(currentStage);
}, { passive: false });