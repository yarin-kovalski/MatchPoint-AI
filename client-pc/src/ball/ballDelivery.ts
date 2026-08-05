import * as THREE from "three";
import { Handedness, BackhandStyle } from "../strokeDetection/strokeTypes.js";
import { STROKE_CONFIG } from "../strokeDetection/strokeConfig.js";
import { BALL_CONFIG } from "./ballConfig.js";
import { LaunchPreset } from "./ballTypes.js";

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

export function getExpectedRacketContactTransform(options: {
  strokeType: "forehand" | "backhand";
  handedness: Handedness;
  backhandStyle: BackhandStyle;
}): ExpectedContactTransform {
  const forwardPath = STROKE_CONFIG.proceduralPath.forwardSwing;
  const contactPath = STROKE_CONFIG.proceduralPath.contactWindow;
  const handSign = options.handedness === "right" ? 1 : -1;
  const strokeSign = options.strokeType === "forehand" ? handSign : -handSign;
  const sampleFrames = STROKE_CONFIG.timing.contactWindowMs *
    BALL_CONFIG.launch.expectedContactSampleFraction / 1000 *
    BALL_CONFIG.launch.referenceFramesPerSecond;
  const smoothingProgress = 1 - Math.pow(
    1 - STROKE_CONFIG.proceduralPath.smoothing,
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

export function getBallDeliveryTarget(options: {
  preset: LaunchPreset;
  handedness: Handedness;
  backhandStyle: BackhandStyle;
  heightOffset?: number;
  sideOffset?: number;
  depthOffset?: number;
}): THREE.Vector3 {
  const type = options.preset === "easyBackhand" ? "backhand" : "forehand";
  const expected = getExpectedRacketContactTransform({ strokeType: type, handedness: options.handedness, backhandStyle: options.backhandStyle });
  const preset = BALL_CONFIG.launch[options.preset];
  const handMirror = options.handedness === "right" ? 1 : -1;
  const side = options.sideOffset ?? preset.sideOffset;
  const localComfortOffset = new THREE.Vector3(
    side * handMirror,
    options.heightOffset ?? preset.heightOffset,
    options.depthOffset ?? preset.depthOffset
  ).applyQuaternion(expected.quaternion);
  return expected.stringBedCenter.add(localComfortOffset);
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
