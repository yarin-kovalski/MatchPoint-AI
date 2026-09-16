import * as THREE from "three";
import {
  synchronizeProfileApexFromTiming, TrajectoryCalibrationProfile, worldToPlayerLocal
} from "./trajectoryCalibration.js";

export type ContactPositionCalibration = {
  lateralMeters: number;
  verticalMeters: number;
  depthMeters: number;
  version: 1;
};

export type ContactCalibrationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const CONTACT_CALIBRATION_STEP_METERS = 0.05;
export const DEFAULT_CONTACT_POSITION_CALIBRATION: ContactPositionCalibration = {
  lateralMeters: 0, verticalMeters: 0, depthMeters: 0, version: 1
};

const LIMITS = { lateral: 0.65, vertical: 0.30, depth: 0.50 } as const;
const STORAGE_PREFIX = "matchpoint.contact-position.v1";

export function applyContactPositionCalibration(
  source: TrajectoryCalibrationProfile,
  calibration: ContactPositionCalibration
): TrajectoryCalibrationProfile {
  const profile = structuredClone(source);
  const safe = normalizeContactPositionCalibration(calibration);
  const basis = profile.playerBasisAtCalibration;
  const contact = new THREE.Vector3().fromArray(profile.contactPointWorld)
    .addScaledVector(new THREE.Vector3().fromArray(basis.right).normalize(), safe.lateralMeters)
    .addScaledVector(new THREE.Vector3().fromArray(basis.up).normalize(), safe.verticalMeters)
    .addScaledVector(new THREE.Vector3().fromArray(basis.forward).normalize(), safe.depthMeters);
  profile.contactPointWorld = contact.toArray();
  profile.contactPointPlayerLocal = worldToPlayerLocal(contact, basis).toArray();

  // Keep the bounce-to-contact path centered on the newly marked strike point.
  const launch = new THREE.Vector3().fromArray(profile.launchPointWorld);
  const bounce = new THREE.Vector3().fromArray(profile.bouncePointWorld);
  const progress = THREE.MathUtils.clamp(
    (bounce.z - launch.z) / Math.max(0.001, contact.z - launch.z), 0.1, 0.9
  );
  bounce.x = THREE.MathUtils.lerp(launch.x, contact.x, progress);
  profile.bouncePointWorld = bounce.toArray();
  synchronizeProfileApexFromTiming(profile);
  return profile;
}

export function adjustContactPositionCalibration(
  calibration: ContactPositionCalibration,
  axis: "lateral" | "vertical" | "depth",
  deltaMeters: number
): ContactPositionCalibration {
  const next = { ...calibration };
  if (axis === "lateral") next.lateralMeters += deltaMeters;
  if (axis === "vertical") next.verticalMeters += deltaMeters;
  if (axis === "depth") next.depthMeters += deltaMeters;
  return normalizeContactPositionCalibration(next);
}

export function loadContactPositionCalibration(
  storage: ContactCalibrationStorage,
  strokeType: "forehand" | "backhand"
): ContactPositionCalibration {
  try {
    const raw = storage.getItem(storageKey(strokeType));
    return raw ? normalizeContactPositionCalibration(JSON.parse(raw)) : { ...DEFAULT_CONTACT_POSITION_CALIBRATION };
  } catch {
    return { ...DEFAULT_CONTACT_POSITION_CALIBRATION };
  }
}

export function saveContactPositionCalibration(
  storage: ContactCalibrationStorage,
  strokeType: "forehand" | "backhand",
  calibration: ContactPositionCalibration
): ContactPositionCalibration {
  const safe = normalizeContactPositionCalibration(calibration);
  storage.setItem(storageKey(strokeType), JSON.stringify(safe));
  return safe;
}

export function resetContactPositionCalibration(
  storage: ContactCalibrationStorage,
  strokeType: "forehand" | "backhand"
): ContactPositionCalibration {
  storage.removeItem(storageKey(strokeType));
  return { ...DEFAULT_CONTACT_POSITION_CALIBRATION };
}

export function formatContactPositionCalibration(calibration: ContactPositionCalibration): string {
  const horizontal = calibration.lateralMeters === 0 ? "centered"
    : `${Math.abs(calibration.lateralMeters).toFixed(2)} m ${calibration.lateralMeters > 0 ? "right" : "left"}`;
  const height = calibration.verticalMeters === 0 ? "standard height"
    : `${Math.abs(calibration.verticalMeters).toFixed(2)} m ${calibration.verticalMeters > 0 ? "higher" : "lower"}`;
  const depth = calibration.depthMeters === 0 ? "standard depth"
    : `${Math.abs(calibration.depthMeters).toFixed(2)} m ${calibration.depthMeters > 0 ? "farther into court" : "closer"}`;
  return `${horizontal} · ${height} · ${depth}`;
}

function normalizeContactPositionCalibration(value: Partial<ContactPositionCalibration>): ContactPositionCalibration {
  return {
    lateralMeters: clampFinite(value.lateralMeters, LIMITS.lateral),
    verticalMeters: clampFinite(value.verticalMeters, LIMITS.vertical),
    depthMeters: clampFinite(value.depthMeters, LIMITS.depth),
    version: 1
  };
}

function clampFinite(value: number | undefined, limit: number): number {
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value! : 0, -limit, limit);
}

function storageKey(strokeType: "forehand" | "backhand"): string {
  return `${STORAGE_PREFIX}.${strokeType}`;
}
