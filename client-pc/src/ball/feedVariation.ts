import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import {
  CalibrationStrokeType, solveTrajectoryProfile, synchronizeProfileApexFromTiming,
  TrajectoryCalibrationProfile, worldToPlayerLocal
} from "./trajectoryCalibration.js";
import { VALIDATED_TRAJECTORY_PRESET } from "./validatedTrajectoryPreset.js";

export type FeedVariationLevel = "off" | "low" | "medium";
export type FeedVariationOffsets = {
  bounceLateral: number; bounceDepth: number; contactLateral: number;
  contactHeight: number; contactDepth: number; contactTimeMs: number; speedScale: number;
};
export type FeedVariationResult = {
  profile: TrajectoryCalibrationProfile; baseProfile: CalibrationStrokeType;
  level: FeedVariationLevel; seed: number; offsets: FeedVariationOffsets;
  retryCount: number; valid: boolean; fallback: boolean; validationErrors: string[];
};

export const FEED_VARIATION_RANGES = {
  off: { bounceLateral: 0, bounceDepth: 0, contactLateral: 0, contactHeight: 0, contactDepth: 0, contactTimeMs: 0, speedPercent: 0 },
  low: { bounceLateral: 0.05, bounceDepth: 0.08, contactLateral: 0.035, contactHeight: 0.03, contactDepth: 0.02, contactTimeMs: 20, speedPercent: 0.015 },
  medium: { bounceLateral: 0.08, bounceDepth: 0.12, contactLateral: 0.06, contactHeight: 0.05, contactDepth: 0.04, contactTimeMs: 40, speedPercent: 0.03 }
} as const;

export const SAFE_CONTACT_ENVELOPE = {
  safeLateralRange: 0.08, safeVerticalRange: 0.07, safeDepthRange: 0.06,
  safeTimingRangeMs: 50,
  maxMagnetCorrection: BALL_CONFIG.playableCalibratedHit.maximumCorrection
} as const;

export const MAX_VARIATION_RETRIES = 12;
export const validatedForehandBase = deepFreeze(structuredClone(VALIDATED_TRAJECTORY_PRESET.forehand));
export const validatedBackhandBase = deepFreeze(structuredClone(VALIDATED_TRAJECTORY_PRESET.backhand));
export const SAFE_CONTACT_ENVELOPES = deepFreeze({
  forehand: { baseContactPoint: [...validatedForehandBase.contactPointWorld], ...SAFE_CONTACT_ENVELOPE },
  backhand: { baseContactPoint: [...validatedBackhandBase.contactPointWorld], ...SAFE_CONTACT_ENVELOPE }
});

export function canLaunchPracticeFeed(now: number, relaunchAt: number, ballActive: boolean): boolean {
  return relaunchAt > 0 && now >= relaunchAt && !ballActive;
}

