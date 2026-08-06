import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EasySwingIntentDetector } from "../client-pc/src/strokeDetection/easySwingIntent.js";
import { getRecordedReachEnvelope } from "../client-pc/src/ball/recordedReachEnvelope.js";
import { getLaunchParameters } from "../client-pc/src/ball/ballLauncher.js";

type MotionFrame = {
  timestamp: number;
  angularSpeed: number;
  accelerationMagnitude: number;
  forwardScore: number;
  racketFaceAngle: number;
  sensorValid: boolean;
};

type Attempt = {
  createdAt: number;
  attemptType: "forehand" | "backhand";
  motionFrames: MotionFrame[];
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
      preparationScore: 0.7,
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
