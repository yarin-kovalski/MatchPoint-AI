import * as THREE from "three";
import { MOTION_CONFIG } from "./motionConfig.js";
import {
  ensureQuaternionContinuity,
  isFiniteQuaternion,
  isFiniteVector,
  smoothVector
} from "./motionFiltering.js";
import { getRacketBasisFromQuaternion, RacketBasis } from "./racketBasis.js";

export type SensorNormalizationInput = {
  timestamp: number;
  sensorTimestamp: number;
  currentPhoneQuaternion: THREE.Quaternion;
  relativePhoneQuaternion: THREE.Quaternion;
  mappedRacketQuaternion: THREE.Quaternion;
  /** Expo rotationRate, mapped to phone X/Y/Z and converted from deg/s to rad/s. */
  angularVelocityPhoneRadPerSecond?: THREE.Vector3;
  sensorToWorldQuaternion?: THREE.Quaternion;
  accelerationMps2: THREE.Vector3;
  accelerationIncludingGravityMps2: THREE.Vector3;
};

export type NormalizedSensorFrame = {
  timestamp: number;
  sensorTimestamp: number;
  deltaTime: number;
  currentPhoneQuaternion: THREE.Quaternion;
  relativePhoneQuaternion: THREE.Quaternion;
  mappedRacketQuaternion: THREE.Quaternion;
  angularVelocityLocal: THREE.Vector3;
  angularVelocityWorld: THREE.Vector3;
  angularSpeed: number;
  rawAcceleration: THREE.Vector3;
  accelerationIncludingGravity: THREE.Vector3;
  gravityCompensatedAcceleration: THREE.Vector3;
  smoothedAcceleration: THREE.Vector3;
  fastAcceleration: THREE.Vector3;
  accelerationMagnitude: number;
  jerk: number;
  racketForwardVector: THREE.Vector3;
  racketUpVector: THREE.Vector3;
  racketSideVector: THREE.Vector3;
  racketFaceNormal: THREE.Vector3;
  racketFaceAngleToCourtRadians: number;
  motionForwardScore: number;
  motionUpwardScore: number;
  motionSidewaysScore: number;
  valid: boolean;
  rejectionReason: string;
};

export class SensorNormalizer {
  private previousTimestamp: number | null = null;
  private previousQuaternion: THREE.Quaternion | null = null;
  private readonly smoothedAcceleration = new THREE.Vector3();
  private readonly fastAcceleration = new THREE.Vector3();
  private readonly previousSmoothedAcceleration = new THREE.Vector3();
  private hasAccelerationHistory = false;

