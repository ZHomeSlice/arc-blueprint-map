import json
from pathlib import Path

import numpy as np
from PIL import Image

directory = Path('C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots')
names = json.loads(Path(__file__).with_name('wiki-blueprint-grid.json').read_text(encoding='utf-8'))


def screenshot(filename):
    return np.asarray(Image.open(directory / filename).convert('RGB').resize((2048, 1152)), dtype=np.int16)


first = screenshot('20260928083711_1.jpg')
second = screenshot('20260928083718_1.jpg')
rows = [(first, y) for y in (338, 449, 560, 671)] + [(second, y) for y in (350, 461, 572, 683, 794)]
results = []
for row_index, (image, top) in enumerate(rows):
    for column in range(10):
        index = row_index * 10 + column
        if index >= len(names):
            break
        left = 461 + column * 111
        tile = image[top + 8:top + 72, left + 8:left + 94]
        red, green, blue = tile[:, :, 0], tile[:, :, 1], tile[:, :, 2]
        blue_fraction = np.mean((blue > 45) & (blue > red * 1.35) & (blue > green * 1.12) & (green > 20))
        obtained = bool(blue_fraction > .20)
        results.append({'slot': index + 1, 'row': row_index + 1, 'column': column + 1,
                        'name': names[index], 'obtained': obtained, 'blue_fraction': round(float(blue_fraction), 3)})

found = sum(item['obtained'] for item in results)
if found != 73 or len(results) != 83:
    raise RuntimeError(f'Expected 73/83 found, detected {found}/{len(results)}')
Path(__file__).with_name('identified-collection.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
for item in results:
    if not item['obtained']:
        print(f"Missing slot {item['slot']:02}, row {item['row']}, col {item['column']}: {item['name']} ({item['blue_fraction']})")
print(f'Found {found}/{len(results)}')
