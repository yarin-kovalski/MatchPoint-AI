import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { BALL_CONFIG } from "../client-pc/src/ball/ballConfig.js";
import {
  createDefaultTrajectoryProfile, loadTrajectoryProfile, resetTrajectoryProfile,
  sampleBallistic, saveTrajectoryProfile, setProfileArcHeight, solveTrajectoryProfile, validateTrajectoryProfile,
  worldToPlayerLocal
} from "../client-pc/src/ball/trajectoryCalibration.js";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

test("right-handed calibrated contacts occupy independent player sides", () => {
  const forehand = createDefaultTrajectoryProfile("forehand", "right");
  const backhand = createDefaultTrajectoryProfile("backhand", "right");
  assert.ok(forehand.contactPointPlayerLocal[0] > 0.25);
  assert.ok(backhand.contactPointPlayerLocal[0] < -0.25);
  backhand.contactPointWorld[0] = forehand.contactPointWorld[0];
  backhand.contactPointPlayerLocal = worldToPlayerLocal(new THREE.Vector3().fromArray(backhand.contactPointWorld), backhand.playerBasisAtCalibration).toArray();
  assert.ok(validateTrajectoryProfile(backhand).some(error => error.includes("CALIBRATION_WRONG_SIDE")));
});

test("profiles save, reload, and reset independently", () => {
  const storage = new MemoryStorage();
  const forehand = createDefaultTrajectoryProfile("forehand", "right", 100);
  const backhand = createDefaultTrajectoryProfile("backhand", "right", 200);
  saveTrajectoryProfile(storage, forehand);
  saveTrajectoryProfile(storage, backhand);
  assert.equal(JSON.stringify(loadTrajectoryProfile(storage, "forehand")), JSON.stringify(forehand));
  assert.equal(JSON.stringify(loadTrajectoryProfile(storage, "backhand")), JSON.stringify(backhand));
  resetTrajectoryProfile(storage, "forehand");
  assert.equal(loadTrajectoryProfile(storage, "forehand"), null);
  assert.equal(JSON.stringify(loadTrajectoryProfile(storage, "backhand")), JSON.stringify(backhand));
});

test("physical profile rises through its calibrated apex and reaches contact before bounce two", () => {
  for (const strokeType of ["forehand", "backhand"] as const) {
    const profile = createDefaultTrajectoryProfile(strokeType, "right");
    const solved = solveTrajectoryProfile(profile);
    assert.equal(solved.valid, true, solved.errors.join("; "));
    assert.ok(solved.postBounceVelocity.y > 0);
    assert.ok(Math.abs(solved.solvedApexPoint.y - profile.apexPointWorld[1]) < 0.12);
    assert.ok(profile.bounceToContactMs < solved.secondBounceMs);
    assert.ok(solved.safetyMarginMs > 0);
    const contact = sampleBallistic(
      new THREE.Vector3().fromArray(profile.bouncePointWorld), solved.postBounceVelocity,
      profile.bounceToContactMs / 1000
    );
    assert.ok(contact.distanceTo(new THREE.Vector3().fromArray(profile.contactPointWorld)) < 1e-8);
    assert.ok(solved.maximumCurveDeviation < 0.35);
    assert.equal(profile.bouncePointWorld[1], BALL_CONFIG.courtHeight + BALL_CONFIG.scale.physicalRadiusMeters);
  }
});

test("rendered physical samples are the same ballistic samples used by the solver", () => {
  const profile = createDefaultTrajectoryProfile("forehand", "right");
  const solved = solveTrajectoryProfile(profile);
  for (let index = 0; index < solved.physicalCurve.length; index += 1) {
    const expected = sampleBallistic(
      new THREE.Vector3().fromArray(profile.bouncePointWorld), solved.postBounceVelocity,
      profile.bounceToContactMs / 1000 * index / (solved.physicalCurve.length - 1)
    );
    assert.ok(solved.physicalCurve[index].distanceTo(expected) < 1e-10);
  }
});

test("served calibration UI exposes and binds every required workflow control", () => {
  const html = readFileSync("client-pc/public/index.html", "utf8");
  const source = readFileSync("client-pc/src/main.ts", "utf8");
  for (const id of [
    "calibrateForehandTrajectory", "calibrateBackhandTrajectory", "captureForehandContact",
    "captureBackhandContact", "saveForehandTrajectory", "saveBackhandTrajectory",
    "resetForehandTrajectory", "resetBackhandTrajectory", "previewCalibratedFeed", "useCalibratedFeeds"
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
    assert.match(source, new RegExp(`${id}.*addEventListener`, "s"));
  }
});

test("Arc Height changes only vertical shape and preserves bounce, contact, and lateral side", () => {
  for (const strokeType of ["forehand", "backhand"] as const) {
    const profile = createDefaultTrajectoryProfile(strokeType, "right");
    const bounceBefore = [...profile.bouncePointWorld];
    const contactBefore = [...profile.contactPointWorld];
    const initial = solveTrajectoryProfile(profile);
    setProfileArcHeight(profile, profile.apexPointWorld[1] + 0.35);
    const raised = solveTrajectoryProfile(profile);
    assert.deepEqual(profile.bouncePointWorld, bounceBefore);
    assert.deepEqual(profile.contactPointWorld, contactBefore);
    assert.ok(raised.solvedApexPoint.y > initial.solvedApexPoint.y);
    assert.ok(Math.abs(raised.solvedApexPoint.y - profile.apexPointWorld[1]) < 1e-8);
    for (let index = 0; index < raised.physicalCurve.length; index += 1) {
      const amount = index / (raised.physicalCurve.length - 1);
      const horizontal = new THREE.Vector3().fromArray(profile.bouncePointWorld)
        .lerp(new THREE.Vector3().fromArray(profile.contactPointWorld), amount);
      assert.ok(Math.abs(raised.physicalCurve[index].x - horizontal.x) < 1e-8);
      assert.ok(Math.abs(raised.physicalCurve[index].z - horizontal.z) < 1e-8);
    }
    const localSides = raised.physicalCurve.map(point => worldToPlayerLocal(point, profile.playerBasisAtCalibration).x);
    assert.equal(strokeType === "forehand" ? Math.min(...localSides) > 0 : Math.max(...localSides) < 0, true);
  }
});

test("physical apex lies between bounce and contact with no horizontal overshoot", () => {
  const profile = createDefaultTrajectoryProfile("forehand", "right");
  setProfileArcHeight(profile, 1.65);
  const solved = solveTrajectoryProfile(profile);
  assert.equal(solved.valid, true, solved.errors.join("; "));
  assert.ok(profile.bounceToApexMs > 0 && profile.bounceToApexMs < profile.bounceToContactMs);
  const minimumX = Math.min(profile.bouncePointWorld[0], profile.contactPointWorld[0]);
  const maximumX = Math.max(profile.bouncePointWorld[0], profile.contactPointWorld[0]);
  assert.ok(solved.solvedApexPoint.x >= minimumX && solved.solvedApexPoint.x <= maximumX);
  assert.ok(Math.abs(solved.solvedApexPoint.y - profile.apexPointWorld[1]) < 1e-8);
});