  process(input: SensorNormalizationInput): NormalizedSensorFrame {
    const rawDeltaMs = this.previousTimestamp === null
      ? MOTION_CONFIG.timing.nominalDeltaMs
      : input.timestamp - this.previousTimestamp;
    const packetGapInvalid =
      rawDeltaMs <= 0 || rawDeltaMs > MOTION_CONFIG.timing.invalidGapMs;
    const deltaMs = THREE.MathUtils.clamp(
      rawDeltaMs || MOTION_CONFIG.timing.nominalDeltaMs,
      MOTION_CONFIG.timing.minimumDeltaMs,
      MOTION_CONFIG.timing.maximumDeltaMs
    );
    const deltaTime = deltaMs / 1000;

    const currentQuaternion = input.currentPhoneQuaternion.clone();
    const quaternionLength = currentQuaternion.length();
    let rejectionReason = "";

    if (
      !isFiniteQuaternion(currentQuaternion) ||
      quaternionLength < MOTION_CONFIG.validation.minimumQuaternionLength ||
      quaternionLength > MOTION_CONFIG.validation.maximumQuaternionLength
    ) {
      rejectionReason = "invalid quaternion";
      currentQuaternion.identity();
    } else {
      currentQuaternion.normalize();
      ensureQuaternionContinuity(currentQuaternion, this.previousQuaternion);
    }

    const rawAcceleration = phoneVectorToThreeVector(input.accelerationMps2);
    // Expo's `acceleration` has gravity removed, but remains in phone-local
    // coordinates. Rotate it by the calibrated relative phone pose before any
    // tennis-direction scoring. The racket model correction is deliberately not
    // used here: it aligns mesh axes and is not part of the accelerometer frame.
    const worldLinearAcceleration = rawAcceleration.clone()
      .applyQuaternion(input.sensorToWorldQuaternion ?? input.relativePhoneQuaternion);
    const accelerationIncludingGravity = phoneVectorToThreeVector(
      input.accelerationIncludingGravityMps2
    ).applyQuaternion(input.sensorToWorldQuaternion ?? input.relativePhoneQuaternion);
    const accelerationInvalid =
      !isFiniteVector(rawAcceleration) ||
      rawAcceleration.length() > MOTION_CONFIG.validation.maximumAccelerationMps2;

    if (!rejectionReason && accelerationInvalid) {
      rejectionReason = "invalid acceleration";
      rawAcceleration.set(0, 0, 0);
    }

    const angularVelocityLocal = new THREE.Vector3();
    let angularSpeed = 0;

    if (this.previousQuaternion && !rejectionReason && !packetGapInvalid) {
      const deltaQuaternion = this.previousQuaternion.clone().invert().multiply(currentQuaternion);
      if (deltaQuaternion.w < 0) {
        deltaQuaternion.set(
          -deltaQuaternion.x,
          -deltaQuaternion.y,
          -deltaQuaternion.z,
          -deltaQuaternion.w
        );
      }
      deltaQuaternion.normalize();
      const angle = 2 * Math.acos(THREE.MathUtils.clamp(deltaQuaternion.w, -1, 1));
      const sineHalfAngle = Math.sqrt(Math.max(0, 1 - deltaQuaternion.w ** 2));
      angularSpeed = angle / deltaTime;

      if (sineHalfAngle > 0.0001) {
        angularVelocityLocal
          .set(deltaQuaternion.x, deltaQuaternion.y, deltaQuaternion.z)
          .multiplyScalar(angularSpeed / sineHalfAngle);
      }

      if (angularSpeed > MOTION_CONFIG.validation.maximumAngularSpeedRadPerSecond) {
        rejectionReason = "impossible rotation spike";
      }
    }

    const gyro = input.angularVelocityPhoneRadPerSecond;
    if (gyro && isFiniteVector(gyro) && gyro.lengthSq() > 1e-8 &&
        gyro.length() <= MOTION_CONFIG.validation.maximumAngularSpeedRadPerSecond && !packetGapInvalid) {
      angularVelocityLocal.copy(gyro);
      angularSpeed = gyro.length();
    }

    if (packetGapInvalid && this.previousTimestamp !== null) {
      rejectionReason = "packet gap";
    }

    this.previousSmoothedAcceleration.copy(this.smoothedAcceleration);
    smoothVector(
      this.smoothedAcceleration,
      worldLinearAcceleration,
      this.hasAccelerationHistory ? MOTION_CONFIG.smoothing.acceleration : 1
    );
    smoothVector(
      this.fastAcceleration,
      worldLinearAcceleration,
      this.hasAccelerationHistory ? MOTION_CONFIG.smoothing.fastAcceleration : 1
    );
    const jerk = this.hasAccelerationHistory
      ? this.smoothedAcceleration.distanceTo(this.previousSmoothedAcceleration) / deltaTime
      : 0;
    this.hasAccelerationHistory = true;

    const angularVelocityWorld = input.sensorToWorldQuaternion
      ? phoneVectorToThreeVector(angularVelocityLocal).applyQuaternion(input.sensorToWorldQuaternion)
      : angularVelocityLocal.clone().applyQuaternion(input.mappedRacketQuaternion);
    const basis = getRacketBasisFromQuaternion(input.mappedRacketQuaternion);
    const scoreScale = MOTION_CONFIG.scoring.referenceAccelerationMps2;

    const frame: NormalizedSensorFrame = {
      timestamp: input.timestamp,
      sensorTimestamp: input.sensorTimestamp,
      deltaTime,
      currentPhoneQuaternion: currentQuaternion,
      relativePhoneQuaternion: input.relativePhoneQuaternion.clone().normalize(),
      mappedRacketQuaternion: input.mappedRacketQuaternion.clone().normalize(),
      angularVelocityLocal,
      angularVelocityWorld,
      angularSpeed,
      rawAcceleration,
      accelerationIncludingGravity,
      gravityCompensatedAcceleration: worldLinearAcceleration.clone(),
      smoothedAcceleration: this.smoothedAcceleration.clone(),
      fastAcceleration: this.fastAcceleration.clone(),
      accelerationMagnitude: this.fastAcceleration.length(),
      jerk,
      racketForwardVector: basis.forward,
      racketUpVector: basis.up,
      racketSideVector: basis.side,
      racketFaceNormal: basis.faceNormal,
      racketFaceAngleToCourtRadians: basis.faceAngleToCourtRadians,
      motionForwardScore: scoreVector(this.smoothedAcceleration, new THREE.Vector3(0, 0, -1), scoreScale),
      motionUpwardScore: scoreVector(this.smoothedAcceleration, new THREE.Vector3(0, 1, 0), scoreScale),
      motionSidewaysScore: scoreVector(this.smoothedAcceleration, new THREE.Vector3(1, 0, 0), scoreScale),
      valid: rejectionReason === "",
      rejectionReason
    };

    this.previousTimestamp = input.timestamp;
    if (frame.valid) {
      this.previousQuaternion = currentQuaternion.clone();
    } else if (rejectionReason === "impossible rotation spike") {
      // Reject this sample for analytics, but do not compare every subsequent
      // packet to an old pose over a single-packet dt (which latches rejection).
      this.previousQuaternion = currentQuaternion.clone();
    } else if (packetGapInvalid) {
      this.previousQuaternion = null;
    }

    return frame;
  }

  reset(): void {
    this.previousTimestamp = null;
    this.previousQuaternion = null;
    this.smoothedAcceleration.set(0, 0, 0);
    this.fastAcceleration.set(0, 0, 0);
    this.previousSmoothedAcceleration.set(0, 0, 0);
    this.hasAccelerationHistory = false;
  }
}

export function phoneVectorToThreeVector(value: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(value.x, value.z, -value.y);
}

function scoreVector(value: THREE.Vector3, direction: THREE.Vector3, scale: number): number {
  return THREE.MathUtils.clamp(value.dot(direction) / scale, -1, 1);
}

export function getRacketBasis(frame: NormalizedSensorFrame): RacketBasis {
  return {
    forward: frame.racketForwardVector.clone(),
    up: frame.racketUpVector.clone(),
    side: frame.racketSideVector.clone(),
    faceNormal: frame.racketFaceNormal.clone(),
    faceAngleToCourtRadians: frame.racketFaceAngleToCourtRadians
  };
}
