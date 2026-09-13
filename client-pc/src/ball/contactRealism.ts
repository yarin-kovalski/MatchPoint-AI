import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import { predictReturnTrajectory, ReturnTrajectoryPrediction } from "./ballResponse.js";
import type { ForwardSwingSnapshot, InvalidDirectionReason } from "../motion/forwardSwingFusion.js";

export type ContactOutcome =
  | "NO_CONTACT" | "FRAME_CONTACT" | "STRING_BLOCK" | "WEAK_CONTACT"
  | "VALID_HIT" | "TOPSPIN_HIT" | "FLAT_HIT" | "SLICE_HIT"
  | "OFF_CENTER_HIT" | "MISHIT" | "INVALID_SHOT_DIRECTION";
export type ContactLifecycle = "APPROACHING" | "CONTACT_CANDIDATE" | "IMPACT_RESOLVED" | "SEPARATING" | "CONTACT_COOLDOWN";
export type PhysicalSpinType = "TOPSPIN" | "FLAT" | "SLICE" | "SIDE_SPIN" | "MIXED_SPIN";

export type PhysicalImpactInput = {
  incomingVelocity: THREE.Vector3;
  incomingSpin: THREE.Vector3;
  contactPointWorld: THREE.Vector3;
  contactPointLocal: THREE.Vector3;
  racketPosition: THREE.Vector3;
  racketQuaternion: THREE.Quaternion;
  previousRacketPosition: THREE.Vector3;
  previousRacketQuaternion: THREE.Quaternion;
  frameSeconds: number;
  swingIntent: boolean;
  swingConfidence: number;
  sensorAngularSpeed: number;
  angularVelocityWorld?: THREE.Vector3;
  sensorAcceleration: number;
  forwardScore: number;
  upwardScore: number;
  frameContact: boolean;
  forwardSwing?: ForwardSwingSnapshot;
};

export type PhysicalImpactResolution = {
  outcome: ContactOutcome;
  outgoingVelocity: THREE.Vector3;
  outgoingAngularVelocity: THREE.Vector3;
  rawOutgoingVelocity: THREE.Vector3;
  assistedOutgoingVelocity: THREE.Vector3;
  safetyCorrection: THREE.Vector3;
  contactNormal: THREE.Vector3;
  racketUpTangent: THREE.Vector3;
  racketSideTangent: THREE.Vector3;
  racketContactPointVelocity: THREE.Vector3;
  relativeVelocity: THREE.Vector3;
  incomingNormalVelocity: number;
  incomingTangentialVelocity: THREE.Vector3;
  normalImpulse: number;
  tangentialImpulse: THREE.Vector3;
  sweetSpotDistance: number;
  contactQuality: number;
  faceAngleRadians: number;
  swingPathAngleRadians: number;
  spinType: PhysicalSpinType;
  spinRateRadiansPerSecond: number;
  racketHeadSpeed: number;
  forwardRacketHeadSpeed: number;
  upwardBrushVelocity: number;
  downwardBrushVelocity: number;
  powerScore: number;
  launchAngleRadians: number;
  predictedNetClearance: number | null;
  rawLaunchAngleRadians: number;
  rawSpin: THREE.Vector3;
  rawPrediction: ReturnTrajectoryPrediction;
  prediction: ReturnTrajectoryPrediction;
  forwardDirectionQuality: number;
  forwardDriveScore: number;
  forwardAcceleration: number;
  upwardAcceleration: number;
  lateralAcceleration: number;
  upwardRacketHeadSpeed: number;
  lateralRacketHeadSpeed: number;
  invalidDirectionReason: InvalidDirectionReason;
};

const LOCAL_FORWARD = new THREE.Vector3(0, 0, 1);
const LOCAL_UP = new THREE.Vector3(0, 1, 0);
const LOCAL_SIDE = new THREE.Vector3(1, 0, 0);
const COURT_FORWARD = new THREE.Vector3(0, 0, -1);

