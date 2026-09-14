import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import { solveSpinFlight } from "./spinFlight.js";
import { calculateMagnusAcceleration } from "./ballPhysics.js";
import { TENNIS_COURT } from "../scene/tennisEnvironment.js";

export function isReturnInCourt(point: THREE.Vector3): boolean {
  const radius = BALL_CONFIG.scale.physicalRadiusMeters;
  return Math.abs(point.x) <= TENNIS_COURT.singlesWidth / 2 + radius &&
    point.z < BALL_CONFIG.launch.netDepth &&
    point.z >= BALL_CONFIG.launch.netDepth - TENNIS_COURT.length / 2 - radius;
}

/** Solve once at accepted Training contact. Never steer a ball during flight. */
export function solveTrainingReturn(start: THREE.Vector3, raw: THREE.Vector3, originalSpin: THREE.Vector3) {
  const power = THREE.MathUtils.clamp(raw.length() / 24, 0, 1);
  const target = new THREE.Vector3(
    THREE.MathUtils.clamp(raw.x * 0.15, -2.2, 2.2),
    BALL_CONFIG.courtHeight + BALL_CONFIG.scale.physicalRadiusMeters,
    BALL_CONFIG.launch.netDepth - 4.5 - power * 3
  );
  const spin = originalSpin.clone().clampLength(0, 12);
  // Progressively higher arcs preserve comfortable speed and clear the net.
  for (let seconds = 1.25; seconds <= 2.65; seconds += 0.1) {
    const velocity = solveSpinFlight(start, target, seconds, spin);
    let previous = start.clone();
    const speed = velocity.clone();
    for (let t = BALL_CONFIG.physicsStepSeconds; t <= seconds; t += BALL_CONFIG.physicsStepSeconds) {
      const dt = BALL_CONFIG.physicsStepSeconds;
      speed.addScaledVector(calculateMagnusAcceleration(spin, speed), dt);
      speed.y += BALL_CONFIG.gravity * dt;
      speed.multiplyScalar(1 - BALL_CONFIG.airDrag * dt);
      const point = previous.clone().addScaledVector(speed, dt);
      if (previous.z > BALL_CONFIG.launch.netDepth && point.z <= BALL_CONFIG.launch.netDepth) {
        const fraction = (previous.z - BALL_CONFIG.launch.netDepth) / (previous.z - point.z);
        const height = THREE.MathUtils.lerp(previous.y, point.y, fraction);
        if (height >= BALL_CONFIG.launch.netHeight + BALL_CONFIG.scale.physicalRadiusMeters + 0.35 &&
            velocity.length() <= BALL_CONFIG.contactRealism.maximumOutgoingSpeed) return { velocity, spin };
        break;
      }
      previous = point;
    }
  }
  return null;
}
