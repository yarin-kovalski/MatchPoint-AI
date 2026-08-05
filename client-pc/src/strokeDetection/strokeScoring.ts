import * as THREE from "three";
import { NormalizedSensorFrame } from "../motion/sensorNormalization.js";
import { STROKE_CONFIG } from "./strokeConfig.js";
import { SpinType, StrokeProfile, StrokeScores } from "./strokeTypes.js";

export function getPreparationSideScore(
  frame: NormalizedSensorFrame,
  profile: StrokeProfile
): number {
  const sideEvidence = Math.max(0, frame.motionSidewaysScore * profile.preparationSide);
  const orientationEvidence = THREE.MathUtils.clamp(
    frame.relativePhoneQuaternion.angleTo(new THREE.Quaternion()) / 0.7,
    0,
    1
  );
  const angularEvidence = THREE.MathUtils.clamp(frame.angularSpeed / 2.5, 0, 1);
  return clamp01(sideEvidence * 0.55 + orientationEvidence * 0.25 + angularEvidence * 0.2);
}

export function getForwardSwingScore(frame: NormalizedSensorFrame): number {
  const forward = Math.max(0, frame.motionForwardScore);
  const acceleration = THREE.MathUtils.clamp(frame.accelerationMagnitude / 10, 0, 1);
  const angular = THREE.MathUtils.clamp(frame.angularSpeed / 4, 0, 1);
  return clamp01(forward * 0.5 + acceleration * 0.25 + angular * 0.25);
}

export function getRacketFaceSuitability(
  frame: NormalizedSensorFrame,
  profile: StrokeProfile
): number {
  const [minimum, maximum] = profile.faceAngleRangeRadians;
  const angle = frame.racketFaceAngleToCourtRadians;
  if (angle < minimum || angle > maximum) {
    return 0;
  }
  const middle = (minimum + maximum) * 0.5;
  const halfRange = (maximum - minimum) * 0.5;
  return clamp01(1 - Math.abs(angle - middle) / Math.max(halfRange, 0.001));
}

export function calculateStrokeScores(
  frame: NormalizedSensorFrame,
  forehand: StrokeProfile,
  backhand: StrokeProfile,
  preparationPeak: number
): StrokeScores {
  const forehandCandidateScore = getPreparationSideScore(frame, forehand);
  const backhandCandidateScore = getPreparationSideScore(frame, backhand);
  const forwardSwingScore = getForwardSwingScore(frame);
  const lowToHighScore = clamp01(Math.max(0, frame.motionUpwardScore));
  const highToLowScore = clamp01(Math.max(0, -frame.motionUpwardScore));
  const faceSuitability = Math.max(
    getRacketFaceSuitability(frame, forehand),
    getRacketFaceSuitability(frame, backhand)
  );
  const topspinScore = clamp01(lowToHighScore * 0.7 + faceSuitability * 0.3);
  const sliceScore = clamp01(highToLowScore * 0.7 + faceSuitability * 0.3);
  const spinType = classifySpin(topspinScore, sliceScore);

  return {
    forehandCandidateScore,
    backhandCandidateScore,
    classificationMargin: Math.abs(forehandCandidateScore - backhandCandidateScore),
    preparationScore: Math.max(forehandCandidateScore, backhandCandidateScore),
    reversalScore: clamp01(forwardSwingScore * 0.7 + preparationPeak * 0.3),
    forwardSwingScore,
    followThroughScore: clamp01(
      Math.max(0, frame.motionUpwardScore) * 0.55 +
      Math.abs(frame.motionSidewaysScore) * 0.25 +
      Math.max(0, frame.motionForwardScore) * 0.2
    ),
    contactScore: clamp01(forwardSwingScore * 0.7 + faceSuitability * 0.3),
    lowToHighScore,
    highToLowScore,
    topspinScore,
    sliceScore,
    spinType
  };
}

function classifySpin(topspinScore: number, sliceScore: number): SpinType {
  if (topspinScore >= STROKE_CONFIG.spin.topspinThreshold && topspinScore > sliceScore + 0.1) {
    return "topspin";
  }
  if (sliceScore >= STROKE_CONFIG.spin.sliceThreshold && sliceScore > topspinScore + 0.1) {
    return "slice";
  }
  if (Math.max(topspinScore, sliceScore) <= STROKE_CONFIG.spin.flatMaximum) {
    return "flat";
  }
  return "unknown";
}

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1);
}
