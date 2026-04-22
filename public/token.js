// token.js - Mapbox token loader
// This file should export a function or value for the Mapbox token.
// If missing or empty, the app should log a clear error and not crash.

export async function resolveMapboxToken() {
  // Try to get token from meta tag
  const meta = document.querySelector('meta[name="mapbox-token"]');
  if (meta && meta.content && meta.content.startsWith('pk.')) {
    return meta.content;
  }
  // Could also try to fetch from a config endpoint or environment
  console.error('[TOKEN] Mapbox token not found in meta tag. Please add your token to the <meta name="mapbox-token"> tag in index.html.');
  return null;
}
