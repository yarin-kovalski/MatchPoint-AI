import * as THREE from "three";
import { ensureQuaternionContinuity, isFiniteQuaternion } from "./motionFiltering.js";

export const SENSOR_INTERPOLATION_DELAY_MS = 40;
export const MAXIMUM_SENSOR_EXTRAPOLATION_MS = 50;
const MAX_SAMPLES = 24;

export type OrientationSample = {
  timestamp: number;
  quaternion: THREE.Quaternion;
  angularVelocity: THREE.Vector3;
  angularSpeed: number;
  accelerationMagnitude: number;
  jerk: number;
};

export type SensorResamplerTelemetry = {
  acceptedPackets: number;
  duplicatePackets: number;
  outOfOrderPackets: number;
  staleFrames: number;
  packetRateHz: number;
  averageIntervalMs: number;
  packetJitterMs: number;
  maximumAngularDeltaRadians: number;
  extrapolationMs: number;
};

export class SensorResampler {
  private readonly samples: OrientationSample[] = [];
  readonly output = new THREE.Quaternion();
  readonly telemetry: SensorResamplerTelemetry = {
    acceptedPackets: 0, duplicatePackets: 0, outOfOrderPackets: 0, staleFrames: 0,
    packetRateHz: 0, averageIntervalMs: 0, packetJitterMs: 0,
    maximumAngularDeltaRadians: 0, extrapolationMs: 0
  };

  add(sample: OrientationSample): boolean {
    if (!Number.isFinite(sample.timestamp) || !isFiniteQuaternion(sample.quaternion) || sample.quaternion.lengthSq() < 1e-8) return false;
    const previous = this.samples.at(-1);
    if (previous && sample.timestamp === previous.timestamp) {
      this.telemetry.duplicatePackets += 1;
      return false;
    }
    if (previous && sample.timestamp < previous.timestamp) {
      this.telemetry.outOfOrderPackets += 1;
      return false;
    }
    const quaternion = sample.quaternion.clone().normalize();
    ensureQuaternionContinuity(quaternion, previous?.quaternion ?? null);
    if (previous) {
      const interval = sample.timestamp - previous.timestamp;
      const count = this.telemetry.acceptedPackets;
      const previousAverage = this.telemetry.averageIntervalMs;
      this.telemetry.averageIntervalMs += (interval - previousAverage) / Math.max(1, count);
      this.telemetry.packetJitterMs += (Math.abs(interval - previousAverage) - this.telemetry.packetJitterMs) * 0.12;
      this.telemetry.packetRateHz = 1000 / Math.max(1, this.telemetry.averageIntervalMs);
      this.telemetry.maximumAngularDeltaRadians = Math.max(
        this.telemetry.maximumAngularDeltaRadians, previous.quaternion.angleTo(quaternion)
      );
    }
    this.samples.push({ ...sample, quaternion, angularVelocity: sample.angularVelocity.clone() });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
    this.telemetry.acceptedPackets += 1;
    return true;
  }

  sample(renderTimestamp: number): THREE.Quaternion | null {
    if (this.samples.length === 0) return null;
    const target = renderTimestamp - SENSOR_INTERPOLATION_DELAY_MS;
    const first = this.samples[0];
    const latest = this.samples[this.samples.length - 1];
    if (target <= first.timestamp) return this.output.copy(first.quaternion);
    for (let index = 1; index < this.samples.length; index += 1) {
      const right = this.samples[index];
      if (right.timestamp < target) continue;
      const left = this.samples[index - 1];
      const amount = THREE.MathUtils.clamp((target - left.timestamp) / Math.max(1, right.timestamp - left.timestamp), 0, 1);
      this.telemetry.extrapolationMs = 0;
      return this.output.copy(left.quaternion).slerp(right.quaternion, amount).normalize();
    }
    const requestedExtrapolation = target - latest.timestamp;
    const extrapolationMs = THREE.MathUtils.clamp(requestedExtrapolation, 0, MAXIMUM_SENSOR_EXTRAPOLATION_MS);
    this.telemetry.extrapolationMs = extrapolationMs;
    if (requestedExtrapolation > MAXIMUM_SENSOR_EXTRAPOLATION_MS) this.telemetry.staleFrames += 1;
    this.output.copy(latest.quaternion);
    const speed = latest.angularVelocity.length();
    if (speed > 1e-5 && extrapolationMs > 0) {
      const delta = new THREE.Quaternion().setFromAxisAngle(
        latest.angularVelocity.clone().normalize(), speed * extrapolationMs / 1000
      );
      this.output.multiply(delta).normalize();
    }
    return this.output;
  }

  reset(): void {
    this.samples.length = 0;
    this.output.identity();
    Object.assign(this.telemetry, {
      acceptedPackets: 0, duplicatePackets: 0, outOfOrderPackets: 0, staleFrames: 0,
      packetRateHz: 0, averageIntervalMs: 0, packetJitterMs: 0,
      maximumAngularDeltaRadians: 0, extrapolationMs: 0
    });
  }
}

export function adaptiveVisualSmoothingFactor(
  angularSpeed: number,
  accelerationMagnitude: number,
  jerk: number,
  valid: boolean
): number {
  if (!valid) return 0.08;
  const motion = THREE.MathUtils.clamp(
    angularSpeed / 10 + accelerationMagnitude / 35 + Math.min(jerk, 120) / 300,
    0, 1
  );
  return THREE.MathUtils.lerp(0.12, 0.58, motion);
}
