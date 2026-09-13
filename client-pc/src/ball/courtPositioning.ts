import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import {
  synchronizeProfileApexFromTiming, TrajectoryCalibrationProfile, worldToPlayerLocal
} from "./trajectoryCalibration.js";

export const PLAYER_BASELINE_OFFSET_Z = 5.75;
export const CONTACT_EASE_DEPTH_Z = 0.10;
const TRAINING_CONTACT_Z = 4.65;
const TRAINING_CONTACT_SIDE = 1.5;
const TRAINING_BOUNCE_Z = 0.25;

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
  const side = profile.strokeType === "forehand" ? 1 : -1;
  profile.launchPointWorld = [0, 2.2, -8.5];
  profile.contactPointWorld = [side * TRAINING_CONTACT_SIDE, 1.05, TRAINING_CONTACT_Z];
  profile.bouncePointWorld = [side * 0.75, BALL_CONFIG.courtHeight + BALL_CONFIG.scale.physicalRadiusMeters, TRAINING_BOUNCE_Z];
  profile.bounceToContactMs = 820;
  profile.overallSpeed = 7;
  profile.contactPointPlayerLocal = worldToPlayerLocal(
    new THREE.Vector3().fromArray(profile.contactPointWorld), profile.playerBasisAtCalibration
  ).toArray();
  synchronizeProfileApexFromTiming(profile);
  return profile;
}
