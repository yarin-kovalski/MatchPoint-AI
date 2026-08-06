import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import { BallController } from "../client-pc/src/ball/BallController.js";
import { BALL_CONFIG } from "../client-pc/src/ball/ballConfig.js";
import { getLaunchParameters } from "../client-pc/src/ball/ballLauncher.js";
import { getRecordedReachEnvelope } from "../client-pc/src/ball/recordedReachEnvelope.js";
import { sweepBallAgainstRacket } from "../client-pc/src/ball/racketCollider.js";
import { getRacketBasisFromQuaternion } from "../client-pc/src/motion/racketBasis.js";
import { NormalizedSensorFrame } from "../client-pc/src/motion/sensorNormalization.js";
import { StrokeStateMachine } from "../client-pc/src/strokeDetection/strokeStateMachine.js";
import { EasySwingIntentDetector } from "../client-pc/src/strokeDetection/easySwingIntent.js";

type RecordedMotion = {
  timestamp: number; deltaTime: number; phoneQuaternion: number[]; relativePhoneQuaternion: number[];
  racketQuaternion: number[]; angularVelocity: number[]; angularSpeed: number; acceleration: number[];
  accelerationMagnitude: number; jerk: number; forwardScore: number; upwardScore: number;
  sidewaysScore: number; racketFaceAngle: number; sensorValid: boolean;
};
type GeometryFrame = {
  timestamp: number; ballPosition: number[]; previousBallPosition: number[]; ballVelocity: number[];
  stringBedCenterWorld: number[]; stringBedQuaternion: number[]; ballPositionRacketLocal: number[];
};
type Fixture = {
  createdAt: number; observedFailures: string[]; firstBounce: GeometryFrame; closestApproach: GeometryFrame;
  planeCrossingPair: GeometryFrame[]; motionFrames: RecordedMotion[];
  trajectoryFrames: Array<{
    timestamp: number; stringBedCenterWorld: number[]; stringBedQuaternion: number[];
    angularSpeed: number; accelerationMagnitude: number; forwardScore: number;
    racketFaceNormal: number[]; racketFaceAngle: number; sensorValid: boolean;
  }>;
};

const fixture = JSON.parse(readFileSync("tests/fixtures/real-forehand-attempt.json", "utf8")) as Fixture;

function matrix(frame: { stringBedCenterWorld: number[]; stringBedQuaternion: number[] }): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(frame.stringBedCenterWorld),
    new THREE.Quaternion().fromArray(frame.stringBedQuaternion),
    new THREE.Vector3(0.01, 0.01, 0.01)
  );
}

function sensorFrame(value: RecordedMotion): NormalizedSensorFrame {
  const mapped = new THREE.Quaternion().fromArray(value.racketQuaternion);
  const basis = getRacketBasisFromQuaternion(mapped);
  const acceleration = new THREE.Vector3().fromArray(value.acceleration);
  return {
    timestamp: value.timestamp, sensorTimestamp: value.timestamp, deltaTime: value.deltaTime,
    currentPhoneQuaternion: new THREE.Quaternion().fromArray(value.phoneQuaternion),
    relativePhoneQuaternion: new THREE.Quaternion().fromArray(value.relativePhoneQuaternion),
    mappedRacketQuaternion: mapped, angularVelocityLocal: new THREE.Vector3(),
    angularVelocityWorld: new THREE.Vector3().fromArray(value.angularVelocity), angularSpeed: value.angularSpeed,
    rawAcceleration: acceleration.clone(), accelerationIncludingGravity: acceleration.clone(),
    gravityCompensatedAcceleration: acceleration.clone(), smoothedAcceleration: acceleration.clone(),
    fastAcceleration: acceleration.clone(), accelerationMagnitude: value.accelerationMagnitude, jerk: value.jerk,
    racketForwardVector: basis.forward, racketUpVector: basis.up, racketSideVector: basis.side,
    racketFaceNormal: basis.faceNormal, racketFaceAngleToCourtRadians: value.racketFaceAngle,
    motionForwardScore: value.forwardScore, motionUpwardScore: value.upwardScore,
    motionSidewaysScore: value.sidewaysScore, valid: value.sensorValid, rejectionReason: ""
  };
}

test("real fixture preserves the original measured failures", () => {
  for (const failure of ["BALL_TOO_FAR", "STROKE_STAYED_READY", "NO_PLANE_CROSSING"]) {
    assert.ok(fixture.observedFailures.includes(failure));
  }
});

test("real non-neutral forehand leaves READY after stationary arming", () => {
  const machine = new StrokeStateMachine("right", "one-handed");
  const visited = new Set<string>();
  for (const value of fixture.motionFrames) {
    machine.process(sensorFrame(value));
    visited.add(machine.getSnapshot(value.timestamp).currentState);
  }
  assert.ok([...visited].some(state => state !== "READY"), [...visited].join(" -> "));
});

test("moving-racket sweep detects the recorded relative plane crossing", () => {
  const [previous, current] = fixture.planeCrossingPair;
  const collision = sweepBallAgainstRacket(
    new THREE.Vector3().fromArray(previous.ballPosition),
    new THREE.Vector3().fromArray(current.ballPosition),
    BALL_CONFIG.scale.physicalRadiusMeters,
    matrix(current),
    "easy",
    matrix(previous)
  );
  assert.equal(collision.crossed, true);
});

test("corrected deterministic delivery targets the measured forehand reach envelope", () => {
  const launch = getLaunchParameters("easyForehand", "right", "normal", "one-handed");
  const measured = getRecordedReachEnvelope("forehand", "right");
  assert.ok(launch.contactTarget.distanceTo(measured.comfortableCenter) <= 1e-8);
  assert.ok(launch.contactTimeAfterBounce < launch.predictedSecondBounceTimeAfterBounce);
});

test("real forehand motion creates Easy swing intent", () => {
  const detector = new EasySwingIntentDetector();
  let active = false;
  for (const value of fixture.motionFrames) {
    const result = detector.update({
      timestamp: value.timestamp, valid: value.sensorValid, angularSpeed: value.angularSpeed,
      accelerationMagnitude: value.accelerationMagnitude, forwardScore: value.forwardScore,
      preparationScore: 0.7, racketFaceAngle: value.racketFaceAngle
    }, "forehand");
    active ||= result.active;
  }
  assert.equal(active, true);
});
