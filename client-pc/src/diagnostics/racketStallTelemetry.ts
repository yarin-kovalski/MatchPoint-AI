export const RACKET_STALL_THRESHOLD_MS = 250;

export type ResamplerState = "empty" | "interpolating" | "extrapolating" | "stale" | "held";

export type RacketStallSample = {
  at: number;
  packetAgeMs: number | null;
  packetRateHz: number;
  packetJitterMs: number;
  duplicatePackets: number;
  stalePackets: number;
  rejectedPackets: number;
  physicsUpdateAgeMs: number;
  visualUpdateAgeMs: number;
  visualChangeAgeMs: number;
  frameDeltaMs: number;
  physicsSteps: number;
  extrapolationMs: number;
  resamplerState: ResamplerState;
  posePending: boolean;
  quaternionX: number;
  quaternionY: number;
  quaternionZ: number;
  quaternionW: number;
  quaternionAgeMs: number | null;
  runtimeErrors: number;
};

export function detectRacketStall(sample: RacketStallSample, reasons: string[] = []): string[] {
  reasons.length = 0;
  if (sample.packetAgeMs !== null && sample.packetAgeMs > RACKET_STALL_THRESHOLD_MS) {
    reasons.push("packet_age");
  }
  if (sample.packetAgeMs !== null && sample.packetAgeMs <= RACKET_STALL_THRESHOLD_MS &&
      sample.physicsUpdateAgeMs > RACKET_STALL_THRESHOLD_MS) {
    reasons.push("packets_arriving_physics_not_updated");
  }
  if (sample.frameDeltaMs <= RACKET_STALL_THRESHOLD_MS && sample.posePending &&
      sample.visualChangeAgeMs > RACKET_STALL_THRESHOLD_MS) {
    reasons.push("render_alive_racket_not_advancing");
  }
  if (sample.frameDeltaMs > RACKET_STALL_THRESHOLD_MS) reasons.push("main_thread_long_frame");
  return reasons;
}

/** Fixed-capacity three-second trace. Slots are allocated once and mutated in place. */
export class RacketStallTelemetry {
  private readonly samples: RacketStallSample[];
  private cursor = 0;
  private count = 0;
  private stallActive = false;
  private readonly currentReasons: string[] = [];
  private lastStall: { detectedAt: number; reasons: string[]; trace: RacketStallSample[] } | null = null;

  constructor(capacity = 720) {
    this.samples = Array.from({ length: capacity }, () => ({
      at: 0, packetAgeMs: null, physicsUpdateAgeMs: 0, visualUpdateAgeMs: 0,
      packetRateHz: 0, packetJitterMs: 0, duplicatePackets: 0, stalePackets: 0, rejectedPackets: 0,
      visualChangeAgeMs: 0, frameDeltaMs: 0, physicsSteps: 0, extrapolationMs: 0,
      resamplerState: "empty" as ResamplerState, posePending: false,
      quaternionX: 0, quaternionY: 0, quaternionZ: 0, quaternionW: 1,
      quaternionAgeMs: null, runtimeErrors: 0
    }));
  }

  record(sample: RacketStallSample): string[] {
    Object.assign(this.samples[this.cursor], sample);
    this.cursor = (this.cursor + 1) % this.samples.length;
    this.count = Math.min(this.count + 1, this.samples.length);
    const reasons = detectRacketStall(sample, this.currentReasons);
    if (reasons.length > 0 && !this.stallActive) {
      this.lastStall = { detectedAt: sample.at, reasons: [...reasons], trace: this.snapshot() };
    }
    this.stallActive = reasons.length > 0;
    return reasons;
  }

  snapshot(): RacketStallSample[] {
    const start = (this.cursor - this.count + this.samples.length) % this.samples.length;
    const ordered = Array.from({ length: this.count }, (_, index) => ({
      ...this.samples[(start + index) % this.samples.length]
    }));
    const latestAt = ordered.at(-1)?.at ?? 0;
    return ordered.filter(sample => sample.at >= latestAt - 3000);
  }

  getLastStall(): { detectedAt: number; reasons: string[]; trace: RacketStallSample[] } | null {
    return this.lastStall;
  }

  isStallActive(): boolean {
    return this.stallActive;
  }
}
