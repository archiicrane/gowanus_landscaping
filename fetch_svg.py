import urllib.request, re

url = 'https://observablehq.com/embed/4f11dfdf7a715ebe@622?cells=bldgDrawing2&api_key=a179cd31f7162f6ef1777ec6d823ac4e7db1f771&banner=false'
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as r:
        content = r.read().decode('utf-8')
    vb = re.findall(r'viewBox[=:]["\'`]([^"\'`]+)["\'`]', content)
    print('viewBox:', vb[:5])
    svgs = re.findall(r'<svg[^>]{0,400}>', content[:100000])
    print('SVG tags:', svgs[:3])
    circles = re.findall(r'<circle[^>]+>', content[:100000])
    print('Circles:', circles[:10])
    print('Content length:', len(content))
    # Save content for inspection
    with open('embed_content.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Saved to embed_content.html')
except Exception as e:
    print('Error:', e)
