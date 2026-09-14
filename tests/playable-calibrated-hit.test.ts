import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BALL_CONFIG } from "../client-pc/src/ball/ballConfig.js";
import { BallController } from "../client-pc/src/ball/BallController.js";
import { createPlayableStrokePlan, evaluatePlayableCalibratedHit } from "../client-pc/src/ball/playableCalibratedHit.js";
import { createDefaultTrajectoryProfile, worldToPlayerLocal } from "../client-pc/src/ball/trajectoryCalibration.js";
import { EasyHitMotion } from "../client-pc/src/ball/ballTypes.js";
import { StrokeDetectorSnapshot } from "../client-pc/src/strokeDetection/strokeTypes.js";
import { TrainingSessionCalibration } from "../client-pc/src/diagnostics/trainingSessionCalibration.js";

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

test("Training accepts recorded face-angle variation while Realistic keeps strict fused geometry", () => {
  const profile = createDefaultTrajectoryProfile("backhand", "right");
  const realBackhand = motion("backhand");
  realBackhand.motionForwardScore = 0.53;
  realBackhand.racketFaceAngle = 1.52;
  realBackhand.forwardSwing = {
    windowDurationMs: 160, sampleCount: 8,
    forwardAcceleration: 3, upwardAcceleration: 1, lateralAcceleration: 2,
    peakForwardAcceleration: 8, racketHeadVelocityWorld: new THREE.Vector3(2, 1, -5),
    forwardRacketHeadVelocity: 5, upwardRacketHeadVelocity: 1,
    lateralRacketHeadVelocity: 2, angularSpeed: 4.8, faceAngleRadians: 1.3,
    forwardDriveScore: 0.08, invalidDirectionReason: "FACE_TOO_SIDEWAYS"
  };
  const input = { now: 1000, contactTime: 1000, bounceCount: 1, alreadyHit: false,
    expectedStrokeType: "backhand" as const, profile, motion: realBackhand };
  assert.equal(evaluatePlayableCalibratedHit({ ...input, assistLevel: "training" }).accepted, true);
  assert.equal(evaluatePlayableCalibratedHit({ ...input, assistLevel: "realistic" }).reason, "NO_REAL_SWING");
});

test("Training intent age and contact window use one PC clock domain", () => {
  const profile = createDefaultTrajectoryProfile("forehand", "right");
  const realSwing = motion("forehand");
  const pcContactTime = 1_800_000_000_000;
  realSwing.swingIntent!.startedAt = pcContactTime - 90;
  realSwing.swingIntent!.peakAt = pcContactTime - 20;
  realSwing.swingIntent!.expiresAt = pcContactTime + 230;
  assert.equal(evaluatePlayableCalibratedHit({
    now: pcContactTime, contactTime: pcContactTime, bounceCount: 1, alreadyHit: false,
    expectedStrokeType: "forehand", profile, motion: realSwing, assistLevel: "training"
  }).accepted, true);
});

