import * as THREE from "three";

export type StrokeType = "forehand" | "backhand" | "unknown";
export type Handedness = "right" | "left";
export type BackhandStyle = "one-handed" | "two-handed";
export type SpinType = "flat" | "topspin" | "slice" | "unknown";

export type StrokeState =
  | "READY"
  | "PREPARATION"
  | "BACKSWING"
  | "RACKET_DROP"
  | "FORWARD_SWING"
  | "CONTACT_WINDOW"
  | "FOLLOW_THROUGH"
  | "RECOVERY";

export type StrokeProfile = {
  id: "forehand" | "one-handed-backhand" | "two-handed-backhand";
  strokeType: Exclude<StrokeType, "unknown">;
  preparationSide: 1 | -1;
  followThroughSide: 1 | -1;
  minimumPreparationScore: number;
  minimumForwardIntensity: number;
  minimumReversalStrength: number;
  faceAngleRangeRadians: readonly [number, number];
  contactTimingMs: readonly [number, number];
  backswingMinimumMs: number;
  followThroughMinimumMs: number;
  allowsRacketDrop: boolean;
};

export type StrokeScores = {
  forehandCandidateScore: number;
  backhandCandidateScore: number;
  classificationMargin: number;
  preparationScore: number;
  reversalScore: number;
  forwardSwingScore: number;
  followThroughScore: number;
  contactScore: number;
  lowToHighScore: number;
  highToLowScore: number;
  topspinScore: number;
  sliceScore: number;
  spinType: SpinType;
};

export type EstimatedRacketContact = {
  id: string;
  swingId: string;
  timestamp: number;
  strokeType: Exclude<StrokeType, "unknown">;
  handedness: Handedness;
  backhandStyle: BackhandStyle;
  confidence: number;
  estimatedSpeed: number;
  forwardScore: number;
  upwardScore: number;
  sidewaysScore: number;
  racketFaceAngle: number;
  racketQuaternion: THREE.Quaternion;
  racketPosition: THREE.Vector3;
  racketForwardVector: THREE.Vector3;
  racketUpVector: THREE.Vector3;
  racketSideVector: THREE.Vector3;
  racketFaceNormal: THREE.Vector3;
  peakAngularVelocity: number;
  peakAcceleration: number;
  peakJerk: number;
  preparationDuration: number;
  forwardSwingDuration: number;
  lowToHighScore: number;
  highToLowScore: number;
  topspinScore: number;
  sliceScore: number;
  spinType: SpinType;
};

export type StrokeDetectorSnapshot = {
  currentState: StrokeState;
  previousState: StrokeState;
  stateEnteredAt: number;
  stateDuration: number;
  swingId: string | null;
  lockedStrokeType: StrokeType;
  confidence: number;
  rejectionReason: string;
  scores: StrokeScores;
  peakAngularVelocity: number;
  peakAcceleration: number;
  peakJerk: number;
  preparationDuration: number;
  lastCompletedStroke: string;
  lastContactTimestamp: number | null;
  transitions: string[];
};

