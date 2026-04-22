// site-plan-style.js
// Centralized visual constants for the Site Plan renderer

export const SitePlanStyle = {
  background: '#f8f7f4',
  paper: '#f8f7f4',
  grass: '#e6ecd7',
  planted: '#dbe7c9',
  bioswale: '#c7d7b2',
  // New muted architectural tones for hardscape
  roadFill: '#e0dedb',        // muted light gray for road fill
  roadLine: 0xbbb7ae,         // muted gray for road lines (THREE.js color)
  sidewalkFill: '#ecebe7',    // slightly lighter for sidewalks
  sidewalkLine: 0xdedcd6,     // light line for sidewalk edges
  hardscapeFill: '#eae7e2',   // for plazas, paved open areas
  hardscapeLine: 0xd3d0c8,    // outline for hardscape
  // Existing
  road: '#e5e3df',
  sidewalk: '#edece8',
  buildingTop: '#f9f9f9',
  buildingSide: '#e0e0e0',
  buildingEdge: '#bdbdbd',
  buildingShadow: 'rgba(60,60,60,0.10)',
  treeCanopy: ['#b7d3a8', '#a2c48c', '#cbe3b7'],
  treeEdge: '#7a8c6b',
  treeTrunk: '#b6a47a',
  outline: '#bdbdbd',
  parkOutline: '#a3b18a',
  lineWeight: 1.2,
  buildingExtrude: 2.5, // meters
  shadowOffset: [2, -2], // x, y in meters
  shadowBlur: 8,
  treeCanopyBaseRadius: 3.5, // meters
  treeCanopyRadiusJitter: 0.7, // meters
  treeCanopyLayers: 3,
  treeCanopyAlpha: 0.85,
  treeEdgeWeight: 1.1,
  treeTrunkRadius: 0.5,
};
