import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { stabilizeTrainingRacketOrigin } from "../client-pc/src/motion/racketOriginStability.js";

test("Training READY pose returns exactly to the calibrated neutral origin", () => {
  const position = new THREE.Vector3(4.2, -1.1, 2.8);
  assert.equal(stabilizeTrainingRacketOrigin(position, "READY", "training"), true);
  assert.deepEqual(position.toArray(), [0, 0, 0]);
});

test("origin stabilization does not alter active swings or Realistic mode", () => {
  const active = new THREE.Vector3(4.2, -1.1, 2.8);
  assert.equal(stabilizeTrainingRacketOrigin(active, "FORWARD_SWING", "training"), false);
  assert.deepEqual(active.toArray(), [4.2, -1.1, 2.8]);
  assert.equal(stabilizeTrainingRacketOrigin(active, "READY", "realistic"), false);
  assert.deepEqual(active.toArray(), [4.2, -1.1, 2.8]);
});
