import * as THREE from "three";
import { PhysicalImpactResolution, PhysicalSpinType } from "../ball/contactRealism.js";

export type PowerLevel = "Weak" | "Medium" | "Strong" | "Very Strong";
export type LaunchTendency = "Low" | "Neutral" | "High";
export type ShotShape = "FLAT" | "TOPSPIN" | "SLICE" | "SIDE_SPIN" | "MIXED";

export type ContactFeatureSnapshot = {
  timestamp: number;
  peakAngularSpeed: number;
  meanAngularSpeed: number;
  peakAcceleration: number;
  meanAcceleration: number;
  jerk: number;
  forwardScore: number;
  upwardScore: number;
  sidewaysScore: number;
  racketFaceAngle: number;
  racketFaceNormal: [number, number, number];
  swingPathAngle: number;
  brushingDirection: [number, number, number];
  contactPointVelocity: [number, number, number];
  estimatedContactSpeed: number;
  preContactOrientationDelta: number;
  postContactFollowThrough: [number, number, number];
  powerScore: number;
  powerLevel: PowerLevel;
  shotShape: ShotShape;
  launchTendency: LaunchTendency;
};

export function continuousPowerScore(contactPointSpeed: number): number {
  return THREE.MathUtils.smoothstep(contactPointSpeed, 1.2, 8.5);
}

export function powerLevel(score: number): PowerLevel {
  return score < 0.25 ? "Weak" : score < 0.55 ? "Medium" : score < 0.82 ? "Strong" : "Very Strong";
}

export function shotShape(spinType: PhysicalSpinType): ShotShape {
  return spinType === "MIXED_SPIN" ? "MIXED" : spinType;
}

export function launchTendency(outgoingVelocity: THREE.Vector3): LaunchTendency {
  const horizontal = Math.hypot(outgoingVelocity.x, outgoingVelocity.z);
  const angle = Math.atan2(outgoingVelocity.y, Math.max(0.001, horizontal));
  return angle < 0.25 ? "Low" : angle > 0.55 ? "High" : "Neutral";
}

export function featureSnapshotFromImpact(
  timestamp: number,
  impact: PhysicalImpactResolution,
  sensor: {
    peakAngularSpeed: number;
    meanAngularSpeed?: number;
    peakAcceleration: number;
    meanAcceleration?: number;
    jerk: number;
    forwardScore: number;
    upwardScore: number;
    sidewaysScore: number;
    preContactOrientationDelta?: number;
    postContactFollowThrough?: THREE.Vector3;
  }
): ContactFeatureSnapshot {
  const score = impact.powerScore;
  return Object.freeze({
    timestamp,
    peakAngularSpeed: sensor.peakAngularSpeed,
    meanAngularSpeed: sensor.meanAngularSpeed ?? sensor.peakAngularSpeed,
    peakAcceleration: sensor.peakAcceleration,
    meanAcceleration: sensor.meanAcceleration ?? sensor.peakAcceleration,
    jerk: sensor.jerk,
    forwardScore: sensor.forwardScore,
    upwardScore: sensor.upwardScore,
    sidewaysScore: sensor.sidewaysScore,
    racketFaceAngle: impact.faceAngleRadians,
    racketFaceNormal: impact.contactNormal.toArray(),
    swingPathAngle: impact.swingPathAngleRadians,
    brushingDirection: impact.tangentialImpulse.clone().normalize().toArray(),
    contactPointVelocity: impact.racketContactPointVelocity.toArray(),
    estimatedContactSpeed: impact.racketContactPointVelocity.length(),
    preContactOrientationDelta: sensor.preContactOrientationDelta ?? 0,
    postContactFollowThrough: (sensor.postContactFollowThrough ?? new THREE.Vector3()).toArray(),
    powerScore: score,
    powerLevel: powerLevel(score),
    shotShape: shotShape(impact.spinType),
    launchTendency: launchTendency(impact.outgoingVelocity)
  });
}
