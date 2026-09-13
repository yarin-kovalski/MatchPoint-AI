import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BALL_CONFIG } from "../client-pc/src/ball/ballConfig.js";
import { createTrainingComfortProfile, positionValidatedProfileAtBaseline } from "../client-pc/src/ball/courtPositioning.js";
import { solveTrajectoryProfile } from "../client-pc/src/ball/trajectoryCalibration.js";
import { VALIDATED_TRAJECTORY_PRESET } from "../client-pc/src/ball/validatedTrajectoryPreset.js";
import { BALL_CAMERA_BASE_FOV, BALL_CAMERA_BASE_TARGET, updateBallFlightCamera } from "../client-pc/src/scene/ballFlightCamera.js";

test("Training feeds move bounce and contact into comparable comfortable reach", () => {
  const positioned = (["forehand", "backhand"] as const).map(stroke =>
    positionValidatedProfileAtBaseline(VALIDATED_TRAJECTORY_PRESET[stroke])
  );
  const training = positioned.map(createTrainingComfortProfile);
  assert.deepEqual(training[0].launchPointWorld, training[1].launchPointWorld);
  assert.equal(training[0].bouncePointWorld[0], -training[1].bouncePointWorld[0]);
  assert.equal(training[0].contactPointWorld[0], -training[1].contactPointWorld[0]);
  const baseline = new THREE.Vector3(0, 1.45, 5.75);
  for (let index = 0; index < training.length; index += 1) {
    const oldContact = new THREE.Vector3().fromArray(positioned[index].contactPointWorld);
    const contact = new THREE.Vector3().fromArray(training[index].contactPointWorld);
    assert.ok(contact.distanceTo(baseline) < oldContact.distanceTo(baseline));
    assert.ok(training[index].bouncePointWorld[2] > positioned[index].bouncePointWorld[2] + 4.5);
    assert.equal(solveTrajectoryProfile(training[index]).valid, true);
  }
  const forehandReach = new THREE.Vector3().fromArray(training[0].contactPointWorld).distanceTo(baseline);
  const backhandReach = new THREE.Vector3().fromArray(training[1].contactPointWorld).distanceTo(baseline);
  assert.ok(Math.abs(forehandReach - backhandReach) < 0.08);
  assert.ok(training[0].contactPointWorld[0] > 0 && training[1].contactPointWorld[0] < 0);
});

test("canonical Training feed uses exact mirrored strike-zone geometry", () => {
  const forehand = createTrainingComfortProfile(VALIDATED_TRAJECTORY_PRESET.forehand);
  const backhand = createTrainingComfortProfile(VALIDATED_TRAJECTORY_PRESET.backhand);
  assert.deepEqual(forehand.launchPointWorld, [0, 2.2, -8.5]);
  assert.deepEqual(forehand.bouncePointWorld, [0.75, 0.10350000000000001, 0.25]);
  assert.deepEqual(backhand.bouncePointWorld, [-0.75, 0.10350000000000001, 0.25]);
  assert.deepEqual(forehand.contactPointWorld, [1.5, 1.05, 4.65]);
  assert.deepEqual(backhand.contactPointWorld, [-1.5, 1.05, 4.65]);
  assert.equal(forehand.bounceToContactMs, 820);
  assert.equal(backhand.bounceToContactMs, 820);
});

test("Training feed clears net, bounces once, then rises into contact without a snap", () => {
  const profile = createTrainingComfortProfile(positionValidatedProfileAtBaseline(VALIDATED_TRAJECTORY_PRESET.forehand));
  const solved = solveTrajectoryProfile(profile);
  const launch = new THREE.Vector3().fromArray(profile.launchPointWorld);
  const timeToNet = (BALL_CONFIG.launch.netDepth - launch.z) / solved.preBounceVelocity.z;
  const netHeight = launch.y + solved.preBounceVelocity.y * timeToNet + 0.5 * BALL_CONFIG.gravity * timeToNet ** 2;
  assert.ok(netHeight > BALL_CONFIG.launch.netHeight + BALL_CONFIG.scale.physicalRadiusMeters);
  assert.ok(solved.postBounceVelocity.y > 0);
  assert.ok(solved.solvedApexPoint.y > profile.contactPointWorld[1]);
  const postBounceDistance = new THREE.Vector3().fromArray(profile.bouncePointWorld)
    .distanceTo(new THREE.Vector3().fromArray(profile.contactPointWorld));
  assert.ok(postBounceDistance > 3.5 && postBounceDistance < 5.5);
});

test("high-shot camera adjustment is smooth, bounded, and returns to baseline", () => {
  let state = { targetY: BALL_CAMERA_BASE_TARGET.y, fov: BALL_CAMERA_BASE_FOV };
  const first = updateBallFlightCamera(state, new THREE.Vector3(0, 9, -2), true, 1 / 60);
  assert.ok(first.targetY > state.targetY && first.targetY - state.targetY < 0.25);
  assert.ok(first.fov > state.fov && first.fov - state.fov < 0.3);
  state = first;
  for (let i = 0; i < 120; i += 1) state = updateBallFlightCamera(state, new THREE.Vector3(0, 9, -2), true, 1 / 60);
  assert.ok(state.targetY <= BALL_CAMERA_BASE_TARGET.y + 3.2);
  assert.ok(state.fov <= BALL_CAMERA_BASE_FOV + 4);
  const camera = new THREE.PerspectiveCamera(state.fov, 16 / 9, 0.1, 100);
  camera.position.fromArray(BALL_CONFIG.camera.position);
  camera.lookAt(BALL_CAMERA_BASE_TARGET.x, state.targetY, BALL_CAMERA_BASE_TARGET.z);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const highBallViewportY = new THREE.Vector3(0, 9, -2).project(camera).y;
  const netViewportY = new THREE.Vector3(0, BALL_CONFIG.launch.netHeight, BALL_CONFIG.launch.netDepth).project(camera).y;
  assert.ok(highBallViewportY < 0.7, `high ball entered top 15%: ${highBallViewportY}`);
  assert.ok(netViewportY > -0.8, `net left readable viewport: ${netViewportY}`);
  for (let i = 0; i < 180; i += 1) state = updateBallFlightCamera(state, new THREE.Vector3(), false, 1 / 60);
  assert.ok(Math.abs(state.targetY - BALL_CAMERA_BASE_TARGET.y) < 0.01);
  assert.ok(Math.abs(state.fov - BALL_CAMERA_BASE_FOV) < 0.01);
});

test("flat outgoing shots leave the baseline camera composition unchanged", () => {
  const initial = { targetY: BALL_CAMERA_BASE_TARGET.y, fov: BALL_CAMERA_BASE_FOV };
  const result = updateBallFlightCamera(initial, new THREE.Vector3(0, 2.5, -3), true, 1 / 60);
  assert.ok(Math.abs(result.targetY - initial.targetY) < 1e-10);
  assert.ok(Math.abs(result.fov - initial.fov) < 1e-10);
});
