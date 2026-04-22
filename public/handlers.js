// handlers.js - All map event handlers and UI logic

export function setupMapHandlers(map) {
  // --- Example: Popup for buildings ---
  map.on('click', 'arch-buildings-fill', (e) => {
    const feature = e.features && e.features[0];
    if (!feature) return;
    const props = feature.properties;
    new mapboxgl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`<b>Building</b><br>ID: ${props.id || ''}`)
      .addTo(map);
  });

  // --- Example: Popup for CSO Outfalls ---
  map.on('click', 'cso-outfalls-circle', (e) => {
    const feature = e.features && e.features[0];
    if (!feature) return;
    const props = feature.properties;
    new mapboxgl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`<b>CSO Outfall</b><br>ID: ${props.id || ''}`)
      .addTo(map);
  });

  // --- Add more handlers as needed (hover, toggles, etc.) ---
}
