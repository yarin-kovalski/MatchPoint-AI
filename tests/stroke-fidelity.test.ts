import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  continuousPowerScore, launchTendency, powerLevel, shotShape
} from "../client-pc/src/strokeDetection/strokeFidelity.js";

test("weak medium and strong contact speeds map continuously in order", () => {
  const weak = continuousPowerScore(1.5);
  const medium = continuousPowerScore(5);
  const strong = continuousPowerScore(8.5);
  assert.ok(weak < medium && medium < strong);
  assert.equal(powerLevel(weak), "Weak");
  assert.equal(powerLevel(medium), "Medium");
  assert.equal(powerLevel(strong), "Very Strong");
  assert.equal(powerLevel(0.7), "Strong");
});

test("spin shape and launch tendency remain independent", () => {
  assert.equal(shotShape("TOPSPIN"), "TOPSPIN");
  assert.equal(shotShape("SLICE"), "SLICE");
  assert.equal(shotShape("FLAT"), "FLAT");
  assert.equal(launchTendency(new THREE.Vector3(0, 1, -10)), "Low");
  assert.equal(launchTendency(new THREE.Vector3(0, 4, -8)), "Neutral");
  assert.equal(launchTendency(new THREE.Vector3(0, 7, -8)), "High");
});
