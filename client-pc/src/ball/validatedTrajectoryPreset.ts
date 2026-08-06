import {
  CalibrationStorage, CalibrationStrokeType, createDefaultTrajectoryProfile,
  loadTrajectoryProfile, saveTrajectoryProfile, solveTrajectoryProfile, TrajectoryCalibrationProfile
} from "./trajectoryCalibration.js";

export type TrajectoryProfileSource = "User calibration" | "Validated project preset" | "Default fallback";
export type ValidatedTrajectoryPreset = Record<CalibrationStrokeType, TrajectoryCalibrationProfile>;
const PRESET_SOURCE_PREFIX = "matchpoint.trajectory.source.v1";

// Exact values exported from the validated localhost browser profiles.
export const VALIDATED_TRAJECTORY_PRESET: ValidatedTrajectoryPreset = {
  forehand: {
    strokeType: "forehand", handedness: "right",
    playerBasisAtCalibration: { forward: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0], origin: [0, 0, 0] },
    launchPointWorld: [2.2593113238568265, 1.85, -6.088704851563163],
    bouncePointWorld: [2.5601662395473346, 0.10350000000000001, -4.729598044736115],
    apexPointWorld: [2.467806435303367, 1.8437895698833398, -2.4394627746623305],
    contactPointWorld: [2.407425854377178, 1.1, -0.9422779425967853],
    contactPointPlayerLocal: [2.407425854377178, 1.0999999999999996, 0.9422779425967853],
    contactRacketQuaternion: [0, 0, 0, 1], contactFaceNormal: [0, 0, -1],
    bounceToApexMs: 595.6501463243128, bounceToContactMs: 985.05874412546,
    overallSpeed: 4.2, createdAt: 1786038163647, version: 1
  },
  backhand: {
    strokeType: "backhand", handedness: "right",
    playerBasisAtCalibration: { forward: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0], origin: [0, 0, 0] },
    launchPointWorld: [-1.7856064605204014, 1.85, -2.8951458860209627],
    bouncePointWorld: [-2.6326243680087384, 0.10350000000000001, -5.018435635134617],
    apexPointWorld: [-2.5246476891144205, 1.9137895698833398, -2.993036001420065],
    contactPointWorld: [-2.452252117665146, 1.1, -1.6350579139533217],
    contactPointPlayerLocal: [-2.452252117665146, 1.1, 1.6350579139533217],
    contactRacketQuaternion: [0, 0, 0, 1], contactFaceNormal: [0, 0, -1],
    bounceToApexMs: 607.5115214561828, bounceToContactMs: 1014.8322893127781,
    overallSpeed: 4.2, createdAt: 1786036108035, version: 1
  }
};

export function loadTrajectoryProfileWithPriority(
  storage: CalibrationStorage,
  strokeType: CalibrationStrokeType,
  handedness: "right" | "left" = "right",
  preset: ValidatedTrajectoryPreset = VALIDATED_TRAJECTORY_PRESET
): { profile: TrajectoryCalibrationProfile; source: TrajectoryProfileSource } {
  const user = loadTrajectoryProfile(storage, strokeType);
  const validated = preset[strokeType];
  if (user) {
    const restoredPreset = storage.getItem(`${PRESET_SOURCE_PREFIX}.${strokeType}`) === "validated-preset" &&
      JSON.stringify(user) === JSON.stringify(validated);
    return { profile: structuredClone(user), source: restoredPreset ? "Validated project preset" : "User calibration" };
  }
  if (validated?.strokeType === strokeType && solveTrajectoryProfile(validated).valid) {
    return { profile: structuredClone(validated), source: "Validated project preset" };
  }
  return { profile: createDefaultTrajectoryProfile(strokeType, handedness), source: "Default fallback" };
}

export function restoreValidatedTrajectoryPreset(
  storage: CalibrationStorage,
  preset: ValidatedTrajectoryPreset = VALIDATED_TRAJECTORY_PRESET
): void {
  saveTrajectoryProfile(storage, structuredClone(preset.forehand));
  saveTrajectoryProfile(storage, structuredClone(preset.backhand));
  storage.setItem(`${PRESET_SOURCE_PREFIX}.forehand`, "validated-preset");
  storage.setItem(`${PRESET_SOURCE_PREFIX}.backhand`, "validated-preset");
}

export function markTrajectoryProfileAsUser(storage: CalibrationStorage, strokeType: CalibrationStrokeType): void {
  storage.removeItem(`${PRESET_SOURCE_PREFIX}.${strokeType}`);
}
