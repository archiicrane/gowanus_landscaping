// site-plan-renderer.js
// Responsible for rendering the architectural site plan using Three.js

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { SitePlanStyle } from './site-plan-style.js';
import { drawArchitecturalTree } from './site-plan-trees.js';

function computeSiteBounds(data) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  function processCoord(coord) {
    if (!Array.isArray(coord) || coord.length < 2) return;
    const [lon, lat] = coord;
    if (typeof lon !== 'number' || typeof lat !== 'number') return;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  data.buildings.forEach((building) => {
    const geometry = building.geometry;
    if (!geometry || !geometry.coordinates) return;
    if (geometry.type === 'Polygon') {
      geometry.coordinates.forEach((ring) => ring.forEach(processCoord));
    } else if (geometry.type === 'MultiPolygon') {
      geometry.coordinates.forEach((polygon) => polygon.forEach((ring) => ring.forEach(processCoord)));
    } else if (geometry.type === 'LineString') {
      geometry.coordinates.forEach(processCoord);
    } else if (geometry.type === 'MultiLineString') {
      geometry.coordinates.forEach((line) => line.forEach(processCoord));
    }
  });

  data.parks.forEach((park) => {
    if (!park.polygon) return;
    park.polygon.forEach((ring) => ring.forEach(processCoord));
  });

  data.trees.forEach((tree) => {
    if (Array.isArray(tree.position)) processCoord(tree.position);
  });

  return { minLon, minLat, maxLon, maxLat };
}

let centerLon = 0;
let centerLat = 0;
let scale = 1;

function projectLonLatToPlan(lon, lat) {
  const x = (lon - centerLon) * scale;
  const y = (lat - centerLat) * scale;
  return [x, -y];
}

export class SitePlanRenderer {
  constructor(canvas, data) {
    this.canvas = canvas;
    this.data = data;
    this.padding = 20;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(SitePlanStyle.paper);
    this.initLighting();
    this.contentGroup = new THREE.Group();
    this.scene.add(this.contentGroup);
    this.updateSizeAndCamera();
    this.drawScene();
    window.addEventListener('resize', () => this.handleResize());
  }

  initLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xb0b0b0, 0.32);
    directional.position.set(30, -60, 80);
    this.scene.add(directional);
  }

  updateSizeAndCamera() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);

    const { minLon, minLat, maxLon, maxLat } = computeSiteBounds(this.data);
    centerLon = (minLon + maxLon) / 2;
    centerLat = (minLat + maxLat) / 2;
    const availableWidth = width - this.padding * 2;
    const availableHeight = height - this.padding * 2;
    const scaleX = availableWidth / Math.max(maxLon - minLon, 1e-9);
    const scaleY = availableHeight / Math.max(maxLat - minLat, 1e-9);
    scale = Math.min(scaleX, scaleY) * 1.3;

    const siteWidth = (maxLon - minLon) * scale;
    const siteHeight = (maxLat - minLat) * scale;
    const margin = 1.15;

    if (!this.camera) {
      this.camera = new THREE.OrthographicCamera(
        -siteWidth / 2 * margin,
        siteWidth / 2 * margin,
        siteHeight / 2 * margin,
        -siteHeight / 2 * margin,
        -1000,
        2000
      );
    } else {
      this.camera.left = -siteWidth / 2 * margin;
      this.camera.right = siteWidth / 2 * margin;
      this.camera.top = siteHeight / 2 * margin;
      this.camera.bottom = -siteHeight / 2 * margin;
      this.camera.near = -1000;
      this.camera.far = 2000;
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.set(0, 0, 1000);
    this.camera.lookAt(0, 0, 0);
    this.siteWidth = siteWidth;
    this.siteHeight = siteHeight;
  }

  handleResize() {
    this.updateSizeAndCamera();
    this.drawScene();
  }

  clearContent() {
    while (this.contentGroup.children.length > 0) {
      this.contentGroup.remove(this.contentGroup.children[0]);
    }
  }

  drawScene() {
    this.clearContent();

    if (this.siteWidth && this.siteHeight) {
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(this.siteWidth * 2, this.siteHeight * 2),
        new THREE.MeshBasicMaterial({ color: SitePlanStyle.grass })
      );
      ground.position.z = -1;
      this.contentGroup.add(ground);
    }

    this.data.parks.forEach((park) => {
      if (Array.isArray(park.polygon) && Array.isArray(park.polygon[0]) && Array.isArray(park.polygon[0][0])) {
        this.drawPolygon(park.polygon, SitePlanStyle.planted, 0.01);
      }
    });

    this.data.roads.forEach((road) => {
      const geometry = road.geometry;
      if (!geometry) return;
      if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
        this.drawPolygon(geometry.coordinates, SitePlanStyle.roadFill, 0.02);
      } else if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
        this.drawLineString(geometry, SitePlanStyle.roadLine, 2.5);
      }
    });

    this.data.sidewalks.forEach((sidewalk) => {
      const geometry = sidewalk.geometry;
      if (!geometry) return;
      if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
        this.drawPolygon(geometry.coordinates, SitePlanStyle.sidewalkFill, 0.03);
      } else if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
        this.drawLineString(geometry, SitePlanStyle.sidewalkLine, 1.5);
      }
    });

    this.data.hardscape.forEach((hardscape) => {
      const geometry = hardscape.geometry;
      if (!geometry) return;
      if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
        this.drawPolygon(geometry.coordinates, SitePlanStyle.hardscapeFill, 0.04);
      } else if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
        this.drawLineString(geometry, SitePlanStyle.hardscapeLine, 1.2);
      }
    });

    this.data.buildings.forEach((building) => {
      const geometry = building.geometry;
      if (!geometry) return;
      if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
        this.drawBuilding(geometry);
      } else if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
        this.drawLineString(geometry, 0x888888, 0.2);
      }
    });

    this.data.trees.forEach((tree) => {
      if (!Array.isArray(tree.position)) return;
      const [x, y] = projectLonLatToPlan(tree.position[0], tree.position[1]);
      drawArchitecturalTree(this.contentGroup, { ...tree, position: [x, y], _treeVisualScale: 0.5 }, SitePlanStyle);
    });

    this.renderer.render(this.scene, this.camera);
  }

  drawPolygon(coords, color, z = 0) {
    if (!Array.isArray(coords) || coords.length === 0) return;
    const shape = new THREE.Shape();
    coords[0].forEach(([lon, lat], index) => {
      if (typeof lon !== 'number' || typeof lat !== 'number') return;
      const [x, y] = projectLonLatToPlan(lon, lat);
      if (index === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });

    for (let holeIndex = 1; holeIndex < coords.length; holeIndex += 1) {
      const holePath = new THREE.Path();
      coords[holeIndex].forEach(([lon, lat], pointIndex) => {
        if (typeof lon !== 'number' || typeof lat !== 'number') return;
        const [x, y] = projectLonLatToPlan(lon, lat);
        if (pointIndex === 0) holePath.moveTo(x, y);
        else holePath.lineTo(x, y);
      });
      shape.holes.push(holePath);
    }

    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = z;
    this.contentGroup.add(mesh);
  }

  drawLineString(geometry, color = 0x888888, z = 0.2) {
    if (!geometry || !geometry.type || !geometry.coordinates) return;
    const material = new THREE.LineBasicMaterial({ color, linewidth: 2 });

    const drawPoints = (coordinates) => {
      const points = coordinates
        .filter((coord) => Array.isArray(coord) && coord.length >= 2)
        .map(([lon, lat]) => {
          const [x, y] = projectLonLatToPlan(lon, lat);
          return new THREE.Vector3(x, y, z);
        });
      if (points.length < 2) return;
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(lineGeometry, material);
      this.contentGroup.add(line);
    };

    if (geometry.type === 'LineString') {
      drawPoints(geometry.coordinates);
    } else if (geometry.type === 'MultiLineString') {
      geometry.coordinates.forEach(drawPoints);
    }
  }

  getPolygonRings(geometry) {
    if (!geometry || !geometry.type || !geometry.coordinates) return [];
    if (geometry.type === 'Polygon') return [geometry.coordinates];
    if (geometry.type === 'MultiPolygon') return geometry.coordinates;
    return [];
  }

  drawBuilding(geometry) {
    const polygons = this.getPolygonRings(geometry);
    polygons.forEach((rings) => {
      if (!Array.isArray(rings) || rings.length === 0) return;
      const shape = new THREE.Shape();
      rings[0].forEach((coord, index) => {
        if (!Array.isArray(coord) || coord.length < 2) return;
        const [lon, lat] = coord;
        const [x, y] = projectLonLatToPlan(lon, lat);
        if (index === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      });

      for (let holeIndex = 1; holeIndex < rings.length; holeIndex += 1) {
        const holePath = new THREE.Path();
        rings[holeIndex].forEach((coord, pointIndex) => {
          if (!Array.isArray(coord) || coord.length < 2) return;
          const [lon, lat] = coord;
          const [x, y] = projectLonLatToPlan(lon, lat);
          if (pointIndex === 0) holePath.moveTo(x, y);
          else holePath.lineTo(x, y);
        });
        shape.holes.push(holePath);
      }

      if (shape.getPoints().length < 3) return;
      const geometry3d = new THREE.ExtrudeGeometry(shape, {
        depth: SitePlanStyle.buildingExtrude * 3,
        bevelEnabled: false
      });
      const material = new THREE.MeshLambertMaterial({
        color: SitePlanStyle.buildingTop,
        emissive: 0x111111,
        flatShading: true
      });
      const mesh = new THREE.Mesh(geometry3d, material);
      mesh.position.z = 0.5;
      this.contentGroup.add(mesh);

      const edges = new THREE.EdgesGeometry(geometry3d);
      const edgeLines = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: SitePlanStyle.buildingEdge, linewidth: 1 })
      );
      edgeLines.position.copy(mesh.position);
      this.contentGroup.add(edgeLines);
    });
  }
}
