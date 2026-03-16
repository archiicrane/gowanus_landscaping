/**
 * REWILDING GOWANUS - THREE.JS FOCUS
 * This version uses Threebox to manually build 3D geometry from your GeoJSON.
 */

// 1. Setup Map
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [-73.991, 40.675],
    zoom: 16,
    pitch: 60,
    bearing: -20,
    interactive: false 
});

let tb;
let currentStage = 0;
let isAnimating = false;
let buildings = []; // Array to store our Three.js meshes

// 2. Initialize Threebox
map.on('style.load', () => {
    map.addLayer({
        id: 'custom-three-layer',
        type: 'custom',
        renderingMode: '3d',
        onAdd: function (map, gl) {
            tb = new Threebox(map, gl, { defaultLights: true });
            console.log("Threebox loaded. Ready for 3D.");
            // Pre-load data so it's ready for the scroll
            loadBuildings();
        },
        render: function () {
            tb.update();
        }
    });
});

// 3. The Data Loader & 3D Builder
async function loadBuildings() {
    try {
        console.log("Fetching GeoJSON...");
        const response = await fetch('gowanus-buildings.geojson');
        const data = await response.json();
        console.log("GeoJSON loaded. Building 3D objects...");

        data.features.forEach((feature, i) => {
            if (feature.geometry.type !== 'Polygon') return;

            // Height from your file: e.g., "13.2"
            const h = parseFloat(feature.properties.height) || 12;
            const coords = feature.geometry.coordinates[0];

            // Create Three.js Material (Architectural Gray)
            const material = new THREE.MeshPhongMaterial({ 
                color: 0xdddddd, 
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.9
            });

            // Use Threebox utility to create the extruded mesh from coordinates
            const mesh = tb.utils.makeTriangulatedMesh(coords, h, { material: material });
            
            // Start flat
            mesh.scale.z = 0.01;
            mesh.visible = true;

            tb.add(mesh);
            buildings.push(mesh);
        });
        console.log(`${buildings.length} buildings ready.`);
    } catch (e) {
        console.error("Error loading buildings:", e);
    }
}

// 4. The Scroll Interaction
window.addEventListener('wheel', (e) => {
    if (isAnimating) return;
    
    // Scroll Down -> Stage 1 (Rise)
    if (e.deltaY > 0 && currentStage === 0) {
        currentStage = 1;
        animateRise(1); // Rise to full height
    } 
    // Scroll Up -> Stage 0 (Flatten)
    else if (e.deltaY < 0 && currentStage === 1) {
        currentStage = 0;
        animateRise(0.01); // Flatten to ground
    }
}, { passive: true });

// 5. The Animation Engine
function animateRise(targetScale) {
    isAnimating = true;
    console.log("Animating buildings to scale:", targetScale);

    let completed = 0;
    buildings.forEach(mesh => {
        let currentS = mesh.scale.z;
        const step = (targetScale - currentS) / 20;

        const interval = setInterval(() => {
            currentS += step;
            mesh.scale.z = currentS;

            // Check if animation is finished for this building
            if (Math.abs(currentS - targetScale) < 0.02) {
                mesh.scale.z = targetScale;
                clearInterval(interval);
                completed++;
                
                // When all buildings finish, unlock the scroll
                if (completed >= buildings.length) {
                    isAnimating = false;
                }
            }
        }, 30);
    });
}