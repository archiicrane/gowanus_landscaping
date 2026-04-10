console.log('trees.js loaded');

// Species to canopy color mapping (matches original dot colors)
const SPECIES_COLORS = {
  'kentucky coffeetree': '#b8d7a5',
  'honeylocust':         '#b7e1c2',
  'london planetree':    '#a8d5ba',
  'japanese zelkova':    '#9fcfb2',
  'littleleaf linden':   '#d6e3b2',
  'callery pear':        '#e1e7c0',
  'pin oak':             '#8fbba1',
  'ginkgo':              '#f2e3ab',
  'bald cypress':        '#9dc8ba',
  'cornelian cherry':    '#e9c8b8',
  'black walnut':        '#b7c7a0',
  'japanese tree lilac': '#d6c8de',
  'red maple':           '#e7b8b3',
  'norway maple':        '#e4c3a8'
};
const DEFAULT_TREE_COLOR = '#b9d8b6';

/**
 * Parse a hex colour into [r, g, b] integers.
 */
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lighten(hex, amount = 0.22) {
  const [r, g, b] = hexToRgb(hex);
  const l = (c) => Math.min(255, Math.round(c + (255 - c) * amount));
  return `rgb(${l(r)},${l(g)},${l(b)})`;
}

function darken(hex, amount = 0.28) {
  const [r, g, b] = hexToRgb(hex);
  const d = (c) => Math.max(0, Math.round(c * (1 - amount)));
  return `rgb(${d(r)},${d(g)},${d(b)})`;
}

/**
 * Draws a detailed organic tree icon onto a canvas:
 * multi-cluster leafy canopy, trunk, drop shadow, per-cluster shading.
 * Returns raw ImageData for map.addImage().
 */
function createTreeIcon(canopyColor, size = 72) {
  const canvas = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const cx = size / 2;
  const cy = size * 0.42;
  const R  = size * 0.30; // base canopy radius

  // Leaf cluster layout: [dx, dy, radius] relative to canopy centre
  const clusters = [
    [  0,        0,       R        ],  // centre body
    [ -R * 0.50, -R * 0.40, R * 0.68 ],  // top-left lobe
    [  R * 0.48, -R * 0.38, R * 0.65 ],  // top-right lobe
    [ -R * 0.55,  R * 0.32, R * 0.58 ],  // bottom-left lobe
    [  R * 0.50,  R * 0.30, R * 0.56 ],  // bottom-right lobe
    [  0,        -R * 0.60, R * 0.50 ],  // top crown
  ];

  // --- Ground shadow ---
  ctx.beginPath();
  ctx.ellipse(cx + 2, size * 0.87, R * 0.62, R * 0.18, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fill();

  // --- Trunk ---
  const tw = size * 0.09;
  const trunkTop    = cy + R * 0.55;
  const trunkBottom = size * 0.87;
  const grad = ctx.createLinearGradient(cx - tw, 0, cx + tw, 0);
  grad.addColorStop(0,   '#5a3010');
  grad.addColorStop(0.4, '#8b5c2a');
  grad.addColorStop(1,   '#4a2808');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx - tw * 0.6, trunkBottom);
  ctx.lineTo(cx - tw,       trunkTop);
  ctx.lineTo(cx + tw,       trunkTop);
  ctx.lineTo(cx + tw * 0.6, trunkBottom);
  ctx.closePath();
  ctx.fill();

  // --- Canopy: dark under-shadow pass ---
  for (const [dx, dy, r] of clusters) {
    ctx.beginPath();
    ctx.arc(cx + dx + 1.5, cy + dy + 2, r, 0, Math.PI * 2);
    ctx.fillStyle = darken(canopyColor, 0.45);
    ctx.fill();
  }

  // --- Canopy: main mid-tone fill pass ---
  for (const [dx, dy, r] of clusters) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
    ctx.fillStyle = canopyColor;
    ctx.fill();
  }

  // --- Canopy: lighter top surfaces (simulate light from upper-left) ---
  const litClusters = [
    [  0,        0,       R * 0.55 ],
    [ -R * 0.50, -R * 0.40, R * 0.40 ],
    [  0,        -R * 0.60, R * 0.32 ],
  ];
  for (const [dx, dy, r] of litClusters) {
    ctx.beginPath();
    ctx.arc(cx + dx - R * 0.1, cy + dy - R * 0.12, r, 0, Math.PI * 2);
    ctx.fillStyle = lighten(canopyColor, 0.18);
    ctx.fill();
  }

  // --- Small dark leaf-gap dots for texture ---
  const dots = [
    [ R * 0.18,  R * 0.14 ],
    [-R * 0.22,  R * 0.22 ],
    [ R * 0.30, -R * 0.10 ],
    [-R * 0.08, -R * 0.28 ],
    [ R * 0.10,  R * 0.36 ],
    [-R * 0.35,  R * 0.02 ],
  ];
  for (const [dx, dy] of dots) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, R * 0.10, 0, Math.PI * 2);
    ctx.fillStyle = darken(canopyColor, 0.38);
    ctx.fill();
  }

  // --- Specular highlight ---
  ctx.beginPath();
  ctx.arc(cx - R * 0.38, cy - R * 0.50, R * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}

