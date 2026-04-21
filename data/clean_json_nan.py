import json
import math

INPUT_PATH = 'data/gowanus_trees.json'
OUTPUT_PATH = 'data/gowanus_trees_clean.json'

def clean_nan(obj):
    if isinstance(obj, dict):
        return {k: clean_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_nan(v) for v in obj]
    elif isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    elif isinstance(obj, str) and obj.strip().lower() == 'nan':
        return None
    else:
        return obj

with open(INPUT_PATH, 'r', encoding='utf-8') as f:
    # Try to load as JSON, fallback to eval for non-standard NaN
    try:
        data = json.load(f)
    except json.decoder.JSONDecodeError:
        # Replace NaN with null for eval
        text = f.read().replace('NaN', 'null').replace('nan', 'null')
        data = json.loads(text)

cleaned = clean_nan(data)

with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(cleaned, f, indent=2)

print(f"Cleaned JSON written to {OUTPUT_PATH}")
