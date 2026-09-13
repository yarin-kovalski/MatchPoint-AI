import type { PlayableFailureReason } from "../ball/playableCalibratedHit.js";

export type TrainingMissReason =
  | "TOO_EARLY"
  | "TOO_LATE"
  | "BALL_TOO_FAR"
  | "BALL_TOO_HIGH"
  | "BALL_TOO_LOW"
  | "NO_FORWARD_INTENT"
  | "RACKET_DRIFT"
  | "OUTSIDE_STRIKE_ZONE"
  | "ASSIST_REJECTED";

export type TrainingMissEvidence = {
  closestOffset: { x: number; y: number; z: number } | null;
  closestBallToStringBedMeters: number | null;
  maximumStringBedReachMeters: number;
  strikeZoneRadii: { lateral: number; vertical: number; depth: number };
  enteredStrikeZone: boolean;
  maximumNeutralOriginDriftMeters: number;
  sawActiveIntentBeforeWindow: boolean;
  sawActiveIntentInWindow: boolean;
  sawActiveIntentAfterWindow: boolean;
  sawForwardIntentInWindow: boolean;
  rejectedInWindow: PlayableFailureReason | null;
};

export function emptyTrainingMissBreakdown(): Record<TrainingMissReason, number> {
  return {
    TOO_EARLY: 0, TOO_LATE: 0, BALL_TOO_FAR: 0, BALL_TOO_HIGH: 0,
    BALL_TOO_LOW: 0, NO_FORWARD_INTENT: 0, RACKET_DRIFT: 0,
    OUTSIDE_STRIKE_ZONE: 0, ASSIST_REJECTED: 0
  };
}

/** Classifies a completed Training miss from evidence gathered during the full feed. */
export function classifyTrainingMiss(evidence: TrainingMissEvidence): TrainingMissReason[] {
  const reasons: TrainingMissReason[] = [];
  const offset = evidence.closestOffset;
  if (!evidence.enteredStrikeZone) reasons.push("OUTSIDE_STRIKE_ZONE");
  if (offset) {
    if (offset.y > evidence.strikeZoneRadii.vertical) reasons.push("BALL_TOO_HIGH");
    else if (offset.y < -evidence.strikeZoneRadii.vertical) reasons.push("BALL_TOO_LOW");
    if (Math.abs(offset.x) > evidence.strikeZoneRadii.lateral ||
        Math.abs(offset.z) > evidence.strikeZoneRadii.depth) reasons.push("BALL_TOO_FAR");
  }
  if (evidence.closestBallToStringBedMeters !== null &&
      evidence.closestBallToStringBedMeters > evidence.maximumStringBedReachMeters) {
    reasons.push("BALL_TOO_FAR");
  }
  if (evidence.maximumNeutralOriginDriftMeters > 0.03) reasons.push("RACKET_DRIFT");

  if (!evidence.sawActiveIntentInWindow) {
    if (evidence.sawActiveIntentBeforeWindow) reasons.push("TOO_EARLY");
    else if (evidence.sawActiveIntentAfterWindow) reasons.push("TOO_LATE");
    else reasons.push("NO_FORWARD_INTENT");
  } else if (!evidence.sawForwardIntentInWindow) {
    reasons.push("NO_FORWARD_INTENT");
  }

  if (evidence.rejectedInWindow !== null) reasons.push("ASSIST_REJECTED");
  if (reasons.length === 0) reasons.push("ASSIST_REJECTED");
  return [...new Set(reasons)];
}
