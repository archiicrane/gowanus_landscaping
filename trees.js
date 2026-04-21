
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
window.TreeRenderer = {
  async initTrees(map) {
    try {
      // Load main tree data
      const response = await fetch('./data/gowanus_trees.json');
      if (!response.ok) throw new Error(`Trees fetch failed: ${response.status} ${response.statusText}`);
      const rawText = await response.text();
      const cleanedText = rawText.replace(/\bNaN\b/g, 'null');
      const rawData = JSON.parse(cleanedText);

      // All trees as points
      const treeFeatures = rawData
        .filter(t => t.lat != null && t.lon != null && t.species)
        .map(t => ({
          lon: Number(t.lon),
          lat: Number(t.lat),
          species: t.species ?? 'Unknown'
        }));

      // Remove old canvas if present
      let canvas = document.getElementById('tree-canopy-canvas');
      if (canvas) canvas.remove();
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
      // Project and draw each tree
      for (const tree of treeFeatures) {
        const pt = map.project([tree.lon, tree.lat]);
        // Vary size slightly by species or random
        const r = 13 + Math.random() * 7;
        // Use theme color
        ctx.save();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = currentTheme.treeCanopy;
        ctx.globalAlpha = 1;
        ctx.shadowColor = currentTheme.treeCanopy;
        ctx.shadowBlur = r * 0.5;
        ctx.fill();
        // Trunk dot
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r * 0.18, 0, 2 * Math.PI);
        ctx.fillStyle = currentTheme.treeTrunk;
        ctx.globalAlpha = 0.7;
        ctx.shadowBlur = 0;
        ctx.fill();
        ctx.restore();
      }

    } catch (err) {
      console.error('TREE LOAD ERROR:', err);
    }
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

      // All trees as points
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


      // Remove all layers using 'trees' before removing the source, then add new source/layer
      function removeAllTreeLayersAndSourceThenAdd(retries = 20) {
        // Always try to remove highlight layer first if present
        if (map.getLayer('trees-highlight')) {
          try {
            map.removeLayer('trees-highlight');
          } catch (e) {
            console.warn('Could not remove trees-highlight:', e);
          }
        }
        if (!map.getSource('trees')) {
          // Now safe to add new source and layer
          map.addSource('trees', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features }
          });
          map.addLayer({
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
          return;
        }
        const layers = map.getStyle().layers || [];
        let removedAny = false;
        for (const layer of layers) {
          if (layer.source === 'trees' && map.getLayer(layer.id)) {
            try {
              map.removeLayer(layer.id);
              removedAny = true;
            } catch (e) {
              console.warn('Could not remove layer', layer.id, e);
            }
          }
        }
        if (removedAny && retries > 0) {
          setTimeout(() => removeAllTreeLayersAndSourceThenAdd(retries - 1), 10);
        } else {
          try {
            map.removeSource('trees');
            setTimeout(() => removeAllTreeLayersAndSourceThenAdd(retries - 1), 10);
          } catch (e) {
            if (retries > 0) {
              setTimeout(() => removeAllTreeLayersAndSourceThenAdd(retries - 1), 10);
            } else {
              console.warn('Could not remove source trees after retries:', e);
            }
          }
        }
      }
      removeAllTreeLayersAndSourceThenAdd();
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
