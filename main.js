// --- CONFIG & BOUNDARY ---
const GOWANUS_COORDS = [
    [40.683945676183654, -73.98963594611494], [40.680669969224006, -73.98084416376932],
    [40.665495232798115, -73.99274143083169], [40.667988596328655, -73.99607305804426],
    [40.67260255106102, -73.99889524234268], [40.67744610487334, -73.9964465299067],
    [40.67663528353369, -73.99461997552936]
];

function isInsideGowanus(lat, lon) {
    let inside = false;
    for (let i = 0, j = GOWANUS_COORDS.length - 1; i < GOWANUS_COORDS.length; j = i++) {
        let xi = GOWANUS_COORDS[i][0], yi = GOWANUS_COORDS[i][1];
        let xj = GOWANUS_COORDS[j][0], yj = GOWANUS_COORDS[j][1];
        let intersect = ((yi > lon) != (yj > lon)) && (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// --- INITIALIZE MAP ---
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [-73.991, 40.675],
    zoom: 16,
    pitch: 60,
    bearing: -20,
    interactive: false 
});

window.tb = null;
let currentStage = 0;
let isScrolling = false;
let buildings = [];
let trees = [];

map.on('style.load', () => {
    map.addLayer({
        id: 'custom-three-layer',
        type: 'custom',
        renderingMode: '3d',
        onAdd: function (map, gl) {
            window.tb = new Threebox(map, gl, { defaultLights: true });
            console.log("Threebox Initialized");
        },
        render: function () {
            if (window.tb) window.tb.update();
        }
    });
});

// --- STAGE LOGIC ---
window.addEventListener('wheel', (e) => {
    if (isScrolling) return;
    isScrolling = true;
    setTimeout(() => { isScrolling = false; }, 800);

    // Scroll down moves forward, Scroll up moves back
    if (e.deltaY > 0) currentStage = Math.min(currentStage + 1, 3);
    else currentStage = Math.max(currentStage - 1, 0);

    console.log("Current Stage:", currentStage);
    applyStage(currentStage);
}, { passive: true });

async function applyStage(stage) {
    // UI Feedback
    const stats = document.getElementById('stats-panel');
    if (stats) stats.classList.toggle('visible', stage === 3);

    if (stage === 0) {
        setItemsVisible(buildings, false);
        setItemsVisible(trees, false);
    } 
    else if (stage === 1) {
        await ensureBuildingsLoaded();
        setItemsVisible(buildings, true);
        setItemsVisible(trees, false);
        animateRise(buildings);
    } 
    else if (stage === 2 || stage === 3) {
        await ensureBuildingsLoaded();
        await ensureTreesLoaded();
        setItemsVisible(buildings, true);
        setItemsVisible(trees, true);
        animateRise(trees);
    }
}

// --- THREE.JS LOADERS ---

async function ensureBuildingsLoaded() {
    if (buildings.length > 0) return;
    console.log("Loading Buildings...");
    const res = await fetch('gowanus-buildings.geojson');
    const data = await res.json();

    data.features.forEach(f => {
        if (f.geometry.type !== 'Polygon') return;
        const height = parseFloat(f.properties.height) || 12;
        const coords = f.geometry.coordinates[0];

        // Threebox triangulated mesh for buildings
        const meshOptions = { color: 0xdddddd, side: THREE.DoubleSide };
        const building = tb.utils.makeTriangulatedMesh(coords, height, meshOptions);
        
        building.visible = false;
        tb.add(building);
        buildings.push(building);
    });
}

async function ensureTreesLoaded() {
    if (trees.length > 0) return;
    console.log("Loading Trees...");
    const res = await fetch('gowanus_trees.json');
    const data = await res.json();

    data.forEach(t => {
        if (!t.lat || !t.lon || !isInsideGowanus(t.lat, t.lon)) return;

        // Build a stylized Three.js tree group
        const group = new THREE.Group();
        
        // Trunk
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.2, 1.2),
            new THREE.MeshPhongMaterial({ color: 0x4d2e1e })
        );
        // Canopy
        const canopy = new THREE.Mesh(
            new THREE.SphereGeometry(1, 8, 8),
            new THREE.MeshPhongMaterial({ color: getTreeColor(t.species) })
        );
        canopy.position.y = 1.2;
        group.add(trunk);
        group.add(canopy);

        // Position it in the 3D map space
        const treeObj = tb.Object3D({ obj: group, anchor: 'bottom' })
            .setCoords([t.lon, t.lat, 0]);

        treeObj.visible = false;
        tb.add(treeObj);
        trees.push(treeObj);
    });
}

// --- UTILS ---

function getTreeColor(species) {
    const greens = ['#2d5a27', '#467c3a', '#3a5a40', '#588157', '#a3b18a'];
    let hash = 0;
    if (species) {
        for (let i = 0; i < species.length; i++) hash = species.charCodeAt(i) + ((hash << 5) - hash);
    }
    return greens[Math.abs(hash) % greens.length];
}

function setItemsVisible(array, visible) {
    array.forEach(item => { item.visible = visible; });
}

function animateRise(array) {
    array.forEach(item => {
        if (item.scale.z > 0.1) return; // Already risen
        item.scale.z = 0.01;
        let s = 0;
        const intr = setInterval(() => {
            s += 0.05;
            item.scale.z = s;
            if (s >= 1) clearInterval(intr);
        }, 30);
    });
}
