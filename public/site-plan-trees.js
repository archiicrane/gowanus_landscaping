// site-plan-trees.js
// Responsible for stylized architectural tree rendering

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

function randRange(min, max) {
  return Math.random() * (max - min) + min;
}

export function drawArchitecturalTree(scene, tree, style) {
  const [x, y] = tree.position;
  const visualScale = typeof tree._treeVisualScale === 'number' ? tree._treeVisualScale : 0.5;
  const baseRadius = ((tree.canopy || style.treeCanopyBaseRadius) * visualScale) * randRange(0.92, 1.08);
  const layers = style.treeCanopyLayers || 3;

  for (let index = 0; index < layers; index += 1) {
    const radius = baseRadius * randRange(0.82, 1.12);
    const color = style.treeCanopy[index % style.treeCanopy.length];
    const alpha = 0.6 * randRange(0.85, 1.0);
    const geometry = new THREE.CircleGeometry(radius, 24 + Math.floor(randRange(-2, 2)));
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: alpha });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x + randRange(-0.7, 0.7), y + randRange(-0.7, 0.7), 0.2 + index * 0.05);
    scene.add(mesh);
  }

  const edgeGeometry = new THREE.RingGeometry(baseRadius * 0.98, baseRadius * 1.08, 32);
  const edgeMaterial = new THREE.MeshBasicMaterial({ color: style.treeEdge, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
  const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
  edge.position.set(x, y, 0.3);
  scene.add(edge);

  const trunkGeometry = new THREE.CircleGeometry(style.treeTrunkRadius * visualScale * randRange(0.8, 1.2), 10);
  const trunkMaterial = new THREE.MeshBasicMaterial({ color: style.treeTrunk, opacity: 0.6 });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.set(x, y, 0.1);
  scene.add(trunk);
}
