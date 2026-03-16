// --- INITIALIZE MAP ---
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [-73.991, 40.675],
    zoom: 16,
    pitch: 60,
    bearing: -20,
    interactive: false // This prevents the map from stealing scroll focus
});

let tb; 
let currentStage = 0;
let isAnimating = false;
let buildings = [];

// --- ADD THREEJS LAYER ---
map.on('style.load', () => {
    map.addLayer({
        id: 'threejs-layer',
        type: 'custom',
        renderingMode: '3d',
        onAdd: function (map, gl) {
            // bridge MapLibre and Three.js
            window.tb = new Threebox(map, gl, { defaultLights: true });
        },
        render: function () {
            if (window.tb) window.tb.update();
        }
    });
});

// --- THE SCROLL SYSTEM ---
// This listens for any scroll on the page and triggers the 3D rise
window.addEventListener('wheel', (e) => {
    if (isAnimating) return; // Prevent spamming the scroll
    
    // deltaY > 0 means scroll down
    if (e.deltaY > 0 && currentStage === 0) {
        currentStage = 1;
        console.log("Moving to Stage 1: Rising Buildings");
        startExperience();
    } else if (e.deltaY < 0 && currentStage === 1) {
        currentStage = 0;
        console.log("Moving to Stage 0: Flattening Buildings");
        flattenBuildings();
    }
}, { passive: true });

async function startExperience() {
    isAnimating = true;
    
    // 1. Load Data if not already loaded
    if (buildings.length === 0) {
        await loadBuildings();
    }

    // 2. Animate the Z-Scale (Height) from 0 to 1
    animateHeight(1); 
    
    setTimeout(() => { isAnimating = false; }, 1000);
}

function flattenBuildings() {
    isAnimating = true;
    animateHeight(0.01); // Shrink back to ground
    setTimeout(() => { isAnimating = false; }, 1000);
}

// --- BUILDING LOADER ---
async function loadBuildings() {
    const res = await fetch('gowanus-buildings.geojson');
    const data = await res.json();

    data.features.forEach(f => {
        if (f.geometry.type !== 'Polygon') return;

        // Pull the height from your data ("13.2" -> 13.2)
        const h = parseFloat(f.properties.height) || 12;
        const coords = f.geometry.coordinates[0];

        // Create the 3D Mesh
        const meshOptions = { color: 0xdddddd, side: THREE.DoubleSide };
        const building = window.tb.utils.makeTriangulatedMesh(coords, h, meshOptions);
        
        // Start at height 0 (flat)
        building.scale.z = 0.01;
        
        window.tb.add(building);
        buildings.push(building);
    });
}

// --- ANIMATION ENGINE ---
function animateHeight(targetScale) {
    buildings.forEach(b => {
        let currentS = b.scale.z;
        const step = (targetScale - currentS) / 20;
        
        const counter = setInterval(() => {
            currentS += step;
            b.scale.z = currentS;
            
            // Stop when we hit the target
            if ((step > 0 && currentS >= targetScale) || (step < 0 && currentS <= targetScale)) {
                b.scale.z = targetScale;
                clearInterval(counter);
            }
        }, 30);
    });
}
