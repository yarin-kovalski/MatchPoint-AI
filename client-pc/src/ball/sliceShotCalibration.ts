import * as THREE from "three";
import type { EasyHitMotion } from "./ballTypes.js";

export type SliceCalibrationKind = "drop" | "deep";
export type SliceShotIntent = SliceCalibrationKind;

export type SliceMotionFeatures = {
  angularSpeed: number;
  acceleration: number;
  forwardDrive: number;
  downwardPath: number;
  faceOpenDegrees: number;
  racketHeadSpeed: number;
  sideways: number;
};

export type SliceCalibrationSample = {
  recordedAt: number;
  strokeType: "forehand" | "backhand";
  motion: SliceMotionFeatures;
  contactSensors: unknown;
};

export type SliceCalibrationData = Record<SliceCalibrationKind, SliceCalibrationSample[]>;

export type SliceClassification = {
  intent: SliceShotIntent;
  confidence: number;
  dropDistance: number;
  deepDistance: number;
};

export const SLICE_CALIBRATION_SAMPLES_PER_KIND = 3;
export const SLICE_CALIBRATION_STORAGE_KEY = "matchpoint.slice-shot-calibration.v1";

const EMPTY: SliceCalibrationData = { drop: [], deep: [] };
const FEATURE_SCALES: SliceMotionFeatures = {
  angularSpeed: 2.2,
  acceleration: 4.5,
  forwardDrive: 0.28,
  downwardPath: 0.28,
  faceOpenDegrees: 16,
  racketHeadSpeed: 2.8,
  sideways: 0.45
};

export function sliceMotionFeatures(motion: EasyHitMotion): SliceMotionFeatures {
  const forwardSpeed = Math.max(0, motion.forwardSwing?.forwardRacketHeadVelocity ?? motion.angularSpeed * 0.68);
  const upwardSpeed = motion.forwardSwing?.upwardRacketHeadVelocity ?? (motion.motionUpwardScore ?? 0) * 4;
  const verticalPath = THREE.MathUtils.clamp(
    upwardSpeed / Math.max(2, forwardSpeed) * 0.85 +
    (motion.motionUpwardScore ?? 0) * (motion.forwardSwing ? 0.2 : 0.8) +
    (motion.forwardSwing?.upwardAcceleration ?? 0) / 80,
    -1,
    1
  );
  const face = motion.racketFaceNormal.clone().normalize();
  if (face.z > 0) face.negate();
  return {
    angularSpeed: finite(Math.max(motion.angularSpeed, motion.swingIntent?.peakAngularSpeed ?? 0)),
    acceleration: finite(motion.accelerationMagnitude),
    forwardDrive: finite(Math.max(motion.motionForwardScore, motion.forwardSwing?.forwardDriveScore ?? -1)),
    downwardPath: finite(Math.max(0, -verticalPath)),
    faceOpenDegrees: finite(THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(face.y, -0.82, 0.82)))),
    racketHeadSpeed: finite(Math.max(forwardSpeed, motion.forwardSwing?.racketHeadVelocityWorld.length() ?? 0)),
    sideways: finite(motion.motionSidewaysScore ?? 0)
  };
}

export function isSliceMotion(features: SliceMotionFeatures): boolean {
  return features.downwardPath >= 0.12 && features.angularSpeed >= 0.85 && features.forwardDrive >= 0.04;
}

export function addSliceCalibrationSample(
  data: SliceCalibrationData,
  kind: SliceCalibrationKind,
  sample: SliceCalibrationSample
): SliceCalibrationData {
  return {
    drop: kind === "drop" ? [...data.drop, sample].slice(-SLICE_CALIBRATION_SAMPLES_PER_KIND) : [...data.drop],
    deep: kind === "deep" ? [...data.deep, sample].slice(-SLICE_CALIBRATION_SAMPLES_PER_KIND) : [...data.deep]
  };
}

export function resetSliceCalibrationKind(
  data: SliceCalibrationData,
  kind: SliceCalibrationKind
): SliceCalibrationData {
  return { drop: kind === "drop" ? [] : [...data.drop], deep: kind === "deep" ? [] : [...data.deep] };
}

export function classifyCalibratedSlice(
  motion: EasyHitMotion,
  data: SliceCalibrationData
): SliceClassification | null {
  if (!sliceCalibrationComplete(data)) return null;
  const features = sliceMotionFeatures(motion);
  if (!isSliceMotion(features)) return null;
  const dropDistance = featureDistance(features, centroid(data.drop));
  const deepDistance = featureDistance(features, centroid(data.deep));
  const nearest = Math.min(dropDistance, deepDistance);
  if (nearest > 2.8) return null;
  const separation = Math.abs(dropDistance - deepDistance);
  return {
    intent: dropDistance <= deepDistance ? "drop" : "deep",
    confidence: THREE.MathUtils.clamp(0.55 + separation * 0.18 - nearest * 0.08, 0.5, 0.96),
    dropDistance,
    deepDistance
  };
}

export function sliceCalibrationComplete(data: SliceCalibrationData): boolean {
  return data.drop.length >= SLICE_CALIBRATION_SAMPLES_PER_KIND &&
    data.deep.length >= SLICE_CALIBRATION_SAMPLES_PER_KIND;
}

export function saveSliceCalibration(storage: StorageLike, data: SliceCalibrationData): void {
  storage.setItem(SLICE_CALIBRATION_STORAGE_KEY, JSON.stringify(data));
}

export function loadSliceCalibration(storage: StorageLike): SliceCalibrationData {
  try {
    const parsed = JSON.parse(storage.getItem(SLICE_CALIBRATION_STORAGE_KEY) ?? "null") as Partial<SliceCalibrationData> | null;
    return {
      drop: sanitizeSamples(parsed?.drop),
      deep: sanitizeSamples(parsed?.deep)
    };
  } catch {
    return { drop: [], deep: [] };
  }
}

export function clearSliceCalibration(storage: StorageLike): SliceCalibrationData {
  storage.removeItem(SLICE_CALIBRATION_STORAGE_KEY);
  return { drop: [], deep: [] };
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function centroid(samples: SliceCalibrationSample[]): SliceMotionFeatures {
  const keys = Object.keys(FEATURE_SCALES) as Array<keyof SliceMotionFeatures>;
  const result = { ...FEATURE_SCALES };
  for (const key of keys) result[key] = samples.reduce((sum, sample) => sum + sample.motion[key], 0) / samples.length;
  return result;
}

function featureDistance(a: SliceMotionFeatures, b: SliceMotionFeatures): number {
  const keys = Object.keys(FEATURE_SCALES) as Array<keyof SliceMotionFeatures>;
  return Math.sqrt(keys.reduce((sum, key) => sum + ((a[key] - b[key]) / FEATURE_SCALES[key]) ** 2, 0) / keys.length);
}

function sanitizeSamples(value: unknown): SliceCalibrationSample[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is SliceCalibrationSample => {
    if (!entry || typeof entry !== "object") return false;
    const sample = entry as Partial<SliceCalibrationSample>;
    return (sample.strokeType === "forehand" || sample.strokeType === "backhand") &&
      !!sample.motion && isFiniteFeatures(sample.motion as SliceMotionFeatures);
  }).slice(-SLICE_CALIBRATION_SAMPLES_PER_KIND);
}

function isFiniteFeatures(features: SliceMotionFeatures): boolean {
  return (Object.keys(FEATURE_SCALES) as Array<keyof SliceMotionFeatures>)
    .every(key => Number.isFinite(features[key]));
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
