import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import { BallSnapshot } from "./ballTypes.js";

export type EasyTrajectoryAssistResult = {
  applied: boolean;
  acceleration: THREE.Vector3;
  reason: string;
};

export function applyEasyTrajectoryAssist(
  ball: BallSnapshot,
  deltaSeconds: number,
  now: number
): EasyTrajectoryAssistResult {
  const config = BALL_CONFIG.easyTrajectoryAssist;
  const acceleration = new THREE.Vector3();
  if (!config.enabled) return { applied: false, acceleration, reason: "disabled" };
  if (config.startAfterBounce && ball.bounceCount !== 1) {
    return { applied: false, acceleration, reason: "waiting for first bounce" };
  }
  const remainingMs = ball.contactDeadline - now;
  if (ball.contactDeadline <= 0 || remainingMs <= config.stopBeforeContactMs) {
    return { applied: false, acceleration, reason: "final contact coast" };
  }
  const error = ball.lockedContactTarget.clone().sub(ball.position);
  if (error.length() <= config.stopDistance) {
    return { applied: false, acceleration, reason: "inside stop distance" };
  }
  const remainingSeconds = Math.max(remainingMs / 1000, 0.001);
  const desiredVelocity = error.clone().divideScalar(remainingSeconds);
  acceleration.copy(error).multiplyScalar(config.positionGain)
    .add(desiredVelocity.sub(ball.velocity).multiplyScalar(config.velocityGain));
  if (acceleration.length() > config.maxAcceleration) acceleration.setLength(config.maxAcceleration);

  const candidateVelocity = ball.velocity.clone().addScaledVector(acceleration, deltaSeconds);
  const angle = ball.velocity.lengthSq() > 1e-8 && candidateVelocity.lengthSq() > 1e-8
    ? ball.velocity.angleTo(candidateVelocity)
    : 0;
  if (angle > config.maxCorrectionAngle) {
    candidateVelocity.copy(ball.velocity).lerp(candidateVelocity, config.maxCorrectionAngle / angle);
  }
  ball.velocity.copy(candidateVelocity);
  return { applied: true, acceleration, reason: "correcting" };
}
