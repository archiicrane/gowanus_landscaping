console.log('trees.js loaded');

// Species → canopy colour mapping (matches original dot colours)
const SPECIES_COLORS = {
  'kentucky coffeetree': '#8bc34a',
  'honeylocust':         '#7ddc6f',
  'london planetree':    '#5fbf72',
  'japanese zelkova':    '#4caf50',
  'littleleaf linden':   '#9ccc65',
  'callery pear':        '#c0e57b',
  'pin oak':             '#2e7d32',
  'ginkgo':              '#ffd54f',
  'bald cypress':        '#2f855a',
  'cornelian cherry':    '#ff8a65',
  'black walnut':        '#6d8f3f',
  'japanese tree lilac': '#ba68c8',
  'red maple':           '#ef5350',
  'norway maple':        '#ef6c00'
};
const DEFAULT_TREE_COLOR = '#22c55e';

/**
 * Draws a stylised 3-D tree icon (canopy + trunk + highlight) onto a canvas
 * and returns the raw ImageData so it can be registered with map.addImage().
 */
function createTreeIcon(canopyColor, size = 52) {
  const canvas = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const cx = size / 2;
  const r  = size * 0.33;

  // Ground shadow (ellipse under the tree)
  ctx.beginPath();
  ctx.ellipse(cx + 1.5, size * 0.8, r * 0.55, r * 0.17, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fill();

  // Trunk
  const tw = size * 0.13;
  const th = size * 0.24;
  ctx.fillStyle = '#7c4a1e';
  ctx.beginPath();
  ctx.rect(cx - tw / 2, size * 0.6, tw, th);
  ctx.fill();

  // Canopy – dark rim for depth
  ctx.beginPath();
  ctx.arc(cx + 1.5, size * 0.38 + 2, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fill();

  // Canopy – main colour
  ctx.beginPath();
  ctx.arc(cx, size * 0.38, r, 0, Math.PI * 2);
  ctx.fillStyle = canopyColor;
  ctx.fill();

  // Specular highlight (top-left) for 3-D sphere effect
  ctx.beginPath();
  ctx.arc(cx - r * 0.3, size * 0.26, r * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
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

      // Build match expression: species name → icon image id
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
          'icon-size': [
            'interpolate', ['linear'], ['zoom'],
            13, 0.32,
            15, 0.52,
            17, 0.82,
            19, 1.2
          ],
          'icon-allow-overlap':    true,
          'icon-ignore-placement': true,
          // Billboard: icons stay upright on the 65° pitched map
          'icon-rotation-alignment': 'viewport',
          'icon-pitch-alignment':    'viewport'
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