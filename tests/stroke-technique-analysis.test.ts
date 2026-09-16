import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { PhysicalImpactResolution } from "../client-pc/src/ball/contactRealism.js";
import { createShotTechnique, FollowThroughAnalyzer } from "../client-pc/src/diagnostics/strokeTechniqueAnalysis.js";

test("follow-through mirrors the far-shoulder direction for forehand and backhand", () => {
  const forehand = new FollowThroughAnalyzer();
  forehand.start(new THREE.Quaternion(), "forehand", "right", "one-handed");
  forehand.observe({ relativeQuaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.1),
    sidewaysScore: -0.9, upwardScore: 0.8, angularSpeed: 4 });
  assert.equal(forehand.finish().finishedAcrossFarShoulder, true);

  const backhand = new FollowThroughAnalyzer();
  backhand.start(new THREE.Quaternion(), "backhand", "right", "two-handed");
  backhand.observe({ relativeQuaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.1),
    sidewaysScore: 0.9, upwardScore: 0.8, angularSpeed: 4 });
  assert.equal(backhand.finish().finishedAcrossFarShoulder, true);
});

test("technique converts physical brush, spin, and trajectory into coaching scales", () => {
  const impact = {
    spinType: "TOPSPIN", spinRateRadiansPerSecond: 40, racketHeadSpeed: 10,
    upwardBrushVelocity: 7, downwardBrushVelocity: 0, swingPathAngleRadians: 0.35,
    launchAngleRadians: 0.28, predictedNetClearance: 0.7, contactQuality: 0.86,
    prediction: { apexPoint: new THREE.Vector3(0, 2.8, -9) }
  } as unknown as PhysicalImpactResolution;
  const technique = createShotTechnique(impact, {
    score: 82, label: "Complete", finishedAcrossFarShoulder: true,
    crossBodyScore: 85, upwardFinishScore: 72, orientationTravelDegrees: 68
  });
  assert.ok(technique);
  assert.equal(technique.brushDirection, "Low to high");
  assert.ok(technique.underBallScore >= 80);
  assert.equal(technique.topspinLevel, technique.spinLevel);
  assert.equal(technique.sliceLevel, 0);
  assert.equal(technique.apexHeightMeters, 2.8);
});
