import json

# Polygon from STUDY_RING in main.js (as [lng, lat] pairs)
STUDY_RING = [
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

def point_in_polygon(lon, lat, polygon):
    x, y = lon, lat
    inside = False
    n = len(polygon)
    p1x, p1y = polygon[0]
    for i in range(n+1):
        p2x, p2y = polygon[i % n]
        if min(p1y, p2y) < y <= max(p1y, p2y):
            if x <= max(p1x, p2x):
                if p1y != p2y:
                    xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y + 1e-12) + p1x
                if p1x == p2x or x <= xinters:
                    inside = not inside
        p1x, p1y = p2x, p2y
    return inside

def main():
    with open('data/gowanus_trees.json') as f:
        trees = json.load(f)
    species_set = set()
    for t in trees:
        species = t.get('species')
        if (
            t.get('lat') is not None and
            t.get('lon') is not None and
            isinstance(species, str) and species.strip()
        ):
            if point_in_polygon(t['lon'], t['lat'], STUDY_RING):
                species_set.add(species.strip().lower())
    print('Unique species within clipped area:')
    for s in sorted(species_set):
        print('-', s)
    # Optionally, write to a file
    with open('data/species_within_clip.json', 'w') as f:
        json.dump(sorted(species_set), f, indent=2)

if __name__ == '__main__':
    main()
