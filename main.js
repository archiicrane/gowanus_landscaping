/**
 * REWILDING GOWANUS - MAIN ENGINE
 * Logic: MapLibre native extrusion for buildings (for reliable scrolling)
 * Logic: Three.js for stylized tree models
 */

// --- CONFIG & BOUNDARY ---
const GOWANUS_BOUNDARY = [
    [-73.98963594611494, 40.683945676183654],
    [-73.98084416376932, 40.680669969224006],
    [-73.99274143083169, 40.665495232798115],
    [-73.99607305804426, 40.667988596328655],
    [-73.99889524234268, 40.67260255106102],
    [-73.9964465299067, 40.67744610487334],
    [-73.99461997552936, 40.67663528353369],
    [-73.98963594611494, 40.683945676183654] // Closed
];

function isPointInPolygon(point, vs) {
    var x = point[0], y = point[1];
    var inside = false;
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        var xi = vs[i][0], yi = vs[i][1];
        var xj = vs[j][0], yj = vs[j][1];
        var intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [-73.991, 40.675],
    zoom: 15.5,
    pitch: 65,
    bearing: -20,
    antialias: true
});

map.scrollZoom.disable();

let currentStage = 0;
let isAnimating = false;
let tb; // Threebox for trees
let treeModels = [];

// Building height expression from your "worked" logic
const existingHeightExpression = [
    'coalesce',
    ['to-number', ['get', 'height']],
    12 // Default fallback
];

// --- UTILS ---
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

// --- MAP LAYERS ---
map.on('load', async () => {
    // 1. Load Building Data
    const resB = await fetch('gowanus-buildings.geojson');
    const buildingData = await resB.json();

    map.addSource('buildings', { type: 'geojson', data: buildingData });
    map.addLayer({
        id: 'gowanus-buildings',
        type: 'fill-extrusion',
        source: 'buildings',
        paint: {
            'fill-extrusion-color': '#e0e0e0',
            'fill-extrusion-height': 0,
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.85
        }
    });

    // 2. Load Park Spaces (Mocking some green areas in the boundary)
    map.addLayer({
        id: 'parks',
        type: 'fill',
        source: 'buildings', // Use same source for simplicity or filter for 'park'
        filter: ['==', ['get', 'leisure'], 'park'],
        paint: { 'fill-color': '#4a7c44', 'fill-opacity': 0 }
    }, 'gowanus-buildings');

    // 3. Initialize Threebox for Trees
    map.addLayer({
        id: 'tree-layer',
        type: 'custom',
        renderingMode: '3d',
        onAdd: function (map, gl) {
            tb = new Threebox(map, gl, { defaultLights: true });
            loadTrees();
        },
        render: function () { tb.update(); }
    });

    setStageInstant(0);
});

async function loadTrees() {
    const resT = await fetch('gowanus_trees.json');
    const data = await resT.json();

    data.forEach(t => {
        if (!t.lat || !t.lon || !isPointInPolygon([t.lon, t.lat], GOWANUS_BOUNDARY)) return;

        // Simple Three.js tree group (Trunk + Canopy)
        const group = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1), new THREE.MeshPhongMaterial({color: 0x4d2e1e}));
        const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), new THREE.MeshPhongMaterial({color: getTreeColor(t.species)}));
        canopy.position.y = 1;
        group.add(trunk); group.add(canopy);

        const obj = tb.Object3D({ obj: group, anchor: 'bottom' }).setCoords([t.lon, t.lat, 0]);
        obj.visible = false;
        obj.scale.set(0.01, 0.01, 0.01);
        tb.add(obj);
        treeModels.push(obj);
    });
}

function getTreeColor(species) {
    const greens = ['#2d5a27', '#467c3a', '#3a5a40', '#588157'];
    return greens[species ? species.length % greens.length : 0];
}

// --- STAGE ANIMATION ---
function setStageInstant(stage) {
    const h = (stage >= 1) ? existingHeightExpression : 0;
    map.setPaintProperty('gowanus-buildings', 'fill-extrusion-height', h);
    map.setPaintProperty('parks', 'fill-opacity', (stage >= 2) ? 0.6 : 0);
    treeModels.forEach(t => { 
        t.visible = (stage >= 2); 
        t.scale.set(1, 1, 1);
    });
    document.getElementById('stats-panel').classList.toggle('visible', stage === 3);
}

function animateStage(stage) {
    if (isAnimating) return;
    isAnimating = true;

    const duration = 1000;
    const startTime = performance.now();

    function step(now) {
        const raw = clamp((now - startTime) / duration, 0, 1);
        const t = easeOutCubic(raw);

        // Stage 1: Buildings Rise
        if (stage === 1) {
            map.setPaintProperty('gowanus-buildings', 'fill-extrusion-height', ['*', t, existingHeightExpression]);
            treeModels.forEach(m => m.visible = false);
        }
        
        // Stage 0: Buildings Fall
        if (stage === 0) {
            map.setPaintProperty('gowanus-buildings', 'fill-extrusion-height', ['*', 1 - t, existingHeightExpression]);
        }

        // Stage 2: Trees & Parks Appear
        if (stage === 2) {
            map.setPaintProperty('parks', 'fill-opacity', t * 0.6);
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

// --- SCROLL INTERACTION ---
window.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (isAnimating) return;

    if (e.deltaY > 0) currentStage = clamp(currentStage + 1, 0, 3);
    else currentStage = clamp(currentStage - 1, 0, 3);

    const stages = ["Gowanus Canal", "Existing Density", "Proposed Rewilding", "Project Impact"];
    document.getElementById('stage-title').innerText = stages[currentStage];
    
    animateStage(currentStage);
}, { passive: false });