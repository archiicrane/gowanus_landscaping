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
      const res = await fetch('./models/footprints.geojson');
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
              './models/B_heights.gltf',
              (gltf) => {
                const bounds = new window.THREE.Box3().setFromObject(gltf.scene);
                if (!bounds.isEmpty()) {
                  const center = new window.THREE.Vector3();
                  bounds.getCenter(center);
                  const epsilon = 0.05;
                  gltf.scene.position.set(-center.x, -epsilon, -center.z);
                }
                gltf.scene.traverse((node) => {
                  if (!node.isMesh) return;
                  node.material = new window.THREE.MeshStandardMaterial({
                    color: 0xfacc15,
                    emissive: 0x5a4a00,
                    metalness: 0.04,
                    roughness: 0.8,
                    transparent: true,
                    opacity: 0.92
                  });
                });
                this.scene.add(gltf.scene);
              },
              undefined,
              (err) => { console.error('Failed to load B_heights.gltf:', err); }
            );
            this.renderer = new window.THREE.WebGLRenderer({
              canvas: mapInstance.getCanvas(),
              context: gl,
              antialias: true
            });
            this.renderer.autoClear = false;
          },
          render: function(gl, matrix) {
            modelTransform.translateZ = mercator.z;
            const rotationX = new window.THREE.Matrix4().makeRotationAxis(
              new window.THREE.Vector3(1, 0, 0), modelTransform.rotateX
            );
            const rotationY = new window.THREE.Matrix4().makeRotationAxis(
              new window.THREE.Vector3(0, 1, 0), modelTransform.rotateY
            );
            const rotationZ = new window.THREE.Matrix4().makeRotationAxis(
              new window.THREE.Vector3(0, 0, 1), modelTransform.rotateZ
            );
            const m = new window.THREE.Matrix4().fromArray(matrix);
            const l = new window.THREE.Matrix4()
              .makeTranslation(
                modelTransform.translateX,
                modelTransform.translateY,
                modelTransform.translateZ
              )
              .scale(new window.THREE.Vector3(modelTransform.scale, -modelTransform.scale, modelTransform.scale))
              .multiply(rotationX)
              .multiply(rotationY)
              .multiply(rotationZ);
            this.camera.projectionMatrix = m.multiply(l);
            this.renderer.resetState();
            this.renderer.render(this.scene, this.camera);
            map.triggerRepaint();
          }
        };
        map.addLayer(customLayer);
      }
    } catch (err) {
      console.error('[LAYERS] B_heights GLTF error:', err);
    }
  })();

      // --- Contour Lines Overlay (con_lines_gowanus_1ft.geojson) ---
      (async () => {
        try {
          const res = await fetch('./models/con_lines_gowanus_1ft.geojson');
          if (!res.ok) throw new Error(`con_lines_gowanus_1ft.geojson fetch failed: ${res.status} ${res.statusText}`);
          const contourData = await res.json();
          if (!map.getSource('contour-lines')) {
            map.addSource('contour-lines', { type: 'geojson', data: contourData });
          } else {
            map.getSource('contour-lines').setData(contourData);
          }
          if (!map.getLayer('contour-lines')) {
            map.addLayer({
              id: 'contour-lines',
              type: 'line',
              source: 'contour-lines',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': '#9ca3af',
                'line-width': [
                  'case',
                    ['==', ['%', ['round', ['get', 'ELEV']], 5], 0], 1.2,
                    0.72
                ],
                'line-opacity': 0.7
              }
            });
          }
        } catch (err) {
          console.error('[LAYERS] contour lines error:', err);
        }
      })();
    // --- Park Outline and Hatch Fill ---
    (async () => {
      try {
        // Load park outline and area
        const response = await fetch('./models/park.geojson');
        if (!response.ok) throw new Error(`Park outline fetch failed: ${response.status} ${response.statusText}`);
        const parkData = await response.json();
        const features = Array.isArray(parkData?.features) ? parkData.features : [];
        // Build polygons from lines
        const equalPoint = (a, b, eps = 1e-8) => (Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps);
        const closeEnough = (a, b, eps = 1e-6) => (Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps);
        const rings = [];
        let current = [];
        const finalizeCurrent = () => {
          if (current.length < 4) { current = []; return; }
          const first = current[0];
          const last = current[current.length - 1];
          if (!equalPoint(first, last)) {
            if (closeEnough(first, last)) {
              current.push([first[0], first[1]]);
            } else { current = []; return; }
          }
          rings.push(current); current = [];
        };
        for (const feature of features) {
          const coords = feature?.geometry?.type === 'LineString' ? feature.geometry.coordinates : [];
          if (coords.length < 2) continue;
          const a = [Number(coords[0][0]), Number(coords[0][1])];
          const b = [Number(coords[coords.length - 1][0]), Number(coords[coords.length - 1][1])];
          if (!current.length) { current = [a, b]; continue; }
          const tail = current[current.length - 1];
          if (equalPoint(tail, a)) { current.push(b); }
          else if (equalPoint(tail, b)) { current.push(a); }
          else { finalizeCurrent(); current = [a, b]; }
        }
        finalizeCurrent();
        const parkAreaFeatures = rings.map((ring, index) => ({
          type: 'Feature',
          properties: { name: `park-area-${index + 1}` },
          geometry: { type: 'Polygon', coordinates: [ring] }
        }));
        if (!map.getSource('park-outline')) {
          map.addSource('park-outline', { type: 'geojson', data: parkData });
        } else {
          map.getSource('park-outline').setData(parkData);
        }
        if (!map.getSource('park-area')) {
          map.addSource('park-area', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: parkAreaFeatures }
          });
        } else {
          map.getSource('park-area').setData({ type: 'FeatureCollection', features: parkAreaFeatures });
        }
        // Add hatch pattern
        if (!map.hasImage('park-hatch-red')) {
          const hatchCanvas = document.createElement('canvas');
          hatchCanvas.width = 24; hatchCanvas.height = 24;
          const ctx = hatchCanvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, 24, 24);
            ctx.strokeStyle = 'rgba(220,38,38,0.40)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-6, 24); ctx.lineTo(12, 6);
            ctx.moveTo(0, 30); ctx.lineTo(18, 12);
            ctx.moveTo(6, 36); ctx.lineTo(24, 18);
            ctx.stroke();
            map.addImage('park-hatch-red', ctx.getImageData(0, 0, 24, 24), { pixelRatio: 2 });
          }
        }
        if (!map.getLayer('park-hatch-fill')) {
          map.addLayer({
            id: 'park-hatch-fill',
            type: 'fill',
            source: 'park-area',
            layout: { visibility: 'visible' },
            paint: { 'fill-pattern': 'park-hatch-red', 'fill-opacity': 0.62 }
          });
        }
        if (!map.getLayer('park-outline')) {
          map.addLayer({
            id: 'park-outline',
            type: 'line',
            source: 'park-outline',
            layout: { visibility: 'visible', 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#dc2626',
              'line-width': [ 'interpolate', ['linear'], ['zoom'], 14, 1.6, 16, 2.6, 18, 3.9 ],
              'line-dasharray': [1.4, 1.1],
              'line-opacity': 0.96
            }
          });
        }
        map.setPaintProperty('park-hatch-fill', 'fill-pattern', 'park-hatch-red');
        map.setPaintProperty('park-hatch-fill', 'fill-opacity', 0.62);
        map.setPaintProperty('park-outline', 'line-color', '#dc2626');
        map.setPaintProperty('park-outline', 'line-width', [ 'interpolate', ['linear'], ['zoom'], 14, 1.6, 16, 2.6, 18, 3.9 ]);
        map.setPaintProperty('park-outline', 'line-dasharray', [1.4, 1.1]);
        map.setPaintProperty('park-outline', 'line-opacity', 0.96);
      } catch (err) {
        console.error('[LAYERS] Park outline error:', err);
      }
    })();
  // --- Hide default Mapbox labels, POIs, and color noise ---
  const style = map.getStyle();
  style.layers.forEach(layer => {
    if (!map.getLayer(layer.id)) return;
    if (layer.id === 'trees-layer') return;
    try {
      if (
        layer.type === 'symbol' ||
        layer.id.includes('label') ||
        layer.id.includes('poi') ||
        layer.id.includes('road-label') ||
        layer.id.includes('transit')
      ) {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      }
    } catch (e) {}
    try {
      if (layer.type === 'fill' && (layer.id.includes('landuse') || layer.id.includes('park'))) {
        map.setPaintProperty(layer.id, 'fill-color', '#f7f7f7');
        map.setPaintProperty(layer.id, 'fill-opacity', 1);
      }
    } catch (e) {}
    try {
      if (layer.id.includes('water')) {
        map.setPaintProperty(layer.id, 'fill-color', '#e6f0fa');
        map.setPaintProperty(layer.id, 'fill-opacity', 1);
      }
    } catch (e) {}
    try {
      if (layer.id.includes('building')) {
        map.setPaintProperty(layer.id, 'fill-color', '#e0e0e0');
        map.setPaintProperty(layer.id, 'fill-outline-color', '#bdbdbd');
        map.setPaintProperty(layer.id, 'fill-opacity', 1);
      }
    } catch (e) {}
    try {
      if (layer.type === 'line' && layer.id.includes('road')) {
        map.setPaintProperty(layer.id, 'line-color', '#f7f7f7');
        map.setPaintProperty(layer.id, 'line-width', 1.2);
        map.setPaintProperty(layer.id, 'line-opacity', 1);
      }
    } catch (e) {}
  });

  // --- Add custom architectural layers (buildings, roads, blocks) ---
  map.addSource('arch-buildings', {
    type: 'geojson',
    data: 'models/footprints.geojson'
  });
  map.addLayer({
    id: 'arch-buildings-fill',
    type: 'fill',
    source: 'arch-buildings',
    paint: {
      'fill-color': [
        'case',
          ['boolean', ['get', 'yellow'], false],
          '#b0b0b0',
          '#e0e0e0'
      ],
      'fill-opacity': 1
    }
  }, 'waterway-label');
  map.addLayer({
    id: 'arch-buildings-outline',
    type: 'line',
    source: 'arch-buildings',
    paint: {
      'line-color': '#bdbdbd',
      'line-width': 1.1
    }
  }, 'arch-buildings-fill');

  // --- Flood vulnerability layer ---
  map.addSource('flood-vulnerability', {
    type: 'geojson',
    data: 'data/flood-vulnerability.geojson'
  });
  map.addLayer({
    id: 'flood-vulnerability-fill',
    type: 'fill',
    source: 'flood-vulnerability',
    paint: {
      'fill-color': '#4fc3f7',
      'fill-opacity': 0.28
    },
    filter: ['within', { type: 'Polygon', coordinates: [window.STUDY_RING] }]
  }, 'arch-buildings-outline');

  // --- CSO Outfalls ---
  fetch('models/Citywide_Outfalls_20260416.geojson')
    .then(res => res.json())
    .then(citywideCSO => {
      const filtered = citywideCSO.features.filter(f => {
        if (!f.geometry || f.geometry.type !== 'Point') return false;
        return window.pointInStudyPolygon(f.geometry.coordinates);
      });
      const gowanusCSO = {
        type: 'FeatureCollection',
        features: filtered
      };
      map.addSource('cso-outfalls', {
        type: 'geojson',
        data: gowanusCSO
      });
      map.addLayer({
        id: 'cso-outfalls-circle',
        type: 'circle',
        source: 'cso-outfalls',
        paint: {
          'circle-radius': 7,
          'circle-color': '#ff9800',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
          'circle-opacity': 0.95
        }
      }, 'flood-vulnerability-fill');
    });
}