export function estimateRacketContactPointVelocity(input: PhysicalImpactInput): THREE.Vector3 {
  const dt = Math.max(input.frameSeconds, 1 / 240);
  const pivotVelocity = input.racketPosition.clone().sub(input.previousRacketPosition).divideScalar(dt)
    .clampLength(0, BALL_CONFIG.contactRealism.maximumInferredPivotSpeed);
  const previous = input.previousRacketQuaternion.clone();
  const current = input.racketQuaternion.clone();
  if (previous.dot(current) < 0) current.set(-current.x, -current.y, -current.z, -current.w);
  const delta = previous.invert().multiply(current).normalize();
  const angle = 2 * Math.acos(THREE.MathUtils.clamp(delta.w, -1, 1));
  const sinHalf = Math.sqrt(Math.max(0, 1 - delta.w * delta.w));
  const axis = sinHalf > 1e-6 ? new THREE.Vector3(delta.x, delta.y, delta.z).divideScalar(sinHalf) : new THREE.Vector3();
  const inferredOmega = axis.applyQuaternion(input.previousRacketQuaternion).multiplyScalar(angle / dt);
  const omega = (input.angularVelocityWorld?.lengthSq() ? input.angularVelocityWorld.clone() : inferredOmega)
    .clampLength(0, BALL_CONFIG.contactRealism.maximumAngularSpeed);
  const radius = input.contactPointWorld.clone().sub(input.racketPosition);
  return pivotVelocity.add(new THREE.Vector3().crossVectors(omega, radius));
}

