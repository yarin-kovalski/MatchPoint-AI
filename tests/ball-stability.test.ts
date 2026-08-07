import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BALL_CONFIG } from "../client-pc/src/ball/ballConfig.js";
import { assertBallVisualState } from "../client-pc/src/ball/ballVisualState.js";
import { advanceBallFixedStep, createFixedStepPhysicsState } from "../client-pc/src/ball/fixedStepBallPhysics.js";
import { BallSnapshot } from "../client-pc/src/ball/ballTypes.js";

function ball(): BallSnapshot {
  return {
    id: "test", state: "IN_FLIGHT_TO_PLAYER", position: new THREE.Vector3(0, 2, -2),
    previousPosition: new THREE.Vector3(0, 2, -2), velocity: new THREE.Vector3(1, 2, 5),
    spinVector: new THREE.Vector3(), angularVelocity: new THREE.Vector3(), spinType: "flat",
    spinStrength: 0, magnusAcceleration: new THREE.Vector3(), physicsRadius: 0.0335, visualRadius: 0.15,
    bounceCount: 0, hit: false, active: true, launchTimestamp: 0, launchPreset: "easyForehand",
    contactTarget: new THREE.Vector3(), lockedContactTarget: new THREE.Vector3(),
    lockedContactQuaternion: new THREE.Quaternion(), lockedStrokeType: "forehand", expectedStrokeType: "forehand",
    bouncePoint: new THREE.Vector3(), contactTimeAfterBounce: 1, contactDeadline: 0, secondBounceDeadline: 0
  };
}

test("fixed-step ball physics is stable at 30, 60, and 120 FPS", () => {
  const results = [30, 60, 120].map(fps => {
    const candidate = ball();
    const state = createFixedStepPhysicsState();
    for (let frame = 0; frame < fps; frame += 1) advanceBallFixedStep(candidate, 1 / fps, state);
    assert.ok(candidate.position.toArray().every(Number.isFinite));
    return candidate.position;
  });
  assert.ok(results[0].distanceTo(results[1]) < 1e-8);
  assert.ok(results[1].distanceTo(results[2]) < 1e-8);
});

test("active ball visual audit reports hidden and detached meshes", () => {
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial());
  mesh.visible = false;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 2, 8);
  camera.lookAt(0, 1, 0);
  const lifecycle = { lastStateTransition: "IDLE -> IN_FLIGHT", lastResetReason: "none", lastHideReason: "none" };
  const audit = assertBallVisualState(ball(), mesh, camera, scene, lifecycle);
  assert.equal(audit.valid, false);
  assert.ok(audit.errors.includes("ACTIVE_BALL_HIDDEN"));
  assert.ok(audit.errors.includes("ACTIVE_BALL_DETACHED"));
});

test("behind-player bound remains beyond baseline calibrated contact", () => {
  assert.ok(BALL_CONFIG.bounds.zBehindPlayer > 5.75);
  assert.ok(BALL_CONFIG.bounds.zBehindPlayer > 4.91);
});
