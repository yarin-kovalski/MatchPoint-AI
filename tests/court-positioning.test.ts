import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  CONTACT_EASE_DEPTH_Z, PLAYER_BASELINE_OFFSET_Z, positionValidatedProfileAtBaseline,
  createTrainingComfortProfile, isInsideTrainingStrikeZone
} from "../client-pc/src/ball/courtPositioning.js";
import { profileForHandedness, solveTrajectoryProfile, worldToPlayerLocal } from "../client-pc/src/ball/trajectoryCalibration.js";
import { VALIDATED_TRAJECTORY_PRESET } from "../client-pc/src/ball/validatedTrajectoryPreset.js";

for (const strokeType of ["forehand", "backhand"] as const) {
  test(`${strokeType} validated profile is positioned near the baseline without mutating its preset`, () => {
    const source = VALIDATED_TRAJECTORY_PRESET[strokeType];
    const original = structuredClone(source);
    const positioned = positionValidatedProfileAtBaseline(source);

    assert.deepEqual(source, original);
    assert.deepEqual(positioned.launchPointWorld, source.launchPointWorld);
    assert.deepEqual(positioned.bouncePointWorld, source.bouncePointWorld);
    assert.equal(
      positioned.contactPointWorld[2],
      source.contactPointWorld[2] + PLAYER_BASELINE_OFFSET_Z + CONTACT_EASE_DEPTH_Z
    );
    assert.equal(positioned.contactPointWorld[1], source.contactPointWorld[1]);
    assert.equal(positioned.contactPointWorld[0], source.contactPointWorld[0]);

    const localContact = worldToPlayerLocal(
      new THREE.Vector3().fromArray(positioned.contactPointWorld), positioned.playerBasisAtCalibration
    );
    assert.equal(Math.sign(localContact.x), strokeType === "forehand" ? 1 : -1);
    assert.ok(positioned.contactPointWorld[2] > 3.9 && positioned.contactPointWorld[2] < 5.1);

    const solved = solveTrajectoryProfile(positioned);
    assert.equal(solved.valid, true, solved.errors.join(", "));
    assert.ok(positioned.bounceToApexMs > 0);
    assert.ok(positioned.bounceToApexMs < positioned.bounceToContactMs);
    assert.ok(solved.safetyMarginMs > 0);
  });
}

test("Training backhand feed mirrors forehand contact and has a practical cross-body strike envelope", () => {
  const forehand = createTrainingComfortProfile(VALIDATED_TRAJECTORY_PRESET.forehand);
  const backhand = createTrainingComfortProfile(VALIDATED_TRAJECTORY_PRESET.backhand);
  assert.equal(backhand.contactPointWorld[0], -forehand.contactPointWorld[0]);
  assert.equal(backhand.contactPointWorld[1], forehand.contactPointWorld[1]);
  assert.equal(backhand.contactPointWorld[2], forehand.contactPointWorld[2]);
  const backhandEdge = new THREE.Vector3().fromArray(backhand.contactPointWorld).add(
    new THREE.Vector3(0.46, 0, 0)
  );
  assert.equal(isInsideTrainingStrikeZone(backhandEdge, new THREE.Vector3().fromArray(backhand.contactPointWorld), "backhand"), true);
  assert.equal(isInsideTrainingStrikeZone(backhandEdge, new THREE.Vector3().fromArray(forehand.contactPointWorld), "forehand"), false);
});

test("left-handed Training buttons reverse the right-handed contact sides", () => {
  const rightForehand = createTrainingComfortProfile(VALIDATED_TRAJECTORY_PRESET.forehand);
  const rightBackhand = createTrainingComfortProfile(VALIDATED_TRAJECTORY_PRESET.backhand);
  const leftForehand = createTrainingComfortProfile(
    profileForHandedness(VALIDATED_TRAJECTORY_PRESET.forehand, "left")
  );
  const leftBackhand = createTrainingComfortProfile(
    profileForHandedness(VALIDATED_TRAJECTORY_PRESET.backhand, "left")
  );
  assert.equal(leftForehand.contactPointWorld[0], rightBackhand.contactPointWorld[0]);
  assert.equal(leftBackhand.contactPointWorld[0], rightForehand.contactPointWorld[0]);
  assert.ok(leftForehand.contactPointWorld[0] < 0);
  assert.ok(leftBackhand.contactPointWorld[0] > 0);
});
