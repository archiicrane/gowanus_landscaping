
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('https://observablehq.com/embed/4f11dfdf7a715ebe@622?cells=bldgDrawing2&api_key=a179cd31f7162f6ef1777ec6d823ac4e7db1f771&banner=false', {waitUntil: 'networkidle', timeout: 30000});
  await page.waitForTimeout(4000);
  const svgInfo = await page.evaluate(() => {
    const svg = document.querySelector('svg');
    if (!svg) return {error: 'no svg', html: document.body.innerHTML.substring(0,500)};
    const vb = svg.getAttribute('viewBox');
    const w = svg.getAttribute('width');
    const h = svg.getAttribute('height');
    const bbox = svg.getBoundingClientRect();
    // Get all circles (control points)
    const circles = Array.from(svg.querySelectorAll('circle')).map(c => ({
      cx: c.getAttribute('cx'), cy: c.getAttribute('cy'), r: c.getAttribute('r'), fill: c.getAttribute('fill'), style: c.getAttribute('style')
    }));
    // Also get all g elements with transform  
    const groups = Array.from(svg.querySelectorAll('g[transform]')).slice(0,5).map(g => g.getAttribute('transform'));
    // Get page HTML structure
    const cells = Array.from(document.querySelectorAll('[class*="cell"]')).slice(0,5).map(el => ({tag: el.tagName, cls: el.className, html: el.innerHTML.substring(0,100)}));
    return {viewBox: vb, width: w, height: h, bbox: {left: bbox.left, top: bbox.top, width: bbox.width, height: bbox.height}, circles: circles.slice(0,20), groups, cells};
  });
  console.log(JSON.stringify(svgInfo, null, 2));
  await page.screenshot({path: 'observable_screenshot.png'});
  await browser.close();
})();
