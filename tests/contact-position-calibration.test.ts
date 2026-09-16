import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  adjustContactPositionCalibration, applyContactPositionCalibration,
  DEFAULT_CONTACT_POSITION_CALIBRATION, loadContactPositionCalibration,
  resetContactPositionCalibration, saveContactPositionCalibration
} from "../client-pc/src/ball/contactPositionCalibration.js";
import { createTrainingComfortProfile, positionValidatedProfileAtBaseline } from "../client-pc/src/ball/courtPositioning.js";
import { solveTrajectoryProfile, worldToPlayerLocal } from "../client-pc/src/ball/trajectoryCalibration.js";
import { VALIDATED_TRAJECTORY_PRESET } from "../client-pc/src/ball/validatedTrajectoryPreset.js";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function base(strokeType: "forehand" | "backhand") {
  return createTrainingComfortProfile(positionValidatedProfileAtBaseline(
    VALIDATED_TRAJECTORY_PRESET[strokeType]
  ));
}

test("forehand and backhand contact marks move independently in player coordinates", () => {
  const forehandBase = base("forehand");
  const backhandBase = base("backhand");
  const forehand = applyContactPositionCalibration(forehandBase, {
    ...DEFAULT_CONTACT_POSITION_CALIBRATION, lateralMeters: 0.20
  });
  const backhand = applyContactPositionCalibration(backhandBase, {
    ...DEFAULT_CONTACT_POSITION_CALIBRATION, lateralMeters: -0.15
  });
  const forehandBefore = worldToPlayerLocal(new THREE.Vector3().fromArray(forehandBase.contactPointWorld), forehandBase.playerBasisAtCalibration);
  const forehandAfter = worldToPlayerLocal(new THREE.Vector3().fromArray(forehand.contactPointWorld), forehand.playerBasisAtCalibration);
  const backhandBefore = worldToPlayerLocal(new THREE.Vector3().fromArray(backhandBase.contactPointWorld), backhandBase.playerBasisAtCalibration);
  const backhandAfter = worldToPlayerLocal(new THREE.Vector3().fromArray(backhand.contactPointWorld), backhand.playerBasisAtCalibration);
  assert.ok(Math.abs(forehandAfter.x - forehandBefore.x - 0.20) < 1e-8);
  assert.ok(Math.abs(backhandAfter.x - backhandBefore.x + 0.15) < 1e-8);
  assert.equal(solveTrajectoryProfile(forehand).valid, true);
  assert.equal(solveTrajectoryProfile(backhand).valid, true);
});

test("contact calibration saves each stroke separately and clamps unsafe adjustments", () => {
  const storage = new MemoryStorage();
  saveContactPositionCalibration(storage, "forehand", {
    lateralMeters: 4, verticalMeters: 2, depthMeters: -3, version: 1
  });
  saveContactPositionCalibration(storage, "backhand", {
    lateralMeters: -0.25, verticalMeters: 0.1, depthMeters: 0.2, version: 1
  });
  assert.deepEqual(loadContactPositionCalibration(storage, "forehand"), {
    lateralMeters: 0.65, verticalMeters: 0.30, depthMeters: -0.50, version: 1
  });
  assert.equal(loadContactPositionCalibration(storage, "backhand").lateralMeters, -0.25);
  assert.deepEqual(resetContactPositionCalibration(storage, "forehand"), DEFAULT_CONTACT_POSITION_CALIBRATION);
  assert.deepEqual(loadContactPositionCalibration(storage, "forehand"), DEFAULT_CONTACT_POSITION_CALIBRATION);
});

test("calibration pad moves in exact five-centimetre steps", () => {
  let value = { ...DEFAULT_CONTACT_POSITION_CALIBRATION };
  value = adjustContactPositionCalibration(value, "lateral", 0.05);
  value = adjustContactPositionCalibration(value, "vertical", -0.05);
  value = adjustContactPositionCalibration(value, "depth", 0.05);
  assert.deepEqual(value, { lateralMeters: 0.05, verticalMeters: -0.05, depthMeters: 0.05, version: 1 });
});

test("every bounded corner of the contact calibration remains a physical feed", () => {
  for (const strokeType of ["forehand", "backhand"] as const) {
    for (const lateralMeters of [-0.65, 0.65]) {
      for (const verticalMeters of [-0.30, 0.30]) {
        for (const depthMeters of [-0.50, 0.50]) {
          const profile = applyContactPositionCalibration(base(strokeType), {
            lateralMeters, verticalMeters, depthMeters, version: 1
          });
          assert.equal(solveTrajectoryProfile(profile).valid, true,
            `${strokeType} ${lateralMeters}/${verticalMeters}/${depthMeters}`);
        }
      }
    }
  }
});
