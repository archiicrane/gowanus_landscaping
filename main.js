// --- CONFIG & BOUNDARY ---
const GOWANUS_COORDS = [
    [40.683945676183654, -73.98963594611494],
    [40.680669969224006, -73.98084416376932],
    [40.665495232798115, -73.99274143083169],
    [40.667988596328655, -73.99607305804426],
    [40.67260255106102, -73.99889524234268],
    [40.67744610487334, -73.9964465299067],
    [40.67663528353369, -73.99461997552936]
];

// Point-in-polygon check for filtering
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
    center: [-73.990, 40.675],
    zoom: 15.5,
    pitch: 60,
    bearing: -20,
    interactive: false 
});

let tb;
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
            tb = new Threebox(map, gl, { defaultLights: true });
        },
        render: function () { tb.update(); }
    });
});

// --- STAGE MANAGER ---
async function updateStage(stage) {
    if (isAnimating) return;
    isAnimating = true;

    // UI Updates
    const title = document.getElementById('stage-title');
    const text = document.getElementById('stage-text');
    const stats = document.getElementById('stats-panel');

    if (stage === 0) {
        title.innerText = "Gowanus Canal";
        text.innerText = "The industrial heart of Brooklyn. Scroll to begin.";
        stats.classList.remove('visible');
        toggleVisibility(buildings, false);
        toggleVisibility(trees, false);
    } 
    else if (stage === 1) {
        title.innerText = "Existing Built Form";
        text.innerText = "Extracting building heights from GeoJSON...";
        stats.classList.remove('visible');
        await loadBuildings();
        toggleVisibility(buildings, true);
        toggleVisibility(trees, false);
        animateRise(buildings);
    } 
    else if (stage === 2) {
        title.innerText = "Urban Forest";
        text.innerText = "Adding species-specific canopy from tree data.";
        stats.classList.remove('visible');
        await loadTrees();
        toggleVisibility(buildings, true);
        toggleVisibility(trees, true);
        animateRise(trees);
    } 
    else if (stage === 3) {
        title.innerText = "Environmental Stats";
        text.innerText = "Projected impact of the rewilding strategy.";
        stats.classList.add('visible');
    }

    setTimeout(() => { isAnimating = false; }, 800);
}

// --- DATA LOADERS ---
async function loadBuildings() {
    if (buildings.length > 0) return;
    const res = await fetch('gowanus-buildings.geojson');
    const data = await res.json();

    data.features.forEach(f => {
        if (f.geometry.type !== 'Polygon') return;
        
        // Use the height property from your JSON
        const h = parseFloat(f.properties.height) || 12;
        const coords = f.geometry.coordinates[0];

        const meshOptions = { color: 0xeeeeee, side: THREE.DoubleSide, transparent: true, opacity: 0.9 };
        const building = tb.utils.makeTriangulatedMesh(coords, h, meshOptions);
        
        building.visible = false;
        tb.add(building);
        buildings.push(building);
    });
}

async function loadTrees() {
    if (trees.length > 0) return;
    const res = await fetch('gowanus_trees.json');
    const data = await res.json();

    data.forEach(t => {
        if (!t.lat || !t.lon || !isInsideGowanus(t.lat, t.lon)) return;

        // Create Three.js tree model (Trunk + Canopy)
        const treeGroup = new THREE.Group();
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.2, 1.2),
            new THREE.MeshPhongMaterial({ color: 0x4d2e1e })
        );
        const canopy = new THREE.Mesh(
            new THREE.SphereGeometry(1.2, 8, 8),
            new THREE.MeshPhongMaterial({ color: getTreeColor(t.species) })
        );
        canopy.position.y = 1.2;
        treeGroup.add(trunk);
        treeGroup.add(canopy);

        const treeObj = tb.Object3D({ obj: treeGroup, anchor: 'bottom' })
            .setCoords([t.lon, t.lat, 0]);

        treeObj.visible = false;
        tb.add(treeObj);
        trees.push(treeObj);
    });
}

// --- HELPERS ---
function getTreeColor(species) {
    const shades = ['#2d5a27', '#467c3a', '#386641', '#6a994e', '#a7c957'];
    let hash = 0;
    if (species) {
        for (let i = 0; i < species.length; i++) hash = species.charCodeAt(i) + ((hash << 5) - hash);
    }
    return shades[Math.abs(hash) % shades.length];
}

function toggleVisibility(array, state) {
    array.forEach(item => item.visible = state);
}

function animateRise(array) {
    array.forEach(item => {
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

// --- SCROLL INTERACTION ---
window.addEventListener('wheel', (e) => {
    if (isAnimating) return;
    
    if (e.deltaY > 0) currentStage = Math.min(currentStage + 1, 3);
    else currentStage = Math.max(currentStage - 1, 0);

    updateStage(currentStage);
}, { passive: true });
