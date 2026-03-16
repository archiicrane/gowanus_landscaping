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
    pitch: 60, // Isometric-like tilt
    bearing: -20,
    interactive: false 
});

window.tb = null;
let currentStage = 0;
let isScrolling = false;
const buildings = [];
const trees = [];

map.on('style.load', () => {
    map.addLayer({
        id: 'custom-threebox-layer',
        type: 'custom',
        renderingMode: '3d',
        onAdd: function (map, gl) {
            // CRITICAL: Initialize Threebox with the map and gl context
            window.tb = new Threebox(map, gl, { defaultLights: true });
        },
        render: function () {
            if (window.tb) window.tb.update();
        }
    });
});

// --- SCROLL INTERACTION ---
window.addEventListener('wheel', (e) => {
    if (isScrolling) return;
    isScrolling = true;
    setTimeout(() => { isScrolling = false; }, 800);

    if (e.deltaY > 0 && currentStage < 3) currentStage++;
    else if (e.deltaY < 0 && currentStage > 0) currentStage--;

    updateExperience();
}, { passive: true });

function updateExperience() {
    document.getElementById('stats-panel').classList.toggle('visible', currentStage === 3);
    
    if (currentStage >= 1) loadBuildings();
    if (currentStage >= 2) loadTrees();

    // Toggle visibility based on stage
    buildings.forEach(b => b.visible = (currentStage >= 1));
    trees.forEach(t => t.visible = (currentStage >= 2));
}

// --- 3D BUILDING GENERATION ---
function loadBuildings() {
    if (buildings.length > 0) return;

    fetch('gowanus-buildings.geojson')
        .then(res => res.json())
        .then(data => {
            data.features.forEach(feature => {
                if (feature.geometry.type !== 'Polygon') return;

                // 1. Convert height
                const h = parseFloat(feature.properties.height) || 15;
                const coords = feature.geometry.coordinates[0];

                // 2. Create the 3D Shape using Threebox utility
                // We use tb.utils.projectToWorld to convert GPS to Three.js units
                const shapePoints = coords.map(p => tb.utils.projectToWorld([p[0], p[1]]));
                const shape = new THREE.Shape(shapePoints);

                const geometry = new THREE.ExtrudeGeometry(shape, { 
                    depth: h, 
                    bevelEnabled: false 
                });
                
                const material = new THREE.MeshPhongMaterial({ color: 0xdddddd, side: THREE.DoubleSide });
                const mesh = new THREE.Mesh(geometry, material);
                
                // 3. Wrap in Threebox Object and add to map
                const obj = tb.Object3D({ obj: mesh, anchor: 'bottom' });
                // Use the first coordinate as the anchor point
                obj.setCoords([coords[0][0], coords[0][1], 0]);
                
                tb.add(obj);
                buildings.push(obj);
            });
        });
}

// --- 3D TREE GENERATION ---
function loadTrees() {
    if (trees.length > 0) return;

    fetch('gowanus_trees.json')
        .then(res => res.json())
        .then(data => {
            data.forEach(t => {
                if (!t.lat || !t.lon || !isInsideGowanus(t.lat, t.lon)) return;

                // Create a stylized tree (Trunk + Canopy)
                const treeGroup = new THREE.Group();
                const trunk = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.2, 0.2, 1.5),
                    new THREE.MeshPhongMaterial({ color: 0x4d2e1e })
                );
                const canopy = new THREE.Mesh(
                    new THREE.SphereGeometry(1.2, 8, 8),
                    new THREE.MeshPhongMaterial({ color: getSpeciesColor(t.species) })
                );
                canopy.position.y = 1.5;
                treeGroup.add(trunk);
                treeGroup.add(canopy);

                const treeObj = tb.Object3D({ obj: treeGroup, anchor: 'bottom' })
                    .setCoords([t.lon, t.lat, 0]);

                tb.add(treeObj);
                trees.push(treeObj);
            });
        });
}

function getSpeciesColor(species) {
    const palette = ['#2d5a27', '#467c3a', '#386641', '#6a994e', '#a7c957'];
    let hash = 0;
    if (species) {
        for (let i = 0; i < species.length; i++) hash = species.charCodeAt(i) + ((hash << 5) - hash);
    }
    return palette[Math.abs(hash) % palette.length];
}
