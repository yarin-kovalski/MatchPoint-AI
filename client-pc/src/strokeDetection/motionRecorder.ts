import * as THREE from "three";
import { NormalizedSensorFrame } from "../motion/sensorNormalization.js";
import { BallHitEvent, BallMissEvent, BallSpeedPreset, LaunchPreset } from "../ball/ballTypes.js";
import { BackhandStyle, Handedness } from "./strokeTypes.js";

export type RecordingLabel =
  | "forehand"
  | "one-handed-backhand"
  | "two-handed-backhand"
  | "noise"
  | "shake"
  | "incomplete-stroke";

export type RecordedMotionFrame = {
  timestamp: number;
  sensorTimestamp: number;
  deltaTime: number;
  currentPhoneQuaternion: number[];
  relativePhoneQuaternion: number[];
  mappedRacketQuaternion: number[];
  angularVelocityLocal: number[];
  angularVelocityWorld: number[];
  angularSpeed: number;
  rawAcceleration: number[];
  accelerationIncludingGravity: number[];
  gravityCompensatedAcceleration: number[];
  smoothedAcceleration: number[];
  fastAcceleration: number[];
  accelerationMagnitude: number;
  jerk: number;
  racketForwardVector: number[];
  racketUpVector: number[];
  racketSideVector: number[];
  racketFaceNormal: number[];
  racketFaceAngleToCourtRadians: number;
  motionForwardScore: number;
  motionUpwardScore: number;
  motionSidewaysScore: number;
  valid: boolean;
  rejectionReason: string;
};

export type MotionRecording = {
  version: 1;
  label: RecordingLabel;
  createdAt: number;
  frames: RecordedMotionFrame[];
  gameplay: {
    launch: {
      preset: LaunchPreset;
      handedness: Handedness;
      backhandStyle: BackhandStyle;
      speed: BallSpeedPreset;
      timestamp: number;
      targetOffsets: { heightOffset: number; sideOffset: number; depthOffset: number };
      visualScaleMultiplier: number;
    } | null;
    result: { type: "hit"; event: BallHitEvent } | { type: "miss"; event: BallMissEvent } | null;
  };
};

export class MotionRecorder {
  private recording: MotionRecording | null = null;
  private lastRecording: MotionRecording | null = null;

  constructor(private readonly maximumFrames = 4000) {}

  start(label: RecordingLabel): void {
    this.recording = {
      version: 1,
      label,
      createdAt: Date.now(),
      frames: [],
      gameplay: { launch: null, result: null }
    };
  }

  capture(frame: NormalizedSensorFrame): void {
    if (!this.recording || this.recording.frames.length >= this.maximumFrames) {
      return;
    }
    this.recording.frames.push(serializeFrame(frame));
  }

  stop(): MotionRecording | null {
    if (!this.recording) {
      return this.lastRecording;
    }
    this.lastRecording = this.recording;
    this.recording = null;
    return this.lastRecording;
  }

  isRecording(): boolean {
    return this.recording !== null;
  }

  getLastRecording(): MotionRecording | null {
    return this.lastRecording;
  }

  recordBallLaunch(
    preset: LaunchPreset,
    handedness: Handedness,
    backhandStyle: BackhandStyle,
    speed: BallSpeedPreset,
    timestamp: number,
    targetOffsets: { heightOffset: number; sideOffset: number; depthOffset: number },
    visualScaleMultiplier: number
  ): void {
    if (this.recording) this.recording.gameplay.launch = {
      preset, handedness, backhandStyle, speed, timestamp, targetOffsets, visualScaleMultiplier
    };
  }

  recordBallResult(result: { type: "hit"; event: BallHitEvent } | { type: "miss"; event: BallMissEvent }): void {
    if (this.recording) this.recording.gameplay.result = result;
  }
}

export function serializeFrame(frame: NormalizedSensorFrame): RecordedMotionFrame {
  return {
    timestamp: frame.timestamp,
    sensorTimestamp: frame.sensorTimestamp,
    deltaTime: frame.deltaTime,
    currentPhoneQuaternion: frame.currentPhoneQuaternion.toArray(),
    relativePhoneQuaternion: frame.relativePhoneQuaternion.toArray(),
    mappedRacketQuaternion: frame.mappedRacketQuaternion.toArray(),
    angularVelocityLocal: frame.angularVelocityLocal.toArray(),
    angularVelocityWorld: frame.angularVelocityWorld.toArray(),
    angularSpeed: frame.angularSpeed,
    rawAcceleration: frame.rawAcceleration.toArray(),
    accelerationIncludingGravity: frame.accelerationIncludingGravity.toArray(),
    gravityCompensatedAcceleration: frame.gravityCompensatedAcceleration.toArray(),
    smoothedAcceleration: frame.smoothedAcceleration.toArray(),
    fastAcceleration: frame.fastAcceleration.toArray(),
    accelerationMagnitude: frame.accelerationMagnitude,
    jerk: frame.jerk,
    racketForwardVector: frame.racketForwardVector.toArray(),
    racketUpVector: frame.racketUpVector.toArray(),
    racketSideVector: frame.racketSideVector.toArray(),
    racketFaceNormal: frame.racketFaceNormal.toArray(),
    racketFaceAngleToCourtRadians: frame.racketFaceAngleToCourtRadians,
    motionForwardScore: frame.motionForwardScore,
    motionUpwardScore: frame.motionUpwardScore,
    motionSidewaysScore: frame.motionSidewaysScore,
    valid: frame.valid,
    rejectionReason: frame.rejectionReason
  };
}

export function deserializeFrame(frame: RecordedMotionFrame): NormalizedSensorFrame {
  return {
    timestamp: frame.timestamp,
    sensorTimestamp: frame.sensorTimestamp,
    deltaTime: frame.deltaTime,
    currentPhoneQuaternion: quaternion(frame.currentPhoneQuaternion),
    relativePhoneQuaternion: quaternion(frame.relativePhoneQuaternion),
    mappedRacketQuaternion: quaternion(frame.mappedRacketQuaternion),
    angularVelocityLocal: vector(frame.angularVelocityLocal),
    angularVelocityWorld: vector(frame.angularVelocityWorld),
    angularSpeed: frame.angularSpeed,
    rawAcceleration: vector(frame.rawAcceleration),
    accelerationIncludingGravity: vector(frame.accelerationIncludingGravity),
    gravityCompensatedAcceleration: vector(frame.gravityCompensatedAcceleration),
    smoothedAcceleration: vector(frame.smoothedAcceleration),
    fastAcceleration: vector(frame.fastAcceleration),
    accelerationMagnitude: frame.accelerationMagnitude,
    jerk: frame.jerk,
    racketForwardVector: vector(frame.racketForwardVector),
    racketUpVector: vector(frame.racketUpVector),
    racketSideVector: vector(frame.racketSideVector),
    racketFaceNormal: vector(frame.racketFaceNormal),
    racketFaceAngleToCourtRadians: frame.racketFaceAngleToCourtRadians,
    motionForwardScore: frame.motionForwardScore,
    motionUpwardScore: frame.motionUpwardScore,
    motionSidewaysScore: frame.motionSidewaysScore,
    valid: frame.valid,
    rejectionReason: frame.rejectionReason
  };
}

function vector(values: number[]): THREE.Vector3 {
  return new THREE.Vector3(values[0], values[1], values[2]);
}

function quaternion(values: number[]): THREE.Quaternion {
  return new THREE.Quaternion(values[0], values[1], values[2], values[3]);
}
