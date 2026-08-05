import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { ensureQuaternionContinuity } from "../client-pc/src/motion/motionFiltering.js";
import { getRacketBasisFromQuaternion } from "../client-pc/src/motion/racketBasis.js";
import {
  phoneVectorToThreeVector,
  SensorNormalizationInput,
  SensorNormalizer
} from "../client-pc/src/motion/sensorNormalization.js";

const IDENTITY = new THREE.Quaternion();

function createInput(
  timestamp: number,
  quaternion = IDENTITY,
  acceleration = new THREE.Vector3()
): SensorNormalizationInput {
  return {
    timestamp,
    sensorTimestamp: timestamp / 1000,
    currentPhoneQuaternion: quaternion.clone(),
    relativePhoneQuaternion: quaternion.clone(),
    mappedRacketQuaternion: quaternion.clone(),
    accelerationMps2: acceleration.clone(),
    accelerationIncludingGravityMps2: new THREE.Vector3(0, 0, -9.80665)
  };
}

function approximately(actual: number, expected: number, tolerance = 0.001): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

test("phone vectors map explicitly into Three.js axes", () => {
  assert.deepEqual(phoneVectorToThreeVector(new THREE.Vector3(1, 2, 3)).toArray(), [1, 3, -2]);
});

test("quaternion sign changes retain the short interpolation path", () => {
  const previous = new THREE.Quaternion(0.1, 0.2, 0.3, 0.9).normalize();
  const sameRotationWithOppositeSign = new THREE.Quaternion(
    -previous.x,
    -previous.y,
    -previous.z,
    -previous.w
  );

  ensureQuaternionContinuity(sameRotationWithOppositeSign, previous);
  approximately(sameRotationWithOppositeSign.dot(previous), 1);
});

test("corrected ready pose points the head forward and face upward", () => {
  const baseReady = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    THREE.MathUtils.degToRad(12)
  );
  const modelCorrection = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    -Math.PI / 2
  );
  const basis = getRacketBasisFromQuaternion(baseReady.multiply(modelCorrection));

  assert.ok(basis.forward.z < -0.95);
  assert.ok(basis.forward.y > 0.15);
  assert.ok(basis.faceNormal.y > 0.95);
  assert.ok(basis.faceAngleToCourtRadians < THREE.MathUtils.degToRad(15));
});

test("normalizer keeps separate smoothed and fast acceleration paths", () => {
  const normalizer = new SensorNormalizer();
  normalizer.process(createInput(1000));
  const frame = normalizer.process(createInput(1016, IDENTITY, new THREE.Vector3(10, 0, 0)));

  approximately(frame.smoothedAcceleration.x, 2.5);
  approximately(frame.fastAcceleration.x, 6.5);
  assert.ok(frame.fastAcceleration.x > frame.smoothedAcceleration.x);
  assert.equal(frame.valid, true);
});

test("zero-length quaternions are rejected", () => {
  const normalizer = new SensorNormalizer();
  const frame = normalizer.process(
    createInput(1000, new THREE.Quaternion(0, 0, 0, 0))
  );

  assert.equal(frame.valid, false);
  assert.equal(frame.rejectionReason, "invalid quaternion");
});

test("impossible one-frame rotations are rejected", () => {
  const normalizer = new SensorNormalizer();
  normalizer.process(createInput(1000));
  const halfTurn = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.PI
  );
  const frame = normalizer.process(createInput(1016, halfTurn));

  assert.equal(frame.valid, false);
  assert.equal(frame.rejectionReason, "impossible rotation spike");
});

test("large packet gaps invalidate and reset angular history", () => {
  const normalizer = new SensorNormalizer();
  normalizer.process(createInput(1000));
  const gapFrame = normalizer.process(createInput(1400));
  const recoveredFrame = normalizer.process(createInput(1416));

  assert.equal(gapFrame.valid, false);
  assert.equal(gapFrame.rejectionReason, "packet gap");
  assert.equal(recoveredFrame.valid, true);
  approximately(recoveredFrame.angularSpeed, 0);
});

test("stationary noise does not create meaningful angular speed", () => {
  const normalizer = new SensorNormalizer();
  normalizer.process(createInput(1000));
  const tinyRotation = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    0.0005
  );
  const frame = normalizer.process(createInput(1016, tinyRotation));

  assert.equal(frame.valid, true);
  assert.ok(frame.angularSpeed < 0.05);
});
