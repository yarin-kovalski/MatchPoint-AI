import * as THREE from "three";
import { BackhandStyle, Handedness, SpinType, StrokeType } from "../strokeDetection/strokeTypes.js";

export type BallState = "IDLE" | "IN_FLIGHT_TO_PLAYER" | "BOUNCED" | "CONTACT_ZONE" | "RETURNED" | "MISSED" | "OUT" | "RESETTING";
export type LaunchPreset = "easyForehand" | "easyBackhand" | "centerPractice";
export type AssistMode = "off" | "prototype" | "easy";
export type BallSpeedPreset = "slow" | "normal" | "fast";

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
};

export type BallHitEvent = {
  id: string;
  ballId: string;
  timestamp: number;
  strokeContactEventId: string;
  strokeType: Exclude<StrokeType, "unknown">;
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
