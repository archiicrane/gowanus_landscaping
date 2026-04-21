// site-plan-renderer.js
// Responsible for rendering the architectural site plan using Three.js


import { SitePlanStyle } from './site-plan-style.js';
import { drawArchitecturalTree } from './site-plan-trees.js';

// Helper: Compute bounds from all features (buildings, parks, trees)
function computeSiteBounds(data) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  // Helper to process a coordinate array
  function processCoord(coord) {
    if (!Array.isArray(coord) || coord.length < 2) return;
    const [lon, lat] = coord;
    if (typeof lon !== 'number' || typeof lat !== 'number') return;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  // Buildings
  data.buildings.forEach(bldg => {
    const geom = bldg.geometry;
    if (!geom || !geom.coordinates) return;
    if (geom.type === 'Polygon') {
      geom.coordinates.forEach(ring => ring.forEach(processCoord));
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach(poly => poly.forEach(ring => ring.forEach(processCoord)));
    }
  });
  // Parks
  data.parks.forEach(park => {
    if (!park.polygon) return;
    park.polygon.forEach(ring => ring.forEach(processCoord));
  });
  // Trees
  data.trees.forEach(tree => {
    if (Array.isArray(tree.position)) processCoord(tree.position);
  });
  return { minLon, minLat, maxLon, maxLat };
}

// Helper: Project lon/lat to plan coordinates
function projectLonLatToPlan(lon, lat, bounds, width, height, padding) {
  // Compute scale and offsets
  const siteWidth = bounds.maxLon - bounds.minLon;
  const siteHeight = bounds.maxLat - bounds.minLat;
  // Add padding (in screen units)
  const padX = padding;
  const padY = padding;
  const drawWidth = width - 2 * padX;
  const drawHeight = height - 2 * padY;
  // Preserve aspect ratio
  const scaleX = drawWidth / siteWidth;
  const scaleY = drawHeight / siteHeight;
  const scale = Math.min(scaleX, scaleY);
  // Centering offset
  const offsetX = padX + (drawWidth - siteWidth * scale) / 2;
  const offsetY = padY + (drawHeight - siteHeight * scale) / 2;
  // Flip Y so north is up
  const x = offsetX + (lon - bounds.minLon) * scale;
  const y = offsetY + (bounds.maxLat - lat) * scale;
  return [x, y];
}

export class SitePlanRenderer {
  constructor(canvas, data) {
    this.canvas = canvas;
    this.data = data;
    this.padding = 40; // px padding around site
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(SitePlanStyle.paper);
    this.initLighting();
    // Initial setup
    this.updateSizeAndCamera();
    this.drawScene();
    // Handle resize
    window.addEventListener('resize', () => {
      this.updateSizeAndCamera();
      this.drawScene();
    });
  }

