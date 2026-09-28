export function blueprintFromText(text) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const clean = value => value.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').replace(/\s+/g, ' ').trim();
  const valid = value => value.length >= 3 && value.length <= 70 && (value.match(/[a-z]/gi) || []).length >= 3 && !/^(already learned|ping item)$/i.test(value);

  // Item titles have priority over the small BLUEPRINT category label and status text.
  for (const line of lines) {
    const match = line.match(/^(.+?)\s+blueprint\s*$/i);
    if (!match) continue;
    const name = clean(match[1]);
    if (valid(name) && !/[|]/.test(name)) return name;
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^blueprint\s*[:\-]?\s*$/i.test(line)) continue;
    const next = clean(lines[i + 1] || '');
    if (valid(next)) return next.replace(/\s+blueprint$/i, '');
    const previous = clean(lines[i - 1] || '');
    if (valid(previous)) return previous;
  }
  return null;
}

export function clamp01(value) { return Math.max(0, Math.min(1, Number(value))); }
export function positionFromEvent(event, element) {
  const box = element.getBoundingClientRect();
  return { x: clamp01((event.clientX - box.left) / box.width), y: clamp01((event.clientY - box.top) / box.height) };
}

export function createFind(name, map, position) {
  return { id: crypto.randomUUID(), name: name.trim(), map, x: clamp01(position.x), y: clamp01(position.y), foundAt: new Date().toISOString() };
}
