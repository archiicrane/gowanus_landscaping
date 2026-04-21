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

    // Draw parks/planted areas
    this.data.parks.forEach(park => {
      this.drawPolygon(park.polygon, SitePlanStyle.planted, 0.01);
    });

    // Draw buildings
    this.data.buildings.forEach(bldg => {
      this.drawBuilding(bldg.polygon);
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

  drawBuilding(coords) {
    coords.forEach(ring => {
      const shape = new THREE.Shape();
      ring.forEach(([x, y], i) => {
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      });
      const extrudeSettings = {
        depth: SitePlanStyle.buildingExtrude,
        bevelEnabled: false
      };
      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      const material = new THREE.MeshLambertMaterial({
        color: SitePlanStyle.buildingTop,
        flatShading: true
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.z = 0.1;
      this.scene.add(mesh);
    });
  }
}
