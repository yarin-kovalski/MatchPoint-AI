import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BALL_CONFIG } from "../client-pc/src/ball/ballConfig.js";
import { getBallDeliveryTarget, projectPixelDiameter, solveVelocity } from "../client-pc/src/ball/ballDelivery.js";
import { getRecordedReachEnvelope } from "../client-pc/src/ball/recordedReachEnvelope.js";
import { getLaunchParameters } from "../client-pc/src/ball/ballLauncher.js";
import { stepBallPhysics } from "../client-pc/src/ball/ballPhysics.js";
import { calculateOutgoingVelocity } from "../client-pc/src/ball/ballResponse.js";
import { sweepBallAgainstRacket } from "../client-pc/src/ball/racketCollider.js";
import { BallSnapshot } from "../client-pc/src/ball/ballTypes.js";
import { createProceduralTennisBallTexture, integrateBallRotation, resetTennisBallTextureCache } from "../client-pc/src/ball/ballVisuals.js";
import { EstimatedRacketContact } from "../client-pc/src/strokeDetection/strokeTypes.js";
import { BallController, shouldEnterContactZone } from "../client-pc/src/ball/BallController.js";
import { applyEasyTrajectoryAssist } from "../client-pc/src/ball/easyTrajectoryAssist.js";

function simulatedDelivery(preset: "easyForehand" | "easyBackhand", handedness: "right" | "left") {
  const launch = getLaunchParameters(preset, handedness, "normal");
  const value: BallSnapshot = {
    id: "delivery", state: "IN_FLIGHT_TO_PLAYER", position: launch.position.clone(),
    previousPosition: launch.position.clone(), velocity: launch.velocity.clone(), spinVector: new THREE.Vector3(),
    angularVelocity: new THREE.Vector3(), spinType: "flat", spinStrength: 0,
    magnusAcceleration: new THREE.Vector3(), physicsRadius: BALL_CONFIG.scale.physicalRadiusMeters,
    visualRadius: BALL_CONFIG.scale.physicalRadiusMeters * BALL_CONFIG.scale.visualScaleMultiplier,
    bounceCount: 0, hit: false, active: true, launchTimestamp: 0, launchPreset: preset,
    contactTarget: launch.contactTarget.clone(), bouncePoint: launch.bouncePoint.clone(),
    lockedContactTarget: launch.contactTarget.clone(), lockedContactQuaternion: launch.contactQuaternion.clone(),
    lockedStrokeType: launch.strokeType, expectedStrokeType: launch.strokeType,
    contactTimeAfterBounce: launch.contactTimeAfterBounce, contactDeadline: 0, secondBounceDeadline: 0
  };
  let bouncedAt = -1;
  for (let time = 0; time < 2.6; time += 0.005) {
    const bounced = stepBallPhysics(value, 0.005);
    if (bounced && bouncedAt < 0) {
      bouncedAt = time;
      value.velocity.copy(solveVelocity(value.position, value.contactTarget, value.contactTimeAfterBounce));
    }
    if (bouncedAt >= 0 && time - bouncedAt >= value.contactTimeAfterBounce) break;
  }
  return { value, launch };
}

function strokeContact(spinType: "topspin" | "slice"): EstimatedRacketContact {
  return {
    id: "contact", swingId: "swing", timestamp: 0, strokeType: "forehand", handedness: "right",
    backhandStyle: "one-handed", confidence: 1, estimatedSpeed: 16, forwardScore: 0.9,
    upwardScore: spinType === "topspin" ? 0.8 : -0.6, sidewaysScore: 0, racketFaceAngle: 0.5,
    racketQuaternion: new THREE.Quaternion(), racketPosition: new THREE.Vector3(),
    racketForwardVector: new THREE.Vector3(0, 1, 0), racketUpVector: new THREE.Vector3(0, 0, 1),
    racketSideVector: new THREE.Vector3(1, 0, 0), racketFaceNormal: new THREE.Vector3(0, 0, 1),
    peakAngularVelocity: 4, peakAcceleration: 9, peakJerk: 15, preparationDuration: 300,
    forwardSwingDuration: 100, lowToHighScore: spinType === "topspin" ? 0.8 : 0,
    highToLowScore: spinType === "slice" ? 0.8 : 0, topspinScore: spinType === "topspin" ? 0.8 : 0.1,
    sliceScore: spinType === "slice" ? 0.8 : 0.1, spinType
  };
}

