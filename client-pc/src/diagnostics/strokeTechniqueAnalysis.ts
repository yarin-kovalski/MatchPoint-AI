import * as THREE from "three";
import type { PhysicalImpactResolution, PhysicalSpinType } from "../ball/contactRealism.js";
import type { BackhandStyle, Handedness } from "../strokeDetection/strokeTypes.js";
import type { TrainingStroke } from "./smartTrainingSession.js";

export type FollowThroughResult = {
  score: number;
  label: "Complete" | "Partial" | "Incomplete";
  finishedAcrossFarShoulder: boolean;
  crossBodyScore: number;
  upwardFinishScore: number;
  orientationTravelDegrees: number;
};

export type ShotTechnique = {
  spinType: PhysicalSpinType;
  spinRateRadPerSecond: number;
  spinRpm: number;
  spinLevel: number;
  topspinLevel: number;
  sliceLevel: number;
  verticalPathScore: number;
  racketFaceOpenDegrees: number;
  racketFaceOpennessLevel: number;
  racketFaceOpennessLabel: "Very closed" | "Closed" | "Slightly closed" | "Square" | "Slightly open" | "Open" | "Very open";
  brushDirection: "Low to high" | "High to low" | "Level";
  swingPathAngleDegrees: number;
  launchAngleDegrees: number;
  apexHeightMeters: number;
  arcLevel: number;
  arcLabel: "Low" | "Medium" | "High";
  netClearanceMeters: number | null;
  contactQuality: number;
  followThrough: FollowThroughResult;
};

export class FollowThroughAnalyzer {
  private contactQuaternion = new THREE.Quaternion();
  private expectedSide = 0;
  private maximumCrossBody = 0;
  private maximumUpward = 0;
  private maximumOrientationTravel = 0;
  private observations = 0;

  start(
    contactQuaternion: THREE.Quaternion,
    stroke: TrainingStroke,
    handedness: Handedness,
    _backhandStyle: BackhandStyle
  ): void {
    this.contactQuaternion.copy(contactQuaternion).normalize();
    const hand = handedness === "right" ? 1 : -1;
    this.expectedSide = stroke === "forehand" ? -hand : hand;
    this.maximumCrossBody = 0;
    this.maximumUpward = 0;
    this.maximumOrientationTravel = 0;
    this.observations = 0;
  }

  observe(input: {
    relativeQuaternion: THREE.Quaternion;
    sidewaysScore: number;
    upwardScore: number;
    angularSpeed: number;
  }): void {
    if (this.expectedSide === 0 || !Number.isFinite(input.angularSpeed)) return;
    this.maximumCrossBody = Math.max(this.maximumCrossBody,
      clamp01(input.sidewaysScore * this.expectedSide));
    this.maximumUpward = Math.max(this.maximumUpward, clamp01(input.upwardScore));
    this.maximumOrientationTravel = Math.max(this.maximumOrientationTravel,
      this.contactQuaternion.angleTo(input.relativeQuaternion));
    this.observations += 1;
  }

  finish(): FollowThroughResult {
    if (this.observations === 0) return emptyFollowThrough();
    const orientationScore = clamp01(this.maximumOrientationTravel / 1.05);
    const score = Math.round(100 * (
      this.maximumCrossBody * 0.5 + this.maximumUpward * 0.25 + orientationScore * 0.25
    ));
    const finishedAcrossFarShoulder = score >= 55 && this.maximumCrossBody >= 0.32;
    return {
      score,
      label: score >= 70 ? "Complete" : score >= 40 ? "Partial" : "Incomplete",
      finishedAcrossFarShoulder,
      crossBodyScore: Math.round(this.maximumCrossBody * 100),
      upwardFinishScore: Math.round(this.maximumUpward * 100),
      orientationTravelDegrees: round(THREE.MathUtils.radToDeg(this.maximumOrientationTravel), 1)
    };
  }

