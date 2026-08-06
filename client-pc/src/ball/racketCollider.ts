import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import { AssistMode, RacketCollisionResult } from "./ballTypes.js";

const EMPTY = new THREE.Vector3();

export function sweepBallAgainstRacket(
  previousWorld: THREE.Vector3,
  currentWorld: THREE.Vector3,
  ballRadiusWorld: number,
  colliderWorldMatrix: THREE.Matrix4,
  assistMode: AssistMode,
  previousColliderWorldMatrix: THREE.Matrix4 = colliderWorldMatrix
): RacketCollisionResult {
  const previousInverse = previousColliderWorldMatrix.clone().invert();
  const currentInverse = colliderWorldMatrix.clone().invert();
  const previous = previousWorld.clone().applyMatrix4(previousInverse);
  const current = currentWorld.clone().applyMatrix4(currentInverse);
  const scale = new THREE.Vector3();
  colliderWorldMatrix.decompose(EMPTY, new THREE.Quaternion(), scale);
  const worldScale = Math.max(0.0001, (Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3);
  const radiusLocal = ballRadiusWorld / worldScale;
  const assistScale = BALL_CONFIG.collision.assistScale[assistMode];
  const halfWidth = BALL_CONFIG.collision.halfWidthLocal * assistScale;
  const halfHeight = BALL_CONFIG.collision.halfHeightLocal * assistScale;
  const planeTolerance = BALL_CONFIG.collision.thicknessLocal + radiusLocal +
    BALL_CONFIG.collision.movingRacketToleranceLocal[assistMode];
  const denominator = previous.z - current.z;
  const crossesPlane = previous.z * current.z <= 0 && Math.abs(denominator) > 1e-8;
  const t = crossesPlane
    ? THREE.MathUtils.clamp(previous.z / denominator, 0, 1)
    : Math.abs(previous.z) <= Math.abs(current.z) ? 0 : 1;
  const crossing = previous.clone().lerp(current, t);
  const planeDistance = Math.min(Math.abs(previous.z), Math.abs(current.z), Math.abs(crossing.z));
  const insideWidth = Math.abs(crossing.x) <= halfWidth + radiusLocal;
  const insideHeight = Math.abs(crossing.y) <= halfHeight + radiusLocal;
  const ellipseValue = (crossing.x * crossing.x) / ((halfWidth + radiusLocal) ** 2) +
    (crossing.y * crossing.y) / ((halfHeight + radiusLocal) ** 2);
  const candidate = (crossesPlane || planeDistance <= planeTolerance) && ellipseValue <= 1;
  return {
    crossed: crossesPlane,
    candidate,
    assisted: candidate && assistMode !== "off" && (
      Math.abs(crossing.x) > BALL_CONFIG.collision.halfWidthLocal ||
      Math.abs(crossing.y) > BALL_CONFIG.collision.halfHeightLocal ||
      planeDistance > BALL_CONFIG.collision.thicknessLocal + radiusLocal
    ),
    contactPointWorld: crossing.clone().applyMatrix4(colliderWorldMatrix),
    contactPointLocal: crossing,
    currentLocalPosition: current,
    insideWidth,
    insideHeight,
    planeDistance,
    ellipseValue,
    closestDistance: Math.sqrt(crossing.x ** 2 + crossing.y ** 2 + crossing.z ** 2) * worldScale
  };
}

export function sweepBallAgainstMovingRacket(
  previousWorld: THREE.Vector3,
  currentWorld: THREE.Vector3,
  ballRadiusWorld: number,
  previousColliderWorldMatrix: THREE.Matrix4,
  colliderWorldMatrix: THREE.Matrix4,
  assistMode: AssistMode,
  samples: number
): RacketCollisionResult {
  const count = Math.max(1, Math.floor(samples));
  let best: RacketCollisionResult | null = null;
  for (let index = 0; index < count; index += 1) {
    const start = index / count;
    const end = (index + 1) / count;
    const result = sweepBallAgainstRacket(
      previousWorld.clone().lerp(currentWorld, start),
      previousWorld.clone().lerp(currentWorld, end),
      ballRadiusWorld,
      interpolateMatrix(previousColliderWorldMatrix, colliderWorldMatrix, end),
      assistMode,
      interpolateMatrix(previousColliderWorldMatrix, colliderWorldMatrix, start)
    );
    if (!best || result.candidate || result.closestDistance < best.closestDistance) best = result;
    if (result.candidate) return result;
  }
  return best!;
}

function interpolateMatrix(from: THREE.Matrix4, to: THREE.Matrix4, amount: number): THREE.Matrix4 {
  const fromPosition = new THREE.Vector3();
  const fromQuaternion = new THREE.Quaternion();
  const fromScale = new THREE.Vector3();
  const toPosition = new THREE.Vector3();
  const toQuaternion = new THREE.Quaternion();
  const toScale = new THREE.Vector3();
  from.decompose(fromPosition, fromQuaternion, fromScale);
  to.decompose(toPosition, toQuaternion, toScale);
  return new THREE.Matrix4().compose(
    fromPosition.lerp(toPosition, amount),
    fromQuaternion.slerp(toQuaternion, amount),
    fromScale.lerp(toScale, amount)
  );
}
