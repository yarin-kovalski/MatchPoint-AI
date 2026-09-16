import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EasySwingIntentDetector } from "../client-pc/src/strokeDetection/easySwingIntent.js";
import { getRecordedReachEnvelope } from "../client-pc/src/ball/recordedReachEnvelope.js";
import { getLaunchParameters } from "../client-pc/src/ball/ballLauncher.js";
import { BALL_CONFIG } from "../client-pc/src/ball/ballConfig.js";

type MotionFrame = {
  timestamp: number;
  angularSpeed: number;
  accelerationMagnitude: number;
  forwardScore: number;
  preparationScore?: number;
  racketFaceAngle: number;
  sensorValid: boolean;
};

type Attempt = {
  createdAt: number;
  attemptType: "forehand" | "backhand";
  motionFrames: MotionFrame[];
  frames: Array<{ timestamp: number; bounceCount: number }>;
};

const attempts = [
  JSON.parse(readFileSync("tests/fixtures/real-forehand-attempt-2.json", "utf8")) as Attempt,
  JSON.parse(readFileSync("tests/fixtures/real-backhand-attempt-1.json", "utf8")) as Attempt
];

function replayIntent(attempt: Attempt): { activated: boolean; peak: number } {
  const detector = new EasySwingIntentDetector();
  let activated = false;
  let peak = 0;
  for (const frame of attempt.motionFrames) {
    const snapshot = detector.update({
      timestamp: frame.timestamp,
      valid: frame.sensorValid,
      angularSpeed: frame.angularSpeed,
      accelerationMagnitude: frame.accelerationMagnitude,
      forwardScore: frame.forwardScore,
      preparationScore: frame.preparationScore ?? 0,
      racketFaceAngle: frame.racketFaceAngle
    }, attempt.attemptType);
    activated ||= snapshot.active;
    peak = Math.max(peak, snapshot.peakAngularSpeed);
  }
  return { activated, peak };
}

test("both downloaded human swings activate Easy swing intent", () => {
  for (const attempt of attempts) {
    const replay = replayIntent(attempt);
    assert.equal(replay.activated, true, attempt.attemptType);
    assert.ok(replay.peak > 7, `${attempt.attemptType}: ${replay.peak}`);
  }
});

test("recorded Forehand and Backhand swings overlap the current Training gate", () => {
  let accepted = 0;
  for (const attempt of attempts) {
    const detector = new EasySwingIntentDetector();
    const firstBounceAt = attempt.frames.find(frame => frame.bounceCount === 1)?.timestamp;
    assert.ok(firstBounceAt !== undefined, attempt.attemptType);
    const contactAt = firstBounceAt! + 820;
    let hit = false;
    for (const frame of attempt.motionFrames) {
      const intent = detector.update({
        timestamp: frame.timestamp, valid: frame.sensorValid,
        angularSpeed: frame.angularSpeed, accelerationMagnitude: frame.accelerationMagnitude,
        forwardScore: frame.forwardScore, preparationScore: frame.preparationScore ?? 0,
        racketFaceAngle: frame.racketFaceAngle
      }, attempt.attemptType);
      hit ||= frame.timestamp >= contactAt - BALL_CONFIG.playerAssist.training.windowBeforeMs &&
        frame.timestamp <= contactAt + BALL_CONFIG.playerAssist.training.windowAfterMs &&
        intent.active && frame.timestamp - intent.startedAt >= BALL_CONFIG.playableCalibratedHit.minimumActiveSwingMs &&
        frame.angularSpeed >= BALL_CONFIG.playerAssist.training.minimumAngularSpeed &&
        frame.accelerationMagnitude >= BALL_CONFIG.playerAssist.training.minimumAcceleration &&
        frame.forwardScore >= BALL_CONFIG.playerAssist.training.minimumForwardDriveScore;
    }
    assert.equal(hit, true, attempt.attemptType);
    accepted += Number(hit);
  }
  assert.equal(accepted / attempts.length, 1);
});

test("stationary noise never activates Easy swing intent", () => {
  const detector = new EasySwingIntentDetector();
  for (let timestamp = 0; timestamp <= 1000; timestamp += 16) {
    const snapshot = detector.update({
      timestamp, valid: true, angularSpeed: 0.4, accelerationMagnitude: 0.8,
      forwardScore: 0.03, preparationScore: 0.1, racketFaceAngle: 0.4
    }, "forehand");
    assert.equal(snapshot.active, false);
  }
});

test("a fast orientation-led swing remains active through follow-through and keeps its peak source time", () => {
  const detector = new EasySwingIntentDetector();
  const peak = detector.update({
    timestamp: 10_000, sourceTimestamp: 4_200, valid: true,
    angularSpeed: 3, accelerationMagnitude: 1.1, forwardScore: 0.34,
    preparationScore: 0.5, racketFaceAngle: 0.45
  }, "forehand");
  assert.equal(peak.active, true);
  assert.equal(peak.peakSourceTimestamp, 4_200);

  const followThrough = detector.update({
    timestamp: 10_180, sourceTimestamp: 4_380, valid: true,
    angularSpeed: 0.35, accelerationMagnitude: 0.5, forwardScore: 0.02,
    preparationScore: 0.1, racketFaceAngle: 0.5
  }, "forehand");
  assert.equal(followThrough.active, true);
  assert.equal(followThrough.peakSourceTimestamp, 4_200);
  assert.equal(detector.getSnapshot(10_621, "forehand").active, false);
});

test("Easy feeds intersect the measured reach envelopes during the real swing windows", () => {
  for (const attempt of attempts) {
    const preset = attempt.attemptType === "forehand" ? "easyForehand" : "easyBackhand";
    const launch = getLaunchParameters(preset, "right", "normal");
    const envelope = getRecordedReachEnvelope(attempt.attemptType, "right");
    const contactAt = (launch.contactTimeAfterBounce + 0.646) * 1000;
    assert.ok(launch.contactTarget.distanceTo(envelope.comfortableCenter) < 1e-8);
    assert.ok(contactAt >= envelope.timeRangeAfterLaunchMs.minimum - 1e-6);
    assert.ok(contactAt <= envelope.timeRangeAfterLaunchMs.maximum + 1e-6);
  }
});
