import * as THREE from "three";

export type BallFlightCameraState = { targetY: number; fov: number };

// Keep the adaptive flight camera on the same left-weighted composition as the standard player view.
export const BALL_CAMERA_BASE_TARGET = new THREE.Vector3(0.9, 1.3, 0.8);
export const BALL_CAMERA_BASE_FOV = 50;

export function updateBallFlightCamera(
  state: BallFlightCameraState, ballPosition: THREE.Vector3, outgoing: boolean, deltaSeconds: number
): BallFlightCameraState {
  const highBall = outgoing ? THREE.MathUtils.clamp(ballPosition.y - 3, 0, 7) : 0;
  const desiredTargetY = BALL_CAMERA_BASE_TARGET.y + Math.min(3.2, highBall * 0.52);
  const desiredFov = BALL_CAMERA_BASE_FOV + Math.min(4, Math.max(0, ballPosition.y - 4) * 0.7);
  const response = outgoing ? 3.2 : 2.4;
  const alpha = 1 - Math.exp(-response * Math.max(0, deltaSeconds));
  return {
    targetY: THREE.MathUtils.lerp(state.targetY, desiredTargetY, alpha),
    fov: THREE.MathUtils.lerp(state.fov, outgoing ? desiredFov : BALL_CAMERA_BASE_FOV, alpha)
  };
}