  updateSizeAndCamera() {
    // Always use actual pixel size
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    // Compute bounds from all geometry
    this.bounds = computeSiteBounds(this.data);
    // Compute plan-space size
    const siteWidth = this.bounds.maxLon - this.bounds.minLon;
    const siteHeight = this.bounds.maxLat - this.bounds.minLat;
    // Compute scale to fit site in viewport
    const drawWidth = this.width - 2 * this.padding;
    const drawHeight = this.height - 2 * this.padding;
    const scaleX = drawWidth / siteWidth;
    const scaleY = drawHeight / siteHeight;
    this.planScale = Math.min(scaleX, scaleY);
    // Camera setup: fit the normalized site plan
    if (!this.camera) {
      this.camera = new THREE.OrthographicCamera(0, this.width, this.height, 0, 0.1, 1000);
    } else {
      this.camera.left = 0;
      this.camera.right = this.width;
      this.camera.top = this.height;
      this.camera.bottom = 0;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.set(this.width / 2, this.height / 2, 100);
    this.camera.lookAt(this.width / 2, this.height / 2, 0);
    this.renderer.setSize(this.width, this.height, false);
    // Debug
    console.log('Site bounds:', this.bounds, 'Canvas:', this.width, this.height, 'Scale:', this.planScale);
  }

  handleResize() {
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.camera.left = 0;
    this.camera.right = this.width;
    this.camera.top = this.height;
    this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
    this.drawScene();
  }

  initLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xb0b0b0, 0.32);
    dir.position.set(30, -60, 80);
    this.scene.add(dir);
  }

  drawScene() {
    // Clear scene
    while(this.scene.children.length > 0){ this.scene.remove(this.scene.children[0]); }
    // Draw ground (site bounds rectangle for debug)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this.width, this.height),
      new THREE.MeshBasicMaterial({ color: SitePlanStyle.grass })
    );
    ground.position.set(this.width/2, this.height/2, -0.1);
    this.scene.add(ground);

    // Debug: draw site bounds rectangle
    const rectGeom = new THREE.PlaneGeometry(
      (this.bounds.maxLon - this.bounds.minLon) * this.planScale,
      (this.bounds.maxLat - this.bounds.minLat) * this.planScale
    );
    const rectMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, opacity: 0.5, transparent: true });
    const rectMesh = new THREE.Mesh(rectGeom, rectMat);
    rectMesh.position.set(
      this.padding + ((this.bounds.maxLon - this.bounds.minLon) * this.planScale) / 2,
      this.padding + ((this.bounds.maxLat - this.bounds.minLat) * this.planScale) / 2,
      0.2
    );
    this.scene.add(rectMesh);

    // Draw parks/planted areas (only polygons)
    this.data.parks.forEach(park => {
      if (Array.isArray(park.polygon) && Array.isArray(park.polygon[0]) && Array.isArray(park.polygon[0][0])) {
        // Polygon: [ [ [lon, lat], ... ] ]
        this.drawPolygon(park.polygon, SitePlanStyle.planted, 0.01);
      } else if (Array.isArray(park.polygon) && Array.isArray(park.polygon[0]) && typeof park.polygon[0][0] === 'number') {
        // MultiPolygon: [ [ [ [lon, lat], ... ] ], ... ]
        park.polygon.forEach(poly => {
          if (Array.isArray(poly) && Array.isArray(poly[0])) {
            this.drawPolygon([poly], SitePlanStyle.planted, 0.01);
          }
        });
      }
    });

    // Draw buildings (only Polygon or MultiPolygon)
    this.data.buildings.forEach(bldg => {
      const geom = bldg.geometry;
      if (geom && (geom.type === "Polygon" || geom.type === "MultiPolygon")) {
        this.drawBuilding(geom);
      }
    });

    // Draw trees (use normalized positions)
    this.data.trees.forEach(tree => {
      if (Array.isArray(tree.position)) {
        const [x, y] = projectLonLatToPlan(tree.position[0], tree.position[1], this.bounds, this.width, this.height, this.padding);
        drawArchitecturalTree(this.scene, { ...tree, position: [x, y] }, SitePlanStyle);
      }
    });

    // Debug: center marker
    const centerGeom = new THREE.CircleGeometry(5, 24);
    const centerMat = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const center = new THREE.Mesh(centerGeom, centerMat);
    center.position.set(this.width/2, this.height/2, 2);
    this.scene.add(center);

    // Log feature counts
    console.log('Buildings:', this.data.buildings.length, 'Parks:', this.data.parks.length, 'Trees:', this.data.trees.length);

    this.renderer.render(this.scene, this.camera);
  }

  drawPolygon(coords, color, z = 0) {
    coords.forEach(ring => {
      const shape = new THREE.Shape();
      ring.forEach(([lon, lat], i) => {
        const [x, y] = projectLonLatToPlan(lon, lat, this.bounds, this.width, this.height, this.padding);
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      });
      const geometry = new THREE.ShapeGeometry(shape);
      const material = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.z = z;
      this.scene.add(mesh);
    });
  }

  // Helper to normalize Polygon/MultiPolygon
  getPolygonRings(geometry) {
    if (!geometry || !geometry.type || !geometry.coordinates) return [];
    if (geometry.type === "Polygon") {
      return [geometry.coordinates];
    }
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates;
    }
    console.warn("Unsupported geometry type:", geometry.type, geometry);
    return [];
  }

  drawBuilding(geometry) {
    const polygons = this.getPolygonRings(geometry);
    polygons.forEach(rings => {
      rings.forEach(ring => {
        if (!Array.isArray(ring)) return;
        const shape = new THREE.Shape();
        ring.forEach((coord, i) => {
          if (!Array.isArray(coord) || coord.length < 2) return;
          const [lon, lat] = coord;
          const [x, y] = projectLonLatToPlan(lon, lat, this.bounds, this.width, this.height, this.padding);
          if (i === 0) shape.moveTo(x, y);
          else shape.lineTo(x, y);
        });
        const extrudeSettings = {
          depth: SitePlanStyle.buildingExtrude,
          bevelEnabled: false
        };
        const geometry3 = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const material = new THREE.MeshLambertMaterial({
          color: SitePlanStyle.buildingTop,
          flatShading: true
        });
        const mesh = new THREE.Mesh(geometry3, material);
        mesh.position.z = 0.1;
        this.scene.add(mesh);
      });
    });
  }
}
