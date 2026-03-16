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

const stageContent = [
  {
    title: "Gowanus Canal",
    desc: "Scroll to move through the stages."
  },
  {
    title: "Existing Density",
    desc: "Existing building footprints extrude using recorded height data."
  },
  {
    title: "Proposed Rezoning",
    desc: "Rezoning massing appears over the existing neighborhood fabric."
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

    if (window.TreeRenderer?.hideTrees) {
      window.TreeRenderer.hideTrees(map);
    }
  }

  if (stage === 1) {
    map.setPaintProperty('existing-buildings', 'fill-extrusion-height', existingHeightExpression);
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-height', 0);
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-opacity', 0);

    if (window.TreeRenderer?.hideTrees) {
      window.TreeRenderer.hideTrees(map);
    }
  }

  if (stage === 2) {
    map.setPaintProperty('existing-buildings', 'fill-extrusion-height', existingHeightExpression);
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-height', proposedHeightExpression);
    map.setPaintProperty('proposed-buildings', 'fill-extrusion-opacity', 0.95);

    if (window.TreeRenderer?.showTrees) {
      window.TreeRenderer.showTrees(map);
    }
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

      if (window.TreeRenderer?.hideTrees) {
        window.TreeRenderer.hideTrees(map);
      }
    }

    if (stage === 1) {
      map.setPaintProperty(
        'existing-buildings',
        'fill-extrusion-height',
        ['*', t, existingHeightExpression]
      );

      map.setPaintProperty('proposed-buildings', 'fill-extrusion-height', 0);
      map.setPaintProperty('proposed-buildings', 'fill-extrusion-opacity', 0);

      if (window.TreeRenderer?.hideTrees) {
        window.TreeRenderer.hideTrees(map);
      }
    }

    if (stage === 2) {
      map.setPaintProperty('existing-buildings', 'fill-extrusion-height', existingHeightExpression);

      map.setPaintProperty(
        'proposed-buildings',
        'fill-extrusion-height',
        ['*', t, proposedHeightExpression]
      );

      map.setPaintProperty('proposed-buildings', 'fill-extrusion-opacity', t * 0.95);

      if (raw > 0.2 && window.TreeRenderer?.showTrees) {
        window.TreeRenderer.showTrees(map);
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

map.on('load', async () => {
  try {
    const [existingResponse, proposedResponse] = await Promise.all([
      fetch('./data/gowanus-buildings.geojson'),
      fetch('./data/rezoning-buildings.geojson')
    ]);

    if (!existingResponse.ok) {
      throw new Error(`Existing buildings fetch failed: ${existingResponse.status} ${existingResponse.statusText}`);
    }

    if (!proposedResponse.ok) {
      throw new Error(`Proposed buildings fetch failed: ${proposedResponse.status} ${proposedResponse.statusText}`);
    }

    const existingData = await existingResponse.json();
    const proposedData = await proposedResponse.json();

    console.log('Existing building count:', existingData.features?.length || 0);
    console.log('Proposed building count:', proposedData.features?.length || 0);
    console.log('Sample existing props:', existingData.features?.slice(0, 3).map((f) => f.properties));

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

    console.log('window.TreeRenderer:', window.TreeRenderer);

    if (window.TreeRenderer?.initTrees) {
      await window.TreeRenderer.initTrees(map);
    } else {
      console.error('TreeRenderer not found');
    }

    setStageInstant(0);
  } catch (err) {
    console.error('MAP LOAD ERROR:', err);
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