import * as THREE from "three";

export function smoothVector(
  current: THREE.Vector3,
  sample: THREE.Vector3,
  factor: number
): THREE.Vector3 {
  return current.lerp(sample, THREE.MathUtils.clamp(factor, 0, 1));
}

export function ensureQuaternionContinuity(
  current: THREE.Quaternion,
  previous: THREE.Quaternion | null
): THREE.Quaternion {
  if (previous && previous.dot(current) < 0) {
    current.set(-current.x, -current.y, -current.z, -current.w);
  }

  return current;
}

export function isFiniteVector(value: THREE.Vector3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

export function isFiniteQuaternion(value: THREE.Quaternion): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z) &&
    Number.isFinite(value.w)
  );
}

