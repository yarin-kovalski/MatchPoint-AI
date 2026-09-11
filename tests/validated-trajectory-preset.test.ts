import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { BallController } from "../client-pc/src/ball/BallController.js";
import { EasyHitMotion } from "../client-pc/src/ball/ballTypes.js";
import { createPlayableStrokePlan } from "../client-pc/src/ball/playableCalibratedHit.js";
import { saveTrajectoryProfile, TrajectoryCalibrationProfile, worldToPlayerLocal } from "../client-pc/src/ball/trajectoryCalibration.js";
import {
  loadTrajectoryProfileWithPriority, restoreValidatedTrajectoryPreset,
  VALIDATED_TRAJECTORY_PRESET, ValidatedTrajectoryPreset
} from "../client-pc/src/ball/validatedTrajectoryPreset.js";
import { StrokeDetectorSnapshot } from "../client-pc/src/strokeDetection/strokeTypes.js";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

const repositoryJson = JSON.parse(readFileSync(
  "client-pc/src/ball/presets/validatedTrajectoryCalibration.json", "utf8"
)) as ValidatedTrajectoryPreset;

test("repository JSON exactly matches both recovered validated profiles", () => {
  assert.deepEqual(repositoryJson, VALIDATED_TRAJECTORY_PRESET);
  assert.equal(repositoryJson.forehand.createdAt, 1786038163647);
  assert.equal(repositoryJson.backhand.createdAt, 1786036108035);
  const forehandLocal = worldToPlayerLocal(new THREE.Vector3().fromArray(repositoryJson.forehand.contactPointWorld), repositoryJson.forehand.playerBasisAtCalibration);
  const backhandLocal = worldToPlayerLocal(new THREE.Vector3().fromArray(repositoryJson.backhand.contactPointWorld), repositoryJson.backhand.playerBasisAtCalibration);
  assert.ok(forehandLocal.x > 0.25);
  assert.ok(backhandLocal.x < -0.25);
});

test("loading priority is user, validated preset, then default", () => {
  const storage = new MemoryStorage();
  const presetLoaded = loadTrajectoryProfileWithPriority(storage, "forehand");
  assert.equal(presetLoaded.source, "Validated project preset");
  assert.deepEqual(presetLoaded.profile, repositoryJson.forehand);
  const user = structuredClone(repositoryJson.forehand);
  user.createdAt += 1;
  saveTrajectoryProfile(storage, user);
  const userLoaded = loadTrajectoryProfileWithPriority(storage, "forehand");
  assert.equal(userLoaded.source, "User calibration");
  assert.deepEqual(userLoaded.profile, user);
  const invalidPreset = structuredClone(VALIDATED_TRAJECTORY_PRESET);
  invalidPreset.backhand.version = 999;
  const fallback = loadTrajectoryProfileWithPriority(new MemoryStorage(), "backhand", "right", invalidPreset);
  assert.equal(fallback.source, "Default fallback");
});

test("restore writes exact values for both sides and retains preset provenance", () => {
  const storage = new MemoryStorage();
  restoreValidatedTrajectoryPreset(storage);
  for (const strokeType of ["forehand", "backhand"] as const) {
    const loaded = loadTrajectoryProfileWithPriority(storage, strokeType);
    assert.equal(loaded.source, "Validated project preset");
    assert.deepEqual(loaded.profile, repositoryJson[strokeType]);
  }
});

function motion(strokeType: "forehand" | "backhand"): EasyHitMotion {
  return { valid: true, angularSpeed: 4.5, accelerationMagnitude: 8,
    racketQuaternion: new THREE.Quaternion(), racketFaceNormal: new THREE.Vector3(0, 0, -1),
    racketForwardVector: new THREE.Vector3(0, 0, -1), racketUpVector: new THREE.Vector3(0, 1, 0),
    racketSideVector: new THREE.Vector3(1, 0, 0), racketFaceAngle: 0.4, motionForwardScore: 0.6,
    handedness: "right", backhandStyle: "one-handed",
    swingIntent: { active: true, confidence: 0.85, strokeType, startedAt: 800,
      peakAt: 1000, peakAngularSpeed: 4.5, expiresAt: 1320 } };
}

function snapshot(strokeType: "forehand" | "backhand"): StrokeDetectorSnapshot {
  return { currentState: "READY", previousState: "READY", stateEnteredAt: 0, stateDuration: 0,
    swingId: null, lockedStrokeType: strokeType, confidence: 0, rejectionReason: "",
    scores: { forehandCandidateScore: 0, backhandCandidateScore: 0, classificationMargin: 0,
      preparationScore: 0, reversalScore: 0, forwardSwingScore: 0, followThroughScore: 0,
      contactScore: 0, lowToHighScore: 0, highToLowScore: 0, topspinScore: 0, sliceScore: 0, spinType: "flat" },
    peakAngularVelocity: 0, peakAcceleration: 0, peakJerk: 0, preparationDuration: 0,
    lastCompletedStroke: "none", lastContactTimestamp: null, transitions: ["READY"] };
}

test("both validated preset play paths still produce exactly one HIT", () => {
  for (const strokeType of ["forehand", "backhand"] as const) {
    const profile: TrajectoryCalibrationProfile = repositoryJson[strokeType];
    assert.ok(createPlayableStrokePlan(strokeType, repositoryJson));
    let hits = 0;
    const controller = new BallController(() => { hits += 1; });
    controller.launch(strokeType === "forehand" ? "guaranteedForehand" : "guaranteedBackhand", "right", "normal", 0, "one-handed", undefined, profile);
    controller.ball.bounceCount = 1;
    controller.ball.contactDeadline = 1000;
    controller.ball.secondBounceDeadline = 1800;
    controller.ball.position.fromArray(profile.contactPointWorld);
    controller.ball.previousPosition.copy(controller.ball.position);
    controller.ball.velocity.set(0, 1, 4);
    controller.update(0, 1000, new THREE.Matrix4(), snapshot(strokeType), null, "easy", motion(strokeType), true, profile, true);
    controller.update(0, 1001, new THREE.Matrix4(), snapshot(strokeType), null, "easy", motion(strokeType), true, profile, true);
    assert.equal(hits, 1);
    assert.equal(controller.lastHit?.resolvedHitStrokeType, strokeType);
    assert.deepEqual(controller.lastHit?.contactPointWorld.toArray(), profile.contactPointWorld);
  }
});
