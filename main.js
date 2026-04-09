let map;

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
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-73.9895, 40.6745],
    zoom: 15.3,
    pitch: 65,
    bearing: -20,
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
    title: 'Proposed Rezoning + Trees',
    desc: 'Rezoning massing appears with street tree locations while the terrain, contours, and flood layer stay active.'
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
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-height', proposedHeightExpression);
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-opacity', 0.95);
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
      map.setPaintProperty(
        'proposed-buildings',
        'fill-extrusion-height',
        ['*', t, proposedHeightExpression]
      );
      map.setPaintProperty('proposed-buildings', 'fill-extrusion-opacity', t * 0.95);

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
      minzoom: 11,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
        visibility: 'visible'
      },
      paint: {
        'line-color': [
          'case',
          ['==', ['%', ['to-number', ['get', 'ele']], 50], 0],
          'rgba(255,255,255,0.3)',
          'rgba(255,255,255,0.14)'
        ],
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11, [
            'case',
            ['==', ['%', ['to-number', ['get', 'ele']], 50], 0],
            0.7,
            0.35
          ],
          16, [
            'case',
            ['==', ['%', ['to-number', ['get', 'ele']], 50], 0],
            1.4,
            0.7
          ]
        ],
        'line-opacity': 0.9
      }
    });
  }
}

function addFloodLayer(floodData) {
  if (map.getSource('flood-vulnerability')) return;

  map.addSource('flood-vulnerability', {
    type: 'geojson',
    data: floodData
  });

  map.addLayer({
    id: 'flood-fill',
    type: 'fill',
    source: 'flood-vulnerability',
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

function setupLayerToggles() {
  const topoToggle = document.getElementById('toggle-topo');
  const floodToggle = document.getElementById('toggle-flood');
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

  observableToggle?.addEventListener('change', (event) => {
    const isVisible = event.target.checked;
    observableOverlay?.classList.toggle('hidden', !isVisible);
  });
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

      map.fitBounds([
        [STUDY_BOUNDS.west, STUDY_BOUNDS.south],
        [STUDY_BOUNDS.east, STUDY_BOUNDS.north]
      ], {
        padding: { top: 90, right: 80, bottom: 80, left: 80 },
        duration: 0
      });

      setupLayerToggles();
      await window.TreeRenderer?.initTrees?.(map);

      setStageInstant(0);
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
