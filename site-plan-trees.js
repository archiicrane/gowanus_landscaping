// site-plan-trees.js
// Responsible for stylized architectural tree rendering

// Helper: random float in range
function randRange(min, max) {
  return Math.random() * (max - min) + min;
}

// Draw a stylized tree canopy as overlapping blobs
export function drawArchitecturalTree(scene, tree, style) {
  // tree.position must already be in plan-space coordinates (x, y)
  const [x, y] = tree.position;
  const baseRadius = (tree.canopy || style.treeCanopyBaseRadius) * randRange(0.92, 1.08);
  const layers = style.treeCanopyLayers || 3;
  for (let i = 0; i < layers; i++) {
    const r = baseRadius * randRange(0.82, 1.12);
    const color = style.treeCanopy[i % style.treeCanopy.length];
    const alpha = style.treeCanopyAlpha * randRange(0.85, 1.0);
    const geometry = new THREE.CircleGeometry(r, 24 + Math.floor(randRange(-2, 2)));
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: alpha });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x + randRange(-0.7, 0.7), y + randRange(-0.7, 0.7), 2.5 + i * 0.05);
    scene.add(mesh);
  }
  // Edge ring
  const edgeGeom = new THREE.RingGeometry(baseRadius * 0.98, baseRadius * 1.08, 32);
  const edgeMat = new THREE.MeshBasicMaterial({ color: style.treeEdge, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
  const edge = new THREE.Mesh(edgeGeom, edgeMat);
  edge.position.set(x, y, 2.7);
  scene.add(edge);
  // Trunk hint
  const trunkGeom = new THREE.CircleGeometry(style.treeTrunkRadius * randRange(0.8, 1.2), 10);
  const trunkMat = new THREE.MeshBasicMaterial({ color: style.treeTrunk, opacity: 0.7 });
  const trunk = new THREE.Mesh(trunkGeom, trunkMat);
  trunk.position.set(x, y, 2.2);
  scene.add(trunk);
}
