import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import { Handedness } from "../strokeDetection/strokeTypes.js";
import { BallSpeedPreset, LaunchPreset } from "./ballTypes.js";

export function getLaunchParameters(
  preset: LaunchPreset,
  handedness: Handedness,
  speed: BallSpeedPreset
): { position: THREE.Vector3; velocity: THREE.Vector3 } {
  const values = BALL_CONFIG.launch[preset];
  const mirror = handedness === "right" ? 1 : -1;
  const position = new THREE.Vector3(...values.position);
  position.x *= mirror;
  const velocity = new THREE.Vector3(...values.velocity);
  velocity.multiplyScalar(BALL_CONFIG.launch.speedMultipliers[speed]);
  return { position, velocity };
}
