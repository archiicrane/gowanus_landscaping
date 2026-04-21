// site-plan-renderer.js
// Responsible for rendering the architectural site plan using Three.js

import { SitePlanStyle } from './site-plan-style.js';
import { drawArchitecturalTree } from './site-plan-trees.js';

export class SitePlanRenderer {
  constructor(canvas, data) {
    this.canvas = canvas;
    this.data = data;
    this.width = canvas.clientWidth;
    this.height = canvas.clientHeight;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(
      this.width / -2, this.width / 2, this.height / 2, this.height / -2, 0.1, 1000
    );
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(SitePlanStyle.paper);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.position.set(0, 0, 100);
    this.camera.lookAt(0, 0, 0);
    this.initLighting();
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
    // Draw ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this.width, this.height),
      new THREE.MeshBasicMaterial({ color: SitePlanStyle.grass })
    );
    ground.position.set(0, 0, -0.1);
    this.scene.add(ground);

    // Draw parks/planted areas (only polygons)
    this.data.parks.forEach(park => {
      // Only draw if coordinates are array of arrays (Polygon or MultiPolygon)
      if (Array.isArray(park.polygon) && Array.isArray(park.polygon[0]) && Array.isArray(park.polygon[0][0])) {
        // Polygon: [ [ [x, y], ... ] ]
        this.drawPolygon(park.polygon, SitePlanStyle.planted, 0.01);
      } else if (Array.isArray(park.polygon) && Array.isArray(park.polygon[0]) && typeof park.polygon[0][0] === 'number') {
        // MultiPolygon: [ [ [ [x, y], ... ] ], ... ]
        park.polygon.forEach(poly => {
          if (Array.isArray(poly) && Array.isArray(poly[0])) {
            this.drawPolygon([poly], SitePlanStyle.planted, 0.01);
          }
        });
      }
      // Skip LineString and other types
    });

    // Draw buildings
    this.data.buildings.forEach(bldg => {
      this.drawBuilding(bldg.geometry);
    });

    // Draw trees
    this.data.trees.forEach(tree => {
      drawArchitecturalTree(this.scene, tree, SitePlanStyle);
    });

    this.renderer.render(this.scene, this.camera);
  }

  drawPolygon(coords, color, z = 0) {
    coords.forEach(ring => {
      const shape = new THREE.Shape();
      ring.forEach(([x, y], i) => {
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
          const [x, y] = coord;
          if (typeof x !== 'number' || typeof y !== 'number') return;
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
