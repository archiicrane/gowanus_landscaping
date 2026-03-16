/** * REWILDING GOWANUS - MAIN ENGINE
 * Merging MapLibre (Basemap) + Three.js (3D Objects) + Story Scroll
 */

// --- 1. CONFIG & BOUNDARY ---
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

// --- 2. INITIALIZE MAP ---
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [-73.991, 40.675],
    zoom: 15.8,
    pitch: 60,
    bearing: -15,
    interactive: false // Camera is locked for the story
});

let tb; // Threebox instance
let currentStage = 0;
let isAnimating = false;
let buildings = [];
let trees = [];

map.on('style.load', () => {
    map.addLayer({
        id: 'threejs-layer',
        type: 'custom',
        renderingMode: '3d',
        onAdd: function (map, gl) {
            // Bridge MapLibre and Three.js
            tb = new Threebox(map, gl, { defaultLights: true });
        },
        render: function () {
            tb.update();
        }
    });
});

// --- 3. THE SCROLL STORY SYSTEM ---
// We use a debounce to prevent one wheel click from skipping 5 stages
window.addEventListener('wheel', (e) => {
    if (isAnimating) return;
    isAnimating = true;

    if (e.deltaY > 0) currentStage = Math.min(currentStage + 1, 3);
    else currentStage = Math.max(currentStage - 1, 0);

    updateStage(currentStage);

    // Lock interaction for 800ms during transition
    setTimeout(() => { isAnimating = false; }, 800);
}, { passive: true });

async function updateStage(stage) {
    const stats = document.getElementById('stats-panel');
    const title = document.getElementById('stage-title');
    
    if (stats) stats.classList.toggle('visible', stage === 3);

    switch(stage) {
        case 0:
            title.innerText = "Gowanus Canal";
            set3DVisibility(buildings, false);
            set3DVisibility(trees, false);
            break;
        case 1:
            title.innerText = "Density Analysis";
            await loadBuildings();
            set3DVisibility(buildings, true);
            set3DVisibility(trees, false);
            animateRise(buildings);
            break;
        case 2:
        case 3:
            title.innerText = "Urban Rewilding";
            await loadTrees();
            set3DVisibility(buildings, true);
            set3DVisibility(trees, true);
            animateRise(trees);
            break;
    }
}

// --- 4. THREE.JS BUILDINGS ---
async function loadBuildings() {
    if (buildings.length > 0) return;
    const res = await fetch('gowanus-buildings.geojson');
    const data = await res.json();

    data.features.forEach(f => {
        if (f.geometry.type !== 'Polygon') return;
        
        // Parse height from your specific string property "13.2"
        const h = parseFloat(f.properties.height) || 12;
        const coords = f.geometry.coordinates[0];

        // Create Three.js extrusions via Threebox helper
        const building = tb.utils.makeTriangulatedMesh(coords, h, { 
            color: 0xeeeeee, 
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85
        });
        
        building.visible = false;
        tb.add(building);
        buildings.push(building);
    });
}

// --- 5. THREE.JS TREES ---
async function loadTrees() {
    if (trees.length > 0) return;
    const res = await fetch('gowanus_trees.json');
    const data = await res.json();

    data.forEach(t => {
        // Filter based on your specific boundary
        if (!t.lat || !t.lon || !isInsideGowanus(t.lat, t.lon)) return;

        // Build a stylized Three.js Group: Trunk + Canopy
        const treeGroup = new THREE.Group();
        
        // Trunk (Cylinder)
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.2, 1.2),
            new THREE.MeshPhongMaterial({ color: 0x4d2e1e })
        );
        
        // Canopy (Sphere) - color varies by species
        const canopy = new THREE.Mesh(
            new THREE.SphereGeometry(1, 8, 8),
            new THREE.MeshPhongMaterial({ color: getTreeColor(t.species) })
        );
        canopy.position.y = 1.2;
        
        treeGroup.add(trunk);
        treeGroup.add(canopy);

        // Transform lat/lon into Three.js 3D coordinates
        const treeObj = tb.Object3D({ obj: treeGroup, anchor: 'bottom' })
            .setCoords([t.lon, t.lat, 0]);

        treeObj.visible = false;
        tb.add(treeObj);
        trees.push(treeObj);
    });
}

// --- UTILS ---

function getTreeColor(species) {
    const palette = ['#2d5a27', '#4a7c44', '#31572c', '#4f772d', '#90be6d'];
    let hash = 0;
    if (species) {
        for (let i = 0; i < species.length; i++) hash = species.charCodeAt(i) + ((hash << 5) - hash);
    }
    return palette[Math.abs(hash) % palette.length];
}

function set3DVisibility(array, state) {
    array.forEach(item => { item.visible = state; });
}

function animateRise(array) {
    array.forEach(item => {
        if (item.scale.z > 0.1) return; // Prevent re-animating
        item.scale.z = 0.01;
        let s = 0;
        const interval = setInterval(() => {
            s += 0.05;
            item.scale.z = s;
            if (s >= 1) {
                item.scale.z = 1;
                clearInterval(interval);
            }
        }, 20);
    });
}
