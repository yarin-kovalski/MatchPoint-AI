import * as THREE from "three";
import { BallSnapshot } from "./ballTypes.js";

export type BallVisualLifecycle = {
  lastStateTransition: string;
  lastResetReason: string;
  lastHideReason: string;
};

export type BallVisualAudit = {
  valid: boolean;
  errors: string[];
  state: string;
  active: boolean;
  visible: boolean;
  position: [number, number, number];
  distanceFromCamera: number;
  cameraNear: number;
  cameraFar: number;
  insideFrustum: boolean;
  attachedToScene: boolean;
  lifecycle: BallVisualLifecycle;
};

const projectionMatrix = new THREE.Matrix4();
const frustum = new THREE.Frustum();

export function assertBallVisualState(
  ball: BallSnapshot,
  mesh: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  expectedScene: THREE.Scene,
  lifecycle: BallVisualLifecycle
): BallVisualAudit {
  camera.updateMatrixWorld();
  projectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projectionMatrix);
  const errors: string[] = [];
  const finitePosition = ball.position.toArray().every(Number.isFinite);
  const finiteQuaternion = mesh.quaternion.toArray().every(Number.isFinite);
  const finiteScale = mesh.scale.toArray().every(Number.isFinite);
  const attachedToScene = mesh.parent === expectedScene;
  if (ball.active && !mesh.visible) errors.push("ACTIVE_BALL_HIDDEN");
  if (!finitePosition) errors.push("NON_FINITE_POSITION");
  if (!finiteQuaternion) errors.push("NON_FINITE_QUATERNION");
  if (!finiteScale) errors.push("NON_FINITE_SCALE");
  if (ball.active && !attachedToScene) errors.push("ACTIVE_BALL_DETACHED");
  return {
    valid: errors.length === 0,
    errors,
    state: ball.state,
    active: ball.active,
    visible: mesh.visible,
    position: ball.position.toArray(),
    distanceFromCamera: camera.position.distanceTo(ball.position),
    cameraNear: camera.near,
    cameraFar: camera.far,
    insideFrustum: frustum.intersectsObject(mesh),
    attachedToScene,
    lifecycle
  };
}
