import assert from "node:assert/strict";
import test from "node:test";
import { SmartTrainingSession } from "../client-pc/src/diagnostics/smartTrainingSession.js";
import type { ShotTechnique } from "../client-pc/src/diagnostics/strokeTechniqueAnalysis.js";
import { createTrainingReportHtml } from "../client-pc/src/diagnostics/trainingReportExport.js";

const technique: ShotTechnique = {
  spinType: "TOPSPIN", spinRateRadPerSecond: 38, spinRpm: 363, spinLevel: 69,
  topspinLevel: 69, sliceLevel: 0, verticalPathScore: .62,
  racketFaceOpenDegrees: 8, racketFaceOpennessLevel: 6, racketFaceOpennessLabel: "Slightly open",
  brushDirection: "Low to high", swingPathAngleDegrees: 21, launchAngleDegrees: 17,
  apexHeightMeters: 2.7, arcLevel: 6, arcLabel: "Medium",
  netClearanceMeters: .65, contactQuality: 88,
  followThrough: { score: 82, label: "Complete", finishedAcrossFarShoulder: true,
    crossBodyScore: 84, upwardFinishScore: 70, orientationTravelDegrees: 66 }
};

test("download report contains technique, progress, and representative shot studies", () => {
  const session = new SmartTrainingSession(1000);
  session.record({ timestamp: 1200, expectedStroke: "forehand", detectedStroke: "forehand",
    hit: true, swingSpeedKmh: 72, timingOffsetMs: 0, placementAccuracy: 91, technique });
  session.record({ timestamp: 1800, expectedStroke: "backhand", detectedStroke: "backhand",
    hit: false, swingSpeedKmh: 48, timingOffsetMs: 130, placementAccuracy: 0,
    missReason: "OUT_LONG", technique: { ...technique, racketFaceOpenDegrees: 27,
      racketFaceOpennessLevel: 9, racketFaceOpennessLabel: "Very open",
      followThrough: { ...technique.followThrough, score: 28, label: "Incomplete", finishedAcrossFarShoulder: false } } });
  const html = createTrainingReportHtml(session.finish(null, 5000));
  assert.match(html, /Technique profile/);
  assert.match(html, /Strong example/);
  assert.match(html, /Focus example/);
  assert.match(html, /Low to high/);
  assert.match(html, /Racket face at contact/);
  assert.match(html, /Medium 6\/10/);
  assert.doesNotMatch(html, /m apex/);
  assert.match(html, /body pose is not tracked/);
  assert.doesNotMatch(html, /<script/i);
});
