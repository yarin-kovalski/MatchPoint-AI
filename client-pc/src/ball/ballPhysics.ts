import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import { netHeightAt, NET_HALF_WIDTH } from "./courtRules.js";
import { BallSnapshot } from "./ballTypes.js";
import { FenceSurface, resolveFenceCollision } from "./fenceCollision.js";

export function calculateMagnusAcceleration(spin: THREE.Vector3, velocity: THREE.Vector3, output = new THREE.Vector3()): THREE.Vector3 {
  const acceleration = output.crossVectors(spin, velocity)
    .multiplyScalar(BALL_CONFIG.spin.magnusCoefficient);
  const length = acceleration.length();
  if (length > BALL_CONFIG.spin.maximumAcceleration) acceleration.multiplyScalar(BALL_CONFIG.spin.maximumAcceleration / length);
  return acceleration;
}

export type BallPhysicsEvent = {
  type: "bounce" | "net" | "fence";
  point: THREE.Vector3;
  surface?: FenceSurface;
};

export function stepBallPhysics(ball: BallSnapshot, deltaSeconds: number, onEvent?: (event: BallPhysicsEvent) => void): boolean {
  let remaining = Math.min(deltaSeconds, 0.1);
  let bounced = false;
  ball.previousPosition.copy(ball.position);
  while (remaining > 0) {
    const dt = Math.min(remaining, BALL_CONFIG.maximumStepSeconds);
    const start = ball.position.clone();
    calculateMagnusAcceleration(ball.spinVector, ball.velocity, ball.magnusAcceleration);
    ball.velocity.y += (BALL_CONFIG.gravity + ball.magnusAcceleration.y) * dt;
    ball.velocity.x += ball.magnusAcceleration.x * dt;
    ball.velocity.z += ball.magnusAcceleration.z * dt;
    ball.velocity.multiplyScalar(Math.max(0, 1 - BALL_CONFIG.airDrag * dt));
    ball.position.addScaledVector(ball.velocity, dt);
    const returned = ball.state === "RETURNED" || ball.hit;
    const netZ = BALL_CONFIG.launch.netDepth;
    const floor = BALL_CONFIG.courtHeight + ball.physicsRadius;
    if (returned && start.z > netZ && ball.position.z <= netZ) {
      const fraction = (start.z - netZ) / (start.z - ball.position.z);
      const crossing = start.clone().lerp(ball.position, fraction);
      const floorFraction = ball.position.y < floor && ball.velocity.y < 0
        ? THREE.MathUtils.clamp((start.y - floor) / (start.y - ball.position.y), 0, 1) : 1;
      if (fraction <= floorFraction && Math.abs(crossing.x) <= NET_HALF_WIDTH + ball.physicsRadius &&
          crossing.y - ball.physicsRadius <= netHeightAt(crossing.x)) {
        onEvent?.({ type: "net", point: crossing.clone() });
        if (crossing.y >= netHeightAt(crossing.x)) {
          // A tape clip can still fall in: lose speed and deflect upwards.
          ball.velocity.multiplyScalar(0.65);
          ball.velocity.y = Math.max(0.6, Math.abs(ball.velocity.y) * 0.4);
        } else {
          ball.position.copy(crossing).setZ(netZ + ball.physicsRadius);
          ball.velocity.z = Math.abs(ball.velocity.z) * 0.08;
          ball.velocity.x *= 0.25;
          ball.velocity.y *= 0.25;
        }
      }
    }
    const fenceCollision = resolveFenceCollision(ball, start, dt);
    if (fenceCollision) onEvent?.({ type: "fence", point: fenceCollision.point, surface: fenceCollision.surface });
    if (ball.position.y < floor && ball.velocity.y < 0) {
      // Resolve at first floor contact, not the end of the render frame.
      const fraction = THREE.MathUtils.clamp((start.y - floor) / (start.y - ball.position.y), 0, 1);
      ball.position.lerpVectors(start, ball.position.clone(), fraction).setY(floor);
      onEvent?.({ type: "bounce", point: ball.position.clone() });
      const travel = new THREE.Vector3(ball.velocity.x, 0, ball.velocity.z).normalize();
      const rollingAxis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), travel);
      const spinEffect = returned ? THREE.MathUtils.clamp(ball.spinVector.dot(rollingAxis) / 35, -1, 1) : 0;
      // Continuous spin response also handles diagonal and mixed-spin shots.
      const verticalSpinResponse = 1 + Math.max(0, spinEffect) * 0.13 + Math.min(0, spinEffect) * 0.22;
      ball.velocity.y *= -(returned ? BALL_CONFIG.returnedBounceRestitution : BALL_CONFIG.bounceRestitution) * verticalSpinResponse;
      const spinFriction = 1 + Math.max(0, spinEffect) * 0.08 + Math.min(0, spinEffect) * 0.18;
      ball.velocity.x *= BALL_CONFIG.groundFriction * spinFriction;
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
  const outsideWorld = Math.abs(ball.position.x) > bounds.x || ball.position.y > bounds.y ||
    ball.position.z > bounds.zBehindPlayer || ball.position.z < bounds.zFar;
  // Camera/feed bounds are not tennis lines. Let a return reach its first bounce.
  return !Number.isFinite(ball.position.lengthSq()) ||
    (ball.state !== "RETURNED" && outsideWorld) ||
    now - ball.launchTimestamp > BALL_CONFIG.maximumFlightMs ||
    (ball.bounceCount > 0 && ball.velocity.length() < BALL_CONFIG.stationarySpeed);
}
