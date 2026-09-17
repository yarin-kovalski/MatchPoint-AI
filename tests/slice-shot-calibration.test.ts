import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { EasyHitMotion } from "../client-pc/src/ball/ballTypes.js";
import {
  addSliceCalibrationSample, classifyCalibratedSlice, clearSliceCalibration,
  loadSliceCalibration, saveSliceCalibration, sliceCalibrationComplete,
  sliceMotionFeatures, SliceCalibrationData
} from "../client-pc/src/ball/sliceShotCalibration.js";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function motion(speed: number, upward: number, forward: number, acceleration: number): EasyHitMotion {
  return {
    valid: true, angularSpeed: speed, accelerationMagnitude: acceleration,
    racketQuaternion: new THREE.Quaternion(), racketFaceNormal: new THREE.Vector3(0, 0.25, -0.968).normalize(),
    racketForwardVector: new THREE.Vector3(0, 0, -1), racketUpVector: new THREE.Vector3(0, 1, 0),
    racketSideVector: new THREE.Vector3(1, 0, 0), racketFaceAngle: 0.4,
    motionForwardScore: forward, motionUpwardScore: upward, motionSidewaysScore: 0.08,
    handedness: "right", backhandStyle: "one-handed"
  };
}

function recordThree(data: SliceCalibrationData, kind: "drop" | "deep", source: EasyHitMotion): SliceCalibrationData {
  for (let index = 0; index < 3; index += 1) {
    data = addSliceCalibrationSample(data, kind, {
      recordedAt: 1000 + index, strokeType: index % 2 ? "backhand" : "forehand",
      motion: sliceMotionFeatures(source), contactSensors: { sample: index, fullSensorSnapshot: true }
    });
  }
  return data;
}

test("three drop and three deep samples create persistent distinct slice profiles", () => {
  const storage = new MemoryStorage();
  let data: SliceCalibrationData = { drop: [], deep: [] };
  data = recordThree(data, "drop", motion(3.2, -0.42, 0.24, 5));
  data = recordThree(data, "deep", motion(7.1, -0.72, 0.72, 11));
  assert.equal(sliceCalibrationComplete(data), true);
  saveSliceCalibration(storage, data);
  const loaded = loadSliceCalibration(storage);
  assert.equal(loaded.drop.length, 3);
  assert.equal(loaded.deep.length, 3);
  assert.equal(classifyCalibratedSlice(motion(3.4, -0.44, 0.27, 5.5), loaded)?.intent, "drop");
  assert.equal(classifyCalibratedSlice(motion(6.8, -0.69, 0.68, 10.5), loaded)?.intent, "deep");
  assert.equal(classifyCalibratedSlice(motion(6, 0.45, 0.6, 9), loaded), null, "topspin must never use slice calibration");
  assert.deepEqual(clearSliceCalibration(storage), { drop: [], deep: [] });
  assert.deepEqual(loadSliceCalibration(storage), { drop: [], deep: [] });
});

test("slice calibration stays inactive until all six examples exist", () => {
  const incomplete = recordThree({ drop: [], deep: [] }, "drop", motion(3, -0.5, 0.3, 6));
  assert.equal(classifyCalibratedSlice(motion(3, -0.5, 0.3, 6), incomplete), null);
});

