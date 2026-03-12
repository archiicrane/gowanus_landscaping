const BUILDINGS_FILE = './gowanus-buildings.geojson';
const TREES_FILE = './gowanus_trees.json';

const GOWANUS_BBOX = {
  west: -74.0055,
  south: 40.6685,
  east: -73.9825,
  north: 40.6838
};

const stageChip = document.getElementById('stage-chip');
const statsPanel = document.getElementById('stats-panel');
const mapElement = document.getElementById('map');

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  center: [-73.9904, 40.6748],
  zoom: 15.55,
  pitch: 62,
  bearing: -38,
  antialias: true,
  dragRotate: false,
  pitchWithRotate: false,
  touchPitch: false,
  keyboard: false
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
map.scrollZoom.disable();
map.touchZoomRotate.disableRotation();

actionText(0);

let currentStage = 0;
let wheelLocked = false;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function actionText(stage) {
  const labels = [
    'Scroll to raise the buildings',
    'Scroll again to reveal trees + parks',
    'Scroll again to reveal Gowanus stats',
    'Final stage reached'
  ];
  stageChip.textContent = labels[stage] || labels[labels.length - 1];
}

function getHeightExpression() {
  return [
    '*',
    1.15,
    [
      'coalesce',
      ['to-number', ['get', 'height']],
      ['*', 3.2, ['to-number', ['get', 'building:levels']]],
      ['*', 3.2, ['to-number', ['get', 'levels']]],
      12
    ]
  ];
}

function treesToGeoJSON(treeRows) {
  return {
    type: 'FeatureCollection',
    features: treeRows
      .filter((tree) => tree.lat != null && tree.lon != null)
      .map((tree) => ({
        type: 'Feature',
        properties: {
          tree_id: tree.tree_id || '',
          species: tree.species || 'Unknown species',
          health: tree.health || 'Unknown',
          dbh: tree.dbh || '—'
        },
        geometry: {
          type: 'Point',
          coordinates: [Number(tree.lon), Number(tree.lat)]
        }
      }))
  };
}

function makeTreeIcon() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, size, size);

  ctx.fillStyle = '#5b3a29';
  ctx.fillRect(28, 35, 8, 20);

  ctx.beginPath();
  ctx.arc(32, 24, 16, 0, Math.PI * 2);
  ctx.fillStyle = '#5fbf72';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(22, 28, 10, 0, Math.PI * 2);
  ctx.fillStyle = '#70d485';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(41, 29, 9, 0, Math.PI * 2);
  ctx.fillStyle = '#4da962';
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}

async function fetchParksGeoJSON() {
  const overpassQuery = `
    [out:json][timeout:25];
    (
      way["leisure"="park"](${GOWANUS_BBOX.south},${GOWANUS_BBOX.west},${GOWANUS_BBOX.north},${GOWANUS_BBOX.east});
      relation["leisure"="park"](${GOWANUS_BBOX.south},${GOWANUS_BBOX.west},${GOWANUS_BBOX.north},${GOWANUS_BBOX.east});
    );
    out geom;
  `;

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: overpassQuery.trim()
  });

  if (!response.ok) {
    throw new Error('Could not load park data from Overpass');
  }

  const data = await response.json();

  return {
    type: 'FeatureCollection',
    features: (data.elements || [])
      .filter((element) => Array.isArray(element.geometry) && element.geometry.length > 2)
      .map((element) => ({
        type: 'Feature',
        properties: {
          name: element.tags?.name || 'Park'
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            ...element.geometry.map((point) => [point.lon, point.lat]),
            [element.geometry[0].lon, element.geometry[0].lat]
          ]]
        }
      }))
  };
}

