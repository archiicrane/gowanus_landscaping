

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

function safeRemoveLayer(map, id) {
  try {
    if (map && map.getLayer && map.getLayer(id)) map.removeLayer(id);
  } catch (e) {
    console.warn('Could not remove layer', id, e);
  }
}
function safeRemoveSource(map, id) {
  try {
    if (map && map.getSource && map.getSource(id)) map.removeSource(id);
  } catch (e) {
    console.warn('Could not remove source', id, e);
  }
}
function safeAddSource(map, id, source) {
  try {
    if (map && map.getSource && !map.getSource(id)) map.addSource(id, source);
  } catch (e) {
    console.warn('Could not add source', id, e);
  }
}
function safeAddLayer(map, layerConfig) {
  try {
    if (map && map.getLayer && !map.getLayer(layerConfig.id)) map.addLayer(layerConfig);
  } catch (e) {
    console.warn('Could not add layer', layerConfig.id, e);
  }
}

window.TreeRenderer = {
  async initTrees(map) {
    try {
      if (!map || typeof map.getSource !== 'function') return;
      if (!window.currentTheme) {
        console.warn('currentTheme is not defined');
        return;
      }
      // Wait for style to be loaded
      if (!map.isStyleLoaded()) {
        map.once('styledata', () => this.initTrees(map));
        return;
      }

      // Fetch tree data
      let rawData = null;
      try {
        const response = await fetch('./data/gowanus_trees.json');
        if (!response.ok) throw new Error(`Trees fetch failed: ${response.status} ${response.statusText}`);
        const rawText = await response.text();
        const cleanedText = rawText.replace(/\bNaN\b/g, 'null');
        rawData = JSON.parse(cleanedText);
      } catch (err) {
        console.error('TREE LOAD ERROR:', err);
        return;
      }
      if (!Array.isArray(rawData)) {
        console.warn('Tree data is not an array');
        return;
      }

      // Optionally load honeylocust polygons
      let honeylocustFeatures = [];
      try {
        const honeyTxt = await fetch('./models/honey_tree.txt');
        if (honeyTxt.ok) {
          const honeyText = await honeyTxt.text();
          const lines = honeyText.split(/\r?\n/);
          for (const line of lines) {
            if (/none/i.test(line) || !line.trim()) continue;
            const coords = line.trim().split(/\s+/).map(pair => {
              const [lng, lat] = pair.split(',').map(Number);
              return [lng, lat];
            });
            if (coords.length > 1) {
              honeylocustFeatures.push({
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [coords] },
                properties: { species: 'honeylocust', isHoneyTree: true }
              });
            }
          }
        }
      } catch (e) {
        console.warn('Could not load honey_tree.txt:', e);
      }

      // Build tree point features
      const treeFeatures = rawData
        .filter(t => t.lat != null && t.lon != null && t.species)
        .map(t => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [Number(t.lon), Number(t.lat)] },
          properties: {
            tree_id: t.tree_id ?? null,
            species: t.species ?? 'Unknown',
            health: t.health ?? 'Unknown',
            isHoneyTree: false
          }
        }));

      // Combine all features
      const features = [...treeFeatures, ...honeylocustFeatures];

      // Remove old canvas if present
      try {
        let canvas = document.getElementById('tree-canopy-canvas');
        if (canvas) canvas.remove();
        if (window.currentTheme.treeCanopy && window.currentTheme.treeTrunk) {
          canvas = document.createElement('canvas');
          canvas.id = 'tree-canopy-canvas';
          canvas.style.position = 'absolute';
          canvas.style.top = '0';
          canvas.style.left = '0';
          canvas.style.pointerEvents = 'none';
          canvas.width = map.getContainer().offsetWidth;
          canvas.height = map.getContainer().offsetHeight;
          map.getContainer().appendChild(canvas);
          const ctx = canvas.getContext('2d');
          for (const tree of treeFeatures) {
            const pt = map.project([tree.geometry.coordinates[0], tree.geometry.coordinates[1]]);
            const r = 13 + Math.random() * 7;
            ctx.save();
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = window.currentTheme.treeCanopy;
            ctx.globalAlpha = 1;
            ctx.shadowColor = window.currentTheme.treeCanopy;
            ctx.shadowBlur = r * 0.5;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, r * 0.18, 0, 2 * Math.PI);
            ctx.fillStyle = window.currentTheme.treeTrunk;
            ctx.globalAlpha = 0.7;
            ctx.shadowBlur = 0;
            ctx.fill();
            ctx.restore();
          }
        }
      } catch (e) {
        console.warn('Tree canopy canvas draw error:', e);
      }

      // Remove old layers and sources safely
      safeRemoveLayer(map, 'trees-layer');
      safeRemoveSource(map, 'trees');

      // Add new source and layer safely
      safeAddSource(map, 'trees', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features }
      });
      safeAddLayer(map, {
        id: 'trees-layer',
        type: 'circle',
        source: 'trees',
        paint: {
          'circle-radius': 7,
          'circle-color': [
            'match',
            ['downcase', ['get', 'species']],
            'kentucky coffeetree', SPECIES_COLORS['kentucky coffeetree'],
            'honeylocust', SPECIES_COLORS['honeylocust'],
            'london planetree', SPECIES_COLORS['london planetree'],
            'japanese zelkova', SPECIES_COLORS['japanese zelkova'],
            'littleleaf linden', SPECIES_COLORS['littleleaf linden'],
            'callery pear', SPECIES_COLORS['callery pear'],
            'pin oak', SPECIES_COLORS['pin oak'],
            'ginkgo', SPECIES_COLORS['ginkgo'],
            'bald cypress', SPECIES_COLORS['bald cypress'],
            'cornelian cherry', SPECIES_COLORS['cornelian cherry'],
            'black walnut', SPECIES_COLORS['black walnut'],
            'japanese tree lilac', SPECIES_COLORS['japanese tree lilac'],
            'red maple', SPECIES_COLORS['red maple'],
            'norway maple', SPECIES_COLORS['norway maple'],
            DEFAULT_TREE_COLOR
          ],
          'circle-stroke-color': '#2f2a24',
          'circle-stroke-width': 1.2,
          'circle-opacity': 0.85
        }
      });
      console.log('🌳 Trees layer added with all species, count:', features.length);
    } catch (err) {
      console.error('TREE RENDERER ERROR:', err);
    }
  },

  showTrees(map) {
    if (map && map.getLayer && map.getLayer('trees-layer')) {
      map.setLayoutProperty('trees-layer', 'visibility', 'visible');
    }
  },

  hideTrees(map) {
    if (map && map.getLayer && map.getLayer('trees-layer')) {
      map.setLayoutProperty('trees-layer', 'visibility', 'none');
    }
  }
};
