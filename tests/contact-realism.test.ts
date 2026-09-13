import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BallController } from "../client-pc/src/ball/BallController.js";
import { resolvePhysicalImpact } from "../client-pc/src/ball/contactRealism.js";
import { sweepBallAgainstMovingRacket, sweepBallAgainstRacket } from "../client-pc/src/ball/racketCollider.js";
import { BALL_CONFIG } from "../client-pc/src/ball/ballConfig.js";
import { calculateMagnusAcceleration, stepBallPhysics } from "../client-pc/src/ball/ballPhysics.js";
import { BallSnapshot } from "../client-pc/src/ball/ballTypes.js";
import { StrokeDetectorSnapshot } from "../client-pc/src/strokeDetection/strokeTypes.js";
import { ForwardSwingSnapshot } from "../client-pc/src/motion/forwardSwingFusion.js";

function fusedSwing(overrides: Partial<ForwardSwingSnapshot> = {}): ForwardSwingSnapshot {
  return {
    windowDurationMs: 160, sampleCount: 9, forwardAcceleration: 8,
    upwardAcceleration: 0, lateralAcceleration: 0, peakForwardAcceleration: 11,
    racketHeadVelocityWorld: new THREE.Vector3(0, 0, -7), forwardRacketHeadVelocity: 7,
    upwardRacketHeadVelocity: 0, lateralRacketHeadVelocity: 0, angularSpeed: 8,
    faceAngleRadians: 0.1, forwardDriveScore: 0.8, invalidDirectionReason: "NONE", ...overrides
  };
}

