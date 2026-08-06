import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BallController } from "../client-pc/src/ball/BallController.js";
import { resolvePhysicalImpact } from "../client-pc/src/ball/contactRealism.js";
import { sweepBallAgainstMovingRacket, sweepBallAgainstRacket } from "../client-pc/src/ball/racketCollider.js";
import { BALL_CONFIG } from "../client-pc/src/ball/ballConfig.js";
import { StrokeDetectorSnapshot } from "../client-pc/src/strokeDetection/strokeTypes.js";

function impact(overrides: Partial<Parameters<typeof resolvePhysicalImpact>[0]> = {}) {
  const contact = new THREE.Vector3(0, 0.68, 0);
  return resolvePhysicalImpact({
    incomingVelocity: new THREE.Vector3(0, 0, 7), incomingSpin: new THREE.Vector3(),
    contactPointWorld: contact, contactPointLocal: new THREE.Vector3(),
    racketPosition: new THREE.Vector3(), previousRacketPosition: new THREE.Vector3(),
    racketQuaternion: new THREE.Quaternion(), previousRacketQuaternion: new THREE.Quaternion(),
    frameSeconds: 1 / 60, swingIntent: true, swingConfidence: 0.9,
    sensorAngularSpeed: 4, angularVelocityWorld: new THREE.Vector3(4, 0, 0),
    sensorAcceleration: 8, forwardScore: 0.8, upwardScore: 0,
    frameContact: false, ...overrides
  });
}

test("stationary strings block without creating a valid hit", () => {
  const result = impact({ swingIntent: false, swingConfidence: 0, sensorAngularSpeed: 0, angularVelocityWorld: new THREE.Vector3() });
  assert.equal(result.outcome, "STRING_BLOCK");
  assert.ok(result.outgoingVelocity.z < 0);
  assert.ok(result.outgoingVelocity.length() < 7);
});

test("backward or strongly sideways contact cannot remain a successful tennis hit", () => {
  const valid = impact();
  assert.ok(valid.forwardDirectionQuality >= BALL_CONFIG.contactRealism.minimumForwardDirectionQuality);
  const sidewaysFace = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 1.0, 0));
  const invalid = impact({ racketQuaternion: sidewaysFace, previousRacketQuaternion: sidewaysFace });
  assert.equal(invalid.outcome, "INVALID_SHOT_DIRECTION");
  assert.ok(invalid.forwardDirectionQuality < BALL_CONFIG.contactRealism.minimumForwardDirectionQuality);
  assert.ok(invalid.assistedOutgoingVelocity.length() < invalid.rawOutgoingVelocity.length());
});

test("weak medium and strong racket motion produce continuous increasing speed", () => {
  const weak = impact({ sensorAngularSpeed: 1.25, angularVelocityWorld: new THREE.Vector3(-1.25, 0, 0) });
  const medium = impact({ sensorAngularSpeed: 3.5, angularVelocityWorld: new THREE.Vector3(-3.5, 0, 0) });
  const strong = impact({ sensorAngularSpeed: 7, angularVelocityWorld: new THREE.Vector3(-7, 0, 0) });
  assert.ok(weak.outgoingVelocity.length() < medium.outgoingVelocity.length());
  assert.ok(medium.outgoingVelocity.length() < strong.outgoingVelocity.length());
  assert.ok(strong.outgoingVelocity.length() <= BALL_CONFIG.contactRealism.maximumOutgoingSpeed);
});

test("upward brush creates topspin, downward brush creates slice, and flat remains low-spin", () => {
  const topspin = impact({ upwardScore: 0.9 });
  const slice = impact({ upwardScore: -0.9 });
  const flat = impact({ upwardScore: 0, angularVelocityWorld: new THREE.Vector3(0, 0, 0) });
  assert.equal(topspin.spinType, "TOPSPIN");
  assert.equal(slice.spinType, "SLICE");
  assert.equal(flat.spinType, "FLAT");
  assert.equal(topspin.outcome, "TOPSPIN_HIT");
  assert.equal(slice.outcome, "SLICE_HIT");
  assert.equal(flat.outcome, "FLAT_HIT");
  assert.ok(topspin.spinRateRadiansPerSecond > flat.spinRateRadiansPerSecond);
});

