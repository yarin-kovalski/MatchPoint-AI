import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BALL_CONFIG } from "../client-pc/src/ball/ballConfig.js";
import { BallController } from "../client-pc/src/ball/BallController.js";
import { boundedContactCorrection, createPlayableStrokePlan, evaluatePlayableCalibratedHit, isWithinAssistedContactEnvelope } from "../client-pc/src/ball/playableCalibratedHit.js";
import { createDefaultTrajectoryProfile, worldToPlayerLocal } from "../client-pc/src/ball/trajectoryCalibration.js";
import { EasyHitMotion } from "../client-pc/src/ball/ballTypes.js";
import { StrokeDetectorSnapshot } from "../client-pc/src/strokeDetection/strokeTypes.js";

function motion(strokeType: "forehand" | "backhand", active = true): EasyHitMotion {
  return {
    valid: true, angularSpeed: active ? 4.5 : 0.3, accelerationMagnitude: active ? 8 : 0.6,
    racketQuaternion: new THREE.Quaternion(), racketFaceNormal: new THREE.Vector3(0, 0, -1),
    racketForwardVector: new THREE.Vector3(0, 0, -1), racketUpVector: new THREE.Vector3(0, 1, 0),
    racketSideVector: new THREE.Vector3(1, 0, 0), racketFaceAngle: 0.4,
    motionForwardScore: active ? 0.6 : 0.01, handedness: "right", backhandStyle: "one-handed",
    swingIntent: { active, confidence: active ? 0.85 : 0, strokeType, startedAt: 800,
      peakAt: 1000, peakAngularSpeed: active ? 4.5 : 0.3, expiresAt: 1320 }
  };
}

function snapshot(strokeType: "forehand" | "backhand"): StrokeDetectorSnapshot {
  return {
    currentState: "READY", previousState: "READY", stateEnteredAt: 0, stateDuration: 0,
    swingId: null, lockedStrokeType: strokeType, confidence: 0, rejectionReason: "",
    scores: { forehandCandidateScore: 0, backhandCandidateScore: 0, classificationMargin: 0,
      preparationScore: 0, reversalScore: 0, forwardSwingScore: 0, followThroughScore: 0,
      contactScore: 0, lowToHighScore: 0, highToLowScore: 0, topspinScore: 0,
      sliceScore: 0, spinType: "flat" }, peakAngularVelocity: 0, peakAcceleration: 0,
    peakJerk: 0, preparationDuration: 0, lastCompletedStroke: "none",
    lastContactTimestamp: null, transitions: ["READY"]
  };
}

test("stationary motion never hits while natural forehand and backhand intent do", () => {
  for (const strokeType of ["forehand", "backhand"] as const) {
    const profile = createDefaultTrajectoryProfile(strokeType, "right");
    const base = { now: 1000, contactTime: 1000, bounceCount: 1, alreadyHit: false, expectedStrokeType: strokeType, profile };
    assert.equal(evaluatePlayableCalibratedHit({ ...base, motion: motion(strokeType, false) }).reason, "NO_REAL_SWING");
    assert.equal(evaluatePlayableCalibratedHit({ ...base, motion: motion(strokeType) }).accepted, true);
    const local = worldToPlayerLocal(new THREE.Vector3().fromArray(profile.contactPointWorld), profile.playerBasisAtCalibration);
    assert.equal(strokeType === "forehand" ? local.x > 0 : local.x < 0, true);
  }
});

test("shared stroke plan never swaps profile keys and supports consecutive sides", () => {
  const forehand = createDefaultTrajectoryProfile("forehand", "right");
  const backhand = createDefaultTrajectoryProfile("backhand", "right");
  const profiles = { forehand, backhand };
  const backhandFirst = createPlayableStrokePlan("backhand", profiles)!;
  const forehandSecond = createPlayableStrokePlan("forehand", profiles)!;
  assert.equal(backhandFirst.profile, backhand);
  assert.equal(backhandFirst.expectedSide, "left");
  assert.ok(backhandFirst.contactLocalX < -0.25);
  assert.equal(forehandSecond.profile, forehand);
  assert.equal(forehandSecond.expectedSide, "right");
  assert.ok(forehandSecond.contactLocalX > 0.25);
  assert.equal(createPlayableStrokePlan("forehand", { forehand: backhand, backhand: forehand }), null);
  assert.equal(createPlayableStrokePlan("backhand", profiles)!.profile, backhand);
});

test("calibrated opportunity rejects early, late, wrong-side, and duplicate contacts", () => {
  const profile = createDefaultTrajectoryProfile("forehand", "right");
  const base = { contactTime: 1000, bounceCount: 1, alreadyHit: false, expectedStrokeType: "forehand" as const, profile, motion: motion("forehand") };
  assert.equal(evaluatePlayableCalibratedHit({ ...base, now: 779, assistLevel: "realistic" }).reason, "SWING_TOO_EARLY");
  assert.equal(evaluatePlayableCalibratedHit({ ...base, now: 1181, assistLevel: "realistic" }).reason, "SWING_TOO_LATE");
  assert.equal(evaluatePlayableCalibratedHit({ ...base, now: 1000, motion: motion("backhand") }).reason, "WRONG_STROKE_SIDE");
  assert.equal(evaluatePlayableCalibratedHit({ ...base, now: 1000, alreadyHit: true }).reason, "CONTACT_ALREADY_USED");
});

