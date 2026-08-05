import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import { EstimatedRacketContact } from "../strokeDetection/strokeTypes.js";

const COURT_FORWARD = new THREE.Vector3(0, 0, -1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const COURT_SIDE = new THREE.Vector3(1, 0, 0);

export function calculateOutgoingVelocity(
  contact: EstimatedRacketContact,
  localContactPoint: THREE.Vector3
): { velocity: THREE.Vector3; spinVector: THREE.Vector3; speed: number } {
  const config = BALL_CONFIG.response;
  const face = contact.racketFaceNormal.clone();
  if (face.dot(COURT_FORWARD) < 0) face.negate();
  const lift = config.baseLift + Math.max(-0.1, contact.upwardScore) * config.upwardLift;
  const side = THREE.MathUtils.clamp(
    contact.sidewaysScore * 0.12 + localContactPoint.x / BALL_CONFIG.collision.halfWidthLocal * 0.08,
    -config.maximumSide,
    config.maximumSide
  );
  const direction = face.multiplyScalar(config.faceInfluence)
    .addScaledVector(COURT_FORWARD, config.courtForwardInfluence)
    .addScaledVector(WORLD_UP, lift)
    .addScaledVector(COURT_SIDE, side);
  direction.z = Math.min(direction.z, -0.35);
  direction.y = THREE.MathUtils.clamp(direction.y, 0.08, 0.62);
  direction.x = THREE.MathUtils.clamp(direction.x, -0.42, 0.42);
  direction.normalize();
  const speedInput = THREE.MathUtils.clamp(contact.estimatedSpeed / 20, 0, 1);
  const speed = THREE.MathUtils.clamp(
    config.baseReturnSpeed + Math.sqrt(speedInput) * 4.5 + contact.forwardScore * 1.5,
    config.minimumReturnSpeed,
    config.maximumReturnSpeed
  );
  const spinStrength = contact.spinType === "topspin"
    ? contact.topspinScore * BALL_CONFIG.spin.topspinStrength
    : contact.spinType === "slice"
      ? contact.sliceScore * BALL_CONFIG.spin.sliceStrength
      : 1.5;
  // Negative side-axis spin with -Z flight creates downward Magnus acceleration.
  const spinSign = contact.spinType === "slice" ? 1 : -1;
  const spinVector = contact.racketSideVector.clone().normalize().multiplyScalar(spinStrength * spinSign);
  return { velocity: direction.multiplyScalar(speed), spinVector, speed };
}
