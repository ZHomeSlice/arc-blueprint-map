export class LootWindow {
  constructor(durationMs = 4000) { this.durationMs = durationMs; this.reset(); }
  reset() { this.openedAt = null; this.seen = new Set(); }
  observe(panelVisible, slots, now) {
    if (!panelVisible) { this.reset(); return []; }
    if (this.openedAt === null) this.openedAt = now;
    if (now - this.openedAt > this.durationMs) return [];
    const fresh = slots.filter(slot => !this.seen.has(slot));
    for (const slot of slots) this.seen.add(slot);
    return fresh;
  }
}
