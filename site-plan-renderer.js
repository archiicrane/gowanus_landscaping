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
    } else if (geom.type === 'LineString') {
      geom.coordinates.forEach(processCoord);
    } else if (geom.type === 'MultiLineString') {
      geom.coordinates.forEach(line => line.forEach(processCoord));
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
    this.contentGroup = new THREE.Group();
    this.scene.add(this.contentGroup);
    this.updateSizeAndCamera();
    this.drawScene();
    window.addEventListener('resize', () => this.handleResize());
  }

  initLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xb0b0b0, 0.32);
    dir.position.set(30, -60, 80);
    this.scene.add(dir);
  }

  updateSizeAndCamera() {
    // Get actual display size
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);

    // Compute bounds and transform
    const { minLon, minLat, maxLon, maxLat } = computeSiteBounds(this.data);
    _centerLon = (minLon + maxLon) / 2;
    _centerLat = (minLat + maxLat) / 2;
    const availableWidth = width - this.padding * 2;
    const availableHeight = height - this.padding * 2;
    const scaleX = availableWidth / Math.max(maxLon - minLon, 1e-9);
    const scaleY = availableHeight / Math.max(maxLat - minLat, 1e-9);
    _scale = Math.min(scaleX, scaleY) * 1.5; // boost scale

    // Compute site size in plan space
    const siteWidth = (maxLon - minLon) * _scale;
    const siteHeight = (maxLat - minLat) * _scale;
    const margin = 1.2;

    // Camera tightly frames the site
    if (!this.camera) {
      this.camera = new THREE.OrthographicCamera(
        -siteWidth / 2 * margin,
        siteWidth / 2 * margin,
        siteHeight / 2 * margin,
        -siteHeight / 2 * margin,
        -1000, 2000
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
    // Store for ground layer
    this._siteWidth = siteWidth;
    this._siteHeight = siteHeight;
  }

  handleResize() {
    this.updateSizeAndCamera();
    this.drawScene();
  }

  clearContent() {
    // Remove all children from contentGroup only (preserve lights)
    if (this.contentGroup) {
      while (this.contentGroup.children.length > 0) {
        this.contentGroup.remove(this.contentGroup.children[0]);
      }
    }
  }

  drawScene() {
    this.clearContent();

    // Add ground layer
    if (this._siteWidth && this._siteHeight) {
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(this._siteWidth * 2, this._siteHeight * 2),
        new THREE.MeshBasicMaterial({ color: SitePlanStyle.grass })
      );
      ground.position.z = -1;
      this.contentGroup.add(ground);
    }

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

    // Draw buildings (Polygon, MultiPolygon, LineString, MultiLineString)
    this.data.buildings.forEach(bldg => {
      const geom = bldg.geometry;
      if (!geom) return;
      if (geom.type === "Polygon" || geom.type === "MultiPolygon") {
        this.drawBuilding(geom);
      } else if (geom.type === "LineString" || geom.type === "MultiLineString") {
        this.drawLineString(geom, 0x888888, 0.2); // gray lines for buildings
      }
    });

    // Draw trees (use normalized positions, smaller and more transparent)
    this.data.trees.forEach(tree => {
      if (Array.isArray(tree.position)) {
        const [x, y] = projectLonLatToPlan(tree.position[0], tree.position[1]);
        drawArchitecturalTree(this.contentGroup, { ...tree, position: [x, y], _treeVisualScale: 0.5 }, SitePlanStyle);
      }
    });

    this.renderer.render(this.scene, this.camera);
  }

  drawPolygon(coords, color, z = 0) {
    if (!Array.isArray(coords) || coords.length === 0) return;
    // Outer ring and holes
    const shape = new THREE.Shape();
    coords[0].forEach(([lon, lat], i) => {
      if (typeof lon !== 'number' || typeof lat !== 'number') return;
      const [x, y] = projectLonLatToPlan(lon, lat);
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
    for (let i = 1; i < coords.length; i++) {
      const holePath = new THREE.Path();
      coords[i].forEach(([lon, lat], j) => {
        if (typeof lon !== 'number' || typeof lat !== 'number') return;
        const [x, y] = projectLonLatToPlan(lon, lat);
        if (j === 0) holePath.moveTo(x, y);
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
    if (geometry.type === 'LineString') {
      const points = geometry.coordinates
        .filter(coord => Array.isArray(coord) && coord.length >= 2)
        .map(([lon, lat]) => {
          const [x, y] = projectLonLatToPlan(lon, lat);
          return new THREE.Vector3(x, y, z);
        });
      if (points.length < 2) return;
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geo, material);
      this.contentGroup.add(line);
    } else if (geometry.type === 'MultiLineString') {
      geometry.coordinates.forEach(lineCoords => {
        const points = lineCoords
          .filter(coord => Array.isArray(coord) && coord.length >= 2)
          .map(([lon, lat]) => {
            const [x, y] = projectLonLatToPlan(lon, lat);
            return new THREE.Vector3(x, y, z);
          });
        if (points.length < 2) return;
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geo, material);
        this.contentGroup.add(line);
      });
    }
  }

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
      if (!Array.isArray(rings) || rings.length === 0) return;
      // Outer ring and holes
      const shape = new THREE.Shape();
      rings[0].forEach((coord, i) => {
        if (!Array.isArray(coord) || coord.length < 2) return;
        const [lon, lat] = coord;
        const [x, y] = projectLonLatToPlan(lon, lat);
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      });
      for (let i = 1; i < rings.length; i++) {
        const holePath = new THREE.Path();
        rings[i].forEach((coord, j) => {
          if (!Array.isArray(coord) || coord.length < 2) return;
          const [lon, lat] = coord;
          const [x, y] = projectLonLatToPlan(lon, lat);
          if (j === 0) holePath.moveTo(x, y);
          else holePath.lineTo(x, y);
        });
        shape.holes.push(holePath);
      }
      if (shape.getPoints().length < 3) return; // skip degenerate
      const extrudeSettings = {
        depth: SitePlanStyle.buildingExtrude * 3,
        bevelEnabled: false
      };
      const geometry3 = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      const material = new THREE.MeshLambertMaterial({
        color: SitePlanStyle.buildingTop,
        emissive: 0x111111,
        flatShading: true
      });
      const mesh = new THREE.Mesh(geometry3, material);
      mesh.position.z = 0.5;
      this.contentGroup.add(mesh);
      // Optionally add edge lines
      const edges = new THREE.EdgesGeometry(geometry3);
      const edgeLines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: SitePlanStyle.buildingEdge, linewidth: 1 }));
      edgeLines.position.copy(mesh.position);
      this.contentGroup.add(edgeLines);
    });
  }
}
