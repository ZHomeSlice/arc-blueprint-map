export const UNLOCATED_ALERT_MS = 20_000;
export const LOCATED_ALERT_MS = 10_000;

export class AlertLifecycle {
  constructor(onExpire, clock = globalThis) {
    this.onExpire = onExpire;
    this.clock = clock;
    this.activeId = null;
    this.timer = null;
  }

  show(id, durationMs) {
    this.dismiss();
    this.activeId = id;
    this.timer = this.clock.setTimeout(() => {
      if (this.activeId !== id) return;
      this.activeId = null;
      this.timer = null;
      this.onExpire();
    }, durationMs);
  }

  dismiss(id = this.activeId) {
    if (id !== this.activeId) return;
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.activeId = null;
  }

  isActive(id) {
    return Boolean(id && id === this.activeId);
  }
}
