import * as THREE from "three";
import type { PlayerBasisData } from "../ball/trajectoryCalibration.js";
import type { NormalizedSensorFrame } from "./sensorNormalization.js";

export type InvalidDirectionReason =
  | "NONE"
  | "NO_FORWARD_INTENT"
  | "FACE_TOO_SIDEWAYS"
  | "LATERAL_SWING_DOMINANT"
  | "BACKWARD_SWING"
  | "OFF_CENTER_DIRECTION_LOSS";

export type ForwardSwingSnapshot = {
  windowDurationMs: number;
  sampleCount: number;
  forwardAcceleration: number;
  upwardAcceleration: number;
  lateralAcceleration: number;
  peakForwardAcceleration: number;
  racketHeadVelocityWorld: THREE.Vector3;
  forwardRacketHeadVelocity: number;
  upwardRacketHeadVelocity: number;
  lateralRacketHeadVelocity: number;
  angularSpeed: number;
  faceAngleRadians: number;
  forwardDriveScore: number;
  invalidDirectionReason: InvalidDirectionReason;
};

const WINDOW_MS = 180;
const HISTORY_MS = 300;
const HEAD_RADIUS_METERS = 0.68;

export class ForwardSwingFusion {
  private readonly frames: NormalizedSensorFrame[] = [];

  add(frame: NormalizedSensorFrame): void {
    if (!frame.valid) return;
    this.frames.push(frame);
    const cutoff = frame.timestamp - HISTORY_MS;
    while (this.frames.length && this.frames[0].timestamp < cutoff) this.frames.shift();
  }

  snapshot(contactTimestamp: number, basisData: PlayerBasisData): ForwardSwingSnapshot | null {
    const frames = this.frames.filter(frame =>
      frame.timestamp >= contactTimestamp - WINDOW_MS && frame.timestamp <= contactTimestamp
    );
    if (!frames.length) return null;
    const forward = new THREE.Vector3().fromArray(basisData.forward).normalize();
    const up = new THREE.Vector3().fromArray(basisData.up).normalize();
    const right = new THREE.Vector3().fromArray(basisData.right).normalize();
    let forwardAcceleration = 0;
    let upwardAcceleration = 0;
    let lateralAcceleration = 0;
    let peakForwardAcceleration = 0;
    let angularSpeed = 0;
    let faceAngle = 0;
    const headVelocity = new THREE.Vector3();

    for (const frame of frames) {
      const acceleration = frame.smoothedAcceleration;
      const radius = frame.racketForwardVector.clone().multiplyScalar(HEAD_RADIUS_METERS);
      const instantaneousHeadVelocity = new THREE.Vector3()
        .crossVectors(frame.angularVelocityWorld, radius);
      forwardAcceleration += acceleration.dot(forward);
      upwardAcceleration += acceleration.dot(up);
      lateralAcceleration += acceleration.dot(right);
      peakForwardAcceleration = Math.max(peakForwardAcceleration, acceleration.dot(forward));
      angularSpeed += frame.angularSpeed;
      faceAngle += frame.racketFaceAngleToCourtRadians;
      headVelocity.add(instantaneousHeadVelocity);
    }
    const count = frames.length;
    forwardAcceleration /= count;
    upwardAcceleration /= count;
    lateralAcceleration /= count;
    angularSpeed /= count;
    faceAngle /= count;
    headVelocity.divideScalar(count);
    const headForward = headVelocity.dot(forward);
    const headUp = headVelocity.dot(up);
    const headLateral = headVelocity.dot(right);
    const forwardDriveScore = THREE.MathUtils.clamp(
      0.42 * THREE.MathUtils.clamp(headForward / 8, -1, 1) +
      0.24 * THREE.MathUtils.clamp(peakForwardAcceleration / 12, -1, 1) +
      0.14 * THREE.MathUtils.clamp(forwardAcceleration / 8, -1, 1) +
      0.12 * THREE.MathUtils.clamp(angularSpeed / 12, 0, 1) +
      0.08 * THREE.MathUtils.clamp(1 - faceAngle / (Math.PI / 2), 0, 1),
      -1, 1
    );
    let invalidDirectionReason: InvalidDirectionReason = "NONE";
    if (forwardAcceleration < -1.2 && headForward <= 0) invalidDirectionReason = "BACKWARD_SWING";
    else if (faceAngle > THREE.MathUtils.degToRad(65)) invalidDirectionReason = "FACE_TOO_SIDEWAYS";
    else if (Math.abs(headLateral) > Math.max(1.2, headForward * 1.5)) invalidDirectionReason = "LATERAL_SWING_DOMINANT";
    else if (forwardDriveScore < 0.16) invalidDirectionReason = "NO_FORWARD_INTENT";

    return {
      windowDurationMs: Math.max(0, frames[count - 1].timestamp - frames[0].timestamp),
      sampleCount: count,
      forwardAcceleration, upwardAcceleration, lateralAcceleration,
      peakForwardAcceleration, racketHeadVelocityWorld: headVelocity,
      forwardRacketHeadVelocity: headForward, upwardRacketHeadVelocity: headUp,
      lateralRacketHeadVelocity: headLateral, angularSpeed, faceAngleRadians: faceAngle,
      forwardDriveScore, invalidDirectionReason
    };
  }

  reset(): void { this.frames.length = 0; }
}
