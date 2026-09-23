import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import {
  synchronizeProfileApexFromTiming, TrajectoryCalibrationProfile, worldToPlayerLocal
} from "./trajectoryCalibration.js";

export const PLAYER_BASELINE_OFFSET_Z = 5.75;
export const CONTACT_EASE_DEPTH_Z = 0.10;
const RACKET_MODEL_SCALE = 0.01;
const TRAINING_GRIP_HEIGHT = 1.45;
const TRAINING_BOUNCE_Z = 0.25;
export const TRAINING_STRIKE_ZONE_RADII = { lateral: 0.42, vertical: 0.32, depth: 0.42 } as const;
export const TRAINING_BACKHAND_STRIKE_ZONE_RADII = { lateral: 0.50, vertical: 0.38, depth: 0.50 } as const;

export type TrainingStrikeZoneGeometry = {
  gripPoint: THREE.Vector3;
  racketHeadCenter: THREE.Vector3;
  stringBedCenter: THREE.Vector3;
  playerForward: THREE.Vector3;
  playerRight: THREE.Vector3;
  playerUp: THREE.Vector3;
};

export function getTrainingStrikeZoneGeometry(source: TrajectoryCalibrationProfile): TrainingStrikeZoneGeometry {
  const basis = source.playerBasisAtCalibration;
  const playerForward = new THREE.Vector3().fromArray(basis.forward).normalize();
  const playerRight = new THREE.Vector3().fromArray(basis.right).normalize();
  const playerUp = new THREE.Vector3().fromArray(basis.up).normalize();
  const baselineOrigin = new THREE.Vector3().fromArray(basis.origin)
    .addScaledVector(playerForward, -PLAYER_BASELINE_OFFSET_Z);
  const gripPoint = baselineOrigin.clone().addScaledVector(playerUp, TRAINING_GRIP_HEIGHT);
  const headReach = BALL_CONFIG.collision.headCenterLocal[1] * RACKET_MODEL_SCALE;
  const contactHeight = TRAINING_GRIP_HEIGHT - BALL_CONFIG.collision.halfHeightLocal * RACKET_MODEL_SCALE * 0.5;
  const contactDepth = BALL_CONFIG.scale.measuredRacketHeadWorldHeight * 2 / 3;
  const handSign = source.handedness === "right" ? 1 : -1;
  const strokeSign = (source.strokeType === "forehand" ? 1 : -1) * handSign;
  const stringBedCenter = baselineOrigin.clone()
    .addScaledVector(playerRight, strokeSign * headReach)
    .addScaledVector(playerUp, contactHeight)
    .addScaledVector(playerForward, contactDepth);
  return {
    gripPoint,
    racketHeadCenter: stringBedCenter.clone(),
    stringBedCenter,
    playerForward,
    playerRight,
    playerUp
  };
}

export function isInsideTrainingStrikeZone(
  point: THREE.Vector3,
  center: THREE.Vector3,
  strokeType: "forehand" | "backhand" = "forehand"
): boolean {
  const radii = strokeType === "backhand" ? TRAINING_BACKHAND_STRIKE_ZONE_RADII : TRAINING_STRIKE_ZONE_RADII;
  const x = point.x - center.x;
  const y = point.y - center.y;
  const z = point.z - center.z;
  return x ** 2 / radii.lateral ** 2 +
    y ** 2 / radii.vertical ** 2 +
    z ** 2 / radii.depth ** 2 <= 1;
}

export function positionValidatedProfileAtBaseline(
  source: TrajectoryCalibrationProfile,
  baselineOffsetZ = PLAYER_BASELINE_OFFSET_Z,
  contactEaseDepthZ = CONTACT_EASE_DEPTH_Z
): TrajectoryCalibrationProfile {
  const profile = structuredClone(source);
  profile.contactPointWorld[2] += baselineOffsetZ + contactEaseDepthZ;
  profile.contactPointPlayerLocal = worldToPlayerLocal(
    new THREE.Vector3().fromArray(profile.contactPointWorld),
    profile.playerBasisAtCalibration
  ).toArray();
  synchronizeProfileApexFromTiming(profile);
  return profile;
}

export function createTrainingComfortProfile(source: TrajectoryCalibrationProfile): TrajectoryCalibrationProfile {
  const profile = structuredClone(source);
  const geometry = getTrainingStrikeZoneGeometry(profile);
  profile.launchPointWorld = [0, 2.2, -8.5];
  profile.contactPointWorld = geometry.stringBedCenter.toArray();
  const horizontalBounceProgress = (TRAINING_BOUNCE_Z - profile.launchPointWorld[2]) /
    (profile.contactPointWorld[2] - profile.launchPointWorld[2]);
  profile.bouncePointWorld = [
    THREE.MathUtils.lerp(profile.launchPointWorld[0], profile.contactPointWorld[0], horizontalBounceProgress),
    BALL_CONFIG.courtHeight + BALL_CONFIG.scale.physicalRadiusMeters,
    TRAINING_BOUNCE_Z
  ];
  profile.bounceToContactMs = 820;
  profile.overallSpeed = 7;
  profile.contactPointPlayerLocal = worldToPlayerLocal(
    new THREE.Vector3().fromArray(profile.contactPointWorld), profile.playerBasisAtCalibration
  ).toArray();
  synchronizeProfileApexFromTiming(profile);
  return profile;
}
