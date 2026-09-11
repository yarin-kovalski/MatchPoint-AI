import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import { calculateMagnusAcceleration } from "./ballPhysics.js";
import { solveVelocity } from "./ballDelivery.js";

/** Uses the same semi-implicit fixed step, drag and Magnus law as live flight. */
export function sampleSpinFlight(start: THREE.Vector3, velocity: THREE.Vector3, seconds: number, spin: THREE.Vector3): THREE.Vector3 {
  const position = start.clone(), speed = velocity.clone(), acceleration = new THREE.Vector3();
  let remaining = seconds;
  while (remaining > 1e-8) {
    const dt = Math.min(remaining, BALL_CONFIG.physicsStepSeconds);
    calculateMagnusAcceleration(spin, speed, acceleration);
    speed.addScaledVector(acceleration, dt);
    speed.y += BALL_CONFIG.gravity * dt;
    speed.multiplyScalar(Math.max(0, 1 - BALL_CONFIG.airDrag * dt));
    position.addScaledVector(speed, dt);
    remaining -= dt;
  }
  return position;
}

/** Bounded shooting solve at feed setup / first bounce, never per render frame. */
export function solveSpinFlight(start: THREE.Vector3, target: THREE.Vector3, seconds: number, spin: THREE.Vector3): THREE.Vector3 {
  const velocity = solveVelocity(start, target, seconds);
  for (let i = 0; i < 8; i++) {
    const end = sampleSpinFlight(start, velocity, seconds, spin);
    const error = target.clone().sub(end);
    if (error.lengthSq() < 1e-8) break;
    velocity.addScaledVector(error, 0.9 / seconds);
  }
  return velocity;
}
