import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import { BALL_CONFIG } from "../client-pc/src/ball/ballConfig.js";
import { getLaunchParameters } from "../client-pc/src/ball/ballLauncher.js";
import { calculateOutgoingVelocity, predictReturnTrajectory, resolveReturnDirection } from "../client-pc/src/ball/ballResponse.js";
import { getRacketBasisFromQuaternion } from "../client-pc/src/motion/racketBasis.js";
import { EstimatedRacketContact } from "../client-pc/src/strokeDetection/strokeTypes.js";

type Frame = {
  timestamp: number; strokeType: string; racketQuaternion: number[]; racketFaceNormal: number[];
  ballPosition: number[]; ballVelocity: number[]; ballPositionRacketLocal: number[];
  upwardScore: number; sidewaysScore: number; forwardScore: number;
  estimatedSwingSpeed: number; finalHitAccepted: boolean; bounceCount: number;
};
type Recording = { attemptType: "forehand" | "backhand"; result: string; frames: Frame[] };
const recording = JSON.parse(readFileSync("tests/fixtures/real-successful-forehand-hit.json", "utf8")) as Recording;
const acceptedIndex = recording.frames.findIndex(frame => frame.finalHitAccepted);
const accepted = recording.frames[acceptedIndex];
const before = recording.frames[acceptedIndex - 1];

function contact(strokeType: "forehand" | "backhand"): EstimatedRacketContact {
  const quaternion = new THREE.Quaternion().fromArray(accepted.racketQuaternion);
  const basis = getRacketBasisFromQuaternion(quaternion);
  return {
    id: "recorded-hit", swingId: "recorded-swing", timestamp: accepted.timestamp,
    strokeType, handedness: "right", backhandStyle: "one-handed", confidence: 0.72,
    estimatedSpeed: accepted.estimatedSwingSpeed, forwardScore: accepted.forwardScore,
    upwardScore: accepted.upwardScore, sidewaysScore: accepted.sidewaysScore,
    racketFaceAngle: Math.acos(Math.abs(basis.faceNormal.y)), racketQuaternion: quaternion,
    racketPosition: new THREE.Vector3(), racketForwardVector: basis.forward,
    racketUpVector: basis.up, racketSideVector: basis.side, racketFaceNormal: basis.faceNormal,
    peakAngularVelocity: accepted.estimatedSwingSpeed / 3.2, peakAcceleration: 10,
    peakJerk: 0, preparationDuration: 300, forwardSwingDuration: 120,
    lowToHighScore: 0, highToLowScore: 0.5, topspinScore: 0.1, sliceScore: 0.4,
    spinType: "slice"
  };
}

test("latest uploaded recording remains a HIT and retains its type mismatch", () => {
  assert.equal(recording.result, "HIT");
  assert.equal(recording.attemptType, "forehand");
  assert.equal(accepted.strokeType, "backhand");
  assert.equal(accepted.bounceCount, 1);
});

test("recorded near-vertical face produces a bounded far-court return", () => {
  const result = calculateOutgoingVelocity(
    contact("backhand"), new THREE.Vector3().fromArray(accepted.ballPositionRacketLocal),
    new THREE.Vector3().fromArray(accepted.ballPosition), new THREE.Vector3().fromArray(before.ballVelocity)
  );
  assert.ok(result.velocity.z < 0);
  assert.ok(result.velocity.y >= BALL_CONFIG.response.minimumReturnLift);
  assert.ok(result.velocity.y <= BALL_CONFIG.response.maximumReturnLift);
  assert.ok(result.prediction.netCrossingPoint);
  assert.ok(result.prediction.netCrossingPoint!.y >= BALL_CONFIG.launch.netHeight + BALL_CONFIG.response.minimumNetClearance);
  assert.ok(result.prediction.bouncePoint);
  assert.ok(Math.abs(result.prediction.bouncePoint!.x) < 4.12);
  assert.ok(result.prediction.bouncePoint!.z < BALL_CONFIG.launch.netDepth);
  assert.ok(result.prediction.bouncePoint!.z > -12);
  assert.ok(result.direction.faceContribution.y < 0.12);
});

test("forehand and backhand court targets produce opposite controlled lateral signs", () => {
  const local = new THREE.Vector3();
  const world = new THREE.Vector3(0, 1.2, -1.8);
  const incoming = new THREE.Vector3(0, 0, 8);
  const forehand = calculateOutgoingVelocity(contact("forehand"), local, world, incoming).velocity;
  const backhand = calculateOutgoingVelocity(contact("backhand"), local, world, incoming).velocity;
  assert.ok(forehand.x > 0, String(forehand.x));
  assert.ok(backhand.x < 0, String(backhand.x));
});

test("left-handed mirroring is applied once at the court target", () => {
  const base = {
    strokeType: "forehand" as const, racketFaceNormal: new THREE.Vector3(0, 0.98, -0.2),
    racketSide: new THREE.Vector3(1, 0, 0), racketUp: new THREE.Vector3(0, 1, 0),
    contactPointLocal: new THREE.Vector3(), contactPointWorld: new THREE.Vector3(0, 1, -1.8),
    upwardScore: 0, sidewaysScore: 0, incomingVelocity: new THREE.Vector3(0, 0, 8)
  };
  const right = resolveReturnDirection({ ...base, handedness: "right" }).targetPoint;
  const left = resolveReturnDirection({ ...base, handedness: "left" }).targetPoint;
  assert.equal(right.x, -left.x);
});

test("guaranteed feeds bounce once and rise above their contact height", () => {
  for (const preset of ["guaranteedForehand", "guaranteedBackhand"] as const) {
    const launch = getLaunchParameters(preset, "right", "normal");
    const postBounceVelocity = new THREE.Vector3(
      (launch.contactTarget.x - launch.bouncePoint.x) / launch.contactTimeAfterBounce,
      (launch.contactTarget.y - launch.bouncePoint.y - 0.5 * BALL_CONFIG.gravity * launch.contactTimeAfterBounce ** 2) / launch.contactTimeAfterBounce,
      (launch.contactTarget.z - launch.bouncePoint.z) / launch.contactTimeAfterBounce
    );
    const apex = launch.bouncePoint.y + postBounceVelocity.y ** 2 / (2 * Math.abs(BALL_CONFIG.gravity));
    assert.ok(postBounceVelocity.y > 0);
    assert.ok(apex > launch.contactTarget.y + 0.1, `${preset}: ${apex}`);
    assert.ok(launch.contactTimeAfterBounce < launch.predictedSecondBounceTimeAfterBounce);
  }
});
