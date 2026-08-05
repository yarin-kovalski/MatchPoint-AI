import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BALL_CONFIG } from "../client-pc/src/ball/ballConfig.js";
import { getBallDeliveryTarget, getExpectedRacketContactTransform, projectPixelDiameter, solveVelocity } from "../client-pc/src/ball/ballDelivery.js";
import { getLaunchParameters } from "../client-pc/src/ball/ballLauncher.js";
import { stepBallPhysics } from "../client-pc/src/ball/ballPhysics.js";
import { calculateOutgoingVelocity } from "../client-pc/src/ball/ballResponse.js";
import { sweepBallAgainstRacket } from "../client-pc/src/ball/racketCollider.js";
import { BallSnapshot } from "../client-pc/src/ball/ballTypes.js";
import { createProceduralTennisBallTexture, integrateBallRotation, resetTennisBallTextureCache } from "../client-pc/src/ball/ballVisuals.js";
import { EstimatedRacketContact } from "../client-pc/src/strokeDetection/strokeTypes.js";
import { shouldEnterContactZone } from "../client-pc/src/ball/BallController.js";

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
    contactTimeAfterBounce: launch.contactTimeAfterBounce, contactDeadline: 0
  };
  let bouncedAt = -1;
  for (let time = 0; time < 2; time += 0.005) {
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
test("right-handed forehand target is on player right", () => assert.ok(getBallDeliveryTarget({ preset: "easyForehand", handedness: "right", backhandStyle: "one-handed" }).x > 0));
test("right-handed backhand target mirrors to player left", () => assert.ok(getBallDeliveryTarget({ preset: "easyBackhand", handedness: "right", backhandStyle: "one-handed" }).x < 0));
test("left-handed forehand and backhand targets mirror", () => {
  const fore = getBallDeliveryTarget({ preset: "easyForehand", handedness: "left", backhandStyle: "one-handed" });
  const back = getBallDeliveryTarget({ preset: "easyBackhand", handedness: "left", backhandStyle: "one-handed" });
  assert.ok(fore.x < 0 && back.x > 0);
});
test("forehand target remains near expected string center", () => {
  const target = getBallDeliveryTarget({ preset: "easyForehand", handedness: "right", backhandStyle: "one-handed" });
  const expected = getExpectedRacketContactTransform({ strokeType: "forehand", handedness: "right", backhandStyle: "one-handed" });
  assert.ok(target.distanceTo(expected.stringBedCenter) < 0.26);
});
test("backhand target remains near expected string center", () => {
  const target = getBallDeliveryTarget({ preset: "easyBackhand", handedness: "right", backhandStyle: "one-handed" });
  const expected = getExpectedRacketContactTransform({ strokeType: "backhand", handedness: "right", backhandStyle: "one-handed" });
  assert.ok(target.distanceTo(expected.stringBedCenter) < 0.1);
});
test("default delivery target lies on the expected string plane", () => {
  const target = getBallDeliveryTarget({ preset: "easyForehand", handedness: "right", backhandStyle: "one-handed" });
  const expected = getExpectedRacketContactTransform({ strokeType: "forehand", handedness: "right", backhandStyle: "one-handed" });
  const local = target.clone().sub(expected.stringBedCenter).applyQuaternion(expected.quaternion.clone().invert());
  assert.ok(Math.abs(local.z) < 1e-8);
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
  assert.ok(BALL_CONFIG.scale.measuredRacketHeadWorldWidth / visualDiameter > 4);
});
test("CONTACT_ZONE requires a close post-bounce ball near its deadline", () => {
  const result = simulatedDelivery("easyForehand", "right");
  const value = result.value;
  value.bounceCount = 1;
  value.velocity.set(0, 1, 3);
  value.contactDeadline = 1200;
  value.position.copy(value.contactTarget).add(new THREE.Vector3(0, 0, -1.2));
  assert.equal(shouldEnterContactZone(value, 1100), false);
  value.position.copy(value.contactTarget).add(new THREE.Vector3(0, 0, -0.25));
  assert.equal(shouldEnterContactZone(value, 1100), true);
});
test("both easy trajectories pass near the expected string-bed center", () => {
  for (const preset of ["easyForehand", "easyBackhand"] as const) {
    const result = simulatedDelivery(preset, "right");
    const expected = getExpectedRacketContactTransform({ strokeType: preset === "easyForehand" ? "forehand" : "backhand", handedness: "right", backhandStyle: "one-handed" });
    assert.ok(result.value.position.distanceTo(expected.stringBedCenter) < 0.12);
    assert.equal(result.value.bounceCount, 1);
  }
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
  assert.ok(target.y > 1.5);
  assert.notEqual(target.y, BALL_CONFIG.courtHeight);
});
