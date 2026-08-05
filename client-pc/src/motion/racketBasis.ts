import * as THREE from "three";

export type RacketBasis = {
  forward: THREE.Vector3;
  up: THREE.Vector3;
  side: THREE.Vector3;
  faceNormal: THREE.Vector3;
  faceAngleToCourtRadians: number;
};

const MODEL_HEAD_AXIS = new THREE.Vector3(0, 1, 0);
const MODEL_FACE_NORMAL = new THREE.Vector3(0, 0, 1);
const MODEL_SIDE_AXIS = new THREE.Vector3(1, 0, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export function getRacketBasisFromQuaternion(quaternion: THREE.Quaternion): RacketBasis {
  const forward = MODEL_HEAD_AXIS.clone().applyQuaternion(quaternion).normalize();
  const faceNormal = MODEL_FACE_NORMAL.clone().applyQuaternion(quaternion).normalize();
  const side = MODEL_SIDE_AXIS.clone().applyQuaternion(quaternion).normalize();

  return {
    forward,
    up: faceNormal.clone(),
    side,
    faceNormal,
    faceAngleToCourtRadians: Math.acos(
      THREE.MathUtils.clamp(Math.abs(faceNormal.dot(WORLD_UP)), -1, 1)
    )
  };
}

