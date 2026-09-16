import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { PhysicalImpactResolution } from "../client-pc/src/ball/contactRealism.js";
import { classifyTrainingShotStyle, createShotTechnique, FollowThroughAnalyzer } from "../client-pc/src/diagnostics/strokeTechniqueAnalysis.js";

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
    outgoingVelocity: new THREE.Vector3(0, 5, -14),
    contactNormal: new THREE.Vector3(0, Math.sin(THREE.MathUtils.degToRad(9)), -0.99).normalize(),
    prediction: { apexPoint: new THREE.Vector3(0, 2.8, -9), bouncePoint: new THREE.Vector3(0, 0, -13) }
  } as unknown as PhysicalImpactResolution;
  const technique = createShotTechnique(impact, {
    score: 82, label: "Complete", finishedAcrossFarShoulder: true,
    crossBodyScore: 85, upwardFinishScore: 72, orientationTravelDegrees: 68
  });
  assert.ok(technique);
  assert.equal(technique.brushDirection, "Low to high");
  assert.equal(technique.racketFaceOpennessLabel, "Slightly open");
  assert.equal(technique.racketFaceOpennessLevel, 6);
  assert.equal(technique.topspinLevel, technique.spinLevel);
  assert.equal(technique.sliceLevel, 0);
  assert.equal(technique.apexHeightMeters, 2.8);
  assert.equal(technique.arcLabel, "Medium");
  assert.equal(technique.shotStyle, "TOPSPIN");
});

test("drop and heavy-topspin labels require the complete tennis pattern", () => {
  assert.equal(classifyTrainingShotStyle({ spinType:"SLICE", spinLevel:6, verticalPath:-.5,
    ballSpeedKmh:42, arcLevel:4, bounceDepthPastNetMeters:2.4 }), "DROP_SHOT");
  assert.equal(classifyTrainingShotStyle({ spinType:"TOPSPIN", spinLevel:9, verticalPath:.8,
    ballSpeedKmh:57, arcLevel:9, bounceDepthPastNetMeters:7.2 }), "HEAVY_TOPSPIN");
  assert.equal(classifyTrainingShotStyle({ spinType:"SLICE", spinLevel:6, verticalPath:-.5,
    ballSpeedKmh:68, arcLevel:4, bounceDepthPastNetMeters:2.4 }), "SLICE");
  assert.equal(classifyTrainingShotStyle({ spinType:"TOPSPIN", spinLevel:9, verticalPath:.8,
    ballSpeedKmh:57, arcLevel:4, bounceDepthPastNetMeters:7.2 }), "TOPSPIN");
});

test("racket-face meter uses signed contact pitch instead of swing path", () => {
  const impact = {
    spinType: "FLAT", spinRateRadiansPerSecond: 1, racketHeadSpeed: 8,
    upwardBrushVelocity: 0, downwardBrushVelocity: 0, swingPathAngleRadians: 0,
    launchAngleRadians: 0.15, predictedNetClearance: 0.3, contactQuality: 0.9,
    outgoingVelocity: new THREE.Vector3(0, 3, -10),
    contactNormal: new THREE.Vector3(0, Math.sin(THREE.MathUtils.degToRad(-22)), -0.93).normalize(),
    prediction: { apexPoint: new THREE.Vector3(0, 1.8, -9), bouncePoint: new THREE.Vector3(0, 0, -11) }
  } as unknown as PhysicalImpactResolution;
  const result = createShotTechnique(impact, {
    score: 50, label: "Partial", finishedAcrossFarShoulder: false,
    crossBodyScore: 45, upwardFinishScore: 45, orientationTravelDegrees: 40
  }, 1.1)!;
  assert.equal(result.racketFaceOpennessLabel, "Very closed");
  assert.ok(result.racketFaceOpennessLevel <= 2);
  assert.equal(result.arcLabel, "Low");
});
