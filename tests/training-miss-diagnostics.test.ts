import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyTrainingMiss, emptyTrainingMissBreakdown, TrainingMissEvidence
} from "../client-pc/src/diagnostics/trainingMissDiagnostics.js";

function evidence(overrides: Partial<TrainingMissEvidence> = {}): TrainingMissEvidence {
  return {
    closestOffset: { x: 0, y: 0, z: 0 },
    closestBallToStringBedMeters: 0.2,
    maximumStringBedReachMeters: 0.75,
    strikeZoneRadii: { lateral: 0.42, vertical: 0.32, depth: 0.42 },
    enteredStrikeZone: true,
    maximumNeutralOriginDriftMeters: 0,
    sawActiveIntentBeforeWindow: false,
    sawActiveIntentInWindow: true,
    sawActiveIntentAfterWindow: false,
    sawForwardIntentInWindow: true,
    rejectedInWindow: null,
    ...overrides
  };
}

test("Training miss diagnostics distinguish early, late, and absent forward intent", () => {
  assert.deepEqual(classifyTrainingMiss(evidence({
    sawActiveIntentBeforeWindow: true, sawActiveIntentInWindow: false
  })), ["TOO_EARLY"]);
  assert.deepEqual(classifyTrainingMiss(evidence({
    sawActiveIntentInWindow: false, sawActiveIntentAfterWindow: true
  })), ["TOO_LATE"]);
  assert.deepEqual(classifyTrainingMiss(evidence({
    sawActiveIntentInWindow: false
  })), ["NO_FORWARD_INTENT"]);
});

test("Training miss diagnostics expose geometry and neutral-origin drift", () => {
  assert.deepEqual(classifyTrainingMiss(evidence({
    closestOffset: { x: 0.5, y: 0.4, z: 0 }, enteredStrikeZone: false,
    maximumNeutralOriginDriftMeters: 0.04
  })), ["OUTSIDE_STRIKE_ZONE", "BALL_TOO_HIGH", "BALL_TOO_FAR", "RACKET_DRIFT"]);
  assert.deepEqual(classifyTrainingMiss(evidence({
    closestOffset: { x: 0, y: -0.4, z: 0 }
  })), ["BALL_TOO_LOW"]);
  assert.deepEqual(classifyTrainingMiss(evidence({ closestBallToStringBedMeters: 0.9 })),
    ["BALL_TOO_FAR"]);
});

test("Training miss diagnostics identify a gate rejection despite valid intent", () => {
  assert.deepEqual(classifyTrainingMiss(evidence({ rejectedInWindow: "RACKET_FACE_IMPLAUSIBLE" })),
    ["ASSIST_REJECTED"]);
  assert.equal(emptyTrainingMissBreakdown().ASSIST_REJECTED, 0);
});
