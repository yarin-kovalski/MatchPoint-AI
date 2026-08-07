import * as THREE from "three";
import {
  synchronizeProfileApexFromTiming, TrajectoryCalibrationProfile, worldToPlayerLocal
} from "./trajectoryCalibration.js";

export const PLAYER_BASELINE_OFFSET_Z = 5.75;
export const CONTACT_EASE_DEPTH_Z = 0.10;

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
