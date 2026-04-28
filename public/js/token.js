// token.js - Fetches the Mapbox token from the Vercel serverless API endpoint.
// The token is stored as the MAPBOX_TOKEN environment variable in Vercel.
// API route: /api/mapbox-token.js → { token: process.env.MAPBOX_TOKEN }

export async function resolveMapboxToken() {
	try {
		const res = await fetch('/api/mapbox-token');
		if (!res.ok) throw new Error(`API responded ${res.status}`);
		const { token } = await res.json();
		if (token && token.startsWith('pk.')) return token;
		console.error('[TOKEN] MAPBOX_TOKEN env var is missing or invalid in Vercel.');
		return null;
	} catch (err) {
		console.error('[TOKEN] Failed to fetch token from /api/mapbox-token:', err);
		return null;
	}
}
