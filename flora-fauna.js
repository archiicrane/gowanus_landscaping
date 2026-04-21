// flora-fauna.js - Loads and displays all flora and fauna from available data

async function loadFloraFauna() {
  const floraFaunaDiv = document.getElementById('flora-fauna-list');
  floraFaunaDiv.innerHTML = '<em>Loading...</em>';

  // Load flora (tree species)
  let flora = [];
  try {
    const res = await fetch('data/tree_species_metadata.json');
    flora = await res.json();
  } catch (e) {
    floraFaunaDiv.innerHTML = '<b>Error loading flora data.</b>';
    return;
  }

  // TODO: Add fauna data loading here if available
  // For now, just show flora

  let html = '<h2>Flora (Tree Species)</h2>';
  html += '<ul>';
  for (const species of flora) {
    html += `<li><b>${species.common_name}</b> (<i>${species.scientific_name}</i>)`;
    if (species.native) html += ' <span style="color:green">[Native]</span>';
    if (species.notes) html += ` - ${species.notes}`;
    html += '</li>';
  }
  html += '</ul>';

  // Placeholder for fauna
  html += '<h2>Fauna</h2>';
  html += '<p>No fauna data available yet.</p>';

  floraFaunaDiv.innerHTML = html;
}

window.addEventListener('DOMContentLoaded', loadFloraFauna);
