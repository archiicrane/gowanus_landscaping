// site-plan-renderer.js
// Responsible for rendering the architectural site plan using Three.js


import { SitePlanStyle } from './site-plan-style.js';
import { drawArchitecturalTree } from './site-plan-trees.js';


// Helper: Compute bounds from all features (buildings, parks, trees)
function computeSiteBounds(data) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
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

// Shared transform state
let _centerLon = 0, _centerLat = 0, _scale = 1;

// Helper: Project lon/lat to centered, scaled plan coordinates
function projectLonLatToPlan(lon, lat) {
  const x = (lon - _centerLon) * _scale;
  const y = (lat - _centerLat) * _scale;
  return [x, -y]; // flip Y
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
    const { minLon, minLat, maxLon, maxLat } = this.bounds;
    // Compute center
    _centerLon = (minLon + maxLon) / 2;
    _centerLat = (minLat + maxLat) / 2;
    // Compute scale to fit viewport with padding
    const siteWidth = maxLon - minLon;
    const siteHeight = maxLat - minLat;
    const scaleX = (this.width * 0.9) / siteWidth;
    const scaleY = (this.height * 0.9) / siteHeight;
    _scale = Math.min(scaleX, scaleY);
    // Camera setup: center at (0,0), fit viewport
    if (!this.camera) {
      this.camera = new THREE.OrthographicCamera(-this.width/2, this.width/2, this.height/2, -this.height/2, 0.1, 2000);
    } else {
      this.camera.left = -this.width/2;
      this.camera.right = this.width/2;
      this.camera.top = this.height/2;
      this.camera.bottom = -this.height/2;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.set(0, 0, 1000);
    this.camera.lookAt(0, 0, 0);
    this.renderer.setSize(this.width, this.height, false);
    // Debug
    console.log({ minLon, maxLon, minLat, maxLat, scale: _scale });
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

    // Draw parks/planted areas (only polygons)
    this.data.parks.forEach(park => {
      if (Array.isArray(park.polygon) && Array.isArray(park.polygon[0]) && Array.isArray(park.polygon[0][0])) {
        this.drawPolygon(park.polygon, SitePlanStyle.planted, 0.01);
      } else if (Array.isArray(park.polygon) && Array.isArray(park.polygon[0]) && typeof park.polygon[0][0] === 'number') {
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
        const [x, y] = projectLonLatToPlan(tree.position[0], tree.position[1]);
        drawArchitecturalTree(this.scene, { ...tree, position: [x, y] }, SitePlanStyle);
      }
    });

    // Debug: center marker
    const centerGeom = new THREE.CircleGeometry(8, 24);
    const centerMat = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const center = new THREE.Mesh(centerGeom, centerMat);
    center.position.set(0, 0, 2);
    this.scene.add(center);

    // Log feature counts
    console.log('Buildings:', this.data.buildings.length, 'Parks:', this.data.parks.length, 'Trees:', this.data.trees.length);

    this.renderer.render(this.scene, this.camera);
  }

  drawPolygon(coords, color, z = 0) {
    coords.forEach(ring => {
      const shape = new THREE.Shape();
      ring.forEach(([lon, lat], i) => {
        const [x, y] = projectLonLatToPlan(lon, lat);
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
          const [x, y] = projectLonLatToPlan(lon, lat);
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
