import json, math

# planting-bands extents
with open('public/data/planting-bands.geojson', encoding='utf-8') as f:
    pb = json.load(f)
all_lons, all_lats = [], []
for feat in pb['features']:
    coords = feat['geometry']['coordinates'][0]
    for c in coords:
        all_lons.append(c[0]); all_lats.append(c[1])
    lons = [c[0] for c in coords]; lats = [c[1] for c in coords]
    print(feat['properties']['band'], 'lon', min(lons), max(lons), 'lat', min(lats), max(lats))

site_lon = (min(all_lons), max(all_lons))
site_lat = (min(all_lats), max(all_lats))
print('Combined bbox lon', site_lon, 'lat', site_lat)

def bbox_area(minlon, minlat, maxlon, maxlat):
    RAD = math.pi/180
    lat_m = (maxlat - minlat) * 110540
    lon_m = (maxlon - minlon) * 111320 * math.cos((minlat+maxlat)/2 * RAD)
    return lat_m * lon_m

area = bbox_area(site_lon[0], site_lat[0], site_lon[1], site_lat[1])
print(f'Site bbox area: {area:.0f} m2 = {area/4047:.2f} acres = {area/10000:.2f} ha')

# Trees in site
with open('public/data/gowanus_trees_clean.json', encoding='utf-8') as f:
    trees = json.loads(f.read().replace('NaN','null'))
in_bbox = [t for t in trees if t.get('lat') and t.get('lon')
    and site_lon[0] <= t['lon'] <= site_lon[1]
    and site_lat[0] <= t['lat'] <= site_lat[1]]
print(f'Trees in site bbox: {len(in_bbox)}/{len(trees)}')

# Flood features in bbox
with open('public/data/flood-vulnerability.geojson', encoding='utf-8') as f:
    flood = json.load(f)

def centroid(feat):
    try:
        coords = feat['geometry']['coordinates']
        gt = feat['geometry']['type']
        if gt == 'MultiPolygon':
            coords = coords[0][0]
        elif gt == 'Polygon':
            coords = coords[0]
        lons = [c[0] for c in coords]; lats = [c[1] for c in coords]
        return sum(lons)/len(lons), sum(lats)/len(lats)
    except:
        return None, None

flood_in = []
for feat in flood['features']:
    lon, lat = centroid(feat)
    if lon and site_lon[0]-0.02 <= lon <= site_lon[1]+0.02 and site_lat[0]-0.02 <= lat <= site_lat[1]+0.02:
        flood_in.append(feat)
print(f'Flood features near site: {len(flood_in)}/{len(flood["features"])}')

# What does the park.geojson Layer field look like?
with open('public/data/park.geojson', encoding='utf-8') as f:
    park = json.load(f)
layers = set(f['properties'].get('Layer','') for f in park['features'])
print('park.geojson layers:', sorted(layers)[:20])
print('Sample feature:', park['features'][0]['properties'])
