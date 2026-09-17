import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import type { EasyHitMotion } from "./ballTypes.js";
import { predictReturnTrajectory } from "./ballResponse.js";
import type { PhysicalSpinType } from "./contactRealism.js";
import type { SpinType } from "../strokeDetection/strokeTypes.js";
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
  const brush = Math.sign(verticalPath) * Math.max(0, Math.abs(verticalPath) - 0.06) / 0.94;
  const sideBrush = THREE.MathUtils.clamp((pathYaw - faceYaw) * 0.6 + lateralAcceleration / 80, -1, 1);
  // Backspin lift otherwise nearly cancels gravity with the demo's Magnus gain.
  // Keep a continuous slice response while retaining a low, slower launch.
  const brushSpin = brush * (24 + 52 * power) * (brush < 0 ? 0.55 : 1);
  const spin = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction)
    .multiplyScalar(brushSpin);
  spin.y += sideBrush * (8 + 22 * power);
  const spinType: PhysicalSpinType = spin.length() < 4 ? "FLAT"
    : Math.abs(spin.y) > Math.abs(brushSpin) * 1.5 ? "SIDE_SPIN"
      : Math.abs(brushSpin) > Math.abs(spin.y) * 1.5 ? brush > 0 ? "TOPSPIN" : "SLICE" : "MIXED_SPIN";
  // A phone is held at the racket handle and reports much less translational
  // speed than a real racket head. Slice also stays airborne under backspin,
  // so compress its forward transfer to keep an ordinary 25 km/h phone swing
  // playable while preserving deeper and long outcomes for faster swings.
  const measuredHorizontalSpeed = (5 + 17 * power) * (1 - Math.max(0, -brush) * 0.67);
  // A deliberate high-to-low swing should produce a playable slice even when
  // the phone reports modest handle speed. Preserve measured variation above
  // this floor; it only prevents soft slices from dying before the net.
  let horizontalSpeed = spinType === "SLICE"
    ? Math.max(measuredHorizontalSpeed, 9.8)
    : measuredHorizontalSpeed;
  const calibratedSliceIntent = spinType === "SLICE" ? motion.calibratedSliceIntent : undefined;
  // Face pitch is the primary launch-angle control: an open face raises the
  // arc and a closed face drives it lower. Swing path still adds topspin/slice
  // shape independently, so two strokes with the same face need not fly alike.
  const faceOpenDegrees = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(face.y, -0.82, 0.82)));
  const measuredLaunchAngleDegrees = THREE.MathUtils.clamp(
    18 + faceOpenDegrees * 0.72 + Math.max(0, verticalPath) * 15 + Math.min(0, verticalPath) * 6,
    4,
    50
  );
  // Slice keeps the face-angle relationship, with a small Training floor so a
  // closed phone face does not drive every backspin shot into the net.
  let launchAngleDegrees = spinType === "SLICE"
    ? Math.max(12, measuredLaunchAngleDegrees)
    : measuredLaunchAngleDegrees;
  const angle = THREE.MathUtils.degToRad(launchAngleDegrees);
  const rawVelocity = direction.clone().multiplyScalar(horizontalSpeed);
  rawVelocity.y = Math.tan(angle) * horizontalSpeed;
  rawVelocity.clampLength(0, BALL_CONFIG.contactRealism.maximumOutgoingSpeed);
  const rawPrediction = predictReturnTrajectory(start, rawVelocity, spin);
  const calibrated = calibratedSliceIntent
    ? solveCalibratedSliceVelocity(start, direction, spin, calibratedSliceIntent, horizontalSpeed, launchAngleDegrees)
    : null;
  const velocity = calibrated?.velocity ?? rawVelocity.clone();
  if (calibrated) {
    horizontalSpeed = calibrated.horizontalSpeed;
    launchAngleDegrees = calibrated.launchAngleDegrees;
  }
  // Help marginal net clearance. Slice permits a larger vertical-only correction
  // because phone face noise otherwise makes the entire shot family unplayable.
  const crossing = predictReturnTrajectory(start, velocity, spin).netCrossingPoint;
  if (crossing && crossing.y < BALL_CONFIG.launch.netHeight + 0.15) {
    const seconds = (BALL_CONFIG.launch.netDepth - start.z) / velocity.z;
    const maximumLiftCorrection = spinType === "SLICE" ? 2.2 : 0.6;
    velocity.y += THREE.MathUtils.clamp(
      (BALL_CONFIG.launch.netHeight + 0.15 - crossing.y) / seconds,
      0,
      maximumLiftCorrection
    );
  }
  velocity.clampLength(0, BALL_CONFIG.contactRealism.maximumOutgoingSpeed);
  return { velocity, rawVelocity, spin, spinType, power, verticalPath, headSpeed,
    faceOpenDegrees, launchAngleDegrees, calibratedSliceIntent,
    rawPrediction, prediction: predictReturnTrajectory(start, velocity, spin) };
}

