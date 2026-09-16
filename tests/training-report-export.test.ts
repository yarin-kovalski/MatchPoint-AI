import assert from "node:assert/strict";
import test from "node:test";
import { SmartTrainingSession } from "../client-pc/src/diagnostics/smartTrainingSession.js";
import type { ShotTechnique } from "../client-pc/src/diagnostics/strokeTechniqueAnalysis.js";
import { createTrainingReportHtml } from "../client-pc/src/diagnostics/trainingReportExport.js";
import { courtPointToMap, createCourtMapSvg } from "../client-pc/src/diagnostics/courtVision.js";

const technique: ShotTechnique = {
  spinType: "TOPSPIN", spinRateRadPerSecond: 38, spinRpm: 363, spinLevel: 69,
  topspinLevel: 69, sliceLevel: 0, verticalPathScore: .62,
  racketFaceOpenDegrees: 8, racketFaceOpennessLevel: 6, racketFaceOpennessLabel: "Slightly open",
  brushDirection: "Low to high", swingPathAngleDegrees: 21, launchAngleDegrees: 17,
  apexHeightMeters: 2.7, arcLevel: 6, arcLabel: "Medium",
  netClearanceMeters: .65, contactQuality: 88,
  ballSpeedKmh: 58, bounceDepthPastNetMeters: 7.1,
  shotStyle: "TOPSPIN", shotStyleLabel: "Topspin shot",
  followThrough: { score: 82, label: "Complete", finishedAcrossFarShoulder: true,
    crossBodyScore: 84, upwardFinishScore: 70, orientationTravelDegrees: 66 }
};

test("download report contains overall and separate stroke analysis with player context", () => {
  const session = new SmartTrainingSession(1000);
  session.record({ timestamp: 1200, expectedStroke: "forehand", detectedStroke: "forehand",
    hit: true, swingSpeedKmh: 72, timingOffsetMs: 0, placementAccuracy: 91, technique,
    returnOutcome: "IN", bouncePoint: { x: 1.2, z: -13.2 } });
  session.record({ timestamp: 1800, expectedStroke: "backhand", detectedStroke: "backhand",
    hit: false, swingSpeedKmh: 48, timingOffsetMs: 130, placementAccuracy: 0,
    missReason: "OUT_LONG", returnOutcome: "OUT_LONG", bouncePoint: { x: -2, z: -18.1 }, technique: { ...technique, spinType: "SLICE", topspinLevel: 0,
      sliceLevel: 62, shotStyle: "SLICE", shotStyleLabel: "Slice shot", racketFaceOpenDegrees: 27,
      racketFaceOpennessLevel: 9, racketFaceOpennessLabel: "Very open",
      followThrough: { ...technique.followThrough, score: 28, label: "Incomplete", finishedAcrossFarShoulder: false } } });
  const html = createTrainingReportHtml(session.finish(null, 5000), {
    playerName: "Alex & Sam", playerFeedback: "Backhand felt <late>."
  });
  assert.match(html, /Overall session analysis/);
  assert.match(html, /Forehand and backhand analysis/);
  assert.match(html, /First-bounce placement map/);
  assert.match(html, /1 in/);
  assert.match(html, /1 out/);
  assert.match(html, /court-map-marker is-in/);
  assert.match(html, /court-map-marker is-out/);
  assert.match(html, /Forehand priorities/);
  assert.match(html, /Backhand priorities/);
  assert.match(html, /Topspin level \(spin shots only\)/);
  assert.match(html, /Racket face/);
  assert.match(html, /6\/10 · Medium/);
  assert.doesNotMatch(html, /m apex/);
  assert.match(html, /body pose is not camera-tracked/);
  assert.match(html, /Alex &amp; Sam/);
  assert.match(html, /Backhand felt &lt;late&gt;\./);
  assert.doesNotMatch(html, /<script/i);
});

test("court vision maps real world positions and keeps out balls beyond the court lines", () => {
  const center = courtPointToMap(0, -5.5);
  const wide = courtPointToMap(8.5, -12);
  assert.ok(wide.x > center.x);
  const svg = createCourtMapSvg([{ x: 0, z: -12, outcome: "IN" }, { x: 8.5, z: -12, outcome: "OUT_WIDE" }]);
  assert.match(svg, /aria-label="Shot placement map"/);
  assert.match(svg, /Shot 1: IN/);
  assert.match(svg, /Shot 2: OUT WIDE/);
  assert.doesNotMatch(svg, /NaN|Infinity/);
});