test("open and closed racket faces change launch height", () => {
  const open = impact({ racketQuaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, 0, 0)) });
  const neutral = impact();
  const closed = impact({ racketQuaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25, 0, 0)) });
  assert.ok(open.outgoingVelocity.y > neutral.outgoingVelocity.y);
  assert.ok(neutral.outgoingVelocity.y > closed.outgoingVelocity.y);
});

test("sweet spot retains more energy than edge and frame contact", () => {
  const sweet = impact();
  const edge = impact({ contactPointLocal: new THREE.Vector3(BALL_CONFIG.collision.halfWidthLocal * 0.8, 0, 0) });
  const frame = impact({ frameContact: true });
  assert.ok(sweet.contactQuality > edge.contactQuality);
  assert.ok(sweet.outgoingVelocity.length() > edge.outgoingVelocity.length());
  assert.equal(frame.outcome, "FRAME_CONTACT");
  assert.ok(frame.outgoingVelocity.length() < sweet.outgoingVelocity.length());
});

test("continuous collision catches a high-speed ball and moving-racket midpoint impact", () => {
  const identity = new THREE.Matrix4();
  const fast = sweepBallAgainstRacket(new THREE.Vector3(0, 0, -4), new THREE.Vector3(0, 0, 4), 0.0335, identity, "off");
  assert.equal(fast.physicalCandidate, true);
  assert.ok(fast.impactFraction >= 0 && fast.impactFraction <= 1);
  const previous = new THREE.Matrix4().setPosition(-1, 0, 0);
  const current = new THREE.Matrix4().setPosition(1, 0, 0);
  const moving = sweepBallAgainstMovingRacket(
    new THREE.Vector3(0, 0, -0.2), new THREE.Vector3(0, 0, 0.2), 0.0335,
    previous, current, "off", 12
  );
  assert.equal(moving.physicalCandidate, true);
});

test("controller resolves stationary physical contact once without HIT", () => {
  let hits = 0;
  const controller = new BallController(() => { hits += 1; });
  controller.launch("easyForehand", "right", "normal", 1000);
  controller.ball.bounceCount = 1;
  controller.ball.position.set(0, 1, -0.02);
  controller.ball.previousPosition.set(0, 1, -0.02);
  controller.ball.velocity.set(0, 0, 7);
  const snapshot: StrokeDetectorSnapshot = {
    currentState: "READY", previousState: "READY", stateEnteredAt: 0, stateDuration: 0,
    swingId: null, lockedStrokeType: "unknown", confidence: 0, rejectionReason: "none",
    scores: { forehandCandidateScore: 0, backhandCandidateScore: 0, classificationMargin: 0,
      preparationScore: 0, reversalScore: 0, forwardSwingScore: 0, followThroughScore: 0,
      contactScore: 0, lowToHighScore: 0, highToLowScore: 0, topspinScore: 0, sliceScore: 0, spinType: "flat" },
    peakAngularVelocity: 0, peakAcceleration: 0, peakJerk: 0, preparationDuration: 0,
    lastCompletedStroke: "none", lastContactTimestamp: null, transitions: []
  };
  const racketMatrix = new THREE.Matrix4().setPosition(0, 1, 0);
  controller.update(1 / 60, 1016, racketMatrix, snapshot, null, "off");
  const firstVelocity = controller.ball.velocity.clone();
  controller.update(1 / 60, 1032, racketMatrix, snapshot, null, "off");
  assert.equal(hits, 0);
  assert.equal(controller.lastPhysicalImpact?.outcome, "STRING_BLOCK");
  assert.ok(firstVelocity.z < 0);
  assert.notEqual(controller.contactLifecycle, "APPROACHING");
});