test("physical radius remains a real tennis ball radius", () => {
  assert.ok(BALL_CONFIG.scale.physicalRadiusMeters >= 0.033 && BALL_CONFIG.scale.physicalRadiusMeters <= 0.034);
  assert.equal(BALL_CONFIG.scale.metersPerWorldUnit, 1);
});
test("visual and physical radii are distinct", () => {
  assert.ok(BALL_CONFIG.scale.visualScaleMultiplier >= 1.8);
  assert.ok(BALL_CONFIG.scale.visualScaleMultiplier <= BALL_CONFIG.scale.maximumVisualScaleMultiplier);
});
test("collision acceptance uses physical radius regardless of visual radius", () => {
  const x = BALL_CONFIG.collision.halfWidthLocal + 0.05;
  const matrix = new THREE.Matrix4();
  const physical = sweepBallAgainstRacket(new THREE.Vector3(x, 0, -1), new THREE.Vector3(x, 0, 1), BALL_CONFIG.scale.physicalRadiusMeters, matrix, "off");
  const visuallyEnlarged = sweepBallAgainstRacket(new THREE.Vector3(x, 0, -1), new THREE.Vector3(x, 0, 1), BALL_CONFIG.scale.physicalRadiusMeters * BALL_CONFIG.scale.visualScaleMultiplier, matrix, "off");
  assert.equal(physical.candidate, false);
  assert.equal(visuallyEnlarged.candidate, true);
});
test("right-handed Easy targets use the separately recorded swing sides", () => {
  assert.ok(getBallDeliveryTarget({ preset: "easyForehand", handedness: "right", backhandStyle: "one-handed" }).x < 0);
  assert.ok(getBallDeliveryTarget({ preset: "easyBackhand", handedness: "right", backhandStyle: "one-handed" }).x < 0);
});
test("left-handed forehand and backhand targets mirror", () => {
  const fore = getBallDeliveryTarget({ preset: "easyForehand", handedness: "left", backhandStyle: "one-handed" });
  const back = getBallDeliveryTarget({ preset: "easyBackhand", handedness: "left", backhandStyle: "one-handed" });
  assert.ok(fore.x > 0 && back.x > 0);
});
test("forehand and backhand preserve their independently measured X positions", () => {
  const forehand = getBallDeliveryTarget({ preset: "easyForehand", handedness: "right", backhandStyle: "one-handed" });
  const backhand = getBallDeliveryTarget({ preset: "easyBackhand", handedness: "right", backhandStyle: "one-handed" });
  assert.notEqual(forehand.x, backhand.x);
});
test("both Easy targets lie inside their recorded swept reach envelopes", () => {
  for (const preset of ["easyForehand", "easyBackhand"] as const) {
    const strokeType = preset === "easyForehand" ? "forehand" : "backhand";
    const target = getBallDeliveryTarget({ preset, handedness: "right", backhandStyle: "one-handed" });
    const envelope = getRecordedReachEnvelope(strokeType, "right");
    assert.ok(target.x >= envelope.min.x && target.x <= envelope.max.x);
    assert.ok(target.y >= envelope.min.y && target.y <= envelope.max.y);
    assert.ok(target.z >= envelope.min.z && target.z <= envelope.max.z);
  }
});
test("both Easy targets equal their recorded comfortable centers", () => {
  for (const preset of ["easyForehand", "easyBackhand"] as const) {
    const strokeType = preset === "easyForehand" ? "forehand" : "backhand";
    const target = getBallDeliveryTarget({ preset, handedness: "right", backhandStyle: "one-handed" });
    assert.ok(target.distanceTo(getRecordedReachEnvelope(strokeType, "right").comfortableCenter) < 1e-8);
  }
});
test("Easy target derives directly from the measured forehand envelope", () => {
  const target = getBallDeliveryTarget({ preset: "easyForehand", handedness: "right", backhandStyle: "one-handed" });
  assert.ok(target.distanceTo(getRecordedReachEnvelope("forehand", "right").comfortableCenter) < 1e-8);
});
test("launch locks target, quaternion, and stroke type per ball", () => {
  const launch = getLaunchParameters("easyBackhand", "right", "normal");
  const controller = new BallController();
  controller.launch("easyBackhand", "right", "normal", 1000);
  const locked = controller.ball.lockedContactTarget.clone();
  controller.ball.contactTarget.addScalar(1);
  assert.ok(controller.ball.lockedContactTarget.equals(locked));
  assert.ok(controller.ball.lockedContactQuaternion.angleTo(launch.contactQuaternion) < 1e-8);
  assert.equal(controller.ball.lockedStrokeType, "backhand");
});
test("Easy contact target uses measured natural swing depth", () => {
  const target = getBallDeliveryTarget({ preset: "easyForehand", handedness: "right", backhandStyle: "one-handed" });
  const envelope = getRecordedReachEnvelope("forehand", "right");
  assert.equal(target.z, envelope.comfortableCenter.z);
});
test("deterministic Easy delivery does not apply redundant trajectory steering", () => {
  const value = simulatedDelivery("easyForehand", "right").value;
  value.bounceCount = 0;
  value.position.add(new THREE.Vector3(0.3, 0, 0));
  value.contactDeadline = 2000;
  assert.equal(applyEasyTrajectoryAssist(value, 0.016, 1000).applied, false);
  value.bounceCount = 1;
  const result = applyEasyTrajectoryAssist(value, 0.016, 1000);
  assert.equal(result.applied, false);
  assert.equal(result.reason, "disabled");
});
test("trajectory assist never teleports and clamps acceleration", () => {
  const value = simulatedDelivery("easyForehand", "right").value;
  value.bounceCount = 1;
  value.position.add(new THREE.Vector3(0.4, 0.2, -0.3));
  value.contactDeadline = 2000;
  const before = value.position.clone();
  const result = applyEasyTrajectoryAssist(value, 0.016, 1000);
  assert.ok(value.position.equals(before));
  assert.ok(result.acceleration.length() <= BALL_CONFIG.easyTrajectoryAssist.maxAcceleration + 1e-8);
});
test("trajectory assist stops before final contact", () => {
  const value = simulatedDelivery("easyForehand", "right").value;
  value.bounceCount = 1;
  value.position.add(new THREE.Vector3(0.3, 0, 0));
  value.contactDeadline = 1100;
  const before = value.velocity.clone();
  const result = applyEasyTrajectoryAssist(value, 0.016, 1000);
  assert.equal(result.applied, false);
  assert.ok(value.velocity.equals(before));
});
test("Easy delivery reaches the center of each recorded swept envelope", () => {
  for (const preset of ["easyForehand", "easyBackhand"] as const) {
    const result = simulatedDelivery(preset, "right");
    const stroke = preset === "easyForehand" ? "forehand" : "backhand";
    assert.ok(result.value.position.distanceTo(getRecordedReachEnvelope(stroke, "right").comfortableCenter) < 0.1);
  }
});
test("target height follows the recorded comfortable center", () => {
  const target = getBallDeliveryTarget({ preset: "easyForehand", handedness: "right", backhandStyle: "one-handed" });
  assert.ok(target.y >= BALL_CONFIG.easyAssist.minimumTargetHeight && target.y <= BALL_CONFIG.easyAssist.maximumTargetHeight);
  assert.equal(target.y, getRecordedReachEnvelope("forehand", "right").comfortableCenter.y);
});
test("Easy target is centered in the recorded forehand envelope", () => {
  const target = getBallDeliveryTarget({ preset: "easyForehand", handedness: "right", backhandStyle: "one-handed" });
  assert.ok(target.distanceTo(getRecordedReachEnvelope("forehand", "right").comfortableCenter) < 1e-8);
});
test("easy forehand delivery reaches target center region", () => assert.ok(simulatedDelivery("easyForehand", "right").value.position.distanceTo(simulatedDelivery("easyForehand", "right").launch.contactTarget) < 0.1));
test("easy backhand delivery reaches target center region", () => assert.ok(simulatedDelivery("easyBackhand", "right").value.position.distanceTo(simulatedDelivery("easyBackhand", "right").launch.contactTarget) < 0.1));
test("incoming flight clears configured net height", () => {
  const launch = getLaunchParameters("easyForehand", "right", "normal");
  const time = (BALL_CONFIG.launch.netDepth - launch.position.z) / launch.velocity.z;
  const height = launch.position.y + launch.velocity.y * time + 0.5 * BALL_CONFIG.gravity * time * time;
  assert.ok(height >= BALL_CONFIG.launch.netHeight + BALL_CONFIG.launch.netClearance);
});
test("delivery bounces exactly once before target", () => assert.equal(simulatedDelivery("easyForehand", "right").value.bounceCount, 1));
test("predicted second bounce leaves the configured safety margin", () => {
  for (const preset of ["easyForehand", "easyBackhand"] as const) {
    const launch = getLaunchParameters(preset, "right", "normal");
    assert.ok(launch.predictedSecondBounceTimeAfterBounce - launch.contactTimeAfterBounce >= BALL_CONFIG.easyAssist.secondBounceSafetyMarginMs / 1000);
  }
});
test("Easy Normal contact time overlaps both recorded peak swing windows", () => {
  const launch = getLaunchParameters("easyForehand", "right", "normal");
  const contactMs = (BALL_CONFIG.launch.easyForehand.bounceTime + launch.contactTimeAfterBounce) * 1000;
  for (const stroke of ["forehand", "backhand"] as const) {
    const range = getRecordedReachEnvelope(stroke, "right").timeRangeAfterLaunchMs;
    assert.ok(contactMs >= range.minimum - 1e-6 && contactMs <= range.maximum + 1e-6);
  }
});
test("delivery reaches configured contact height", () => {
  const result = simulatedDelivery("easyForehand", "right");
  assert.ok(Math.abs(result.value.position.y - result.launch.contactTarget.y) < 0.08);
});
test("projected contact diameter meets readability threshold", () => {
  const target = getBallDeliveryTarget({ preset: "easyForehand", handedness: "right", backhandStyle: "one-handed" });
  const pixels = projectPixelDiameter(
    BALL_CONFIG.scale.physicalRadiusMeters * BALL_CONFIG.scale.visualScaleMultiplier,
    target, new THREE.Vector3(...BALL_CONFIG.camera.position), THREE.MathUtils.degToRad(BALL_CONFIG.camera.fovDegrees), 1024
  );
  assert.ok(pixels >= BALL_CONFIG.scale.minimumReadablePixelDiameter);
});
test("visual ball remains smaller than the measured racket head", () => {
  const visualDiameter = BALL_CONFIG.scale.physicalRadiusMeters * BALL_CONFIG.scale.visualScaleMultiplier * 2;
  assert.ok(visualDiameter < BALL_CONFIG.scale.measuredRacketHeadWorldWidth);
  assert.ok(BALL_CONFIG.scale.measuredRacketHeadWorldWidth / visualDiameter > 3.5);
});
test("CONTACT_ZONE requires a close post-bounce ball near its deadline", () => {
  const result = simulatedDelivery("easyForehand", "right");
  const value = result.value;
  value.bounceCount = 1;
  value.velocity.set(0, 1, 3);
  value.contactDeadline = 1200;
  value.position.copy(value.contactTarget).add(new THREE.Vector3(0, 0, -1.2));
  assert.equal(shouldEnterContactZone(value, 1100), false);
  value.position.copy(value.contactTarget).add(new THREE.Vector3(0, 0, -0.15));
  value.position.y = value.contactTarget.y;
  assert.equal(shouldEnterContactZone(value, 1100, "easy"), true);
  value.bounceCount = 2;
  assert.equal(shouldEnterContactZone(value, 1100, "easy"), false);
});
test("both easy trajectories pass through their recorded swept envelope centers", () => {
  for (const preset of ["easyForehand", "easyBackhand"] as const) {
    const result = simulatedDelivery(preset, "right");
    const stroke = preset === "easyForehand" ? "forehand" : "backhand";
    assert.ok(result.value.position.distanceTo(getRecordedReachEnvelope(stroke, "right").comfortableCenter) < 0.1);
    assert.equal(result.value.bounceCount, 1);
  }
});
test("post-bounce trajectory approaches the recorded forehand swing plane", () => {
  const launch = getLaunchParameters("easyForehand", "right", "normal");
  const expected = getRecordedReachEnvelope("forehand", "right");
  const targetPlaneDistance = launch.contactTarget.clone().sub(expected.comfortableCenter).dot(expected.dominantContactPlane);
  const postBounceVelocity = solveVelocity(launch.bouncePoint, launch.contactTarget, launch.contactTimeAfterBounce);
  assert.ok(Math.abs(targetPlaneDistance) < 1e-8);
  assert.ok(Math.abs(postBounceVelocity.dot(expected.dominantContactPlane)) > 0.1);
});

