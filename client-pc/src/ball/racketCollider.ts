import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import { AssistMode, RacketCollisionResult } from "./ballTypes.js";

const EMPTY = new THREE.Vector3();

export function sweepBallAgainstRacket(
  previousWorld: THREE.Vector3,
  currentWorld: THREE.Vector3,
  ballRadiusWorld: number,
  colliderWorldMatrix: THREE.Matrix4,
  assistMode: AssistMode
): RacketCollisionResult {
  const inverse = colliderWorldMatrix.clone().invert();
  const previous = previousWorld.clone().applyMatrix4(inverse);
  const current = currentWorld.clone().applyMatrix4(inverse);
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
