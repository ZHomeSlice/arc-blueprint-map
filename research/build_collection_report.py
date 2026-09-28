import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
items = json.loads((root / 'research' / 'identified-collection.json').read_text(encoding='utf-8'))
missing = [item for item in items if not item['obtained']]
lines = [
    '# ARC Raiders blueprint collection — September 28, 2026',
    '',
    '**73 of 83 found.** Identified from the two collection screenshots supplied on September 28, 2026.',
    '',
    'The slot names follow the [ARC Raiders Wiki blueprint grid](https://arcraiders.wiki/wiki/Blueprints). '
    'Icons were checked against the [MetaForge blueprint catalog](https://metaforge.app/arc-raiders/blueprint-tracker). '
    'The rows and columns below match the in-game collection layout.',
    '',
    '## Missing blueprints',
    '',
]
lines += [f"- Row {item['row']}, column {item['column']}: **{item['name']}**" for item in missing]
lines += ['', '## Complete collection', '', '| Slot | Position | Blueprint | Status |', '| ---: | :--- | :--- | :--- |']
lines += [f"| {item['slot']} | R{item['row']} C{item['column']} | {item['name']} | {'Found' if item['obtained'] else '**Missing**'} |"
          for item in items]
lines += ['', 'These screenshots show collection status. They do not show where an item was found or which blueprints were acquired during the last raid.', '']
(root / 'Blueprint-Collection-2026-09-28.md').write_text('\n'.join(lines), encoding='utf-8')
print(f'Wrote report with {len(items)} entries and {len(missing)} missing blueprints')