test("contact magnet stays inside every configured axis bound", () => {
  const correction = boundedContactCorrection(new THREE.Vector3(), new THREE.Vector3(5, -5, 5));
  assert.equal(correction.x, BALL_CONFIG.playerAssist.training.maximumCorrection.lateral);
  assert.equal(correction.y, -BALL_CONFIG.playerAssist.training.maximumCorrection.vertical);
  assert.equal(correction.z, BALL_CONFIG.playerAssist.training.maximumCorrection.depth);
});

test("Training contact envelope is forgiving while Realistic remains tighter", () => {
  const strings = new THREE.Vector3(0, 1, 0);
  const near = new THREE.Vector3(0.22, 1.18, 0.2);
  const outside = new THREE.Vector3(0.5, 1, 0);
  assert.equal(isWithinAssistedContactEnvelope(near, strings, "training"), true);
  assert.equal(isWithinAssistedContactEnvelope(near, strings, "realistic"), false);
  assert.equal(isWithinAssistedContactEnvelope(outside, strings, "training"), false);
});

test("Training accepts a reasonable swing that Realistic keeps below threshold", () => {
  const profile = createDefaultTrajectoryProfile("forehand", "right");
  const reasonable = motion("forehand");
  reasonable.angularSpeed = 1.05;
  reasonable.accelerationMagnitude = 2.1;
  reasonable.motionForwardScore = 0.15;
  const input = { now: 1000, contactTime: 1000, bounceCount: 1, alreadyHit: false,
    expectedStrokeType: "forehand" as const, profile, motion: reasonable };
  assert.equal(evaluatePlayableCalibratedHit({ ...input, assistLevel: "training" }).accepted, true);
  assert.equal(evaluatePlayableCalibratedHit({ ...input, assistLevel: "realistic" }).reason, "NO_REAL_SWING");
});

test("backward fused intent cannot receive playability assistance", () => {
  const profile = createDefaultTrajectoryProfile("forehand", "right");
  const backward = motion("forehand");
  backward.forwardSwing = {
    windowDurationMs: 160, sampleCount: 9, forwardAcceleration: -6, upwardAcceleration: 0,
    lateralAcceleration: 0, peakForwardAcceleration: 0,
    racketHeadVelocityWorld: new THREE.Vector3(0, 0, 3), forwardRacketHeadVelocity: -3,
    upwardRacketHeadVelocity: 0, lateralRacketHeadVelocity: 0, angularSpeed: 4.5,
    faceAngleRadians: 0.4, forwardDriveScore: -0.3, invalidDirectionReason: "BACKWARD_SWING"
  };
  const decision = evaluatePlayableCalibratedHit({ now: 1000, contactTime: 1000, bounceCount: 1,
    alreadyHit: false, expectedStrokeType: "forehand", profile, motion: backward, assistLevel: "training" });
  assert.equal(decision.accepted, false);
  assert.equal(decision.reason, "NO_REAL_SWING");
});

test("playable contact resolves once at the actual ball position without snapping", () => {
  const hits: unknown[] = [];
  const controller = new BallController(event => hits.push(event));
  const profile = createDefaultTrajectoryProfile("forehand", "right");
  const now = 1000;
  controller.launch("guaranteedForehand", "right", "normal", 0, "one-handed", undefined, profile);
  controller.ball.bounceCount = 1;
  controller.ball.contactDeadline = now;
  controller.ball.secondBounceDeadline = now + 800;
  controller.ball.position.fromArray(profile.contactPointWorld).add(new THREE.Vector3(0.02, 0, 0));
  const actualContact = controller.ball.position.toArray();
  controller.ball.previousPosition.copy(controller.ball.position);
  controller.ball.velocity.set(0, 1, 4);
  const racket = new THREE.Matrix4().compose(
    controller.ball.position.clone(), new THREE.Quaternion(), new THREE.Vector3(0.01, 0.01, 0.01)
  );
  controller.update(0, now, racket, snapshot("forehand"), null, "easy", motion("forehand"), true, profile, true, "training");
  controller.update(0, now + 1, racket, snapshot("forehand"), null, "easy", motion("forehand"), true, profile, true, "training");
  assert.equal(hits.length, 1);
  assert.deepEqual(controller.lastHit?.contactPointWorld.toArray(), actualContact);
  assert.deepEqual(controller.ball.position.toArray(), actualContact);
  assert.equal(controller.ball.state, "RETURNED");
  assert.ok(controller.lastResponse?.prediction.netCrossingPoint);
  assert.ok(controller.lastResponse!.prediction.netCrossingPoint!.y >= BALL_CONFIG.launch.netHeight + BALL_CONFIG.response.minimumNetClearance);
  const bounce = controller.lastResponse!.prediction.bouncePoint!;
  assert.ok(Math.abs(bounce.x) < 4.2 && bounce.z < BALL_CONFIG.launch.netDepth && bounce.z > BALL_CONFIG.bounds.zFar);
});

test("a timed real swing cannot hit a ball outside the bounded contact reach", () => {
  const controller = new BallController();
  const profile = createDefaultTrajectoryProfile("forehand", "right");
  controller.launch("guaranteedForehand", "right", "normal", 0, "one-handed", undefined, profile);
  controller.ball.bounceCount = 1;
  controller.ball.contactDeadline = 1000;
  controller.ball.position.set(5, 1, 2);
  controller.ball.previousPosition.copy(controller.ball.position);
  // A real racket is centimetre-scaled; identity made a 102-metre collider.
  const racket = new THREE.Matrix4().makeScale(0.01, 0.01, 0.01);
  controller.update(0, 1000, racket, snapshot("forehand"), null, "easy", motion("forehand"), true, profile, true);
  assert.equal(controller.ball.hit, false);
  assert.deepEqual(controller.ball.position.toArray(), [5, 1, 2]);
});
