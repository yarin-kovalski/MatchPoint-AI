import * as THREE from "three";
import { tennisFenceBounds } from "../scene/tennisEnvironment.js";
import { BALL_CONFIG } from "./ballConfig.js";
import { BallSnapshot } from "./ballTypes.js";

export type FenceSurface = "left" | "right" | "far";

export type FenceCollision = {
  point: THREE.Vector3;
  surface: FenceSurface;
};

type Candidate = FenceCollision & { fraction: number };

const RESTITUTION = 0.56;
const TANGENTIAL_DAMPING = 0.79;
const SPIN_DAMPING = 0.74;

/** Resolves the earliest swept collision with the visible court enclosure. */
export function resolveFenceCollision(ball: BallSnapshot, start: THREE.Vector3, stepSeconds: number): FenceCollision | null {
  const end = ball.position.clone();
  const bounds = tennisFenceBounds(BALL_CONFIG.launch.netDepth);
  const radius = ball.physicsRadius;
  const left = bounds.left + radius;
  const right = bounds.right - radius;
  const far = bounds.far + radius;
  const near = bounds.near - radius;
  const candidates: Candidate[] = [];

  addXCandidate(candidates, "left", left, start, end, start.x > left && end.x <= left, far, near, bounds.height, radius);
  addXCandidate(candidates, "right", right, start, end, start.x < right && end.x >= right, far, near, bounds.height, radius);
  addZCandidate(candidates, "far", far, start, end, start.z > far && end.z <= far, left, right, bounds.height, radius);

  const collision = candidates.sort((a, b) => a.fraction - b.fraction)[0];
  if (!collision) return null;

  ball.position.copy(collision.point);
  if (collision.surface === "left" || collision.surface === "right") {
    ball.velocity.x = collision.surface === "left"
      ? Math.abs(ball.velocity.x) * RESTITUTION
      : -Math.abs(ball.velocity.x) * RESTITUTION;
    ball.velocity.y *= TANGENTIAL_DAMPING;
    ball.velocity.z *= TANGENTIAL_DAMPING;
  } else {
    ball.velocity.z = Math.abs(ball.velocity.z) * RESTITUTION;
    ball.velocity.x *= TANGENTIAL_DAMPING;
    ball.velocity.y *= TANGENTIAL_DAMPING;
  }
  ball.spinVector.multiplyScalar(SPIN_DAMPING);

  // Preserve the unused part of the fixed step after impact. This prevents
  // fast shots from appearing to stick to the fence at low render rates.
  const remainingSeconds = stepSeconds * (1 - collision.fraction);
  ball.position.addScaledVector(ball.velocity, remainingSeconds);
  if (collision.surface === "left") ball.position.x = Math.max(left, ball.position.x);
  if (collision.surface === "right") ball.position.x = Math.min(right, ball.position.x);
  if (collision.surface === "far") ball.position.z = Math.max(far, ball.position.z);
  return { point: collision.point.clone(), surface: collision.surface };
}

function addXCandidate(
  candidates: Candidate[], surface: FenceSurface, plane: number, start: THREE.Vector3, end: THREE.Vector3,
  crossed: boolean, far: number, near: number, height: number, radius: number
): void {
  if (!crossed || end.x === start.x) return;
  const fraction = (plane - start.x) / (end.x - start.x);
  const point = start.clone().lerp(end, fraction).setX(plane);
  if (point.z >= far && point.z <= near && point.y - radius <= height && point.y + radius >= 0) {
    candidates.push({ point, surface, fraction });
  }
}

function addZCandidate(
  candidates: Candidate[], surface: FenceSurface, plane: number, start: THREE.Vector3, end: THREE.Vector3,
  crossed: boolean, left: number, right: number, height: number, radius: number
): void {
  if (!crossed || end.z === start.z) return;
  const fraction = (plane - start.z) / (end.z - start.z);
  const point = start.clone().lerp(end, fraction).setZ(plane);
  if (point.x >= left && point.x <= right && point.y - radius <= height && point.y + radius >= 0) {
    candidates.push({ point, surface, fraction });
  }
}
