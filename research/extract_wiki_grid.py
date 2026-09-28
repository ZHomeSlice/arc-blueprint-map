import html
import json
import re
from pathlib import Path

source = Path(__file__).with_name('wiki-blueprints.html').read_text(encoding='utf-8')
names = [html.unescape(name) for name in re.findall(r'<div class="bp-name">(.*?)</div>', source)]
if len(names) != 83:
    raise RuntimeError(f'Expected 83 blueprint grid cells, got {len(names)}')
Path(__file__).with_name('wiki-blueprint-grid.json').write_text(json.dumps(names, indent=2), encoding='utf-8')
for index, name in enumerate(names, 1):
    print(f'{index:02} row {(index - 1) // 10 + 1} col {(index - 1) % 10 + 1}: {name}')
