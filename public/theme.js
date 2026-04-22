// theme.js - Centralized theme for map styling

export const MAP_THEMES = {
	renderedPlan: {
		background: '#f7f6f3', // pale warm gray
		road: '#bdbdbd', // soft medium gray
		roadMinor: '#d6d6d6',
		paved: '#eaeaea',
		building: '#eae7e2', // very light gray/beige
		buildingOutline: 'rgba(0,0,0,0)', // no harsh outline
		buildingExtrude: 'rgba(180,180,170,0.32)', // subtle extrusion
		treeCanopy: 'rgba(153,180,140,0.38)', // muted green, semi-transparent
		treeTrunk: '#6b5e3a', // trunk dot
		contour: '#aab89a', // olive/gray-green
		overlayFlood: 'rgba(120,140,120,0.13)',
		overlayBioswale: 'rgba(170,200,140,0.18)',
		overlayTopo: 'rgba(180,180,170,0.10)',
		paperTexture: 'url("./vendor/paper-texture.png")',
		ui: '#bdbdbd',
		label: 'rgba(0,0,0,0)', // minimal labels
	},
	analysis: {
		background: '#f5f5f5',
		road: '#cccccc',
		roadMinor: '#e0e0e0',
		paved: '#eaeaea',
		building: '#e0e0e0',
		buildingOutline: '#bdbdbd',
		buildingExtrude: 'rgba(180,180,170,0.55)',
		treeCanopy: 'rgba(120,180,120,0.45)',
		treeTrunk: '#4b3e2a',
		contour: '#8fa18a',
		overlayFlood: 'rgba(80,120,200,0.18)',
		overlayBioswale: 'rgba(120,180,120,0.22)',
		overlayTopo: 'rgba(180,180,170,0.13)',
		paperTexture: 'none',
		ui: '#cccccc',
		label: '#222',
	}
};

export let currentTheme = MAP_THEMES.renderedPlan;

export function setTheme(mode) {
	currentTheme = MAP_THEMES[mode] || MAP_THEMES.renderedPlan;
}
