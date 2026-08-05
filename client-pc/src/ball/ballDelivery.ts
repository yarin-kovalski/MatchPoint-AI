import * as THREE from "three";
import { Handedness, BackhandStyle } from "../strokeDetection/strokeTypes.js";
import { STROKE_CONFIG } from "../strokeDetection/strokeConfig.js";
import { BALL_CONFIG } from "./ballConfig.js";
import { AssistMode, LaunchPreset } from "./ballTypes.js";

const ROOT_POSITION = new THREE.Vector3(0, 1.45, 0);
const ROOT_SCALE = 0.01;
const HEAD_CENTER_LOCAL = new THREE.Vector3(...BALL_CONFIG.collision.headCenterLocal);
const BASE_READY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(12));
const MODEL_CORRECTION = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

export type ExpectedContactTransform = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  faceNormal: THREE.Vector3;
  stringBedCenter: THREE.Vector3;
  recommendedBallDirection: THREE.Vector3;
};

export type StationaryReachVolume = {
  center: THREE.Vector3;
  depthTolerance: number;
  lateralTolerance: number;
  verticalTolerance: number;
};

export function getExpectedRacketContactTransform(options: {
  strokeType: "forehand" | "backhand";
  handedness: Handedness;
  backhandStyle: BackhandStyle;
}): ExpectedContactTransform {
  const forwardPath = STROKE_CONFIG.proceduralPath.forwardSwing;
  const configuredContactReach = Math.abs(BALL_CONFIG.launch.easyForehand.contactSideOffset);
  const contactPath = [
    configuredContactReach,
    STROKE_CONFIG.proceduralPath.contactWindow[1] + BALL_CONFIG.launch.easyContactPoseLift,
    STROKE_CONFIG.proceduralPath.contactWindow[2] + BALL_CONFIG.easyAssist.naturalReachDepthOffset
  ] as const;
  const handSign = options.handedness === "right" ? 1 : -1;
  const strokeSign = options.strokeType === "forehand" ? handSign : -handSign;
  const sampleFrames = STROKE_CONFIG.timing.contactWindowMs *
    BALL_CONFIG.launch.expectedContactSampleFraction / 1000 *
    BALL_CONFIG.launch.referenceFramesPerSecond;
  const smoothingProgress = 1 - Math.pow(
    1 - BALL_CONFIG.launch.expectedContactPositionSmoothing,
    sampleFrames
  );
  const procedural = new THREE.Vector3(
    forwardPath[0] * strokeSign,
    forwardPath[1],
    forwardPath[2]
  ).lerp(new THREE.Vector3(
    contactPath[0] * strokeSign,
    contactPath[1],
    contactPath[2]
  ), smoothingProgress);
  const correctedHead = HEAD_CENTER_LOCAL.clone().applyQuaternion(MODEL_CORRECTION).multiplyScalar(ROOT_SCALE);
  const position = procedural.add(correctedHead).applyQuaternion(BASE_READY).add(ROOT_POSITION);
  const quaternion = BASE_READY.clone().multiply(MODEL_CORRECTION);
  return {
    position: position.clone(),
    quaternion,
    faceNormal: new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize(),
    stringBedCenter: position.clone(),
    recommendedBallDirection: new THREE.Vector3(0, 0, 1)
  };
}

export function getStationaryReachVolume(options: {
  strokeType: "forehand" | "backhand";
  handedness: Handedness;
  backhandStyle: BackhandStyle;
}): StationaryReachVolume {
  const expected = getExpectedRacketContactTransform(options);
  return { center: expected.stringBedCenter.clone(), ...BALL_CONFIG.easyAssist.stationaryReach };
}

export function isInsideStationaryReachVolume(point: THREE.Vector3, volume: StationaryReachVolume): boolean {
  return Math.abs(point.x - volume.center.x) <= volume.lateralTolerance &&
    Math.abs(point.y - volume.center.y) <= volume.verticalTolerance &&
    Math.abs(point.z - volume.center.z) <= volume.depthTolerance;
}

export function getBallDeliveryTarget(options: {
  preset: LaunchPreset;
  handedness: Handedness;
  backhandStyle: BackhandStyle;
  heightOffset?: number;
  sideOffset?: number;
  depthOffset?: number;
  assistMode?: AssistMode;
}): THREE.Vector3 {
  const type = options.preset === "easyBackhand" ? "backhand" : "forehand";
  const expected = getExpectedRacketContactTransform({ strokeType: type, handedness: options.handedness, backhandStyle: options.backhandStyle });
  const preset = BALL_CONFIG.launch[options.preset];
  const handMirror = options.handedness === "right" ? 1 : -1;
  const target = expected.stringBedCenter.clone();
  target.x = (options.sideOffset ?? preset.contactSideOffset) * handMirror;
  target.y += options.heightOffset ?? preset.contactHeight;
  if ((options.assistMode ?? "easy") === "easy") {
    target.y = THREE.MathUtils.clamp(target.y, BALL_CONFIG.easyAssist.minimumTargetHeight, BALL_CONFIG.easyAssist.maximumTargetHeight);
  }
  const heightDelta = target.y - expected.stringBedCenter.y;
  const depthOffset = options.depthOffset ?? preset.depthOffset;
  target.z += Math.abs(expected.faceNormal.z) > 1e-6
    ? depthOffset - heightDelta * expected.faceNormal.y / expected.faceNormal.z
    : depthOffset;
  return target;
}

export function estimateSecondBounceDelay(verticalVelocityAfterBounce: number): number {
  return Math.max(0, 2 * Math.max(0, verticalVelocityAfterBounce) / Math.abs(BALL_CONFIG.gravity));
}

export function solveVelocity(start: THREE.Vector3, target: THREE.Vector3, seconds: number): THREE.Vector3 {
  return new THREE.Vector3(
    (target.x - start.x) / seconds,
    (target.y - start.y - 0.5 * BALL_CONFIG.gravity * seconds * seconds) / seconds,
    (target.z - start.z) / seconds
  );
}

export function projectPixelDiameter(radius: number, point: THREE.Vector3, cameraPosition: THREE.Vector3, verticalFovRadians: number, viewportHeight: number): number {
  const distance = Math.max(radius, point.distanceTo(cameraPosition));
  return radius * viewportHeight / (distance * Math.tan(verticalFovRadians / 2));
}
