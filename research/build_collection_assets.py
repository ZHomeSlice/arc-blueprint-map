import json
import shutil
from pathlib import Path

root = Path(__file__).resolve().parents[1]
research = root / 'research'
public = root / 'public'
icons = public / 'catalog-icons'
icons.mkdir(exist_ok=True)

identified = json.loads((research / 'identified-collection.json').read_text(encoding='utf-8'))
catalog = json.loads((research / 'blueprint-catalog.json').read_text(encoding='utf-8'))


def key(name):
    return ''.join(character for character in name.lower().replace('blueprint', '') if character.isalnum())


by_name = {key(item['name']): item for item in catalog['entries']}
aliases = {'aphelion': 'aphelionrifle', 'bettinai': 'bettina', 'trailblazer': 'trailblazergrenade'}
output = []
for item in identified:
    item_key = key(item['name'])
    reference = by_name.get(aliases.get(item_key, item_key))
    if reference is None:
        raise RuntimeError(f"No icon found for {item['name']}")
    filename = reference['id'] + '.webp'
    shutil.copyfile(research / 'catalog-icons' / filename, icons / filename)
    output.append({field: item[field] for field in ('slot', 'row', 'column', 'name', 'obtained')}
                  | {'icon': '/catalog-icons/' + filename})

(public / 'collection-data.json').write_text(json.dumps(output, indent=2), encoding='utf-8')
print(f'Built {len(output)} labeled blueprint cards; {sum(item["obtained"] for item in output)} obtained')
