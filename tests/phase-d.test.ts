import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BallController } from "../client-pc/src/ball/BallController.js";
import { BALL_CONFIG } from "../client-pc/src/ball/ballConfig.js";
import { getLaunchParameters } from "../client-pc/src/ball/ballLauncher.js";
import { calculateMagnusAcceleration, isBallOutOfBounds, stepBallPhysics } from "../client-pc/src/ball/ballPhysics.js";
import { calculateOutgoingVelocity } from "../client-pc/src/ball/ballResponse.js";
import { sweepBallAgainstRacket } from "../client-pc/src/ball/racketCollider.js";
import { BallSnapshot } from "../client-pc/src/ball/ballTypes.js";
import { EstimatedRacketContact, StrokeDetectorSnapshot } from "../client-pc/src/strokeDetection/strokeTypes.js";

function ball(): BallSnapshot {
  return {
    id: "test", state: "IN_FLIGHT_TO_PLAYER", position: new THREE.Vector3(0, 1.85, -7.5),
    previousPosition: new THREE.Vector3(0, 1.85, -7.5), velocity: new THREE.Vector3(0, 3.2, 5.25),
    spinVector: new THREE.Vector3(), spinType: "flat", spinStrength: 0,
    magnusAcceleration: new THREE.Vector3(), radius: BALL_CONFIG.radius, bounceCount: 0,
    hit: false, active: true, launchTimestamp: 0, launchPreset: "easyForehand"
  };
}

function snapshot(state: StrokeDetectorSnapshot["currentState"]): StrokeDetectorSnapshot {
  return {
    currentState: state, previousState: "FORWARD_SWING", stateEnteredAt: 0, stateDuration: 20,
    swingId: "swing-1", lockedStrokeType: "forehand", confidence: 0.9, rejectionReason: "",
    scores: { forehandCandidateScore: 0.8, backhandCandidateScore: 0.1, classificationMargin: 0.7,
      preparationScore: 0.8, reversalScore: 0.8, forwardSwingScore: 0.9, followThroughScore: 0.7,
      contactScore: 0.9, lowToHighScore: 0.7, highToLowScore: 0, topspinScore: 0.7,
      sliceScore: 0.1, spinType: "topspin" }, peakAngularVelocity: 4, peakAcceleration: 10,
    peakJerk: 20, preparationDuration: 300, lastCompletedStroke: "none",
    lastContactTimestamp: 1000, transitions: ["READY", "CONTACT_WINDOW"]
  };
}

function contact(overrides: Partial<EstimatedRacketContact> = {}): EstimatedRacketContact {
  return {
    id: "contact-1", swingId: "swing-1", timestamp: 1000, strokeType: "forehand",
    handedness: "right", backhandStyle: "one-handed", confidence: 0.9, estimatedSpeed: 16,
    forwardScore: 0.9, upwardScore: 0.5, sidewaysScore: 0.1, racketFaceAngle: 0.5,
    racketQuaternion: new THREE.Quaternion(), racketPosition: new THREE.Vector3(),
    racketForwardVector: new THREE.Vector3(0, 1, 0), racketUpVector: new THREE.Vector3(0, 0, 1),
    racketSideVector: new THREE.Vector3(1, 0, 0), racketFaceNormal: new THREE.Vector3(0, 0, 1),
    peakAngularVelocity: 4, peakAcceleration: 10, peakJerk: 20, preparationDuration: 300,
    forwardSwingDuration: 100, lowToHighScore: 0.7, highToLowScore: 0, topspinScore: 0.8,
    sliceScore: 0.1, spinType: "topspin", ...overrides
  };
}

function crossing(matrix = new THREE.Matrix4(), x = 0) {
  return sweepBallAgainstRacket(
    new THREE.Vector3(x, 0, -1), new THREE.Vector3(x, 0, 1), BALL_CONFIG.radius, matrix, "off"
  );
}

test("launch presets travel from far court toward player", () => {
  const launch = getLaunchParameters("easyForehand", "right", "normal");
  assert.ok(launch.position.z < 0);
  assert.ok(launch.velocity.z > 0);
});

test("left handed launch mirrors forehand side", () => {
  const right = getLaunchParameters("easyForehand", "right", "normal");
  const left = getLaunchParameters("easyForehand", "left", "normal");
  assert.equal(right.position.x, -left.position.x);
});

test("initial trajectory bounces once at court height", () => {
  const value = ball();
  for (let index = 0; index < 85; index += 1) stepBallPhysics(value, 0.016);
  assert.equal(value.bounceCount, 1);
  assert.ok(value.position.y >= BALL_CONFIG.courtHeight + value.radius);
});

test("world bounds detect a ball behind the player", () => {
  const value = ball(); value.position.z = BALL_CONFIG.bounds.zBehindPlayer + 1;
  assert.equal(isBallOutOfBounds(value, 1000), true);
});

test("stationary racket overlap is not itself a controller hit", () => {
  const controller = new BallController();
  controller.launch("easyForehand", "right", "normal", 1000);
  controller.ball.position.set(0, 0, -0.01); controller.ball.velocity.set(0, 0, 1);
  controller.update(0.02, 1020, new THREE.Matrix4(), snapshot("READY"), null, "off");
  assert.equal(controller.ball.hit, false);
});

test("segment-plane crossing inside ellipse is accepted", () => assert.equal(crossing().candidate, true));
test("fast segment cannot tunnel through racket plane", () => {
  const result = sweepBallAgainstRacket(new THREE.Vector3(0, 0, -20), new THREE.Vector3(0, 0, 20), 0.034, new THREE.Matrix4(), "off");
  assert.equal(result.candidate, true);
});
test("point outside string ellipse is rejected", () => assert.equal(crossing(new THREE.Matrix4(), 70).candidate, false));
test("point inside string ellipse is accepted", () => assert.equal(crossing(new THREE.Matrix4(), 20).candidate, true));

