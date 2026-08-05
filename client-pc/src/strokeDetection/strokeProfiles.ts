import { BackhandStyle, Handedness, StrokeProfile } from "./strokeTypes.js";

export function createStrokeProfiles(
  handedness: Handedness,
  backhandStyle: BackhandStyle
): { forehand: StrokeProfile; backhand: StrokeProfile } {
  const handednessMultiplier = handedness === "right" ? 1 : -1;

  const forehand: StrokeProfile = {
    id: "forehand",
    strokeType: "forehand",
    preparationSide: handednessMultiplier as 1 | -1,
    followThroughSide: -handednessMultiplier as 1 | -1,
    minimumPreparationScore: 0.5,
    minimumForwardIntensity: 0.42,
    minimumReversalStrength: 0.42,
    faceAngleRangeRadians: [0.05, 1.25],
    contactTimingMs: [150, 1450],
    backswingMinimumMs: 80,
    followThroughMinimumMs: 100,
    allowsRacketDrop: true
  };

  const oneHanded = backhandStyle === "one-handed";
  const backhand: StrokeProfile = {
    id: oneHanded ? "one-handed-backhand" : "two-handed-backhand",
    strokeType: "backhand",
    preparationSide: -handednessMultiplier as 1 | -1,
    followThroughSide: handednessMultiplier as 1 | -1,
    minimumPreparationScore: oneHanded ? 0.5 : 0.55,
    minimumForwardIntensity: oneHanded ? 0.4 : 0.46,
    minimumReversalStrength: oneHanded ? 0.4 : 0.46,
    faceAngleRangeRadians: oneHanded ? [0.08, 1.32] : [0.08, 0.95],
    contactTimingMs: oneHanded ? [170, 1500] : [140, 1150],
    backswingMinimumMs: oneHanded ? 95 : 65,
    followThroughMinimumMs: oneHanded ? 130 : 85,
    allowsRacketDrop: true
  };

  return { forehand, backhand };
}

