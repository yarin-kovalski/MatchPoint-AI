import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { ForwardSwingFusion } from "../client-pc/src/motion/forwardSwingFusion.js";
import { NormalizedSensorFrame, SensorNormalizer } from "../client-pc/src/motion/sensorNormalization.js";

const basis = { forward: [0, 0, -1] as [number, number, number], right: [1, 0, 0] as [number, number, number], up: [0, 1, 0] as [number, number, number], origin: [0, 0, 0] as [number, number, number] };

function frame(timestamp: number, acceleration: THREE.Vector3, omega: THREE.Vector3): NormalizedSensorFrame {
  return {
    timestamp, sensorTimestamp: timestamp / 1000, deltaTime: 0.016,
    currentPhoneQuaternion: new THREE.Quaternion(), relativePhoneQuaternion: new THREE.Quaternion(),
    mappedRacketQuaternion: new THREE.Quaternion(), angularVelocityLocal: omega.clone(),
    angularVelocityWorld: omega.clone(), angularSpeed: omega.length(), rawAcceleration: acceleration.clone(),
    accelerationIncludingGravity: new THREE.Vector3(0, -9.80665, 0),
    gravityCompensatedAcceleration: acceleration.clone(), smoothedAcceleration: acceleration.clone(),
    fastAcceleration: acceleration.clone(), accelerationMagnitude: acceleration.length(), jerk: 0,
    racketForwardVector: new THREE.Vector3(0, 1, 0), racketUpVector: new THREE.Vector3(0, 0, 1),
    racketSideVector: new THREE.Vector3(1, 0, 0), racketFaceNormal: new THREE.Vector3(0, 1, 0),
    racketFaceAngleToCourtRadians: 0.1, motionForwardScore: 0, motionUpwardScore: 0,
    motionSidewaysScore: 0, valid: true, rejectionReason: ""
  };
}

function sample(acceleration: THREE.Vector3, omega: THREE.Vector3) {
  const fusion = new ForwardSwingFusion();
  for (let timestamp = 1000; timestamp <= 1160; timestamp += 20) fusion.add(frame(timestamp, acceleration, omega));
  return fusion.snapshot(1160, basis)!;
}

test("forward acceleration raises the fused forward-drive score", () => {
  const weak = sample(new THREE.Vector3(0, 0, -2), new THREE.Vector3(-5, 0, 0));
  const strong = sample(new THREE.Vector3(0, 0, -10), new THREE.Vector3(-5, 0, 0));
  assert.ok(strong.forwardDriveScore > weak.forwardDriveScore + 0.15);
  assert.ok(strong.forwardAcceleration > weak.forwardAcceleration);
});

test("lateral-only and backward swings report explicit invalid directions", () => {
  const lateral = sample(new THREE.Vector3(8, 0, 0), new THREE.Vector3(0, 0, 10));
  const backward = sample(new THREE.Vector3(0, 0, 8), new THREE.Vector3(6, 0, 0));
  assert.equal(lateral.invalidDirectionReason, "LATERAL_SWING_DOMINANT");
  assert.equal(backward.invalidDirectionReason, "BACKWARD_SWING");
});

test("static tilted phone does not become a forward swing", () => {
  const normalizer = new SensorNormalizer();
  const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 3);
  const normalized = normalizer.process({
    timestamp: 1000, sensorTimestamp: 1, currentPhoneQuaternion: tilt,
    relativePhoneQuaternion: tilt, mappedRacketQuaternion: tilt,
    accelerationMps2: new THREE.Vector3(), accelerationIncludingGravityMps2: new THREE.Vector3(0, 0, -9.80665)
  });
  assert.equal(normalized.gravityCompensatedAcceleration.length(), 0);
  assert.equal(normalized.motionForwardScore, 0);
});

test("upward evidence and player-local racket-head components are retained", () => {
  const result = sample(new THREE.Vector3(0, 6, -8), new THREE.Vector3(-8, 0, 0));
  assert.ok(result.upwardAcceleration > 5);
  assert.ok(result.forwardRacketHeadVelocity > 5);
  assert.equal(result.invalidDirectionReason, "NONE");
});
