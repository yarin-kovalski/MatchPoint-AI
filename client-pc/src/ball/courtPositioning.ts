import * as THREE from "three";
import {
  synchronizeProfileApexFromTiming, TrajectoryCalibrationProfile, worldToPlayerLocal
} from "./trajectoryCalibration.js";

export const PLAYER_BASELINE_OFFSET_Z = 5.75;
export const CONTACT_EASE_DEPTH_Z = 0.10;
const TRAINING_CONTACT_Z = 4.75;
const TRAINING_CONTACT_SIDE = 1.5;
const TRAINING_BOUNCE_Z = 0.35;
const VALIDATED_POSITIONED = {
  forehand: { contactX: 2.407425854377178, contactZ: 4.907722057403215, bounceX: 2.5601662395473346, bounceZ: -4.729598044736115 },
  backhand: { contactX: -2.452252117665146, contactZ: 4.214942086046678, bounceX: -2.6326243680087384, bounceZ: -5.018435635134617 }
} as const;

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
  const base = VALIDATED_POSITIONED[profile.strokeType];
  const side = profile.strokeType === "forehand" ? 1 : -1;
  const contactLateralVariation = profile.contactPointWorld[0] - base.contactX;
  const contactDepthVariation = profile.contactPointWorld[2] - base.contactZ;
  const bounceLateralVariation = profile.bouncePointWorld[0] - base.bounceX;
  const bounceDepthVariation = profile.bouncePointWorld[2] - base.bounceZ;
  profile.contactPointWorld[0] = side * TRAINING_CONTACT_SIDE + contactLateralVariation;
  profile.contactPointWorld[2] = TRAINING_CONTACT_Z + contactDepthVariation;
  profile.contactPointWorld[1] = Math.max(1.15, profile.contactPointWorld[1]);
  profile.bouncePointWorld[0] = profile.contactPointWorld[0] * 0.7 + bounceLateralVariation;
  profile.bouncePointWorld[2] = TRAINING_BOUNCE_Z + bounceDepthVariation;
  profile.bounceToContactMs = THREE.MathUtils.clamp(profile.bounceToContactMs, 760, 900);
  profile.contactPointPlayerLocal = worldToPlayerLocal(
    new THREE.Vector3().fromArray(profile.contactPointWorld), profile.playerBasisAtCalibration
  ).toArray();
  synchronizeProfileApexFromTiming(profile);
  return profile;
}
