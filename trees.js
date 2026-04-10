console.log('trees.js loaded');

// 3-D OBJ tree renderer using Three.js InstancedMesh custom Mapbox layer.
// Requires (loaded before this file in index.html):
//   three@0.134.0/build/three.min.js
//   three@0.134.0/examples/js/loaders/OBJLoader.js

const _TREE_ORIGIN_LNGLAT = [-73.9895, 40.6745];

window.TreeRenderer = (function () {
  var _visible = false;

  return {
    initTrees: async function (map) {
      try {
        // 1. Tree point data
        var treeRes = await fetch('./data/gowanus_trees.json');
        if (!treeRes.ok) throw new Error('Trees fetch failed: ' + treeRes.status);
        var trees = JSON.parse((await treeRes.text()).replace(/\bNaN\b/g, 'null'))
          .filter(function (t) { return t.lat != null && t.lon != null; })
          .map(function (t) { return { lng: +t.lon, lat: +t.lat }; });

        // 2. OBJ model
        var objRes = await fetch('./models/Tree%20low.obj');
        if (!objRes.ok) throw new Error('OBJ fetch failed: ' + objRes.status);
        var objText = await objRes.text();

        // 3. Mercator reference (scene origin)
        var originMerc = mapboxgl.MercatorCoordinate.fromLngLat(_TREE_ORIGIN_LNGLAT, 0);
        var mScale = originMerc.meterInMercatorCoordinateUnits();

        // Clean up any previous layers
        if (map.getLayer('trees-3d-layer')) map.removeLayer('trees-3d-layer');
        if (map.getLayer('trees-layer'))    map.removeLayer('trees-layer');
        if (map.getSource('trees'))         map.removeSource('trees');

        var layer = {
          id: 'trees-3d-layer',
          type: 'custom',
          renderingMode: '3d',

          onAdd: function (theMap, gl) {
            this._scene    = new THREE.Scene();
            this._camera   = new THREE.Camera();
            this._renderer = new THREE.WebGLRenderer({ canvas: theMap.getCanvas(), context: gl, antialias: true });
            this._renderer.autoClear = false;

            this._scene.add(new THREE.AmbientLight(0xffffff, 0.60));
            var sun = new THREE.DirectionalLight(0xfff8e7, 1.0);
            sun.position.set(1, 2, 1).normalize();
            this._scene.add(sun);
            var sky = new THREE.DirectionalLight(0x99ccff, 0.35);
            sky.position.set(-1, 0.5, -1).normalize();
            this._scene.add(sky);

            var loader  = new THREE.OBJLoader();
            var objRoot = loader.parse(objText);
            objRoot.updateWorldMatrix(true, true);

            var templates = [];
            objRoot.traverse(function (child) {
              if (!child.isMesh) return;
              var name = ((child.parent ? child.parent.name : '') || child.name || '').toLowerCase();
              var geo = child.geometry.clone();
              geo.applyMatrix4(child.matrixWorld);
              if (!geo.attributes.normal) geo.computeVertexNormals();
              templates.push({ geo: geo, color: name.indexOf('cylinder') >= 0 ? 0x6b3e1f : 0x2d7a2d });
            });

            if (!templates.length) { console.warn('OBJ: no mesh data'); return; }

            var tmp = new THREE.Group();
            templates.forEach(function (t) { tmp.add(new THREE.Mesh(t.geo)); });
            var bbox      = new THREE.Box3().setFromObject(tmp);
            var modelH    = bbox.max.y - bbox.min.y;
            var treeScale = 11 / modelH;
            var baseShift = -bbox.min.y * treeScale;

            var self = this;
            var iMeshes = templates.map(function (t) {
              var m = new THREE.InstancedMesh(
                t.geo,
                new THREE.MeshLambertMaterial({ color: t.color, side: THREE.FrontSide }),
                trees.length
              );
              m.frustumCulled = false;
              self._scene.add(m);
              return m;
            });

            var dummy = new THREE.Object3D();
            trees.forEach(function (tree, i) {
              var c = mapboxgl.MercatorCoordinate.fromLngLat([tree.lng, tree.lat], 0);
              dummy.position.set(
                (c.x - originMerc.x) / mScale,
                baseShift,
                (c.y - originMerc.y) / mScale
              );
              dummy.scale.setScalar(treeScale);
              dummy.updateMatrix();
              iMeshes.forEach(function (m) { m.setMatrixAt(i, dummy.matrix); });
            });
            iMeshes.forEach(function (m) { m.instanceMatrix.needsUpdate = true; });

            console.log('OBJ trees ready: ' + trees.length + ' instances, ' + templates.length + ' mesh(es)');
          },

          render: function (gl, args) {
            if (!_visible || !this._renderer) return;

            var raw;
            if (args && typeof args === 'object' && !Array.isArray(args) && !ArrayBuffer.isView(args)) {
              raw = (args.defaultProjectionData && args.defaultProjectionData.mainMatrix)
                  ? args.defaultProjectionData.mainMatrix
                  : args.modelViewProjectionMatrix;
            } else {
              raw = args;
            }
            if (!raw) return;

            var rotX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
            var worldMatrix = new THREE.Matrix4()
              .makeTranslation(originMerc.x, originMerc.y, originMerc.z)
              .scale(new THREE.Vector3(mScale, -mScale, mScale))
              .multiply(rotX);

            this._camera.projectionMatrix = new THREE.Matrix4()
              .fromArray(Array.from(raw))
              .multiply(worldMatrix);

            this._renderer.resetState();
            this._renderer.render(this._scene, this._camera);
          }
        };

        map.addLayer(layer);
        console.log('3D OBJ tree layer added - ' + trees.length + ' trees');
      } catch (err) {
        console.error('TREE LOAD ERROR:', err);
      }
    },

    showTrees: function (map) {
      _visible = true;
      map.triggerRepaint();
    },

    hideTrees: function (map) {
      _visible = false;
      map.triggerRepaint();
    }
  };
}());
