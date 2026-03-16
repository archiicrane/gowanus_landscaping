console.log('trees.js loaded');

window.TreeRenderer = {
  async initTrees(map) {
    try {
      const response = await fetch('./data/gowanus_trees.json');

      if (!response.ok) {
        throw new Error(`Trees fetch failed: ${response.status} ${response.statusText}`);
      }

      // Read as text first because the file contains invalid JSON tokens like NaN
      const rawText = await response.text();

      // Replace bare NaN values with null so JSON.parse works
      const cleanedText = rawText.replace(/\bNaN\b/g, 'null');

      const rawData = JSON.parse(cleanedText);

      console.log('Tree sample:', rawData[0]);

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
            species: t.species ?? 'Unknown',
            health: t.health ?? 'Unknown'
          }
        }));

      console.log('Tree feature count:', features.length);

      if (map.getLayer('trees-layer')) {
        map.removeLayer('trees-layer');
      }

      if (map.getSource('trees')) {
        map.removeSource('trees');
      }

      map.addSource('trees', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features
        }
      });

      map.addLayer({
        id: 'trees-layer',
        type: 'circle',
        source: 'trees',
        layout: {
          visibility: 'none'
        },
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13, 4,
            15, 6,
            17, 9
          ],
          'circle-color': [
            'match',
            ['downcase', ['to-string', ['coalesce', ['get', 'species'], 'unknown']]],
            'kentucky coffeetree', '#8bc34a',
            'honeylocust', '#7ddc6f',
            'london planetree', '#5fbf72',
            'japanese zelkova', '#4caf50',
            'littleleaf linden', '#9ccc65',
            'callery pear', '#c0e57b',
            'pin oak', '#2e7d32',
            'ginkgo', '#ffd54f',
            'bald cypress', '#2f855a',
            'cornelian cherry', '#ff8a65',
            'black walnut', '#6d8f3f',
            'japanese tree lilac', '#ba68c8',
            'red maple', '#ef5350',
            'norway maple', '#ef6c00',
            '#22c55e'
          ],
          'circle-opacity': 1,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.2
        }
      });

      console.log('trees-layer added');
    } catch (err) {
      console.error('TREE LOAD ERROR:', err);
    }
  },

  showTrees(map) {
    console.log('showTrees called');
    if (map.getLayer('trees-layer')) {
      map.setLayoutProperty('trees-layer', 'visibility', 'visible');
    }
  },

  hideTrees(map) {
    console.log('hideTrees called');
    if (map.getLayer('trees-layer')) {
      map.setLayoutProperty('trees-layer', 'visibility', 'none');
    }
  }
};