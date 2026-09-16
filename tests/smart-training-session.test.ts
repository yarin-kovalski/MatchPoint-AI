import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTrainingTargetAccuracy, classifyTrainingTiming, isSuccessfulTrainingReturn,
  SmartTrainingSession, TrainingStrokeEvidence
} from "../client-pc/src/diagnostics/smartTrainingSession.js";

test("smart session aggregates stroke detection, speed, timing, ratio, accuracy, and streak", () => {
  const session = new SmartTrainingSession(1000);
  session.record({ timestamp: 1100, expectedStroke: "forehand", detectedStroke: "forehand", hit: true,
    swingSpeedKmh: 64, timingOffsetMs: -20, placementAccuracy: 88 });
  session.record({ timestamp: 1200, expectedStroke: "backhand", detectedStroke: "backhand", hit: true,
    swingSpeedKmh: 72, timingOffsetMs: 96, placementAccuracy: 62 });
  session.record({ timestamp: 1300, expectedStroke: "forehand", detectedStroke: "unknown", hit: false,
    swingSpeedKmh: 44, timingOffsetMs: null, placementAccuracy: 0, missReason: "SWING_TOO_EARLY" });
  const summary = session.summary();
  assert.deepEqual(summary, {
    attempts: 3, hits: 2, misses: 1, hitRatio: 67,
    forehands: 1, backhands: 1, unknownStrokes: 1,
    averageSwingSpeedKmh: 60, peakSwingSpeedKmh: 72, targetAccuracy: 50,
    earlyHits: 1, onTimeHits: 1, lateHits: 1, noContact: 0, bestStreak: 2,
    netMisses: 0, wideMisses: 0, longMisses: 0, shortMisses: 0,
    averageSpinLevel: 0, averageTopspinLevel: 0, averageSliceLevel: 0,
    averageFaceOpennessLevel: 0, averageArcLevel: 0, followThroughCompletion: 0
  });
});

test("only an in-court first bounce is a successful training return", () => {
  assert.equal(isSuccessfulTrainingReturn("IN"), true);
  for (const outcome of ["NET", "OUT_WIDE", "OUT_LONG", "SHORT", "OUT"] as const) {
    assert.equal(isSuccessfulTrainingReturn(outcome), false, outcome);
  }
});

test("motion evidence classifies both stroke sides without using the expected feed", () => {
  const forehand = new TrainingStrokeEvidence();
  forehand.observe({ lockedStrokeType: "unknown", confidence: 0,
    forehandCandidateScore: 0.72, backhandCandidateScore: 0.18, angularSpeed: 3.2 });
  assert.equal(forehand.resolve().strokeType, "forehand");
  assert.ok(forehand.resolve().confidence >= 0.5);

  const backhand = new TrainingStrokeEvidence();
  backhand.observe({ lockedStrokeType: "unknown", confidence: 0,
    forehandCandidateScore: 0.12, backhandCandidateScore: 0.81, angularSpeed: 3.8 });
  assert.equal(backhand.resolve().strokeType, "backhand");
  backhand.observe({ lockedStrokeType: "forehand", confidence: 0.88,
    forehandCandidateScore: 0.7, backhandCandidateScore: 0.2, angularSpeed: 4 });
  assert.deepEqual(backhand.resolve(), {
    strokeType: "forehand", confidence: 0.88, source: "strict-state-machine"
  });
});

test("deep-center target scores higher than wide or short placement", () => {
  const center = calculateTrainingTargetAccuracy({ x: 0, z: -13.2 });
  const wide = calculateTrainingTargetAccuracy({ x: 4, z: -13.2 });
  const short = calculateTrainingTargetAccuracy({ x: 0, z: -7 });
  assert.equal(center, 100);
  assert.ok(center > wide && wide > short);
  assert.equal(calculateTrainingTargetAccuracy(null), 0);
});

test("timing uses sensor offset and explicit miss reasons", () => {
  assert.equal(classifyTrainingTiming(-71), "early");
  assert.equal(classifyTrainingTiming(0), "on-time");
  assert.equal(classifyTrainingTiming(71), "late");
  assert.equal(classifyTrainingTiming(null), "no-contact");
  assert.equal(classifyTrainingTiming(0, "SWING_TOO_LATE"), "late");
});

test("completed session compares progress and creates measured coaching", () => {
  const previousSession = new SmartTrainingSession(0);
  previousSession.record({ timestamp: 1, expectedStroke: "forehand", detectedStroke: "unknown", hit: false,
    swingSpeedKmh: 40, timingOffsetMs: null, placementAccuracy: 0 });
  const previous = previousSession.finish(null, 1000);
  const current = new SmartTrainingSession(2000);
  for (let index = 0; index < 4; index += 1) current.record({
    timestamp: 2100 + index, expectedStroke: index % 2 ? "backhand" : "forehand",
    detectedStroke: index % 2 ? "backhand" : "forehand", hit: true,
    swingSpeedKmh: 60, timingOffsetMs: 0, placementAccuracy: 80
  });
  const report = current.finish(previous, 5000);
  assert.equal(report.improvement?.hitRatioPoints, 100);
  assert.equal(report.improvement?.targetAccuracyPoints, 80);
  assert.ok(report.feedback.some(message => message.includes("improved")));
});
