/** Fixed storage; record() performs no allocation or sorting in the render loop. */
export class FrameTelemetry {
  private readonly samples: Float64Array;
  private cursor = 0;
  private count = 0;
  constructor(capacity = 240) { this.samples = new Float64Array(capacity); }
  record(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return;
    this.samples[this.cursor] = milliseconds;
    this.cursor = (this.cursor + 1) % this.samples.length;
    this.count = Math.min(this.count + 1, this.samples.length);
  }
  snapshot(): { fps: number; averageFrameMs: number; p95FrameMs: number; longFrames: number; sampleCount: number } {
    if (!this.count) return { fps: 0, averageFrameMs: 0, p95FrameMs: 0, longFrames: 0, sampleCount: 0 };
    const sorted = this.samples.slice(0, this.count).sort();
    let total = 0, longFrames = 0;
    for (const ms of sorted) { total += ms; if (ms > 1000 / 30) longFrames++; }
    return { fps: 1000 * this.count / total, averageFrameMs: total / this.count,
      p95FrameMs: sorted[Math.ceil(this.count * 0.95) - 1], longFrames, sampleCount: this.count };
  }
}
