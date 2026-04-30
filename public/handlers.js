// handlers.js - All map event handlers and UI logic

function openParkPanel(props) {
  const panel       = document.getElementById('park-info-panel');
  const imgEl       = document.getElementById('park-panel-image');
  const imgPhEl     = document.getElementById('park-panel-image-placeholder');
  const nameEl      = document.getElementById('park-panel-name');
  const distEl      = document.getElementById('park-panel-distance');
  const areaEl      = document.getElementById('park-panel-area');
  const estEl       = document.getElementById('park-panel-established');
  const descEl      = document.getElementById('park-panel-desc');
  const ecoEl       = document.getElementById('park-panel-ecology');
  const wildlifeEl  = document.getElementById('park-panel-wildlife');
  const programsEl  = document.getElementById('park-panel-programs');
  const linkEl      = document.getElementById('park-panel-link');

  if (!panel) return;

  nameEl.textContent   = props.name || 'Park';
  distEl.textContent   = props.distance_label || '';
  areaEl.textContent   = props.area_acres ? `${props.area_acres} acres` : '';
  estEl.textContent    = props.established ? `Est. ${props.established}` : '';
  descEl.textContent   = props.description || '';
  ecoEl.textContent    = props.ecology_note || '';

  if (linkEl) {
    linkEl.href = props.link || '#';
    linkEl.style.display = props.link ? 'inline-block' : 'none';
  }

  // Image: show if image_url present, else show placeholder
  const imageUrl = props.image_url && props.image_url !== 'null' ? props.image_url : null;
  if (imageUrl) {
    imgEl.src = imageUrl;
    imgEl.alt = props.name || '';
    imgEl.classList.remove('hidden');
    imgPhEl.classList.add('hidden');
  } else {
    imgEl.src = '';
    imgEl.classList.add('hidden');
    imgPhEl.classList.remove('hidden');
  }

  // Wildlife chips
  wildlifeEl.innerHTML = '';
  let wildlife = [];
  try {
    wildlife = typeof props.wildlife === 'string' ? JSON.parse(props.wildlife) : (props.wildlife || []);
  } catch (_) { wildlife = []; }
  for (const species of wildlife) {
    const li = document.createElement('li');
    li.textContent = species;
    wildlifeEl.appendChild(li);
  }

  // Programs list
  programsEl.innerHTML = '';
  let programs = [];
  try {
    programs = typeof props.programs === 'string' ? JSON.parse(props.programs) : (props.programs || []);
  } catch (_) { programs = []; }
  for (const prog of programs) {
    const li = document.createElement('li');
    li.textContent = prog;
    programsEl.appendChild(li);
  }

  panel.classList.add('active');
}

export function setupMapHandlers(map) {
  // ── Nearby Parks: click → side panel ─────────────────────────────────────
  map.on('click', 'nearby-parks-fill', (e) => {
    const feature = e.features && e.features[0];
    if (!feature) return;
    e.preventDefault && e.preventDefault();
    openParkPanel(feature.properties);
  });

  // Hover highlight: brighten outline on hover
  let hoveredParkId = null;

  map.on('mousemove', 'nearby-parks-fill', (e) => {
    if (!e.features || !e.features.length) return;
    const id = e.features[0].properties.id;
    if (id !== hoveredParkId) {
      hoveredParkId = id;
      if (map.getLayer('nearby-parks-outline-hover')) {
        map.setFilter('nearby-parks-outline-hover', ['==', ['get', 'id'], id]);
      }
    }
    map.getCanvas().style.cursor = 'pointer';
  });

  map.on('mouseleave', 'nearby-parks-fill', () => {
    hoveredParkId = null;
    if (map.getLayer('nearby-parks-outline-hover')) {
      map.setFilter('nearby-parks-outline-hover', ['==', ['get', 'id'], '']);
    }
    map.getCanvas().style.cursor = '';
  });

  // Close park panel
  const closeBtn = document.getElementById('park-panel-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      const panel = document.getElementById('park-info-panel');
      if (panel) panel.classList.remove('active');
    });
  }

  // ── CSO Outfalls ──────────────────────────────────────────────────────────
  map.on('click', 'cso-outfalls-circle', (e) => {
    const feature = e.features && e.features[0];
    if (!feature) return;
    const props = feature.properties;
    new mapboxgl.Popup({ closeButton: false, focusAfterOpen: false })
      .setLngLat(e.lngLat)
      .setHTML(`<b>CSO Outfall</b><br>ID: ${props.id || ''}`)
      .addTo(map);
  });
}

