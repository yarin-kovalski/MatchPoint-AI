import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import { BallSnapshot } from "./ballTypes.js";

export function calculateMagnusAcceleration(spin: THREE.Vector3, velocity: THREE.Vector3, output = new THREE.Vector3()): THREE.Vector3 {
  const acceleration = output.crossVectors(spin, velocity)
    .multiplyScalar(BALL_CONFIG.spin.magnusCoefficient);
  const length = acceleration.length();
  if (length > BALL_CONFIG.spin.maximumAcceleration) acceleration.multiplyScalar(BALL_CONFIG.spin.maximumAcceleration / length);
  return acceleration;
}

export function stepBallPhysics(ball: BallSnapshot, deltaSeconds: number): boolean {
  let remaining = Math.min(deltaSeconds, 0.1);
  let bounced = false;
  ball.previousPosition.copy(ball.position);
  while (remaining > 0) {
    const dt = Math.min(remaining, BALL_CONFIG.maximumStepSeconds);
    calculateMagnusAcceleration(ball.spinVector, ball.velocity, ball.magnusAcceleration);
    ball.velocity.y += (BALL_CONFIG.gravity + ball.magnusAcceleration.y) * dt;
    ball.velocity.x += ball.magnusAcceleration.x * dt;
    ball.velocity.z += ball.magnusAcceleration.z * dt;
    ball.velocity.multiplyScalar(Math.max(0, 1 - BALL_CONFIG.airDrag * dt));
    ball.position.addScaledVector(ball.velocity, dt);
    const floor = BALL_CONFIG.courtHeight + ball.physicsRadius;
    if (ball.position.y < floor && ball.velocity.y < 0) {
      ball.position.y = floor;
      const returned = ball.state === "RETURNED";
      const verticalSpinResponse = returned && ball.spinType === "topspin" ? 1.13
        : returned && ball.spinType === "slice" ? 0.78 : 1;
      ball.velocity.y *= -(returned ? BALL_CONFIG.returnedBounceRestitution : BALL_CONFIG.bounceRestitution) * verticalSpinResponse;
      const spinFriction = returned && ball.spinType === "topspin" ? 1.08
        : returned && ball.spinType === "slice" ? 0.82 : 1;
      ball.velocity.x *= BALL_CONFIG.groundFriction;
      ball.velocity.z *= BALL_CONFIG.groundFriction * spinFriction;
      ball.bounceCount += 1;
      bounced = true;
    }
    remaining -= dt;
  }
  return bounced;
}

export function isBallOutOfBounds(ball: BallSnapshot, now: number): boolean {
  const bounds = BALL_CONFIG.bounds;
  return !Number.isFinite(ball.position.lengthSq()) || Math.abs(ball.position.x) > bounds.x ||
    ball.position.y > bounds.y || ball.position.z > bounds.zBehindPlayer || ball.position.z < bounds.zFar ||
    now - ball.launchTimestamp > BALL_CONFIG.maximumFlightMs ||
    (ball.bounceCount > 0 && ball.velocity.length() < BALL_CONFIG.stationarySpeed);
}