export function resolvePhysicalImpact(input: PhysicalImpactInput): PhysicalImpactResolution {
  const normal = LOCAL_FORWARD.clone().applyQuaternion(input.racketQuaternion).normalize();
  if (input.incomingVelocity.dot(normal) > 0) normal.negate();
  const up = LOCAL_UP.clone().applyQuaternion(input.racketQuaternion).normalize();
  const side = LOCAL_SIDE.clone().applyQuaternion(input.racketQuaternion).normalize();
  const racketVelocity = estimateRacketContactPointVelocity(input);
  if (input.forwardSwing) racketVelocity.lerp(input.forwardSwing.racketHeadVelocityWorld, 0.55);
  racketVelocity.addScaledVector(
    up,
    THREE.MathUtils.clamp(input.upwardScore, -1, 1) * BALL_CONFIG.contactRealism.maximumInferredSwingTranslation
  );
  const relative = input.incomingVelocity.clone().sub(racketVelocity);
  const incomingNormal = relative.dot(normal);
  const tangent = relative.clone().addScaledVector(normal, -incomingNormal);
  const normalizedRadius = Math.sqrt(
    (input.contactPointLocal.x / BALL_CONFIG.collision.halfWidthLocal) ** 2 +
    (input.contactPointLocal.y / BALL_CONFIG.collision.halfHeightLocal) ** 2
  );
  const quality = THREE.MathUtils.clamp(1 - normalizedRadius ** 1.7, 0.18, 1);
  const motionScore = THREE.MathUtils.clamp(
    (input.sensorAngularSpeed - BALL_CONFIG.contactRealism.blockAngularSpeed) /
      (BALL_CONFIG.contactRealism.strongAngularSpeed - BALL_CONFIG.contactRealism.blockAngularSpeed), 0, 1
  );
  const fusedForwardScore = input.forwardSwing?.forwardDriveScore ?? input.forwardScore;
  const directionQuality = THREE.MathUtils.clamp((fusedForwardScore + 0.15) / 0.75, 0, 1);
  const faceAngle = Math.acos(THREE.MathUtils.clamp(normal.dot(COURT_FORWARD), -1, 1));
  const severeFace = faceAngle > BALL_CONFIG.contactRealism.mishitFaceAngle;
  const intentional = input.swingIntent && motionScore > 0 && input.swingConfidence >= BALL_CONFIG.contactRealism.minimumIntentConfidence;
  let outcome: ContactOutcome = input.frameContact ? "FRAME_CONTACT"
    : !intentional ? "STRING_BLOCK"
      : motionScore < BALL_CONFIG.contactRealism.weakMotionScore ? "WEAK_CONTACT"
        : severeFace || directionQuality < 0.2 ? "MISHIT"
          : quality < BALL_CONFIG.contactRealism.offCenterQuality ? "OFF_CENTER_HIT" : "VALID_HIT";

  const restitution = input.frameContact ? BALL_CONFIG.contactRealism.frameRestitution
    : intentional ? BALL_CONFIG.contactRealism.stringRestitution : BALL_CONFIG.contactRealism.blockRestitution;
  const closingSpeed = Math.max(0, -incomingNormal);
  const racketNormalSpeed = Math.max(0, racketVelocity.dot(normal));
  const racketHeadSpeed = racketVelocity.length();
  const forwardRacketHeadSpeed = Math.max(0, racketVelocity.dot(COURT_FORWARD));
  const powerScore = THREE.MathUtils.clamp(
    (forwardRacketHeadSpeed * 0.78 + racketHeadSpeed * 0.22 - 0.65) / 6.4,
    0,
    1
  );
  const normalImpulse = closingSpeed * (1 + restitution) + racketNormalSpeed * BALL_CONFIG.contactRealism.racketEnergyTransfer * motionScore;
  const raw = input.incomingVelocity.clone().addScaledVector(normal, normalImpulse);
  if (intentional) {
    const energyTransfer = BALL_CONFIG.contactRealism.maximumAddedSpeed *
      (0.12 * motionScore + 0.88 * powerScore) * quality * directionQuality;
    const lowSpeedForwardTransfer = 1.4 * (1 - powerScore) * directionQuality;
    raw.addScaledVector(normal, energyTransfer + lowSpeedForwardTransfer);
    // A forward tennis stroke has a small natural launch even with a neutral
    // face. Face pitch and the measured vertical path then shape it continuously.
    raw.y += 3.3 + forwardRacketHeadSpeed * 0.06;
    const signedFaceLift = THREE.MathUtils.clamp(normal.y, -0.5, 0.5) * Math.max(3, forwardRacketHeadSpeed * 0.7);
    const verticalPath = THREE.MathUtils.clamp(input.upwardScore, -1, 1);
    const brushLiftScale = verticalPath >= 0 ? 2.2 : 0.55;
    const brushLift = verticalPath * BALL_CONFIG.contactRealism.swingLiftInfluence *
      brushLiftScale * (0.35 + 0.65 * powerScore);
    raw.y += signedFaceLift + brushLift;
    if (input.forwardSwing && input.forwardSwing.invalidDirectionReason === "NONE") {
      const horizontalSpeed = Math.hypot(raw.x, raw.z);
      if (horizontalSpeed > 0.001) {
        const contactSpread = THREE.MathUtils.clamp(
          input.contactPointLocal.x / Math.max(BALL_CONFIG.collision.halfWidthLocal, 0.001), -1, 1
        );
        const lateralMotion = THREE.MathUtils.clamp(
          input.forwardSwing.lateralRacketHeadVelocity / 8 + input.forwardSwing.lateralAcceleration / 20,
          -1, 1
        );
        const maximumSideRatio = THREE.MathUtils.lerp(0.08, 0.3, 1 - quality);
        const sideRatio = THREE.MathUtils.clamp(
          lateralMotion * 0.16 + contactSpread * (1 - quality) * 0.18,
          -maximumSideRatio, maximumSideRatio
        );
        const desired = new THREE.Vector3(sideRatio, 0, -1).normalize();
        const measured = new THREE.Vector3(raw.x, 0, raw.z).normalize();
        const forwardBlend = THREE.MathUtils.clamp(0.35 + input.forwardSwing.forwardDriveScore * 0.45, 0.35, 0.78);
        measured.lerp(desired, forwardBlend * quality).normalize().multiplyScalar(horizontalSpeed);
        raw.x = measured.x;
        raw.z = measured.z;
      }
      raw.y += THREE.MathUtils.clamp(input.forwardSwing.upwardAcceleration / 12, -0.35, 0.65) *
        (0.5 + powerScore);
    }
  }
  if (outcome === "STRING_BLOCK" || outcome === "FRAME_CONTACT") raw.multiplyScalar(BALL_CONFIG.contactRealism.passiveDamping);
  raw.clampLength(BALL_CONFIG.contactRealism.minimumSeparationSpeed, BALL_CONFIG.contactRealism.maximumOutgoingSpeed);
  if (raw.dot(normal) < BALL_CONFIG.contactRealism.minimumSeparationSpeed) {
    raw.addScaledVector(normal, BALL_CONFIG.contactRealism.minimumSeparationSpeed - raw.dot(normal));
  }

  const brushUp = racketVelocity.dot(up) - tangent.dot(up);
  const brushSide = racketVelocity.dot(side) - tangent.dot(side);
  const brushMagnitude = Math.hypot(brushUp, brushSide);
  const spinRate = THREE.MathUtils.clamp(
    brushMagnitude / Math.max(BALL_CONFIG.scale.physicalRadiusMeters, 0.001) *
      BALL_CONFIG.contactRealism.spinTransfer * quality * motionScore,
    0, BALL_CONFIG.contactRealism.maximumSpinRate
  );
  const spinAxis = side.clone().multiplyScalar(-brushUp).addScaledVector(up, brushSide).normalize();
  const outgoingSpin = spinAxis.multiplyScalar(spinRate).add(input.incomingSpin.clone().multiplyScalar(0.2));
  const spinType = classifyPhysicalSpin(brushUp, brushSide, spinRate);
  if (spinType === "SLICE") {
    outgoingSpin.multiplyScalar(0.25);
    raw.x *= 0.65;
    raw.z *= 0.65;
  }
  const rawSpin = outgoingSpin.clone();
  const rawHorizontalSpeed = Math.hypot(raw.x, raw.z);
  const rawLaunchAngle = Math.atan2(raw.y, Math.max(0.001, rawHorizontalSpeed));
  const rawPrediction = predictReturnTrajectory(input.contactPointWorld, raw, rawSpin);
  const swingPathAngle = Math.atan2(racketVelocity.dot(up), Math.max(0.001, -racketVelocity.dot(COURT_FORWARD)));
  const assisted = raw.clone();
  const safety = new THREE.Vector3();
  const forwardDirectionQuality = raw.lengthSq() > 1e-8 ? raw.clone().normalize().dot(COURT_FORWARD) : -1;
  let invalidDirectionReason: InvalidDirectionReason = input.forwardSwing?.invalidDirectionReason ?? "NONE";
  if (invalidDirectionReason === "NONE" && quality < BALL_CONFIG.contactRealism.offCenterQuality &&
      forwardDirectionQuality < BALL_CONFIG.contactRealism.minimumForwardDirectionQuality) {
    invalidDirectionReason = "OFF_CENTER_DIRECTION_LOSS";
  }
  if (intentional && !input.frameContact && input.forwardSwing &&
      invalidDirectionReason !== "NONE") {
    outcome = "INVALID_SHOT_DIRECTION";
    assisted.multiplyScalar(BALL_CONFIG.contactRealism.invalidDirectionDamping);
  } else if ((outcome === "VALID_HIT" || outcome === "OFF_CENTER_HIT") &&
      forwardDirectionQuality < BALL_CONFIG.contactRealism.minimumForwardDirectionQuality) {
    outcome = "INVALID_SHOT_DIRECTION";
    assisted.multiplyScalar(BALL_CONFIG.contactRealism.invalidDirectionDamping);
  } else if (outcome === "VALID_HIT") {
    outcome = spinType === "TOPSPIN" ? "TOPSPIN_HIT"
      : spinType === "SLICE" ? "SLICE_HIT"
        : spinType === "FLAT" ? "FLAT_HIT" : "VALID_HIT";
  }
  if (isSuccessfulTennisOutcome(outcome)) {
    const minimumForward = BALL_CONFIG.contactRealism.easySafetyMinimumForwardSpeed;
    const forwardSpeed = -assisted.z;
    if (forwardSpeed > 0 && forwardSpeed < minimumForward) {
      safety.z = -(minimumForward - forwardSpeed);
      assisted.z += safety.z;
    }
    if (assisted.y < BALL_CONFIG.contactRealism.easySafetyMinimumLift) {
      safety.y = BALL_CONFIG.contactRealism.easySafetyMinimumLift - assisted.y;
    }
    const timeToNet = assisted.z < -0.01
      ? (BALL_CONFIG.launch.netDepth - input.contactPointWorld.z) / assisted.z
      : -1;
    if (timeToNet > 0) {
      const shapeMargin = spinType === "TOPSPIN" ? 0.3 : spinType === "SLICE" ? 0.2 : 0.12;
      const requiredHeight = BALL_CONFIG.launch.netHeight + BALL_CONFIG.scale.physicalRadiusMeters + shapeMargin;
      const requiredLift = (requiredHeight - input.contactPointWorld.y -
        0.5 * BALL_CONFIG.gravity * timeToNet * timeToNet) / timeToNet;
      safety.y = Math.max(safety.y, requiredLift - assisted.y);
    }
    safety.clampLength(0, BALL_CONFIG.contactRealism.maximumSafetyCorrection);
    assisted.copy(raw).add(safety);
  }
  assisted.clampLength(BALL_CONFIG.contactRealism.minimumSeparationSpeed, BALL_CONFIG.contactRealism.maximumOutgoingSpeed);
  const prediction = predictReturnTrajectory(input.contactPointWorld, assisted, outgoingSpin);
  const netClearance = prediction.netCrossingPoint
    ? prediction.netCrossingPoint.y - BALL_CONFIG.launch.netHeight - BALL_CONFIG.scale.physicalRadiusMeters
    : null;
  const horizontalSpeed = Math.hypot(assisted.x, assisted.z);
  return {
    outcome, outgoingVelocity: assisted.clone(), outgoingAngularVelocity: outgoingSpin,
    rawOutgoingVelocity: raw, assistedOutgoingVelocity: assisted, safetyCorrection: safety,
    contactNormal: normal, racketUpTangent: up, racketSideTangent: side,
    racketContactPointVelocity: racketVelocity, relativeVelocity: relative,
    incomingNormalVelocity: incomingNormal, incomingTangentialVelocity: tangent,
    normalImpulse, tangentialImpulse: outgoingSpin.clone().multiplyScalar(BALL_CONFIG.scale.physicalRadiusMeters),
    sweetSpotDistance: normalizedRadius, contactQuality: quality, faceAngleRadians: faceAngle,
    swingPathAngleRadians: swingPathAngle, spinType, spinRateRadiansPerSecond: outgoingSpin.length(),
    racketHeadSpeed, forwardRacketHeadSpeed,
    upwardBrushVelocity: Math.max(0, brushUp), downwardBrushVelocity: Math.max(0, -brushUp),
    powerScore, launchAngleRadians: Math.atan2(assisted.y, Math.max(0.001, horizontalSpeed)),
    predictedNetClearance: netClearance, rawLaunchAngleRadians: rawLaunchAngle,
    rawSpin, rawPrediction, prediction,
    forwardDirectionQuality,
    forwardDriveScore: fusedForwardScore,
    forwardAcceleration: input.forwardSwing?.forwardAcceleration ?? 0,
    upwardAcceleration: input.forwardSwing?.upwardAcceleration ?? 0,
    lateralAcceleration: input.forwardSwing?.lateralAcceleration ?? 0,
    upwardRacketHeadSpeed: input.forwardSwing?.upwardRacketHeadVelocity ?? racketVelocity.y,
    lateralRacketHeadSpeed: input.forwardSwing?.lateralRacketHeadVelocity ?? racketVelocity.x,
    invalidDirectionReason
  };
}

export function isSuccessfulTennisOutcome(outcome: ContactOutcome): boolean {
  return outcome === "VALID_HIT" || outcome === "TOPSPIN_HIT" || outcome === "FLAT_HIT" ||
    outcome === "SLICE_HIT" || outcome === "OFF_CENTER_HIT";
}

export function classifyPhysicalSpin(upBrush: number, sideBrush: number, rate: number): PhysicalSpinType {
  if (rate < BALL_CONFIG.contactRealism.flatSpinThreshold) return "FLAT";
  const vertical = Math.abs(upBrush);
  const lateral = Math.abs(sideBrush);
  if (vertical > lateral * 1.5) return upBrush > 0 ? "TOPSPIN" : "SLICE";
  if (lateral > vertical * 1.5) return "SIDE_SPIN";
  return "MIXED_SPIN";
}
