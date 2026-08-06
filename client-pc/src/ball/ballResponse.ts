import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import { EstimatedRacketContact } from "../strokeDetection/strokeTypes.js";

const COURT_FORWARD = new THREE.Vector3(0, 0, -1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const COURT_SIDE = new THREE.Vector3(1, 0, 0);

export type ReturnDirectionInput = {
  strokeType: "forehand" | "backhand";
  handedness: "right" | "left";
  racketFaceNormal: THREE.Vector3;
  racketSide: THREE.Vector3;
  racketUp: THREE.Vector3;
  contactPointLocal: THREE.Vector3;
  contactPointWorld: THREE.Vector3;
  upwardScore: number;
  sidewaysScore: number;
  incomingVelocity: THREE.Vector3;
};

export type ReturnDirectionResolution = {
  rawDirection: THREE.Vector3;
  constrainedDirection: THREE.Vector3;
  sideContribution: THREE.Vector3;
  liftContribution: THREE.Vector3;
  forwardContribution: THREE.Vector3;
  faceContribution: THREE.Vector3;
  targetPoint: THREE.Vector3;
};

export type ReturnTrajectoryPrediction = {
  netCrossingPoint: THREE.Vector3 | null;
  bouncePoint: THREE.Vector3 | null;
};

export function resolveReturnDirection(input: ReturnDirectionInput): ReturnDirectionResolution {
  const config = BALL_CONFIG.response;
  const targetKey = input.strokeType === "forehand" ? "forehand" : "backhand";
  const configuredTarget = config.safeTargets[targetKey];
  const handMirror = input.handedness === "right" ? 1 : -1;
  const targetPoint = new THREE.Vector3(configuredTarget[0] * handMirror, configuredTarget[1], configuredTarget[2]);
  const targetDirection = targetPoint.clone().sub(input.contactPointWorld).normalize();

  const face = input.racketFaceNormal.clone().normalize();
  if (face.dot(COURT_FORWARD) < 0) face.negate();
  face.x = THREE.MathUtils.clamp(face.x, -0.35, 0.35);
  face.y = THREE.MathUtils.clamp(face.y, -0.1, 0.45);
  face.z = Math.min(face.z, -0.35);
  face.normalize();

  // Side score and local impact are already expressed in the current world/racket
  // bases. Handedness is intentionally not applied again here.
  const controlledSide = THREE.MathUtils.clamp(
    input.sidewaysScore * 0.08 + input.contactPointLocal.x / BALL_CONFIG.collision.halfWidthLocal * 0.04,
    -config.maximumSide,
    config.maximumSide
  );
  const forwardContribution = targetDirection.multiplyScalar(config.targetInfluence);
  const faceContribution = face.multiplyScalar(config.constrainedFaceInfluence);
  const liftAmount = THREE.MathUtils.clamp(0.8 + input.upwardScore * 0.15, 0.65, 0.95);
  const liftContribution = WORLD_UP.clone().multiplyScalar(liftAmount * config.liftInfluence);
  const sideContribution = COURT_SIDE.clone().multiplyScalar(controlledSide * config.sideInfluence);
  const rawDirection = forwardContribution.clone().add(faceContribution).add(liftContribution).add(sideContribution);
  const constrainedDirection = rawDirection.clone();
  constrainedDirection.z = Math.min(constrainedDirection.z, -0.48);
  constrainedDirection.x = THREE.MathUtils.clamp(constrainedDirection.x, -0.32, 0.32);
  constrainedDirection.y = THREE.MathUtils.clamp(constrainedDirection.y, 0.2, 0.48);
  constrainedDirection.normalize();
  return { rawDirection, constrainedDirection, sideContribution, liftContribution, forwardContribution, faceContribution, targetPoint };
}

export function calculateOutgoingVelocity(
  contact: EstimatedRacketContact,
  localContactPoint: THREE.Vector3,
  contactPointWorld = new THREE.Vector3(0, 1.2, -1.8),
  incomingVelocity = new THREE.Vector3(0, 0, 1)
): { velocity: THREE.Vector3; spinVector: THREE.Vector3; speed: number; direction: ReturnDirectionResolution; prediction: ReturnTrajectoryPrediction } {
  const config = BALL_CONFIG.response;
  const direction = resolveReturnDirection({
    strokeType: contact.strokeType, handedness: contact.handedness,
    racketFaceNormal: contact.racketFaceNormal, racketSide: contact.racketSideVector,
    racketUp: contact.racketUpVector, contactPointLocal: localContactPoint,
    contactPointWorld, upwardScore: contact.upwardScore,
    sidewaysScore: contact.sidewaysScore, incomingVelocity
  });
  const speedInput = THREE.MathUtils.clamp(contact.estimatedSpeed / 20, 0, 1);
  const speed = THREE.MathUtils.clamp(
    config.baseReturnSpeed + Math.sqrt(speedInput) * 4.5 + contact.forwardScore * 1.5,
    config.minimumReturnSpeed,
    config.maximumReturnSpeed
  );
  const velocity = direction.constrainedDirection.clone().multiplyScalar(speed);
  const timeToNet = (BALL_CONFIG.launch.netDepth - contactPointWorld.z) / Math.min(velocity.z, -0.01);
  const requiredNetHeight = BALL_CONFIG.launch.netHeight + config.minimumNetClearance + BALL_CONFIG.scale.physicalRadiusMeters;
  const requiredLift = timeToNet > 0
    ? (requiredNetHeight - contactPointWorld.y - 0.5 * BALL_CONFIG.gravity * timeToNet ** 2) / timeToNet
    : config.minimumReturnLift;
  const scoredLift = Math.max(velocity.y, config.minimumReturnLift, requiredLift) +
    Math.max(0, THREE.MathUtils.clamp(contact.upwardScore, -1, 1)) * 0.25;
  velocity.y = THREE.MathUtils.clamp(
    scoredLift,
    config.minimumReturnLift,
    config.maximumReturnLift
  );
  const maximumHorizontalSpeed = Math.sqrt(Math.max(0, config.maximumReturnSpeed ** 2 - velocity.y ** 2));
  const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
  if (horizontalSpeed > maximumHorizontalSpeed) {
    const scale = maximumHorizontalSpeed / horizontalSpeed;
    velocity.x *= scale;
    velocity.z *= scale;
  }
  const finalTimeToNet = (BALL_CONFIG.launch.netDepth - contactPointWorld.z) / Math.min(velocity.z, -0.01);
  if (finalTimeToNet > 0) {
    const finalRequiredLift = (requiredNetHeight - contactPointWorld.y -
      0.5 * BALL_CONFIG.gravity * finalTimeToNet ** 2) / finalTimeToNet;
    velocity.y = THREE.MathUtils.clamp(Math.max(velocity.y, finalRequiredLift), config.minimumReturnLift, config.maximumReturnLift);
    const finalHorizontalLimit = Math.sqrt(Math.max(0, config.maximumReturnSpeed ** 2 - velocity.y ** 2));
    const finalHorizontalSpeed = Math.hypot(velocity.x, velocity.z);
    if (finalHorizontalSpeed > finalHorizontalLimit) {
      const scale = finalHorizontalLimit / finalHorizontalSpeed;
      velocity.x *= scale;
      velocity.z *= scale;
    }
  }

  const spinStrength = contact.spinType === "topspin"
    ? contact.topspinScore * BALL_CONFIG.spin.topspinStrength
    : contact.spinType === "slice"
      ? contact.sliceScore * BALL_CONFIG.spin.sliceStrength
      : 1.5;
  const spinSign = contact.spinType === "slice" ? 1 : -1;
  const spinVector = contact.racketSideVector.clone().normalize().multiplyScalar(spinStrength * spinSign);
  return { velocity, spinVector, speed: velocity.length(), direction, prediction: predictReturnTrajectory(contactPointWorld, velocity) };
}

export function predictReturnTrajectory(position: THREE.Vector3, velocity: THREE.Vector3): ReturnTrajectoryPrediction {
  const netTime = velocity.z < 0 ? (BALL_CONFIG.launch.netDepth - position.z) / velocity.z : -1;
  const netCrossingPoint = netTime > 0 ? position.clone().addScaledVector(velocity, netTime) : null;
  if (netCrossingPoint) netCrossingPoint.y += 0.5 * BALL_CONFIG.gravity * netTime ** 2;
  const floor = BALL_CONFIG.courtHeight + BALL_CONFIG.scale.physicalRadiusMeters;
  const discriminant = velocity.y ** 2 - 2 * BALL_CONFIG.gravity * (position.y - floor);
  const bounceTime = discriminant >= 0 ? (-velocity.y - Math.sqrt(discriminant)) / BALL_CONFIG.gravity : -1;
  const bouncePoint = bounceTime > 0 ? position.clone().addScaledVector(velocity, bounceTime) : null;
  if (bouncePoint) bouncePoint.y = floor;
  return { netCrossingPoint, bouncePoint };
}