  reset(): void {
    this.expectedSide = 0;
    this.observations = 0;
  }
}

export function createShotTechnique(
  impact: PhysicalImpactResolution | null,
  followThrough: FollowThroughResult,
  contactHeightMeters = 1.1
): ShotTechnique | null {
  if (!impact) return null;
  const spinRate = finiteNonNegative(impact.spinRateRadiansPerSecond);
  const verticalPath = clamp(impact.upwardBrushVelocity - impact.downwardBrushVelocity,
    -Math.max(impact.racketHeadSpeed, 0.001), Math.max(impact.racketHeadSpeed, 0.001)) /
    Math.max(impact.racketHeadSpeed, 0.001);
  const spinLevel = Math.round(clamp01(spinRate / 55) * 100);
  // The signed vertical component of the face normal is the actual racket-face
  // pitch at impact: negative is closed, zero is square, positive is open.
  const racketFaceOpenDegrees = round(THREE.MathUtils.radToDeg(Math.asin(
    clamp(impact.contactNormal.y, -1, 1)
  )), 1);
  const racketFaceOpennessLevel = clamp(Math.round(
    1 + (racketFaceOpenDegrees + 30) / 65 * 9
  ), 1, 10);
  const racketFaceOpennessLabel = faceOpennessLabel(racketFaceOpenDegrees);
  const apexHeightMeters = round(impact.prediction.apexPoint.y, 2);
  const arcRiseMeters = Math.max(0, apexHeightMeters - contactHeightMeters);
  const launchDegrees = round(THREE.MathUtils.radToDeg(impact.launchAngleRadians), 1);
  const heightLevel = 1 + clamp01(arcRiseMeters / 2.7) * 9;
  const angleLevel = 1 + clamp01((launchDegrees - 5) / 35) * 9;
  const arcLevel = clamp(Math.round(heightLevel * 0.7 + angleLevel * 0.3), 1, 10);
  return {
    spinType: impact.spinType,
    spinRateRadPerSecond: round(spinRate, 1),
    spinRpm: Math.round(spinRate * 60 / (Math.PI * 2)),
    spinLevel,
    topspinLevel: impact.spinType === "TOPSPIN" || impact.spinType === "MIXED_SPIN" ? spinLevel : 0,
    sliceLevel: impact.spinType === "SLICE" || impact.spinType === "MIXED_SPIN" ? spinLevel : 0,
    verticalPathScore: round(verticalPath, 2),
    racketFaceOpenDegrees,
    racketFaceOpennessLevel,
    racketFaceOpennessLabel,
    brushDirection: verticalPath > 0.14 ? "Low to high" : verticalPath < -0.14 ? "High to low" : "Level",
    swingPathAngleDegrees: round(THREE.MathUtils.radToDeg(impact.swingPathAngleRadians), 1),
    launchAngleDegrees: launchDegrees,
    apexHeightMeters,
    arcLevel,
    arcLabel: arcLevel <= 3 ? "Low" : arcLevel <= 7 ? "Medium" : "High",
    netClearanceMeters: impact.predictedNetClearance === null ? null : round(impact.predictedNetClearance, 2),
    contactQuality: Math.round(clamp01(impact.contactQuality) * 100),
    followThrough
  };
}

function faceOpennessLabel(degrees: number): ShotTechnique["racketFaceOpennessLabel"] {
  if (degrees <= -20) return "Very closed";
  if (degrees <= -9) return "Closed";
  if (degrees <= -3) return "Slightly closed";
  if (degrees < 4) return "Square";
  if (degrees < 11) return "Slightly open";
  if (degrees < 23) return "Open";
  return "Very open";
}

export function emptyFollowThrough(): FollowThroughResult {
  return {
    score: 0, label: "Incomplete", finishedAcrossFarShoulder: false,
    crossBodyScore: 0, upwardFinishScore: 0, orientationTravelDegrees: 0
  };
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
