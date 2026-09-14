import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import type { EasyHitMotion } from "./ballTypes.js";
import { predictReturnTrajectory } from "./ballResponse.js";
import type { PhysicalSpinType } from "./contactRealism.js";
export { isReturnInCourt } from "./courtRules.js";

/** Sensor-driven launch model, evaluated once at contact. No landing target. */
export function solveTrainingReturn(start: THREE.Vector3, motion: EasyHitMotion) {
  const fused = motion.forwardSwing;
  const angularSpeed = fused?.angularSpeed ?? motion.angularSpeed;
  const forwardSpeed = Math.max(0, fused?.forwardRacketHeadVelocity ?? angularSpeed * 0.68);
  const forwardAcceleration = Math.max(0, fused?.forwardAcceleration ?? motion.motionForwardScore * 12);
  const headSpeed = 0.65 * forwardSpeed + 0.35 * angularSpeed * 0.68 + forwardAcceleration * 0.045;
  const power = THREE.MathUtils.smoothstep(headSpeed, 0.6, 8);
  const verticalPath = THREE.MathUtils.clamp(
    (fused?.upwardRacketHeadVelocity ?? 0) / Math.max(2, forwardSpeed) * 0.85 +
    (motion.motionUpwardScore ?? 0) * (fused ? 0.2 : 0.8) + (fused?.upwardAcceleration ?? 0) / 80, -1, 1);
  const lateralSpeed = fused?.lateralRacketHeadVelocity ?? (motion.motionSidewaysScore ?? 0) * 4;
  const lateralAcceleration = fused?.lateralAcceleration ?? (motion.motionSidewaysScore ?? 0) * 12;
  const face = motion.racketFaceNormal.clone().normalize();
  // Strings are two-sided; choose the normal facing the opponent.
  if (face.z > 0) face.negate();
  const faceYaw = Math.atan2(face.x, Math.max(0.15, -face.z));
  const pathYaw = Math.atan2(lateralSpeed, Math.max(1, forwardSpeed));
  const yaw = THREE.MathUtils.clamp((faceYaw * 0.6 + pathYaw * 0.5 + lateralAcceleration * 0.012) * 0.9, -1.2, 1.2);
  const direction = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
  const brush = Math.sign(verticalPath) * Math.max(0, Math.abs(verticalPath) - 0.12) / 0.88;
  const sideBrush = THREE.MathUtils.clamp((pathYaw - faceYaw) * 0.6 + lateralAcceleration / 80, -1, 1);
  // Backspin lift otherwise nearly cancels gravity with the demo's Magnus gain.
  // Keep a continuous slice response while retaining a low, slower launch.
  const brushSpin = brush * (18 + 42 * power) * (brush < 0 ? 0.45 : 1);
  const spin = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction)
    .multiplyScalar(brushSpin);
  spin.y += sideBrush * (8 + 22 * power);
  const spinType: PhysicalSpinType = spin.length() < 4 ? "FLAT"
    : Math.abs(spin.y) > Math.abs(brushSpin) * 1.5 ? "SIDE_SPIN"
      : Math.abs(brushSpin) > Math.abs(spin.y) * 1.5 ? brush > 0 ? "TOPSPIN" : "SLICE" : "MIXED_SPIN";
  const horizontalSpeed = (5 + 17 * power) * (1 - Math.max(0, -brush) * 0.3);
  const angle = THREE.MathUtils.degToRad(20 + Math.max(0, verticalPath) * 16 +
    Math.min(0, verticalPath) * 5 + THREE.MathUtils.clamp(face.y, -0.7, 0.7) * 24);
  const rawVelocity = direction.clone().multiplyScalar(horizontalSpeed);
  rawVelocity.y = Math.tan(angle) * horizontalSpeed;
  rawVelocity.clampLength(0, BALL_CONFIG.contactRealism.maximumOutgoingSpeed);
  const velocity = rawVelocity.clone();
  const rawPrediction = predictReturnTrajectory(start, velocity, spin);
  // Help marginal net clearance only; never adjust power, lateral aim or depth.
  const crossing = rawPrediction.netCrossingPoint;
  if (crossing && crossing.y < BALL_CONFIG.launch.netHeight + 0.15) {
    const seconds = (BALL_CONFIG.launch.netDepth - start.z) / velocity.z;
    velocity.y += THREE.MathUtils.clamp((BALL_CONFIG.launch.netHeight + 0.15 - crossing.y) / seconds, 0, 0.6);
  }
  velocity.clampLength(0, BALL_CONFIG.contactRealism.maximumOutgoingSpeed);
  return { velocity, rawVelocity, spin, spinType, power, verticalPath, headSpeed,
    rawPrediction, prediction: predictReturnTrajectory(start, velocity, spin) };
}
