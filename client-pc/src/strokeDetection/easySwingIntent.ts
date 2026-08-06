import * as THREE from "three";
import { BALL_CONFIG } from "../ball/ballConfig.js";
import { StrokeType } from "./strokeTypes.js";

export type EasySwingIntentInput = {
  timestamp: number;
  valid: boolean;
  angularSpeed: number;
  accelerationMagnitude: number;
  forwardScore: number;
  preparationScore: number;
  racketFaceAngle: number;
};

export type EasySwingIntentSnapshot = {
  active: boolean;
  confidence: number;
  strokeType: Exclude<StrokeType, "unknown">;
  startedAt: number;
  peakAt: number;
  peakAngularSpeed: number;
  expiresAt: number;
};

export class EasySwingIntentDetector {
  private snapshot: EasySwingIntentSnapshot | null = null;

  update(input: EasySwingIntentInput, strokeType: Exclude<StrokeType, "unknown">): EasySwingIntentSnapshot {
    const config = BALL_CONFIG.easySwingIntent;
    const speedEvidence = inverseLerp(config.stationaryAngularCeiling, config.fullSwingAngularSpeed, input.angularSpeed);
    const accelerationEvidence = inverseLerp(config.stationaryAccelerationCeiling, config.fullSwingAcceleration, input.accelerationMagnitude);
    const forwardEvidence = inverseLerp(0.05, config.fullSwingForwardScore, input.forwardScore);
    const preparationEvidence = inverseLerp(0.25, config.fullSwingPreparationScore, input.preparationScore);
    const confidence = THREE.MathUtils.clamp(
      speedEvidence * 0.38 + accelerationEvidence * 0.22 +
      Math.max(forwardEvidence, preparationEvidence) * 0.4,
      0,
      1
    );
    const qualifies = input.valid &&
      input.angularSpeed >= config.minimumAngularSpeed &&
      input.accelerationMagnitude >= config.minimumAcceleration &&
      (input.forwardScore >= config.minimumForwardScore || input.preparationScore >= config.minimumPreparationScore) &&
      input.racketFaceAngle <= config.maximumFaceAngleRadians &&
      confidence >= config.minimumConfidence;

    if (qualifies) {
      const previous = this.snapshot?.strokeType === strokeType ? this.snapshot : null;
      this.snapshot = {
        active: true,
        confidence: Math.max(previous?.confidence ?? 0, confidence),
        strokeType,
        startedAt: previous?.startedAt ?? input.timestamp,
        peakAt: !previous || confidence >= previous.confidence ? input.timestamp : previous.peakAt,
        peakAngularSpeed: Math.max(previous?.peakAngularSpeed ?? 0, input.angularSpeed),
        expiresAt: input.timestamp + config.activeWindowMs
      };
    } else if (this.snapshot && input.timestamp > this.snapshot.expiresAt) {
      this.snapshot = { ...this.snapshot, active: false };
    }

    return this.getSnapshot(input.timestamp, strokeType);
  }

  getSnapshot(timestamp: number, strokeType: Exclude<StrokeType, "unknown">): EasySwingIntentSnapshot {
    if (!this.snapshot || this.snapshot.strokeType !== strokeType) {
      return { active: false, confidence: 0, strokeType, startedAt: 0, peakAt: 0, peakAngularSpeed: 0, expiresAt: 0 };
    }
    return { ...this.snapshot, active: this.snapshot.active && timestamp <= this.snapshot.expiresAt };
  }

  reset(): void { this.snapshot = null; }
}

function inverseLerp(minimum: number, maximum: number, value: number): number {
  return THREE.MathUtils.clamp((value - minimum) / Math.max(maximum - minimum, 1e-6), 0, 1);
}