test("procedural tennis texture is cached and reused", () => {
  resetTennisBallTextureCache();
  const context = new Proxy({}, { get: (_target, property) => property === "getImageData"
    ? () => ({ data: new Uint8ClampedArray(512 * 256 * 4) })
    : () => undefined });
  const canvas = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
  const first = createProceduralTennisBallTexture(undefined, () => canvas);
  const second = createProceduralTennisBallTexture(undefined, () => canvas);
  assert.equal(first, second);
  resetTennisBallTextureCache();
});
test("ball rotation integration is delta-time independent", () => {
  const angular = new THREE.Vector3(10, 0, 0);
  const once = integrateBallRotation(new THREE.Quaternion(), angular, 0.1);
  const twice = new THREE.Quaternion();
  integrateBallRotation(twice, angular, 0.05); integrateBallRotation(twice, angular, 0.05);
  assert.ok(once.angleTo(twice) < 1e-8);
});
test("topspin and slice produce opposite angular axes", () => {
  const top = calculateOutgoingVelocity(strokeContact("topspin"), new THREE.Vector3()).spinVector;
  const slice = calculateOutgoingVelocity(strokeContact("slice"), new THREE.Vector3()).spinVector;
  assert.ok(top.dot(slice) < 0);
});
test("contact helper exists at actual target height", () => {
  const target = getBallDeliveryTarget({ preset: "easyForehand", handedness: "right", backhandStyle: "one-handed" });
  assert.ok(target.y >= BALL_CONFIG.easyAssist.minimumTargetHeight);
  assert.notEqual(target.y, BALL_CONFIG.courtHeight);
});