function addLayers(buildingsData, treesData, parksData) {
  map.addSource('buildings', {
    type: 'geojson',
    data: buildingsData
  });

  map.addLayer({
    id: 'buildings-fill',
    type: 'fill-extrusion',
    source: 'buildings',
    paint: {
      'fill-extrusion-color': '#b794f4',
      'fill-extrusion-base': 0,
      'fill-extrusion-height': 0,
      'fill-extrusion-opacity': 0.92
    }
  });

  map.addLayer({
    id: 'buildings-outline',
    type: 'line',
    source: 'buildings',
    paint: {
      'line-color': 'rgba(255,255,255,0.18)',
      'line-width': 0.6
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
    layout: {
      visibility: 'none'
    },
    paint: {
      'fill-color': '#2f7d32',
      'fill-opacity': 0.55
    }
  });

  map.addLayer({
    id: 'parks-outline',
    type: 'line',
    source: 'parks',
    layout: {
      visibility: 'none'
    },
    paint: {
      'line-color': '#9be28d',
      'line-width': 1.2
    }
  });

  map.addImage('tree-icon', makeTreeIcon(), { pixelRatio: 2 });

  map.addSource('trees', {
    type: 'geojson',
    data: treesData
  });

  map.addLayer({
    id: 'trees-symbols',
    type: 'symbol',
    source: 'trees',
    layout: {
      visibility: 'none',
      'icon-image': 'tree-icon',
      'icon-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        14, 0.32,
        17, 0.6
      ],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-anchor': 'bottom'
    }
  });

  map.on('click', 'trees-symbols', (event) => {
    const feature = event.features?.[0];
    if (!feature) return;

    const coordinates = feature.geometry.coordinates.slice();
    const props = feature.properties;

    new maplibregl.Popup({ offset: 12 })
      .setLngLat(coordinates)
      .setHTML(`
        <div style="color:#111; font-family:Arial, sans-serif; min-width:180px;">
          <strong>${props.species}</strong><br>
          Tree ID: ${props.tree_id}<br>
          Health: ${props.health}<br>
          DBH: ${props.dbh}
        </div>
      `)
      .addTo(map);
  });

  map.on('mouseenter', 'trees-symbols', () => {
    map.getCanvas().style.cursor = 'pointer';
  });

  map.on('mouseleave', 'trees-symbols', () => {
    map.getCanvas().style.cursor = '';
  });
}

function setStage(stage) {
  if (!map.getLayer('buildings-fill')) return;

  const showTrees = stage >= 2;
  const showStats = stage >= 3;

  if (stage === 0) {
    map.setPaintProperty('buildings-fill', 'fill-extrusion-height', 0);
  } else {
    map.setPaintProperty('buildings-fill', 'fill-extrusion-height', getHeightExpression());
  }

  map.setLayoutProperty('trees-symbols', 'visibility', showTrees ? 'visible' : 'none');
  map.setLayoutProperty('parks-fill', 'visibility', showTrees ? 'visible' : 'none');
  map.setLayoutProperty('parks-outline', 'visibility', showTrees ? 'visible' : 'none');

  statsPanel.classList.toggle('hidden', !showStats);
  actionText(stage);
}

map.on('load', async () => {
  try {
    const [buildingsResponse, treesResponse] = await Promise.all([
      fetch(BUILDINGS_FILE),
      fetch(TREES_FILE)
    ]);

    if (!buildingsResponse.ok) throw new Error(`Could not load ${BUILDINGS_FILE}`);
    if (!treesResponse.ok) throw new Error(`Could not load ${TREES_FILE}`);

    const buildingsData = await buildingsResponse.json();
    const treeRows = await treesResponse.json();
    const treesData = treesToGeoJSON(treeRows);

    let parksData = { type: 'FeatureCollection', features: [] };

    try {
      parksData = await fetchParksGeoJSON();
      console.log('Parks loaded:', parksData.features.length);
    } catch (parkError) {
      console.warn('Park fetch failed, continuing without parks.', parkError);
    }

    addLayers(buildingsData, treesData, parksData);
    setStage(0);
  } catch (error) {
    console.error('Map loading error:', error);
    stageChip.textContent = 'Something failed to load. Open DevTools console.';
  }
});

mapElement.addEventListener('wheel', (event) => {
  if (event.altKey) {
    map.scrollZoom.enable();
    return;
  }

  event.preventDefault();
  map.scrollZoom.disable();

  if (wheelLocked) return;

  const direction = event.deltaY > 0 ? 1 : -1;
  currentStage = clamp(currentStage + direction, 0, 3);
  setStage(currentStage);

  wheelLocked = true;
  window.setTimeout(() => {
    wheelLocked = false;
  }, 550);
}, { passive: false });

window.addEventListener('keyup', (event) => {
  if (event.key === 'Alt') {
    map.scrollZoom.disable();
  }
});
