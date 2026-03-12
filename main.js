const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  center: [-73.9895, 40.6745],
  zoom: 15.3,
  pitch: 65,
  bearing: -20,
  antialias: true
});

map.addControl(new maplibregl.NavigationControl());
map.scrollZoom.disable();

map.on('load', async () => {

  const [existingResponse, proposedResponse, treesResponse, parksResponse] = await Promise.all([
    fetch('./data/gowanus-buildings.geojson'),
    fetch('./data/rezoning-buildings.geojson'),
    fetch('./data/gowanus_trees.json'),
    fetch('./data/parks.geojson')
  ]);

  const existingData = await existingResponse.json();
  const proposedData = await proposedResponse.json();
  const treesData = await treesResponse.json();
  const parksData = await parksResponse.json();

  const treesGeoJSON = {
    type: "FeatureCollection",
    features: treesData.map(tree => ({
      type: "Feature",
      properties: tree,
      geometry: {
        type: "Point",
        coordinates: [tree.lon, tree.lat]
      }
    }))
  };

  map.addSource('existing', {
    type: 'geojson',
    data: existingData
  });

  map.addLayer({
    id: 'existing-buildings',
    type: 'fill-extrusion',
    source: 'existing',
    paint: {
      'fill-extrusion-color': '#8b5cf6',
      'fill-extrusion-height': ['get','height'],
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.9
    }
  });

  map.addSource('proposed', {
    type: 'geojson',
    data: proposedData
  });

  map.addLayer({
    id: 'proposed-buildings',
    type: 'fill-extrusion',
    source: 'proposed',
    paint: {
      'fill-extrusion-color': '#3b82f6',
      'fill-extrusion-height': ['get','proposed_height'],
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.9
    }
  });

  map.addSource('parks', {
    type: 'geojson',
    data: parksData
  });

  map.addLayer({
    id: 'parks-fill',
    type: 'fill',
    source: 'parks',
    paint: {
      'fill-color': '#3a5a40',
      'fill-opacity': 0.45
    }
  });

  map.addLayer({
    id: 'parks-outline',
    type: 'line',
    source: 'parks',
    paint: {
      'line-color': '#a3b18a',
      'line-width': 2
    }
  });

  map.addSource('trees', {
    type: 'geojson',
    data: treesGeoJSON
  });

  map.addLayer({
    id: 'trees',
    type: 'circle',
    source: 'trees',
    paint: {
      'circle-radius': 4,
      'circle-color': '#6fcf97',
      'circle-opacity': 0.9
    }
  });

});