function impact(overrides: Partial<Parameters<typeof resolvePhysicalImpact>[0]> = {}) {
  const contact = new THREE.Vector3(0, 0.68, 0);
  return resolvePhysicalImpact({
    incomingVelocity: new THREE.Vector3(0, 0, 7), incomingSpin: new THREE.Vector3(),
    contactPointWorld: contact, contactPointLocal: new THREE.Vector3(),
    racketPosition: new THREE.Vector3(), previousRacketPosition: new THREE.Vector3(),
    racketQuaternion: new THREE.Quaternion(), previousRacketQuaternion: new THREE.Quaternion(),
    frameSeconds: 1 / 60, swingIntent: true, swingConfidence: 0.9,
    sensorAngularSpeed: 4, angularVelocityWorld: new THREE.Vector3(-4, 0, 0),
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

test("very strong motion remains visibly faster than medium motion", () => {
  const medium = impact({ sensorAngularSpeed: 3.5, angularVelocityWorld: new THREE.Vector3(-3.5, 0, 0) });
  const veryStrong = impact({ sensorAngularSpeed: 10, angularVelocityWorld: new THREE.Vector3(-10, 0, 0) });
  assert.ok(veryStrong.powerScore > medium.powerScore + 0.35);
  assert.ok(veryStrong.outgoingVelocity.length() > medium.outgoingVelocity.length() + 3);
});

test("upward brush creates topspin, downward brush creates slice, and flat remains low-spin", () => {
  const topspin = impact({ upwardScore: 0.9 });
  const slice = impact({ upwardScore: -0.9 });
  const flat = impact({ upwardScore: 0 });
  assert.equal(topspin.spinType, "TOPSPIN");
  assert.equal(slice.spinType, "SLICE");
  assert.equal(flat.spinType, "FLAT");
  assert.equal(topspin.outcome, "TOPSPIN_HIT");
  assert.equal(slice.outcome, "SLICE_HIT");
  assert.equal(flat.outcome, "FLAT_HIT");
  assert.ok(topspin.spinRateRadiansPerSecond > flat.spinRateRadiansPerSecond);
  assert.ok(slice.spinRateRadiansPerSecond > flat.spinRateRadiansPerSecond);
  assert.ok(topspin.outgoingVelocity.y > flat.outgoingVelocity.y + 1);
  assert.ok(flat.outgoingVelocity.length() > slice.outgoingVelocity.length());
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

test("fused forehand and backhand intent both travel forward with bounded physical spread", () => {
  const forehand = impact({ forwardSwing: fusedSwing({ lateralRacketHeadVelocity: 2 }) });
  const backhand = impact({ forwardSwing: fusedSwing({ lateralRacketHeadVelocity: -2 }) });
  assert.ok(forehand.outgoingVelocity.z < 0);
  assert.ok(backhand.outgoingVelocity.z < 0);
  assert.ok(Math.abs(forehand.outgoingVelocity.x / forehand.outgoingVelocity.z) < 0.3);
  assert.ok(Math.abs(backhand.outgoingVelocity.x / backhand.outgoingVelocity.z) < 0.3);
  assert.ok(Math.sign(forehand.outgoingVelocity.x) !== Math.sign(backhand.outgoingVelocity.x));
});

test("Training stabilizes direction more than Realistic without fixing one landing point", () => {
  const swing = fusedSwing({ lateralRacketHeadVelocity: 3.5, lateralAcceleration: 5 });
  const realistic = impact({ forwardSwing: swing, playabilityAssistStrength: BALL_CONFIG.playerAssist.realistic.directionAnchorStrength });
  const training = impact({ forwardSwing: swing, playabilityAssistStrength: BALL_CONFIG.playerAssist.training.directionAnchorStrength });
  assert.ok(Math.abs(training.outgoingVelocity.x / training.outgoingVelocity.z) <
    Math.abs(realistic.outgoingVelocity.x / realistic.outgoingVelocity.z));
  assert.notDeepEqual(training.prediction.bouncePoint?.toArray(), realistic.prediction.bouncePoint?.toArray());
});

test("fused direction rejects backward intent and off-center contact increases spread", () => {
  const backward = impact({ forwardSwing: fusedSwing({
    forwardAcceleration: -6, forwardRacketHeadVelocity: -3, forwardDriveScore: -0.4,
    racketHeadVelocityWorld: new THREE.Vector3(0, 0, 3), invalidDirectionReason: "BACKWARD_SWING"
  }) });
  const sweet = impact({ forwardSwing: fusedSwing({ lateralRacketHeadVelocity: 1 }) });
  const offCenter = impact({
    contactPointLocal: new THREE.Vector3(BALL_CONFIG.collision.halfWidthLocal * 0.75, 0, 0),
    forwardSwing: fusedSwing({ lateralRacketHeadVelocity: 1 })
  });
  assert.equal(backward.outcome, "INVALID_SHOT_DIRECTION");
  assert.ok(Math.abs(sweet.outgoingVelocity.x / sweet.outgoingVelocity.z) <
    Math.abs(offCenter.outgoingVelocity.x / offCenter.outgoingVelocity.z));
});

test("upward fused acceleration raises launch while forward strength preserves depth ordering", () => {
  const weak = impact({ forwardSwing: fusedSwing({
    forwardDriveScore: 0.3, forwardAcceleration: 2, peakForwardAcceleration: 3,
    forwardRacketHeadVelocity: 2.5, racketHeadVelocityWorld: new THREE.Vector3(0, 0, -2.5)
  }) });
  const strong = impact({ forwardSwing: fusedSwing() });
  const upward = impact({ forwardSwing: fusedSwing({ upwardAcceleration: 8 }) });
  assert.ok(strong.prediction.bouncePoint!.z < weak.prediction.bouncePoint!.z);
  assert.ok(upward.launchAngleRadians > strong.launchAngleRadians);
});

test("strong flat, topspin, and slice swings produce distinct valid trajectories", () => {
  const contactPoint = new THREE.Vector3(0, 1.1, 4);
  const pivot = contactPoint.clone().add(new THREE.Vector3(0, -0.68, 0));
  const common = {
    contactPointWorld: contactPoint,
    racketPosition: pivot,
    previousRacketPosition: pivot,
    sensorAngularSpeed: 7,
    angularVelocityWorld: new THREE.Vector3(-7, 0, 0)
  };
  const flat = impact({ ...common, upwardScore: 0 });
  const topspin = impact({ ...common, upwardScore: 0.9 });
  const slice = impact({ ...common, upwardScore: -0.9 });
  assert.ok((flat.predictedNetClearance ?? -1) > 0);
  assert.ok((topspin.predictedNetClearance ?? -1) > 0);
  assert.ok((slice.predictedNetClearance ?? -1) > 0);
  assert.ok(topspin.launchAngleRadians > flat.launchAngleRadians);
  assert.ok(flat.outgoingVelocity.y > slice.outgoingVelocity.y);
  assert.ok(topspin.predictedNetClearance! > flat.predictedNetClearance!);
  assert.ok(slice.outgoingVelocity.length() < flat.outgoingVelocity.length());
  assert.notDeepEqual(topspin.outgoingVelocity.toArray(), flat.outgoingVelocity.toArray());
  assert.notDeepEqual(slice.outgoingVelocity.toArray(), flat.outgoingVelocity.toArray());
  assert.ok(topspin.prediction.apexPoint.y > flat.prediction.apexPoint.y + 0.5);
  assert.ok(slice.prediction.bounceTimeSeconds! > flat.prediction.bounceTimeSeconds! + 0.15);
  assert.ok(Math.abs(slice.prediction.bouncePoint!.z - flat.prediction.bouncePoint!.z) > 1);
});

test("power controls landing depth without a common target or dominant safety correction", () => {
  const contactPoint = new THREE.Vector3(0, 1.1, 4);
  const pivot = contactPoint.clone().add(new THREE.Vector3(0, -0.68, 0));
  const powered = (angularSpeed: number) => impact({
    contactPointWorld: contactPoint, racketPosition: pivot, previousRacketPosition: pivot,
    sensorAngularSpeed: angularSpeed,
    angularVelocityWorld: new THREE.Vector3(-angularSpeed, 0, 0), upwardScore: 0
  });
  const weak = powered(1.25);
  const medium = powered(3.5);
  const strong = powered(7);
  const veryStrong = powered(10);
  const depths = [weak, medium, strong, veryStrong].map(value => value.prediction.bouncePoint!.z);
  assert.ok(depths[0] > depths[1] && depths[1] > depths[2] && depths[2] > depths[3]);
  assert.ok(new Set(depths.map(depth => depth.toFixed(2))).size === 4);
  for (const result of [weak, medium, strong, veryStrong]) {
    assert.ok(result.safetyCorrection.length() <= BALL_CONFIG.contactRealism.maximumSafetyCorrection + 1e-9);
    assert.ok(result.safetyCorrection.length() < result.outgoingVelocity.length() * 0.1);
    assert.ok(result.rawPrediction.bouncePoint);
    assert.ok(result.outgoingVelocity.clone().sub(result.rawOutgoingVelocity).distanceTo(result.safetyCorrection) < 1e-8);
  }
});

test("topspin dips more in flight and rebounds higher than slice", () => {
  const velocity = new THREE.Vector3(0, 3, -14);
  const topAcceleration = calculateMagnusAcceleration(new THREE.Vector3(-35, 0, 0), velocity);
  const flatAcceleration = calculateMagnusAcceleration(new THREE.Vector3(), velocity);
  const sliceAcceleration = calculateMagnusAcceleration(new THREE.Vector3(22, 0, 0), velocity);
  assert.ok(topAcceleration.y < flatAcceleration.y);
  assert.ok(sliceAcceleration.y > flatAcceleration.y);

  const ball = (spinType: "topspin" | "slice", spinX: number): BallSnapshot => ({
    id: spinType, state: "RETURNED", position: new THREE.Vector3(0, 0.13, 0),
    previousPosition: new THREE.Vector3(), velocity: new THREE.Vector3(0, -3, -10),
    spinVector: new THREE.Vector3(spinX, 0, 0), angularVelocity: new THREE.Vector3(spinX, 0, 0),
    spinType, spinStrength: Math.abs(spinX), magnusAcceleration: new THREE.Vector3(),
    physicsRadius: BALL_CONFIG.scale.physicalRadiusMeters, visualRadius: 0.15,
    bounceCount: 0, hit: true, active: true, launchTimestamp: 0, launchPreset: null,
    contactTarget: new THREE.Vector3(), lockedContactTarget: new THREE.Vector3(),
    lockedContactQuaternion: new THREE.Quaternion(), lockedStrokeType: "forehand",
    expectedStrokeType: "forehand", bouncePoint: new THREE.Vector3(),
    contactTimeAfterBounce: 0, contactDeadline: 0, secondBounceDeadline: 0
  });
  const topBall = ball("topspin", -35);
  const sliceBall = ball("slice", 22);
  stepBallPhysics(topBall, 1 / 60);
  stepBallPhysics(sliceBall, 1 / 60);
  assert.ok(topBall.velocity.y > sliceBall.velocity.y);
  assert.ok(Math.abs(topBall.velocity.z) > Math.abs(sliceBall.velocity.z));
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

test("resolving an overlapping physical contact at zero dt never teleports the ball", () => {
  const controller = new BallController();
  controller.launch("easyForehand", "right", "normal", 1000);
  controller.ball.position.set(0, 1, -0.02);
  controller.ball.previousPosition.copy(controller.ball.position);
  controller.ball.velocity.set(0,0,7);
  const before = controller.ball.position.clone();
  const idle = { currentState: "READY", lockedStrokeType: "unknown", scores: {} } as StrokeDetectorSnapshot;
  controller.update(0,1000,new THREE.Matrix4().setPosition(0,1,0),idle,null,"off");
  assert.equal(controller.lastPhysicalImpact?.outcome, "STRING_BLOCK");
  assert.deepEqual(controller.ball.position,before);
});
