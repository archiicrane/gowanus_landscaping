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

let tb; 
let currentStage = 0;
let isAnimating = false;
let buildings = [];

// --- ADD THREEBOX LAYER ---
map.on('style.load', () => {
    map.addLayer({
        id: 'threejs-layer',
        type: 'custom',
        renderingMode: '3d',
        onAdd: function (map, gl) {
            // bridge MapLibre and Three.js
            window.tb = new Threebox(map, gl, { defaultLights: true });
            console.log("SUCCESS: Threebox bridge initialized.");
        },
        render: function () {
            if (window.tb) window.tb.update();
        }
    });
});

// --- THE SCROLL SYSTEM ---
window.addEventListener('wheel', (e) => {
    if (isAnimating) return;
    
    if (e.deltaY > 0 && currentStage === 0) {
        currentStage = 1;
        console.log("SCROLL: Starting building extrusion...");
        triggerRise();
    } else if (e.deltaY < 0 && currentStage === 1) {
        currentStage = 0;
        console.log("SCROLL: Flattening buildings...");
        triggerFlatten();
    }
}, { passive: true });

async function triggerRise() {
    isAnimating = true;
    if (buildings.length === 0) await loadBuildings();
    animateHeight(1); 
    setTimeout(() => { isAnimating = false; }, 1200);
}

function triggerFlatten() {
    isAnimating = true;
    animateHeight(0.01);
    setTimeout(() => { isAnimating = false; }, 1200);
}

// --- BUILDING LOADER ---
async function loadBuildings() {
    console.log("DATA: Fetching GeoJSON...");
    const res = await fetch('gowanus-buildings.geojson');
    const data = await res.json();
    console.log(`DATA: Found ${data.features.length} features.`);

    data.features.forEach((f, index) => {
        if (f.geometry.type !== 'Polygon') return;

        // Parse height: "13.2" -> 13.2 
        const h = parseFloat(f.properties.height) || 12;
        const coords = f.geometry.coordinates[0];

        // Create the 3D Mesh using the Threebox helper
        const meshOptions = { 
            color: 0xdddddd, 
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9 
        };

        try {
            // This helper turns Lat/Lon polygons into real Three.js geometry
            const building = window.tb.utils.makeTriangulatedMesh(coords, h, meshOptions);
            
            // Set starting scale to essentially 0
            building.scale.z = 0.01;
            
            window.tb.add(building);
            buildings.push(building);
        } catch (err) {
            if (index < 5) console.error("GEOMETRY ERROR:", err);
        }
    });
    console.log(`SUCCESS: ${buildings.length} 3D buildings added to scene.`);
}

// --- ANIMATION ENGINE ---
function animateHeight(targetScale) {
    buildings.forEach(b => {
        let currentS = b.scale.z;
        // Faster, smoother step
        const step = (targetScale - currentS) / 15;
        
        const counter = setInterval(() => {
            currentS += step;
            b.scale.z = currentS;
            
            // Check if we reached the target
            if (Math.abs(currentS - targetScale) < 0.01) {
                b.scale.z = targetScale;
                clearInterval(counter);
            }
        }, 25);
    });
}