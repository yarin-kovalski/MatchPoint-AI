import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import { EasyHitMotion, PlayerAssistLevel } from "./ballTypes.js";
import { TrajectoryCalibrationProfile, worldToPlayerLocal } from "./trajectoryCalibration.js";

export type PlayableTimingState = "TOO EARLY" | "HIT WINDOW" | "TOO LATE";
export type PlayableFailureReason = "NO_SAVED_PROFILE" | "NO_REAL_SWING" | "SWING_TOO_EARLY" |
  "SWING_TOO_LATE" | "WRONG_STROKE_SIDE" | "RACKET_FACE_IMPLAUSIBLE" | "CONTACT_ALREADY_USED";

export type PlayableHitDecision = {
  accepted: boolean;
  timing: PlayableTimingState;
  reason: PlayableFailureReason | null;
  resolvedPlayableStrokeType: "forehand" | "backhand";
  opportunityStart: number;
  opportunityEnd: number;
  timingOffsetMs: number;
};

export type PlayableStrokePlan = {
  strokeType: "forehand" | "backhand";
  profile: TrajectoryCalibrationProfile;
  expectedSide: "right" | "left";
  contactLocalX: number;
  contactWorld: THREE.Vector3;
};

export function createPlayableStrokePlan(
  strokeType: "forehand" | "backhand",
  profiles: Record<"forehand" | "backhand", TrajectoryCalibrationProfile | null>
): PlayableStrokePlan | null {
  const profile = profiles[strokeType];
  if (!profile || profile.strokeType !== strokeType) return null;
  const contactWorld = new THREE.Vector3().fromArray(profile.contactPointWorld);
  const contactLocalX = worldToPlayerLocal(contactWorld, profile.playerBasisAtCalibration).x;
  const validSide = strokeType === "forehand" ? contactLocalX > 0.25 : contactLocalX < -0.25;
  if (!validSide) return null;
  return { strokeType, profile, expectedSide: strokeType === "forehand" ? "right" : "left", contactLocalX, contactWorld };
}
export function evaluatePlayableCalibratedHit(input: {
  now: number;
  contactTime: number;
  bounceCount: number;
  alreadyHit: boolean;
  expectedStrokeType: "forehand" | "backhand";
  profile: TrajectoryCalibrationProfile | null;
  motion: EasyHitMotion | null;
  assistLevel?: PlayerAssistLevel;
}): PlayableHitDecision {
  const assist = BALL_CONFIG.playerAssist[input.assistLevel ?? "training"];
  const opportunityStart = input.contactTime - assist.windowBeforeMs;
  const opportunityEnd = input.contactTime + assist.windowAfterMs;
  const timing: PlayableTimingState = input.now < opportunityStart ? "TOO EARLY" : input.now <= opportunityEnd ? "HIT WINDOW" : "TOO LATE";
  const base: Omit<PlayableHitDecision, "accepted" | "reason"> = {
    timing, resolvedPlayableStrokeType: input.expectedStrokeType, opportunityStart, opportunityEnd,
    timingOffsetMs: input.now - input.contactTime
  };
  if (!input.profile) return { ...base, accepted: false, reason: "NO_SAVED_PROFILE" };
  if (input.alreadyHit) return { ...base, accepted: false, reason: "CONTACT_ALREADY_USED" };
  if (input.bounceCount !== 1 || timing === "TOO EARLY") return { ...base, accepted: false, reason: "SWING_TOO_EARLY" };
  if (timing === "TOO LATE") return { ...base, accepted: false, reason: "SWING_TOO_LATE" };
  const localContact = worldToPlayerLocal(new THREE.Vector3().fromArray(input.profile.contactPointWorld), input.profile.playerBasisAtCalibration);
  const correctSide = input.expectedStrokeType === "forehand" ? localContact.x > 0 : localContact.x < 0;
  if (input.profile.strokeType !== input.expectedStrokeType || !correctSide) return { ...base, accepted: false, reason: "WRONG_STROKE_SIDE" };
  const fusedForwardScore = input.motion?.forwardSwing?.forwardDriveScore ?? 0;
  const measuredForwardScore = input.motion?.motionForwardScore ?? 0;
  const forwardDriveScore = (input.assistLevel ?? "training") === "training"
    ? Math.max(fusedForwardScore, measuredForwardScore)
    : input.motion?.forwardSwing?.forwardDriveScore ?? measuredForwardScore;
  const fusedDirectionReason = input.motion?.forwardSwing?.invalidDirectionReason ?? "NONE";
  const fusedDirectionRejected = (input.assistLevel ?? "training") === "training"
    ? fusedDirectionReason === "BACKWARD_SWING"
    : fusedDirectionReason !== "NONE";
  const enoughMotion = (input.assistLevel ?? "training") === "training"
    ? (input.motion?.angularSpeed ?? 0) >= assist.minimumAngularSpeed ||
      (input.motion?.accelerationMagnitude ?? 0) >= assist.minimumAcceleration
    : (input.motion?.angularSpeed ?? 0) >= assist.minimumAngularSpeed &&
      (input.motion?.accelerationMagnitude ?? 0) >= assist.minimumAcceleration;
  if (!input.motion?.valid || !input.motion.swingIntent?.active ||
      input.now - input.motion.swingIntent.startedAt < BALL_CONFIG.playableCalibratedHit.minimumActiveSwingMs ||
      !enoughMotion ||
      forwardDriveScore < assist.minimumForwardDriveScore ||
      fusedDirectionRejected) {
    return { ...base, accepted: false, reason: "NO_REAL_SWING" };
  }
  if (input.motion.swingIntent.strokeType !== input.expectedStrokeType) return { ...base, accepted: false, reason: "WRONG_STROKE_SIDE" };
  if (input.motion.racketFaceAngle > BALL_CONFIG.playableCalibratedHit.maximumFaceAngleRadians) {
    return { ...base, accepted: false, reason: "RACKET_FACE_IMPLAUSIBLE" };
  }
  return { ...base, accepted: true, reason: null };
}