test("valid collider crossing and contact window produce one hit", () => {
  const hits: unknown[] = [];
  const controller = new BallController(event => hits.push(event));
  controller.launch("easyForehand", "right", "normal", 1000);
  controller.ball.position.set(0, 0.2, -0.05); controller.ball.velocity.set(0, 0, 5);
  controller.update(0.02, 1050, new THREE.Matrix4(), snapshot("CONTACT_WINDOW"), contact(), "off");
  assert.equal(hits.length, 1); assert.equal(controller.ball.hit, true);
  controller.update(0.02, 1070, new THREE.Matrix4(), snapshot("CONTACT_WINDOW"), contact(), "off");
  assert.equal(hits.length, 1);
});

test("collider crossing outside contact window is rejected", () => {
  const controller = new BallController(); controller.launch("easyForehand", "right", "normal", 1000);
  controller.ball.position.set(0, 0.2, -0.05); controller.ball.velocity.set(0, 0, 5);
  controller.update(0.02, 1400, new THREE.Matrix4(), snapshot("READY"), contact(), "off");
  assert.equal(controller.ball.hit, false);
});

test("forehand and backhand share outgoing response", () => {
  const forehand = calculateOutgoingVelocity(contact(), new THREE.Vector3());
  const backhand = calculateOutgoingVelocity(contact({ strokeType: "backhand" }), new THREE.Vector3());
  assert.ok(forehand.velocity.z < 0 && backhand.velocity.z < 0);
});

test("outgoing direction points toward opponent", () => assert.ok(calculateOutgoingVelocity(contact(), new THREE.Vector3()).velocity.z < 0));
test("extreme racket normal remains playable", () => {
  const result = calculateOutgoingVelocity(contact({ racketFaceNormal: new THREE.Vector3(1, 0, 0) }), new THREE.Vector3());
  assert.ok(result.velocity.z < -2); assert.ok(Math.abs(result.velocity.x / result.speed) < 0.7);
});
test("higher stroke speed increases bounded outgoing speed", () => {
  const low = calculateOutgoingVelocity(contact({ estimatedSpeed: 5 }), new THREE.Vector3()).speed;
  const high = calculateOutgoingVelocity(contact({ estimatedSpeed: 40 }), new THREE.Vector3()).speed;
  assert.ok(high > low); assert.ok(high <= BALL_CONFIG.response.maximumReturnSpeed);
});
test("higher upward score adds vertical lift", () => {
  const low = calculateOutgoingVelocity(contact({ upwardScore: 0 }), new THREE.Vector3()).velocity.y;
  const high = calculateOutgoingVelocity(contact({ upwardScore: 1 }), new THREE.Vector3()).velocity.y;
  assert.ok(high > low);
});
test("topspin creates stronger downward Magnus curve than flat", () => {
  const velocity = new THREE.Vector3(0, 0, -10);
  const topspin = calculateMagnusAcceleration(new THREE.Vector3(-10, 0, 0), velocity);
  const flat = calculateMagnusAcceleration(new THREE.Vector3(-1, 0, 0), velocity);
  assert.ok(topspin.y < flat.y);
});
test("slice and topspin alter bounce differently", () => {
  const top = ball(); top.state = "RETURNED"; top.spinType = "topspin"; top.position.y = 0.11; top.velocity.set(0, -2, -8);
  const slice = ball(); slice.state = "RETURNED"; slice.spinType = "slice"; slice.position.y = 0.11; slice.velocity.set(0, -2, -8);
  stepBallPhysics(top, 0.02); stepBallPhysics(slice, 0.02);
  assert.ok(Math.abs(top.velocity.z) > Math.abs(slice.velocity.z));
});
test("miss emits once and resets after delay", () => {
  const misses: unknown[] = []; const controller = new BallController(undefined, event => misses.push(event));
  controller.launch("easyForehand", "right", "normal", 1000);
  controller.ball.position.z = 5; controller.ball.velocity.z = 1;
  controller.update(0, 1100, new THREE.Matrix4(), snapshot("READY"), null, "off");
  controller.update(0, 1200, new THREE.Matrix4(), snapshot("READY"), null, "off");
  assert.equal(misses.length, 1);
  controller.update(0, 1200 + BALL_CONFIG.resetDelayMs, new THREE.Matrix4(), snapshot("READY"), null, "off");
  assert.equal(controller.ball.state, "IDLE");
});
test("assist mode expands ellipse only within configured scale", () => {
  const x = BALL_CONFIG.collision.halfWidthLocal * 1.1;
  const off = sweepBallAgainstRacket(new THREE.Vector3(x, 0, -1), new THREE.Vector3(x, 0, 1), 0, new THREE.Matrix4(), "off");
  const easy = sweepBallAgainstRacket(new THREE.Vector3(x, 0, -1), new THREE.Vector3(x, 0, 1), 0, new THREE.Matrix4(), "easy");
  assert.equal(off.candidate, false); assert.equal(easy.candidate, true);
  assert.ok(BALL_CONFIG.collision.assistScale.easy <= 1.18);
});
test("deterministic replay produces same collision result", () => {
  const first = crossing(); const replay = crossing();
  assert.deepEqual({ candidate: first.candidate, point: first.contactPointLocal.toArray() },
    { candidate: replay.candidate, point: replay.contactPointLocal.toArray() });
});
