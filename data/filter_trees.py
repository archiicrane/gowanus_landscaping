import pandas as pd
import json
from shapely.geometry import Point, Polygon

csv_file = "trees.csv"

df = pd.read_csv(csv_file)

gowanus = Polygon([
    (-73.98963594611494, 40.683945676183654),
    (-73.98084416376932, 40.680669969224006),
    (-73.99274143083169, 40.665495232798115),
    (-73.99607305804426, 40.667988596328655),
    (-73.99889524234268, 40.67260255106102),
    (-73.9964465299067, 40.67744610487334),
    (-73.99461997552936, 40.67663528353369)
])

trees = []

for _, row in df.iterrows():
    lat = row.get("latitude")
    lon = row.get("longitude")

    if pd.isna(lat) or pd.isna(lon):
        continue

    point = Point(lon, lat)

    if gowanus.contains(point):
        trees.append({
            "tree_id": row.get("tree_id"),
            "species": row.get("spc_common"),
            "dbh": row.get("dbh"),
            "health": row.get("health"),
            "lat": lat,
            "lon": lon
        })

with open("gowanus_trees.json", "w", encoding="utf-8") as f:
    json.dump(trees, f, indent=2)

print("Done.")
print("Trees inside Gowanus:", len(trees))