function solveCalibratedSliceVelocity(
  start: THREE.Vector3,
  direction: THREE.Vector3,
  spin: THREE.Vector3,
  intent: "drop" | "deep",
  measuredHorizontalSpeed: number,
  measuredLaunchAngleDegrees: number
): { velocity: THREE.Vector3; horizontalSpeed: number; launchAngleDegrees: number } {
  const config = BALL_CONFIG.calibratedSlice;
  const targetDepth = intent === "drop" ? config.dropDepthPastNetMeters : config.deepDepthPastNetMeters;
  const targetZ = BALL_CONFIG.launch.netDepth - targetDepth;
  const speedRange = intent === "drop" ? config.dropSpeedRange : config.deepSpeedRange;
  const angleCenter = intent === "drop"
    ? THREE.MathUtils.clamp(measuredLaunchAngleDegrees, 12, 19)
    : THREE.MathUtils.clamp(measuredLaunchAngleDegrees, 13, 21);
  let best: { velocity: THREE.Vector3; horizontalSpeed: number; launchAngleDegrees: number; score: number } | null = null;

  for (let angleOffset = -3; angleOffset <= 3; angleOffset += 1) {
    const candidateAngle = angleCenter + angleOffset;
    let low: number = speedRange[0], high: number = speedRange[1];
    for (let iteration = 0; iteration < 14; iteration += 1) {
      const candidateSpeed = (low + high) / 2;
      const candidate = direction.clone().multiplyScalar(candidateSpeed);
      candidate.y = Math.tan(THREE.MathUtils.degToRad(candidateAngle)) * candidateSpeed;
      candidate.clampLength(0, BALL_CONFIG.contactRealism.maximumOutgoingSpeed);
      const prediction = predictReturnTrajectory(start, candidate, spin);
      const bounce = prediction.bouncePoint;
      const crossing = prediction.netCrossingPoint;
      if (!bounce) { low = candidateSpeed; continue; }
      const clearance = crossing
        ? crossing.y - BALL_CONFIG.launch.netHeight - BALL_CONFIG.scale.physicalRadiusMeters
        : -1;
      const netPenalty = Math.max(0, config.minimumNetClearanceMeters - clearance) * 35;
      const sensorPenalty = Math.abs(candidateAngle - angleCenter) * 0.025 +
        Math.abs(candidateSpeed - measuredHorizontalSpeed) * 0.012;
      const score = Math.abs(bounce.z - targetZ) + netPenalty + sensorPenalty;
      if (!best || score < best.score) {
        best = { velocity: candidate, horizontalSpeed: candidateSpeed, launchAngleDegrees: candidateAngle, score };
      }
      if (bounce.z > targetZ) low = candidateSpeed;
      else high = candidateSpeed;
    }
  }
  if (best) return best;
  const velocity = direction.clone().multiplyScalar(measuredHorizontalSpeed);
  velocity.y = Math.tan(THREE.MathUtils.degToRad(measuredLaunchAngleDegrees)) * measuredHorizontalSpeed;
  return { velocity, horizontalSpeed: measuredHorizontalSpeed, launchAngleDegrees: measuredLaunchAngleDegrees };
}

export function trainingFollowThroughStep(
  motion: EasyHitMotion,
  spinType: SpinType,
  elapsedMs: number,
  sensorStepSeconds: number
): { forwardSpeedDelta: number; signedSpinDelta: number; continuity: number } {
  const config = BALL_CONFIG.trainingFollowThrough;
  if (!motion.valid || elapsedMs < 0 || elapsedMs > config.measurementWindowMs ||
      sensorStepSeconds <= 0 || motion.angularSpeed < config.minimumAngularSpeed) {
    return { forwardSpeedDelta: 0, signedSpinDelta: 0, continuity: 0 };
  }
  const speedEvidence = THREE.MathUtils.smoothstep(
    motion.angularSpeed, config.minimumAngularSpeed, config.fullAngularSpeed
  );
  const intentEvidence = THREE.MathUtils.clamp(
    Math.max(0, motion.motionForwardScore) * 0.55 +
    Math.abs(motion.motionUpwardScore ?? 0) * 0.3 + 0.15,
    0,
    1
  );
  const windowTaper = 1 - THREE.MathUtils.smoothstep(
    elapsedMs, config.measurementWindowMs * 0.55, config.measurementWindowMs
  );
  const continuity = speedEvidence * intentEvidence * windowTaper;
  const seconds = Math.min(sensorStepSeconds, config.maximumSensorStepSeconds);
  const forwardAcceleration = spinType === "slice"
    ? config.sliceForwardAcceleration
    : spinType === "topspin" ? config.topspinForwardAcceleration : config.flatForwardAcceleration;
  const spinAcceleration = spinType === "slice"
    ? -config.sliceSpinAcceleration
    : spinType === "topspin" ? config.topspinSpinAcceleration : 0;
  return {
    forwardSpeedDelta: forwardAcceleration * continuity * seconds,
    signedSpinDelta: spinAcceleration * continuity * seconds,
    continuity
  };
}
