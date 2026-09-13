import * as THREE from "three";
import { BackhandStyle, Handedness, SpinType, StrokeType } from "../strokeDetection/strokeTypes.js";
import type { EasySwingIntentSnapshot } from "../strokeDetection/easySwingIntent.js";
import type { ForwardSwingSnapshot } from "../motion/forwardSwingFusion.js";

export type BallState = "IDLE" | "IN_FLIGHT_TO_PLAYER" | "BOUNCED" | "CONTACT_ZONE" | "RETURNED" | "MISSED" | "OUT" | "RESETTING";
export type LaunchPreset = "easyForehand" | "easyBackhand" | "guaranteedForehand" | "guaranteedBackhand" | "centerPractice";
export function isBackhandPreset(preset: LaunchPreset | null): boolean {
  return preset === "easyBackhand" || preset === "guaranteedBackhand";
}
export type AssistMode = "off" | "prototype" | "easy";
export type BallSpeedPreset = "slow" | "normal" | "fast";

export type EasyHitMotion = {
  valid: boolean;
  angularSpeed: number;
  angularVelocityWorld?: THREE.Vector3;
  accelerationMagnitude: number;
  racketQuaternion: THREE.Quaternion;
  racketFaceNormal: THREE.Vector3;
  racketForwardVector: THREE.Vector3;
  racketUpVector: THREE.Vector3;
  racketSideVector: THREE.Vector3;
  racketFaceAngle: number;
  motionForwardScore: number;
  motionUpwardScore?: number;
  motionSidewaysScore?: number;
  handedness: Handedness;
  backhandStyle: BackhandStyle;
  swingIntent?: EasySwingIntentSnapshot;
  forwardSwing?: ForwardSwingSnapshot;
};

export type HitDebugSnapshot = {
  ballNearTarget: boolean;
  ballNearStringBed: boolean;
  oneBounceOnly: boolean;
  beforeSecondBounce: boolean;
  planeCrossed: boolean;
  insideEllipse: boolean;
  strokeStateIsContactReady: boolean;
  recentContactEvent: boolean;
  swingSpeedAboveThreshold: boolean;
  racketPoseValid: boolean;
  swingDirectionValid: boolean;
  hitAccepted: boolean;
  rejectionReason: string;
  ballToTargetDistance: number;
  ballToStringBedDistance: number;
  currentSwingSpeed: number;
  minimumSwingSpeed: number;
  stringBedCenter: THREE.Vector3;
};

export type BallSnapshot = {
  id: string;
  state: BallState;
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  spinVector: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  spinType: SpinType;
  spinStrength: number;
  magnusAcceleration: THREE.Vector3;
  physicsRadius: number;
  visualRadius: number;
  bounceCount: number;
  hit: boolean;
  active: boolean;
  launchTimestamp: number;
  launchPreset: LaunchPreset | null;
  contactTarget: THREE.Vector3;
  lockedContactTarget: THREE.Vector3;
  lockedContactQuaternion: THREE.Quaternion;
  lockedStrokeType: "forehand" | "backhand";
  expectedStrokeType: "forehand" | "backhand";
  bouncePoint: THREE.Vector3;
  contactTimeAfterBounce: number;
  contactDeadline: number;
  secondBounceDeadline: number;
};

export type RacketCollisionResult = {
  crossed: boolean;
  candidate: boolean;
  assisted: boolean;
  contactPointWorld: THREE.Vector3;
  contactPointLocal: THREE.Vector3;
  currentLocalPosition: THREE.Vector3;
  insideWidth: boolean;
  insideHeight: boolean;
  planeDistance: number;
  ellipseValue: number;
  closestDistance: number;
  impactFraction: number;
  physicalCandidate: boolean;
  frameContact: boolean;
};

export type BallHitEvent = {
  id: string;
  ballId: string;
  timestamp: number;
  strokeContactEventId: string;
  strokeType: Exclude<StrokeType, "unknown">;
  expectedStrokeType: "forehand" | "backhand";
  detectedStrokeType: StrokeType;
  resolvedHitStrokeType: "forehand" | "backhand";
  strokeTypeMismatch: "EXPECTED_FOREHAND_DETECTED_BACKHAND" | "EXPECTED_BACKHAND_DETECTED_FOREHAND" | "STROKE_TYPE_UNRESOLVED" | "NONE";
  handedness: Handedness;
  backhandStyle: BackhandStyle;
  confidence: number;
  assisted: boolean;
  contactPointWorld: THREE.Vector3;
  contactPointRacketLocal: THREE.Vector3;
  racketQuaternion: THREE.Quaternion;
  racketFaceNormal: THREE.Vector3;
  incomingVelocity: THREE.Vector3;
  outgoingVelocity: THREE.Vector3;
  outgoingSpeed: number;
  spinType: SpinType;
  spinVector: THREE.Vector3;
  topspinScore: number;
  sliceScore: number;
  racketFaceAngle: number;
};

export type BallMissEvent = {
  id: string;
  ballId: string;
  timestamp: number;
  reason: string;
  closestDistance: number;
  ballPosition: THREE.Vector3;
  racketPosition: THREE.Vector3;
  localBallPosition: THREE.Vector3;
  strokeState: string;
  nearestContactEventAge: number | null;
};
