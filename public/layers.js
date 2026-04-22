// layers.js - All map overlays and sources

// --- Ensure STUDY_RING and pointInStudyPolygon are defined on window ---
if (!window.STUDY_RING) {
  // Coordinates from main_pre_split_utf8.js (lng, lat pairs)
  window.STUDY_RING = [
    [-73.98963594611494, 40.683945676183654],
    [-73.98084416376932, 40.680669969224006],
    [-73.98368161027763, 40.67628724578089],
    [-73.99274143083169, 40.665495232798115],
    [-73.99607305804426, 40.667988596328655],
    [-73.99889524234268, 40.67260255106102],
    [-73.9964465299067, 40.67744610487334],
    [-73.99461997552936, 40.67663528353369],
    [-73.98963594611494, 40.683945676183654]
  ];
}

if (!window.pointInStudyPolygon) {
  window.pointInStudyPolygon = function(point) {
    const x = point[0];
    const y = point[1];
    const ring = window.STUDY_RING;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersects = ((yi > y) !== (yj > y)) &&
        (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  };
}

export function setupMapLayers(map) {
  // --- Add B_heights GLTF 3D Model using Three.js ---
  (async () => {
    // Wait for map to load and Three.js to be available
    if (!window.THREE || !window.THREE.GLTFLoader) {
      console.warn('Three.js or GLTFLoader not available; B_heights model skipped.');
      return;
    }
    // Find anchor point: use centroid of footprints.geojson as in old main.js
    try {
      const res = await fetch('/models/footprints.geojson');
      if (!res.ok) throw new Error('Failed to load footprints.geojson');
      const data = await res.json();
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      for (const feature of data.features || []) {
        const geom = feature?.geometry;
        if (!geom) continue;
        const lines = geom.type === 'LineString' ? [geom.coordinates || []] : (geom.type === 'MultiLineString' ? (geom.coordinates || []) : []);
        for (const line of lines) {
          for (const coord of line) {
            if (!Array.isArray(coord) || coord.length < 2) continue;
            const lng = coord[0];
            const lat = coord[1];
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          }
        }
      }
      if (!Number.isFinite(minLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLng) || !Number.isFinite(maxLat)) return;
      const anchorLngLat = [(minLng + maxLng) * 0.5, (minLat + maxLat) * 0.5];
      // Add the custom Three.js layer
      if (!map.getLayer('b-heights-model')) {
        const mercator = mapboxgl.MercatorCoordinate.fromLngLat(anchorLngLat, 0);
        const meterInMercator = mercator.meterInMercatorCoordinateUnits();
        const modelTransform = {
          translateX: mercator.x,
          translateY: mercator.y,
          translateZ: mercator.z,
          rotateX: Math.PI / 2,
          rotateY: 0,
          rotateZ: 0,
          scale: meterInMercator
        };
        const customLayer = {
          id: 'b-heights-model',
          type: 'custom',
          renderingMode: '3d',
          onAdd: function(mapInstance, gl) {
            this.camera = new window.THREE.Camera();
            this.scene = new window.THREE.Scene();
            this.scene.add(new window.THREE.AmbientLight(0xffffff, 0.78));
            const directional = new window.THREE.DirectionalLight(0xffffff, 0.68);
            directional.position.set(40, -80, 120).normalize();
            this.scene.add(directional);
            const loader = new window.THREE.GLTFLoader();
            loader.load(
              '/models/B_heights.gltf',
              (gltf) => {
                const bounds = new window.THREE.Box3().setFromObject(gltf.scene);
                if (!bounds.isEmpty()) {
                  const center = new window.THREE.Vector3();
                  bounds.getCenter(center);
                  const epsilon = 0.05;