export const SENSOR_UI_INTERVAL_MS = 100;

/** Keeps sensor callbacks lightweight while preserving a readable 10 Hz phone display. */
export class SensorUiThrottle {
  private nextUpdateAt = 0;

  shouldUpdate(now: number): boolean {
    if (!Number.isFinite(now) || now < this.nextUpdateAt) return false;
    this.nextUpdateAt = now + SENSOR_UI_INTERVAL_MS;
    return true;
  }

  reset(): void {
    this.nextUpdateAt = 0;
  }
}