export function generateSafeFeedVariation(
  strokeType: CalibrationStrokeType,
  level: FeedVariationLevel,
  seed: number,
  randomOverride?: () => number
): FeedVariationResult {
  const base = strokeType === "forehand" ? validatedForehandBase : validatedBackhandBase;
  const zero = zeroOffsets();
  if (level === "off") return result(structuredClone(base), strokeType, level, seed, zero, 0, true, false, []);
  const random = randomOverride ?? seededRandom(seed);
  let errors: string[] = [];
  for (let retry = 0; retry < MAX_VARIATION_RETRIES; retry += 1) {
    const ranges = FEED_VARIATION_RANGES[level];
    const offsets: FeedVariationOffsets = {
      bounceLateral: signed(random, ranges.bounceLateral), bounceDepth: signed(random, ranges.bounceDepth),
      contactLateral: signed(random, ranges.contactLateral), contactHeight: signed(random, ranges.contactHeight),
      contactDepth: signed(random, ranges.contactDepth), contactTimeMs: signed(random, ranges.contactTimeMs),
      speedScale: 1 + signed(random, ranges.speedPercent)
    };
    const candidate = structuredClone(base);
    candidate.bouncePointWorld[0] += offsets.bounceLateral;
    candidate.bouncePointWorld[2] += offsets.bounceDepth;
    candidate.contactPointWorld[0] += offsets.contactLateral;
    candidate.contactPointWorld[1] += offsets.contactHeight;
    candidate.contactPointWorld[2] += offsets.contactDepth;
    candidate.bounceToContactMs += offsets.contactTimeMs;
    candidate.overallSpeed *= offsets.speedScale;
    candidate.contactPointPlayerLocal = worldToPlayerLocal(
      new THREE.Vector3().fromArray(candidate.contactPointWorld), candidate.playerBasisAtCalibration
    ).toArray();
    synchronizeProfileApexFromTiming(candidate);
    errors = validateVariation(candidate, base);
    if (errors.length === 0) return result(candidate, strokeType, level, seed, offsets, retry, true, false, []);
  }
  return result(structuredClone(base), strokeType, level, seed, zero, MAX_VARIATION_RETRIES, true, true, errors);
}

export function validateVariation(candidate: TrajectoryCalibrationProfile, base: TrajectoryCalibrationProfile): string[] {
  const errors = [...solveTrajectoryProfile(candidate).errors];
  const numericValues = [
    ...candidate.bouncePointWorld, ...candidate.contactPointWorld, ...candidate.apexPointWorld,
    candidate.bounceToContactMs, candidate.overallSpeed
  ];
  if (numericValues.some((value) => !Number.isFinite(value))) errors.push("NON_FINITE_VARIATION");
  const local = worldToPlayerLocal(new THREE.Vector3().fromArray(candidate.contactPointWorld), candidate.playerBasisAtCalibration);
  if (candidate.strokeType === "forehand" && local.x <= 0.25) errors.push("WRONG_FOREHAND_SIDE");
  if (candidate.strokeType === "backhand" && local.x >= -0.25) errors.push("WRONG_BACKHAND_SIDE");
  const delta = new THREE.Vector3().fromArray(candidate.contactPointWorld).sub(new THREE.Vector3().fromArray(base.contactPointWorld));
  if (Math.abs(delta.x) > SAFE_CONTACT_ENVELOPE.safeLateralRange) errors.push("CONTACT_LATERAL_ENVELOPE");
  if (Math.abs(delta.y) > SAFE_CONTACT_ENVELOPE.safeVerticalRange) errors.push("CONTACT_VERTICAL_ENVELOPE");
  if (Math.abs(delta.z) > SAFE_CONTACT_ENVELOPE.safeDepthRange) errors.push("CONTACT_DEPTH_ENVELOPE");
  if (Math.abs(candidate.bounceToContactMs - base.bounceToContactMs) > SAFE_CONTACT_ENVELOPE.safeTimingRangeMs) errors.push("CONTACT_TIMING_ENVELOPE");
  if (candidate.bouncePointWorld[2] < -5.49 || Math.abs(candidate.bouncePointWorld[0]) > 4.12) errors.push("BOUNCE_OUTSIDE_COURT");
  return [...new Set(errors)];
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
function signed(random: () => number, range: number): number { return (random() * 2 - 1) * range; }
function zeroOffsets(): FeedVariationOffsets { return { bounceLateral: 0, bounceDepth: 0, contactLateral: 0, contactHeight: 0, contactDepth: 0, contactTimeMs: 0, speedScale: 1 }; }
function result(profile: TrajectoryCalibrationProfile, baseProfile: CalibrationStrokeType, level: FeedVariationLevel, seed: number, offsets: FeedVariationOffsets, retryCount: number, valid: boolean, fallback: boolean, validationErrors: string[]): FeedVariationResult {
  return { profile, baseProfile, level, seed, offsets, retryCount, valid, fallback, validationErrors };
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
