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
let tb; // Threebox instance for trees
let treeModels = [];

// Your working expressions
const existingHeightExpression = ['coalesce', ['to-number', ['get', 'height']], 12];

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

// --- TREE LOGIC ---
function getTreeColor(species) {
  const greens = ['#2d5a27', '#467c3a', '#3a5a40', '#588157'];
  const index = species ? species.length % greens.length : 0;
  return greens[index];
}

async function loadTrees() {
  const res = await fetch('gowanus_trees.json');
  const data = await res.json();

  data.forEach(t => {
    if (!t.lat || !t.lon) return;

    // Create Three.js tree: Trunk + Canopy
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 1), 
      new THREE.MeshPhongMaterial({color: 0x4d2e1e})
    );
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 8), 
      new THREE.MeshPhongMaterial({color: getTreeColor(t.species)})
    );
    canopy.position.y = 1;
    group.add(trunk);
    group.add(canopy);

    const obj = tb.Object3D({ obj: group, anchor: 'bottom' }).setCoords([t.lon, t.lat, 0]);
    obj.visible = false;
    obj.scale.set(0.01, 0.01, 0.01);
    tb.add(obj);
    treeModels.push(obj);
  });
}

// --- STAGE LOGIC ---
function setStageInstant(stage) {
  // Buildings
  map.setPaintProperty('existing-buildings', 'fill-extrusion-height', stage >= 1 ? existingHeightExpression : 0);
  
  // Trees
  treeModels.forEach(t => {
    t.visible = stage >= 2;
    t.scale.set(stage >= 2 ? 1 : 0.01, stage >= 2 ? 1 : 0.01, stage >= 2 ? 1 : 0.01);
  });

  // UI
  document.getElementById('stats-panel').classList.toggle('hidden', stage < 3);
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
      map.setPaintProperty('existing-buildings', 'fill-extrusion-height', ['*', 1 - t, existingHeightExpression]);
      treeModels.forEach(m => m.visible = false);
    }

    if (stage === 1) {
      map.setPaintProperty('existing-buildings', 'fill-extrusion-height', ['*', t, existingHeightExpression]);
      treeModels.forEach(m => m.visible = false);
    }

    if (stage === 2 || stage === 3) {
      map.setPaintProperty('existing-buildings', 'fill-extrusion-height', existingHeightExpression);
      treeModels.forEach(m => {
        m.visible = true;
        m.scale.set(t, t, t);
      });
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
  const res = await fetch('gowanus-buildings.geojson');
  const existingData = await res.json();

  map.addSource('existing', { type: 'geojson', data: existingData });

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

  // Add Three.js Layer for Trees
  map.addLayer({
    id: 'tree-layer',
    type: 'custom',
    renderingMode: '3d',
    onAdd: (map, gl) => {
      tb = new Threebox(map, gl, { defaultLights: true });
      loadTrees();
    },
    render: () => { tb.update(); }
  });

  setStageInstant(0);
});

window.addEventListener('wheel', (event) => {
  event.preventDefault();
  if (isAnimating) return;

  if (event.deltaY > 0) currentStage = clamp(currentStage + 1, 0, 3);
  else currentStage = clamp(currentStage - 1, 0, 3);

  const titles = ["Gowanus Canal", "Existing Density", "Rewilding Gowanus", "Future Impact"];
  document.getElementById('stage-title').innerText = titles[currentStage];

  animateStage(currentStage);
}, { passive: false });