function iconId(species) {
  return 'tree-icon-' + species.replace(/\s+/g, '-');
}

window.TreeRenderer = {
  async initTrees(map) {
    try {
      const response = await fetch('./data/gowanus_trees.json');
      if (!response.ok) {
        throw new Error(`Trees fetch failed: ${response.status} ${response.statusText}`);
      }

      const rawText    = await response.text();
      const cleanedText = rawText.replace(/\bNaN\b/g, 'null');
      const rawData    = JSON.parse(cleanedText);

      // Register one icon image per species colour
      const colorEntries = [...Object.entries(SPECIES_COLORS), ['default', DEFAULT_TREE_COLOR]];
      for (const [key, color] of colorEntries) {
        const id = iconId(key);
        if (!map.hasImage(id)) {
          map.addImage(id, createTreeIcon(color));
        }
      }

      const features = rawData
        .filter((t) => t.lat != null && t.lon != null)
        .map((t) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [Number(t.lon), Number(t.lat)]
          },
          properties: {
            tree_id: t.tree_id ?? null,
            species: t.species  ?? 'Unknown',
            health:  t.health   ?? 'Unknown'
          }
        }));

      if (map.getLayer('trees-layer')) map.removeLayer('trees-layer');
      if (map.getSource('trees'))      map.removeSource('trees');

      map.addSource('trees', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features }
      });

      // Build match expression: species name to icon image id
      const iconMatch = [
        'match',
        ['downcase', ['to-string', ['coalesce', ['get', 'species'], 'unknown']]]
      ];
      for (const species of Object.keys(SPECIES_COLORS)) {
        iconMatch.push(species, iconId(species));
      }
      iconMatch.push(iconId('default')); // fallback

      map.addLayer({
        id: 'trees-layer',
        type: 'symbol',
        source: 'trees',
        layout: {
          visibility: 'none',
          'icon-image': iconMatch,
          'icon-size': 0.46,
          'icon-allow-overlap':    true,
          'icon-ignore-placement': true,
          // Billboard icons on pitched map.
          'icon-rotation-alignment': 'viewport',
          'icon-pitch-alignment':    'viewport',
          // Keep a stable on-screen symbol size while zooming/pitching.
          'icon-pitch-scale':        'viewport'
        }
      });

      console.log('trees-layer added (3D icons), count:', features.length);
    } catch (err) {
      console.error('TREE LOAD ERROR:', err);
    }
  },

  showTrees(map) {
    if (map.getLayer('trees-layer')) {
      map.setLayoutProperty('trees-layer', 'visibility', 'visible');
    }
  },

  hideTrees(map) {
    if (map.getLayer('trees-layer')) {
      map.setLayoutProperty('trees-layer', 'visibility', 'none');
    }
  }
};
