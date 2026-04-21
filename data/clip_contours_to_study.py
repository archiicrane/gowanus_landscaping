import json
from shapely.geometry import shape, mapping, Polygon
import os

# --- Use absolute paths to avoid confusion ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONTOUR_PATH = os.path.join(BASE_DIR, '../models/con_lines_gowanus_1ft.geojson')
OUTPUT_PATH = os.path.join(BASE_DIR, '../models/con_lines_gowanus_clipped.geojson')

# Gowanus study polygon (from layers.js, lng/lat pairs)
study_ring = [
    [-73.98963594611494, 40.683945676183654],
    [-73.98084416376932, 40.680669969224006],
    [-73.98368161027763, 40.67628724578089],
    [-73.99274143083169, 40.665495232798115],
    [-73.99607305804426, 40.667988596328655],
    [-73.99889524234268, 40.67260255106102],
    [-73.9964465299067, 40.67744610487334],
    [-73.99461997552936, 40.67663528353369],
    [-73.98963594611494, 40.683945676183654]
]

polygon = Polygon(study_ring)

print(f"Looking for: {CONTOUR_PATH}")
if not os.path.exists(CONTOUR_PATH):
    raise FileNotFoundError(f"Contour file not found: {CONTOUR_PATH}")

with open(CONTOUR_PATH, 'r', encoding='utf-8') as f:
    data = json.load(f)

clipped_features = []
for feature in data['features']:
    geom = shape(feature['geometry'])
    clipped = geom.intersection(polygon)
    if not clipped.is_empty:
        feature['geometry'] = mapping(clipped)
        clipped_features.append(feature)

out = {
    'type': 'FeatureCollection',
    'features': clipped_features
}

with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(out, f)

print(f"Clipped {len(clipped_features)} features. Saved to {OUTPUT_PATH}")
