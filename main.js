// 1. Initialize Map
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  center: [-73.9895, 40.6745],
  zoom: 15.5,
  pitch: 65,
  bearing: -20,
  antialias: true
});

map.scrollZoom.disable();

let currentStage = 0;
let isAnimating = false;
let tb; // Threebox instance for trees
let treeModels = [];

// Helper functions from your working code
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

// Expression to get height from your GeoJSON
const heightExpression = [
  'coalesce',
  ['to-number', ['get', 'height']],
  12 // Default fallback height
];

// 2. Load Data and Setup Layers
map.on('load', async () => {
  // Fetch Building Data
  const resB = await fetch('gowanus-buildings.geojson');
  const buildingData = await resB.json();

  map.addSource('buildings', { type: 'geojson', data: buildingData });

  // Add the native MapLibre extrusion layer (This is the one that "works")
  map.addLayer({
    id: 'existing-buildings',
    type: 'fill-extrusion',
    source: 'buildings',
    paint: {
      'fill-extrusion-color': '#e0e0e0',
      'fill-extrusion-base': 0,
      'fill-extrusion-height': 0, // Starts at 0
      'fill-extrusion-opacity': 0.9
    }
  });

  // Add Threebox Layer specifically for the Trees
  map.addLayer({
    id: 'tree-layer',
    type: 'custom',
    renderingMode: '3d',
    onAdd: function (map, gl) {
      tb = new Threebox(map, gl, { defaultLights: true });
      loadThreejsTrees();
    },
    render: function () { tb.update(); }
  });

  setStageInstant(0);
});

// 3. Tree Modeling with Three.js
async function loadThreejsTrees() {
  const resT = await fetch('gowanus_trees.json');
  const treeData = await resT.json();

  treeData.forEach(t => {
    // Only add trees if they have valid coordinates
    if (!t.lat || !t.lon) return;

    // Create a simple Three.js tree: Trunk (Cylinder) + Canopy (Sphere)
    const group = new THREE.Group();
    
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 1.2),
      new THREE.MeshPhongMaterial({ color: 0x4d2e1e })
    );
    
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 8),
      new THREE.MeshPhongMaterial({ color: '#2d5a27' })
    );
    canopy.position.y = 1.2;
    
    group.add(trunk);
    group.add(canopy);

    // Place in 3D world space
    const obj = tb.Object3D({ obj: group, anchor: 'bottom' }).setCoords([t.lon, t.lat, 0]);
    obj.visible = false; // Hidden at stage 0
    obj.scale.set(0.01, 0.01, 0.01); 

    tb.add(obj);
    treeModels.push(obj);
  });
}

// 4. Animation and Scroll Logic
function setStageInstant(stage) {
  if (stage === 0) {
    map.setPaintProperty('existing-buildings', 'fill-extrusion-height', 0);
    treeModels.forEach(t => { t.visible = false; t.scale.set(0,0,0); });
  }
  if (stage === 1) {
    map.setPaintProperty('existing-buildings', 'fill-extrusion-height', heightExpression);
    treeModels.forEach(t => { t.visible = false; });
  }
  if (stage === 2) {
    map.setPaintProperty('existing-buildings', 'fill-extrusion-height', heightExpression);
    treeModels.forEach(t => { t.visible = true; t.scale.set(1,1,1); });
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

    // Stage 1 Logic: Rise Buildings
    if (stage === 1) {
      map.setPaintProperty('existing-buildings', 'fill-extrusion-height', ['*', t, heightExpression]);
    }
    // Stage 0 Logic: Drop Buildings
    if (stage === 0) {
      map.setPaintProperty('existing-buildings', 'fill-extrusion-height', ['*', 1 - t, heightExpression]);
    }
    // Stage 2 Logic: Grow Trees
    if (stage === 2) {
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

// Scroll Event
window.addEventListener('wheel', (event) => {
  event.preventDefault();
  if (isAnimating) return;

  if (event.deltaY > 0) {
    currentStage = clamp(currentStage + 1, 0, 2);
  } else {
    currentStage = clamp(currentStage - 1, 0, 2);
  }

  animateStage(currentStage);
}, { passive: false });