test("Training strike-zone contact resolves without string-plane intersection or snapping", () => {
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
    new THREE.Vector3(20, 20, 20), new THREE.Quaternion(), new THREE.Vector3(0.01, 0.01, 0.01)
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

test("Realistic mode remains moving-racket geometry based", () => {
  const controller = new BallController();
  const profile = createDefaultTrajectoryProfile("forehand", "right");
  controller.launch("guaranteedForehand", "right", "normal", 0, "one-handed", undefined, profile);
  controller.ball.bounceCount = 1;
  controller.ball.contactDeadline = 1000;
  controller.ball.position.set(5, 1, 2);
  controller.ball.previousPosition.copy(controller.ball.position);
  // A real racket is centimetre-scaled; identity made a 102-metre collider.
  const racket = new THREE.Matrix4().makeScale(0.01, 0.01, 0.01);
  controller.update(0, 1000, racket, snapshot("forehand"), null, "prototype", motion("forehand"), true, profile, false, "realistic");
  assert.equal(controller.ball.hit, false);
  assert.deepEqual(controller.ball.position.toArray(), [5, 1, 2]);
});

test("Training refinement reaches 17 of 20 representative normal swings symmetrically", () => {
  const offsets = [-270, -245, -220, -190, -155, -120, -80, -40, 0, 35,
    70, 105, 140, 175, 205, 220, 230, 235, 260, 320];
  const calibration = new TrainingSessionCalibration();
  const priorAccepted = offsets.filter((offset, index) =>
    offset >= -220 && offset <= 180 && (index === 17 ? 0.08 : 0.15) >= 0.12).length;
  assert.equal(priorAccepted, 12, "previous Training gates accepted 60% of this timing/intent set");
  let report = null;
  for (let index = 0; index < offsets.length; index += 1) {
    const strokeType = index % 2 === 0 ? "forehand" : "backhand";
    const sample = motion(strokeType);
    sample.swingIntent = { ...sample.swingIntent!, startedAt: 400 };
    sample.motionForwardScore = index === 17 ? 0.08 : 0.15;
    const decision = evaluatePlayableCalibratedHit({
      now: 1000 + offsets[index], contactTime: 1000, bounceCount: 1, alreadyHit: false,
      expectedStrokeType: strokeType, profile: createDefaultTrajectoryProfile(strokeType, "right"),
      motion: sample, assistLevel: "training"
    });
    report = calibration.record(decision.accepted, strokeType, decision.reason);
  }
  assert.equal(report?.hits, 17);
  assert.equal(report?.hitPercentage, 85);
  assert.ok(report!.bySide.forehand.hitPercentage >= 80);
  assert.ok(report!.bySide.backhand.hitPercentage >= 80);
  assert.deepEqual(report!.missReasons, [
    { reason: "SWING_TOO_LATE", count: 2 },
    { reason: "NO_REAL_SWING", count: 1 }
  ]);
});

test("20-swing calibration ranks misses and backward swings remain rejected", () => {
  const calibration = new TrainingSessionCalibration();
  let report = null;
  for (let index = 0; index < 20; index += 1) {
    report = calibration.record(index < 17, index % 2 ? "backhand" : "forehand",
      index === 17 ? "NO_REAL_SWING" : "SWING_TOO_LATE");
  }
  assert.deepEqual(report?.missReasons, [
    { reason: "SWING_TOO_LATE", count: 2 },
    { reason: "NO_REAL_SWING", count: 1 }
  ]);

  const backward = motion("backhand");
  backward.forwardSwing = {
    windowDurationMs: 160, sampleCount: 8, forwardAcceleration: -4, upwardAcceleration: 0,
    lateralAcceleration: 0, peakForwardAcceleration: 0,
    racketHeadVelocityWorld: new THREE.Vector3(0, 0, 2), forwardRacketHeadVelocity: -2,
    upwardRacketHeadVelocity: 0, lateralRacketHeadVelocity: 0, angularSpeed: 4,
    faceAngleRadians: 0.4, forwardDriveScore: -0.2, invalidDirectionReason: "BACKWARD_SWING"
  };
  assert.equal(evaluatePlayableCalibratedHit({ now: 1000, contactTime: 1000, bounceCount: 1,
    alreadyHit: false, expectedStrokeType: "backhand", profile: createDefaultTrajectoryProfile("backhand", "right"),
    motion: backward, assistLevel: "training" }).reason, "NO_REAL_SWING");
});


test("Training tolerates a single motion channel dipping during an active forward swing", () => {
  const profile = createDefaultTrajectoryProfile("forehand", "right");
  const moving = motion("forehand");
  moving.accelerationMagnitude = 0.5;
  const input = { now: 1000, contactTime: 1000, bounceCount: 1, alreadyHit: false,
    expectedStrokeType: "forehand" as const, profile, motion: moving };
  assert.equal(evaluatePlayableCalibratedHit({ ...input, assistLevel: "training" }).accepted, true);
  assert.equal(evaluatePlayableCalibratedHit({ ...input, assistLevel: "realistic" }).accepted, false);
  moving.angularSpeed = 0.2;
  assert.equal(evaluatePlayableCalibratedHit({ ...input, assistLevel: "training" }).accepted, false);
});

test("court landing announcement occurs once after the physical bounce", () => {
  const results: string[] = [];
  const controller = new BallController(undefined, undefined, result => results.push(result));
  const ball = controller.ball;
  ball.active = true; ball.hit = true; ball.state = "RETURNED";
  ball.position.set(0, 2, BALL_CONFIG.launch.netDepth + 0.1);
  ball.velocity.set(0, 2, -7);
  ball.launchTimestamp = 0;
  for (let i = 1; i <= 240; i++) {
    controller.update(1 / 120, i * 1000 / 120, new THREE.Matrix4(), snapshot("forehand"), null, "off", null, false);
    if (ball.bounceCount === 0) assert.deepEqual(results, []);
  }
  assert.deepEqual(results, ["IN"]);
});
