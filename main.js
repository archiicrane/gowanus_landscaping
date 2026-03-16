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

// Simple ray-casting algorithm for point-in-polygon filtering
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
    zoom: 15.8,
    pitch: 65,
    bearing: -15,
    interactive: false 
});

let tb;
let currentStage = 0;
let isScrolling = false;
const buildingLayers = [];
const treeLayers = [];

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

// --- STAGE LOGIC ---
window.addEventListener('wheel', (e) => {
    if (isScrolling) return;
    isScrolling = true;
    setTimeout(() => { isScrolling = false; }, 1000); // 1s debounce

    if (e.deltaY > 0 && currentStage < 3) currentStage++;
    else if (e.deltaY < 0 && currentStage > 0) currentStage--;

    handleStageTransition();
});

function handleStageTransition() {
    const title = document.getElementById('stage-title');
    const text = document.getElementById('stage-text');
    const stats = document.getElementById('stats-panel');

    switch(currentStage) {
        case 0:
            title.innerText = "Gowanus Canal";
            text.innerText = "The industrial heart of Brooklyn. Scroll to begin.";
            setLayerVisibility(buildingLayers, false);
            setLayerVisibility(treeLayers, false);
            stats.classList.remove('visible');
            break;
        case 1:
            title.innerText = "Existing Density";
            text.innerText = "Visualizing the building footprints and heights.";
            loadBuildings();
            setLayerVisibility(buildingLayers, true);
            setLayerVisibility(treeLayers, false);
            stats.classList.remove('visible');
            break;
        case 2:
            title.innerText = "The Urban Forest";
            text.innerText = "Mapping individual tree species and green spaces.";
            loadTrees();
            setLayerVisibility(buildingLayers, true);
            setLayerVisibility(treeLayers, true);
            stats.classList.remove('visible');
            break;
        case 3:
            title.innerText = "Impact Analysis";
            text.innerText = "Reviewing the environmental benefits of rewilding.";
            stats.classList.add('visible');
            break;
    }
}

function setLayerVisibility(layers, visible) {
    layers.forEach(l => l.visible = visible);
}

// --- 3D LOADERS ---
function loadBuildings() {
    if (buildingLayers.length > 0) return;
    fetch('gowanus-buildings.geojson')
        .then(res => res.json())
        .then(data => {
            data.features.forEach(f => {
                const height = parseFloat(f.properties.height || f.properties['building:levels'] * 3 || 10);
                const coords = f.geometry.coordinates[0];
                
                // Create Three.js extrusion
                const shape = new THREE.Shape();
                coords.forEach((p, i) => {
                    const xy = tb.utils.projectToWorld([p[0], p[1]]);
                    if (i === 0) shape.moveTo(xy.x, xy.y);
                    else shape.lineTo(xy.x, xy.y);
                });

                const mesh = tb.Object3D({
                    obj: new THREE.Mesh(
                        new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false }),
                        new THREE.MeshPhongMaterial({ color: 0xcccccc, transparent: true, opacity: 0.9 })
                    ),
                    anchor: 'bottom'
                });

                tb.add(mesh);
                buildingLayers.push(mesh);
            });
        });
}

function loadTrees() {
    if (treeLayers.length > 0) return;
    fetch('gowanus_trees.json')
        .then(res => res.json())
        .then(data => {
            data.forEach(t => {
                if (isInsideGowanus(t.lat, t.lon)) {
                    // Simple stylized tree: Cone + Cylinder
                    const treeGroup = new THREE.Group();
                    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1), new THREE.MeshPhongMaterial({color: 0x4d2e1e}));
                    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2, 8), new THREE.MeshPhongMaterial({color: getGreen(t.species)}));
                    canopy.position.y = 1.5;
                    treeGroup.add(trunk); treeGroup.add(canopy);

                    const obj = tb.Object3D({ obj: treeGroup, anchor: 'bottom' }).setCoords([t.lon, t.lat]);
                    tb.add(obj);
                    treeLayers.push(obj);
                }
            });
        });
}

function getGreen(species) {
    const greens = ['#2d5a27', '#467c3a', '#1e4620', '#6aa84f'];
    const index = species ? species.length % greens.length : 0;
    return greens[index];
}
