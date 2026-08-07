import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  adaptiveVisualSmoothingFactor, MAXIMUM_SENSOR_EXTRAPOLATION_MS,
  SENSOR_INTERPOLATION_DELAY_MS, SensorResampler
} from "../client-pc/src/motion/sensorResampler.js";

const sample = (timestamp: number, angle: number, sign = 1) => {
  const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
  if (sign < 0) quaternion.set(-quaternion.x, -quaternion.y, -quaternion.z, -quaternion.w);
  return {
    timestamp, quaternion, angularVelocity: new THREE.Vector3(0, 2, 0), angularSpeed: 2,
    accelerationMagnitude: 3, jerk: 4
  };
};

test("timestamp resampling ignores duplicate and out-of-order packets", () => {
  const resampler = new SensorResampler();
  assert.equal(resampler.add(sample(1000, 0)), true);
  assert.equal(resampler.add(sample(1000, 0.1)), false);
  assert.equal(resampler.add(sample(999, 0.1)), false);
  assert.equal(resampler.telemetry.duplicatePackets, 1);
  assert.equal(resampler.telemetry.outOfOrderPackets, 1);
});

test("quaternion sign flips interpolate without a visual jump", () => {
  const resampler = new SensorResampler();
  resampler.add(sample(1000, 0));
  resampler.add(sample(1100, 0.4, -1));
  const halfway = resampler.sample(1050 + SENSOR_INTERPOLATION_DELAY_MS)!;
  const expected = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.2);
  assert.ok(halfway.angleTo(expected) < 1e-6);
});

test("temporary packet gaps use strictly bounded extrapolation", () => {
  const resampler = new SensorResampler();
  resampler.add(sample(1000, 0));
  const result = resampler.sample(1200 + SENSOR_INTERPOLATION_DELAY_MS)!;
  const maximumExpectedAngle = 2 * MAXIMUM_SENSOR_EXTRAPOLATION_MS / 1000;
  assert.ok(result.angleTo(new THREE.Quaternion()) <= maximumExpectedAngle + 1e-8);
  assert.equal(resampler.telemetry.extrapolationMs, MAXIMUM_SENSOR_EXTRAPOLATION_MS);
  assert.equal(resampler.telemetry.staleFrames, 1);
});

test("adaptive smoothing suppresses stationary jitter and responds faster during swings", () => {
  const stationary = adaptiveVisualSmoothingFactor(0.1, 0.2, 1, true);
  const fast = adaptiveVisualSmoothingFactor(12, 30, 100, true);
  assert.ok(stationary < 0.16);
  assert.ok(fast > 0.5);
  assert.ok(fast > stationary);
});
