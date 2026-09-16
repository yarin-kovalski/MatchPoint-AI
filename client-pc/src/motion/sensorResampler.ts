import * as THREE from "three";
import { ensureQuaternionContinuity, isFiniteQuaternion, isFiniteVector } from "./motionFiltering.js";

export const SENSOR_INTERPOLATION_DELAY_MS = 32;
export const FAST_SWING_INTERPOLATION_DELAY_MS = 10;
export const MAXIMUM_SENSOR_EXTRAPOLATION_MS = 90;
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
  rejectedPackets: number;
  duplicatePackets: number;
  outOfOrderPackets: number;
  staleFrames: number;
  packetRateHz: number;
  averageIntervalMs: number;
  packetJitterMs: number;
  maximumAngularDeltaRadians: number;
  extrapolationMs: number;
  state: "empty" | "interpolating" | "extrapolating" | "stale" | "held";
  latestSampleTimestamp: number | null;
};

export class SensorResampler {
  private readonly samples: OrientationSample[] = [];
  readonly output = new THREE.Quaternion();
  private readonly predictionAxis = new THREE.Vector3();
  private readonly predictionDelta = new THREE.Quaternion();
  private currentInterpolationDelayMs = SENSOR_INTERPOLATION_DELAY_MS;
  readonly telemetry: SensorResamplerTelemetry = {
    acceptedPackets: 0, rejectedPackets: 0, duplicatePackets: 0, outOfOrderPackets: 0, staleFrames: 0,
    packetRateHz: 0, averageIntervalMs: 0, packetJitterMs: 0,
    maximumAngularDeltaRadians: 0, extrapolationMs: 0, state: "empty", latestSampleTimestamp: null
  };

  add(sample: OrientationSample): boolean {
    if (!Number.isFinite(sample.timestamp) || !isFiniteQuaternion(sample.quaternion) || sample.quaternion.lengthSq() < 1e-8 || !isFiniteVector(sample.angularVelocity)) {
      this.telemetry.rejectedPackets += 1;
      return false;
    }
    const previous = this.samples.at(-1);
    if (previous && sample.timestamp === previous.timestamp) {
      this.telemetry.duplicatePackets += 1;
      this.telemetry.rejectedPackets += 1;
      return false;
    }
    if (previous && sample.timestamp < previous.timestamp) {
      this.telemetry.outOfOrderPackets += 1;
      this.telemetry.rejectedPackets += 1;
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
    this.telemetry.latestSampleTimestamp = sample.timestamp;
    return true;
  }

  sample(renderTimestamp: number): THREE.Quaternion | null {
    if (this.samples.length === 0) {
      this.telemetry.state = "empty";
      return null;
    }
    const first = this.samples[0];
    const latest = this.samples[this.samples.length - 1];
    const desiredDelay = interpolationDelayMs(latest.angularSpeed);
    // Enter low latency quickly, then restore the smoothing buffer gradually so
    // the render target never jumps backward when a fast swing ends.
    const delayStep = desiredDelay < this.currentInterpolationDelayMs ? 8 : 1.5;
    this.currentInterpolationDelayMs += THREE.MathUtils.clamp(
      desiredDelay - this.currentInterpolationDelayMs, -delayStep, delayStep
    );
    const target = renderTimestamp - this.currentInterpolationDelayMs;
    if (target <= first.timestamp) {
      this.telemetry.extrapolationMs = 0;
      this.telemetry.state = "held";
      return this.output.copy(first.quaternion);
    }
    for (let index = 1; index < this.samples.length; index += 1) {
      const right = this.samples[index];
      if (right.timestamp < target) continue;
      const left = this.samples[index - 1];
      const amount = THREE.MathUtils.clamp((target - left.timestamp) / Math.max(1, right.timestamp - left.timestamp), 0, 1);
      this.telemetry.extrapolationMs = 0;
      this.telemetry.state = "interpolating";
      return this.output.copy(left.quaternion).slerp(right.quaternion, amount).normalize();
    }
    const requestedExtrapolation = target - latest.timestamp;
    const extrapolationMs = THREE.MathUtils.clamp(requestedExtrapolation, 0, MAXIMUM_SENSOR_EXTRAPOLATION_MS);
    this.telemetry.extrapolationMs = extrapolationMs;
    if (requestedExtrapolation > MAXIMUM_SENSOR_EXTRAPOLATION_MS) {
      this.telemetry.staleFrames += 1;
      this.telemetry.state = "stale";
    } else {
      this.telemetry.state = extrapolationMs > 0 ? "extrapolating" : "held";
    }
    this.output.copy(latest.quaternion);
    const speed = Math.min(30, latest.angularVelocity.length());
    if (speed > 1e-5 && extrapolationMs > 0) {
      // Taper prediction to zero velocity at the horizon instead of abruptly
      // stopping a full-speed rotation when packets are lost.
      const seconds = extrapolationMs / 1000;
      const horizon = MAXIMUM_SENSOR_EXTRAPOLATION_MS / 1000;
      const predictedAngle = speed * (seconds - seconds * seconds / (2 * horizon));
      this.predictionDelta.setFromAxisAngle(
        this.predictionAxis.copy(latest.angularVelocity).normalize(), predictedAngle
      );
      this.output.multiply(this.predictionDelta).normalize();
    }
    return this.output;
  }

  reset(): void {
    this.samples.length = 0;
    this.output.identity();
    this.currentInterpolationDelayMs = SENSOR_INTERPOLATION_DELAY_MS;
    Object.assign(this.telemetry, {
      acceptedPackets: 0, rejectedPackets: 0, duplicatePackets: 0, outOfOrderPackets: 0, staleFrames: 0,
      packetRateHz: 0, averageIntervalMs: 0, packetJitterMs: 0,
      maximumAngularDeltaRadians: 0, extrapolationMs: 0, state: "empty", latestSampleTimestamp: null
    });
  }
}

export function interpolationDelayMs(angularSpeed: number): number {
  const fastSwingAmount = THREE.MathUtils.clamp((angularSpeed - 2) / 8, 0, 1);
  return THREE.MathUtils.lerp(SENSOR_INTERPOLATION_DELAY_MS, FAST_SWING_INTERPOLATION_DELAY_MS, fastSwingAmount);
}

export function adaptiveVisualSmoothingFactor(
  angularSpeed: number,
  accelerationMagnitude: number,
  jerk: number,
  valid: boolean,
  deltaSeconds = 1 / 60
): number {
  if (!valid) return timeBasedSmoothing(0.08, deltaSeconds);
  const motion = THREE.MathUtils.clamp(
    angularSpeed / 10 + accelerationMagnitude / 35 + Math.min(jerk, 120) / 300,
    0, 1
  );
  return timeBasedSmoothing(THREE.MathUtils.lerp(0.12, 0.82, motion), deltaSeconds);
}

export function timeBasedSmoothing(factorAt60Hz: number, deltaSeconds: number): number {
  return 1 - Math.pow(1 - THREE.MathUtils.clamp(factorAt60Hz, 0, 1), Math.max(0, deltaSeconds) * 60);
}

/** Visual-only recovery guard; never alters the collider or calibrated baseline. */
export function updateVisualRacketQuaternion(
  output: THREE.Quaternion, target: THREE.Quaternion, factor: number, deltaSeconds: number
): THREE.Quaternion {
  const angle = output.angleTo(target);
  const maxStep = 30 * Math.min(Math.max(deltaSeconds, 0), 1 / 30);
  const amount = angle > 1e-6 ? Math.min(factor, maxStep / angle) : factor;
  return output.slerp(target, amount).normalize();
}
