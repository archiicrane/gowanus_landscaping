// token.js - Handles Mapbox token resolution

export async function resolveMapboxToken() {
  const local = (window.APP_CONFIG && window.APP_CONFIG.mapboxToken) || "";
  if (local && !local.includes("YOUR_MAPBOX")) return local;
  try {
    const res = await fetch("/api/mapbox-token");
    if (res.status === 401) {
      console.error("[MAP INIT] /api/mapbox-token returned 401 (protected deployment?)");
    }
    if (res.ok) {
      const cfg = await res.json();
      const token = (cfg && cfg.token) || "";
      if (token) return token;
    } else {
      console.error("[MAP INIT] /api/mapbox-token failed:", res.status, res.statusText);
    }
  } catch (err) {
    console.error("[MAP INIT] Error fetching /api/mapbox-token:", err);
  }
  // Legacy: check window and meta
  const windowToken = (window.MAPBOX_TOKEN || '').trim();
  if (windowToken) return windowToken;
  const metaToken = (document.querySelector('meta[name="mapbox-token"]')?.content || '').trim();
  if (metaToken) return metaToken;
  // Fallback for local dev: put your token here if needed
  return "YOUR_MAPBOX_TOKEN_HERE";
}
