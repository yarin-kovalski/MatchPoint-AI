import assert from "node:assert/strict";
import test from "node:test";
import { analyzeGameplayDiagnostic, GameplayDiagnosticFrame, GameplayDiagnosticRecorder, GameplayDiagnosticRecording } from "../client-pc/src/diagnostics/gameplayDiagnostic.js";

function frame(timestamp: number, overrides: Partial<GameplayDiagnosticFrame> = {}): GameplayDiagnosticFrame {
  return {
    timestamp, deltaTime: 0.016, phoneQuaternion: [0,0,0,1], relativePhoneQuaternion: [0,0,0,1],
    racketQuaternion: [0,0,0,1], angularVelocity: [0,0,0], angularSpeed: 1,
    acceleration: [0,0,0], accelerationMagnitude: 1, jerk: 0, strokeState: "FORWARD_SWING",
    strokeType: "forehand", preparationScore: 0.7, forwardScore: 0.7, upwardScore: 0.2,
    sidewaysScore: 0.2, contactScore: 0.7, strokeConfidence: 0.8, estimatedSwingSpeed: 5,
    ballState: "CONTACT_ZONE", ballPosition: [0.1,2,0], previousBallPosition: [0.1,2,-0.1],
    ballVelocity: [0,1,2], bounceCount: 1, stringBedCenterWorld: [0,2,0],
    stringBedQuaternion: [0,0,0,1], racketFaceNormal: [0,0,-1], ballPositionRacketLocal: [10,0,0],
    planeDistance: 0, segmentPlaneCrossed: true, insideEllipse: true, insideWidth: true,
    insideHeight: true, approachingCorrectFace: true, contactWindowActive: true,
    recentContactEvent: true, contactEventAgeMs: 0, minimumStrokeSpeed: 2.08,
    swingSpeedPassed: true, racketFaceAngle: 0.4, racketFaceAnglePassed: true,
    ballNearTarget: true, ballNearStringBed: true, finalHitAccepted: false,
    rejectionReason: "", sensorValid: true, ...overrides
  };
}

function recording(frames: GameplayDiagnosticFrame[], result: "HIT" | "MISS" = "MISS", reason = "rejected"): GameplayDiagnosticRecording {
  return { version: 1, attemptType: "forehand", createdAt: frames[0]?.timestamp ?? 0, result, frames, finalReason: reason };
}

test("diagnostic recorder retains only monotonic synchronized frames", () => {
  const recorder = new GameplayDiagnosticRecorder(); recorder.start("forehand", 100);
  recorder.capture(frame(100)); recorder.capture(frame(100)); recorder.capture(frame(116));
  const saved = recorder.stop("MISS", "test")!;
  assert.deepEqual(saved.frames.map(value => value.timestamp), [100, 116]);
  assert.equal(saved.frames[0].ballPosition.length, 3); assert.equal(saved.frames[0].racketQuaternion.length, 4);
});
test("analyzer finds closest approach, plane crossing, peak speed, and contact interval", () => {
  const analysis = analyzeGameplayDiagnostic(recording([
    frame(100, { ballPosition: [0.3,2,0], segmentPlaneCrossed: false, contactWindowActive: false, estimatedSwingSpeed: 3 }),
    frame(116, { ballPosition: [0.05,2,0], estimatedSwingSpeed: 8 }), frame(132, { contactWindowActive: true })
  ]));
  assert.ok(Math.abs(analysis.closestApproachDistance - 0.05) < 1e-8);
  assert.equal(analysis.planeCrossingTime, 116); assert.equal(analysis.peakSwingSpeedTime, 116);
  assert.deepEqual(analysis.contactWindowInterval, [116, 132]);
});
test("analyzer identifies BALL_TOO_FAR", () => {
  const analysis = analyzeGameplayDiagnostic(recording([frame(100, { ballPosition: [1,2,0] })]));
  assert.ok(analysis.failedConditions.includes("BALL_TOO_FAR"));
});
test("analyzer identifies STROKE_STAYED_READY", () => {
  const analysis = analyzeGameplayDiagnostic(recording([frame(100, { strokeState: "READY", forwardScore: 0 })]));
  assert.ok(analysis.failedConditions.includes("STROKE_STAYED_READY"));
});
test("analyzer identifies SWING_TOO_SLOW", () => {
  const analysis = analyzeGameplayDiagnostic(recording([frame(100, { estimatedSwingSpeed: 1, minimumStrokeSpeed: 2 })]));
  assert.ok(analysis.failedConditions.includes("SWING_TOO_SLOW"));
});
test("analyzer identifies early and late contact", () => {
  assert.ok(analyzeGameplayDiagnostic(recording([frame(100, { contactEventAgeMs: 400 })])).failedConditions.includes("CONTACT_TOO_EARLY"));
  assert.ok(analyzeGameplayDiagnostic(recording([frame(100, { contactEventAgeMs: -400 })])).failedConditions.includes("CONTACT_TOO_LATE"));
});
test("rejection reason is preserved and replay analysis is identical", () => {
  const original = recording([frame(100), frame(116)], "MISS", "no stroke");
  const replayed = JSON.parse(JSON.stringify(original)) as GameplayDiagnosticRecording;
  assert.equal(replayed.finalReason, "no stroke");
  assert.deepEqual(analyzeGameplayDiagnostic(replayed), analyzeGameplayDiagnostic(original));
});
test("multiple failed gates produce one ranked primary cause", () => {
  const analysis = analyzeGameplayDiagnostic(recording([frame(100, {
    sensorValid: false, strokeState: "READY", forwardScore: 0,
    estimatedSwingSpeed: 0.5, minimumStrokeSpeed: 2, segmentPlaneCrossed: false
  })]));
  assert.ok(analysis.failedConditions.length > 1);
  assert.equal(analysis.primaryRootCause, "PACKET_GAP");
});
