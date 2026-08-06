import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";

export type Vec3 = [number, number, number];
export type QuaternionTuple = [number, number, number, number];
export type CalibrationStrokeType = "forehand" | "backhand";

export type PlayerBasisData = { forward: Vec3; right: Vec3; up: Vec3; origin: Vec3 };

export type TrajectoryCalibrationProfile = {
  strokeType: CalibrationStrokeType;
  handedness: "right" | "left";
  playerBasisAtCalibration: PlayerBasisData;
  launchPointWorld: Vec3;
  bouncePointWorld: Vec3;
  apexPointWorld: Vec3;
  contactPointWorld: Vec3;
  contactPointPlayerLocal: Vec3;
  contactRacketQuaternion: QuaternionTuple;
  contactFaceNormal: Vec3;
  bounceToApexMs: number;
  bounceToContactMs: number;
  overallSpeed: number;
  createdAt: number;
  version: number;
};

export type SolvedTrajectory = {
  profile: TrajectoryCalibrationProfile;
  launchToBounceSeconds: number;
  preBounceVelocity: THREE.Vector3;
  postBounceVelocity: THREE.Vector3;
  solvedApexPoint: THREE.Vector3;
  requestedCurve: THREE.Vector3[];
  physicalCurve: THREE.Vector3[];
  maximumCurveDeviation: number;
  secondBounceMs: number;
  safetyMarginMs: number;
  valid: boolean;
  errors: string[];
};

export type CalibrationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const TRAJECTORY_PROFILE_VERSION = 1;
export const TRAJECTORY_STORAGE_PREFIX = "matchpoint.trajectory.v1";
export const MINIMUM_SIDE_OFFSET = 0.25;

export function createPlayerBasis(origin = new THREE.Vector3(0, 0, 0)): PlayerBasisData {
  const forward = new THREE.Vector3(0, 0, -1).normalize();
  const up = new THREE.Vector3(0, 1, 0).normalize();
  const right = forward.clone().cross(up).normalize();
  return { forward: forward.toArray(), right: right.toArray(), up: up.toArray(), origin: origin.toArray() };
}

export function worldToPlayerLocal(point: THREE.Vector3, basis: PlayerBasisData): THREE.Vector3 {
  const relative = point.clone().sub(new THREE.Vector3().fromArray(basis.origin));
  return new THREE.Vector3(
    relative.dot(new THREE.Vector3().fromArray(basis.right)),
    relative.dot(new THREE.Vector3().fromArray(basis.up)),
    relative.dot(new THREE.Vector3().fromArray(basis.forward))
  );
}

export function playerLocalToWorld(point: THREE.Vector3, basis: PlayerBasisData): THREE.Vector3 {
  return new THREE.Vector3().fromArray(basis.origin)
    .addScaledVector(new THREE.Vector3().fromArray(basis.right), point.x)
    .addScaledVector(new THREE.Vector3().fromArray(basis.up), point.y)
    .addScaledVector(new THREE.Vector3().fromArray(basis.forward), point.z);
}

export function createDefaultTrajectoryProfile(strokeType: CalibrationStrokeType, handedness: "right" | "left", now = Date.now()): TrajectoryCalibrationProfile {
  const basis = createPlayerBasis();
  const handednessSign = handedness === "right" ? 1 : -1;
  const side = (strokeType === "forehand" ? 0.85 : -0.85) * handednessSign;
  const bounce = new THREE.Vector3(side * 0.55, BALL_CONFIG.courtHeight + BALL_CONFIG.scale.physicalRadiusMeters, -4.65);
  const contact = new THREE.Vector3(side, 1.1, -1.75);
  const contactMs = 600;
  const velocityY = (contact.y - bounce.y - 0.5 * BALL_CONFIG.gravity * (contactMs / 1000) ** 2) / (contactMs / 1000);
  const apexSeconds = velocityY / Math.abs(BALL_CONFIG.gravity);
  const apex = bounce.clone().addScaledVector(new THREE.Vector3(
    (contact.x - bounce.x) / (contactMs / 1000), velocityY,
    (contact.z - bounce.z) / (contactMs / 1000)
  ), apexSeconds);
  apex.y = bounce.y + velocityY ** 2 / (2 * Math.abs(BALL_CONFIG.gravity));
  return {
    strokeType, handedness, playerBasisAtCalibration: basis,
    launchPointWorld: [...BALL_CONFIG.launch.launchPosition], bouncePointWorld: bounce.toArray(),
    apexPointWorld: apex.toArray(), contactPointWorld: contact.toArray(),
    contactPointPlayerLocal: worldToPlayerLocal(contact, basis).toArray(),
    contactRacketQuaternion: [0, 0, 0, 1], contactFaceNormal: [0, 0, -1],
    bounceToApexMs: apexSeconds * 1000, bounceToContactMs: contactMs,
    overallSpeed: 4.2, createdAt: now, version: TRAJECTORY_PROFILE_VERSION
  };
}

export function setProfileArcHeight(profile: TrajectoryCalibrationProfile, apexHeight: number): void {
  const bounce = new THREE.Vector3().fromArray(profile.bouncePointWorld);
  const contact = new THREE.Vector3().fromArray(profile.contactPointWorld);
  if (apexHeight <= Math.max(bounce.y, contact.y)) throw new Error("CALIBRATION_TOO_LOW: apex must exceed bounce and contact");
  const apexSeconds = Math.sqrt(2 * (apexHeight - bounce.y) / Math.abs(BALL_CONFIG.gravity));
  const descentSeconds = Math.sqrt(2 * (apexHeight - contact.y) / Math.abs(BALL_CONFIG.gravity));
  const contactSeconds = apexSeconds + descentSeconds;
  profile.bounceToApexMs = apexSeconds * 1000;
  profile.bounceToContactMs = contactSeconds * 1000;
  const horizontalVelocity = new THREE.Vector3(
    (contact.x - bounce.x) / contactSeconds, 0, (contact.z - bounce.z) / contactSeconds
  );
  profile.apexPointWorld = bounce.clone().addScaledVector(horizontalVelocity, apexSeconds).setY(apexHeight).toArray();
}

export function synchronizeProfileApexFromTiming(profile: TrajectoryCalibrationProfile): void {
  const bounce = new THREE.Vector3().fromArray(profile.bouncePointWorld);
  const contact = new THREE.Vector3().fromArray(profile.contactPointWorld);
  const seconds = profile.bounceToContactMs / 1000;
  const velocityY = (contact.y - bounce.y - 0.5 * BALL_CONFIG.gravity * seconds ** 2) / seconds;
  const apexSeconds = Math.max(0, velocityY / Math.abs(BALL_CONFIG.gravity));
  const horizontalVelocity = new THREE.Vector3((contact.x - bounce.x) / seconds, 0, (contact.z - bounce.z) / seconds);
  profile.bounceToApexMs = apexSeconds * 1000;
  profile.apexPointWorld = bounce.clone().addScaledVector(horizontalVelocity, apexSeconds)
    .setY(bounce.y + velocityY ** 2 / (2 * Math.abs(BALL_CONFIG.gravity))).toArray();
}

export function solveTrajectoryProfile(profile: TrajectoryCalibrationProfile): SolvedTrajectory {
  const errors = validateTrajectoryProfile(profile);
  const launch = new THREE.Vector3().fromArray(profile.launchPointWorld);
  const bounce = new THREE.Vector3().fromArray(profile.bouncePointWorld);
  const contact = new THREE.Vector3().fromArray(profile.contactPointWorld);
  const contactSeconds = profile.bounceToContactMs / 1000;
  const horizontalDistance = Math.hypot(bounce.x - launch.x, bounce.z - launch.z);
  const launchToBounceSeconds = horizontalDistance / Math.max(profile.overallSpeed, 0.1);
  const solve = (start: THREE.Vector3, end: THREE.Vector3, seconds: number) => new THREE.Vector3(
    (end.x - start.x) / seconds,
    (end.y - start.y - 0.5 * BALL_CONFIG.gravity * seconds ** 2) / seconds,
    (end.z - start.z) / seconds
  );
  const preBounceVelocity = solve(launch, bounce, launchToBounceSeconds);
  const postBounceVelocity = solve(bounce, contact, contactSeconds);
  const apexSeconds = Math.max(0, postBounceVelocity.y / Math.abs(BALL_CONFIG.gravity));
  const solvedApexPoint = sampleBallistic(bounce, postBounceVelocity, apexSeconds);
  const requestedApex = new THREE.Vector3().fromArray(profile.apexPointWorld);
  const requestedVerticalSpeed = Math.sqrt(Math.max(0, 2 * Math.abs(BALL_CONFIG.gravity) * (requestedApex.y - bounce.y)));
  const requestedVelocity = new THREE.Vector3(postBounceVelocity.x, requestedVerticalSpeed, postBounceVelocity.z);
  const requestedCurve: THREE.Vector3[] = [];
  const physicalCurve: THREE.Vector3[] = [];
  let maximumCurveDeviation = 0;
  for (let index = 0; index <= 32; index += 1) {
    const amount = index / 32;
    const requested = sampleBallistic(bounce, requestedVelocity, contactSeconds * amount);
    const physical = sampleBallistic(bounce, postBounceVelocity, contactSeconds * amount);
    requestedCurve.push(requested);
    physicalCurve.push(physical);
    maximumCurveDeviation = Math.max(maximumCurveDeviation, requested.distanceTo(physical));
  }
  const secondBounceSeconds = Math.max(0, 2 * postBounceVelocity.y / Math.abs(BALL_CONFIG.gravity));
  if (apexSeconds <= 0 || apexSeconds >= contactSeconds) errors.push("CALIBRATION_PHYSICALLY_INVALID: apex time must be between bounce and contact");
  if (solvedApexPoint.y <= Math.max(bounce.y, contact.y)) errors.push("CALIBRATION_TOO_LOW: apex must exceed bounce and contact");
  if (Math.abs(solvedApexPoint.y - requestedApex.y) > 0.12) errors.push("CALIBRATION_PHYSICALLY_INVALID: arc height and timing disagree");
  if (maximumCurveDeviation > 0.35) errors.push("CALIBRATION_PHYSICALLY_INVALID: requested curve deviates from physics");
  if (contactSeconds >= secondBounceSeconds) errors.push("CALIBRATION_PHYSICALLY_INVALID: contact occurs after second bounce");
  const netTime = (BALL_CONFIG.launch.netDepth - launch.z) / preBounceVelocity.z;
  if (netTime > 0 && netTime < launchToBounceSeconds) {
    const netHeight = sampleBallistic(launch, preBounceVelocity, netTime).y;
    if (netHeight < BALL_CONFIG.launch.netHeight + BALL_CONFIG.scale.physicalRadiusMeters) errors.push("CALIBRATION_PHYSICALLY_INVALID: feed hits net");
  }
  return {
    profile, launchToBounceSeconds, preBounceVelocity, postBounceVelocity, solvedApexPoint,
    requestedCurve, physicalCurve, maximumCurveDeviation,
    secondBounceMs: secondBounceSeconds * 1000,
    safetyMarginMs: (secondBounceSeconds - contactSeconds) * 1000,
    valid: errors.length === 0, errors
  };
}

export function validateTrajectoryProfile(profile: TrajectoryCalibrationProfile): string[] {
  const errors: string[] = [];
  if (profile.version !== TRAJECTORY_PROFILE_VERSION) errors.push("CALIBRATION_PROFILE_NOT_LOADED: unsupported version");
  const local = worldToPlayerLocal(new THREE.Vector3().fromArray(profile.contactPointWorld), profile.playerBasisAtCalibration);
  const bounceLocal = worldToPlayerLocal(new THREE.Vector3().fromArray(profile.bouncePointWorld), profile.playerBasisAtCalibration);
  if (profile.strokeType === "forehand" && local.x <= MINIMUM_SIDE_OFFSET) errors.push("CALIBRATION_WRONG_SIDE: forehand must be on player right");
  if (profile.strokeType === "backhand" && local.x >= -MINIMUM_SIDE_OFFSET) errors.push("CALIBRATION_WRONG_SIDE: backhand must be on player left");
  if (profile.strokeType === "forehand" && bounceLocal.x <= 0) errors.push("CALIBRATION_WRONG_SIDE: forehand bounce crossed player center");
  if (profile.strokeType === "backhand" && bounceLocal.x >= 0) errors.push("CALIBRATION_WRONG_SIDE: backhand bounce crossed player center");
  if (profile.contactPointWorld[1] < 0.6) errors.push("CALIBRATION_TOO_LOW");
  if (profile.contactPointWorld[1] > 1.8 || profile.apexPointWorld[1] > 2.5) errors.push("CALIBRATION_TOO_HIGH");
  if (profile.apexPointWorld[1] < 0.8) errors.push("CALIBRATION_TOO_LOW: apex");
  if (Math.abs(profile.bouncePointWorld[0]) > 4.12 || profile.bouncePointWorld[2] < -5.49 || profile.bouncePointWorld[2] > 3) errors.push("CALIBRATION_PHYSICALLY_INVALID: bounce outside player court");
  if (profile.bounceToContactMs < 250 || profile.bounceToContactMs > 1400) errors.push("CALIBRATION_PHYSICALLY_INVALID: contact time out of range");
  return errors;
}

export function saveTrajectoryProfile(storage: CalibrationStorage, profile: TrajectoryCalibrationProfile): void {
  const solved = solveTrajectoryProfile(profile);
  if (!solved.valid) throw new Error(solved.errors.join("; "));
  storage.setItem(storageKey(profile.strokeType), JSON.stringify(profile));
}

export function loadTrajectoryProfile(storage: CalibrationStorage, strokeType: CalibrationStrokeType): TrajectoryCalibrationProfile | null {
  const raw = storage.getItem(storageKey(strokeType));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as TrajectoryCalibrationProfile;
    return solveTrajectoryProfile(value).valid ? value : null;
  } catch { return null; }
}

export function resetTrajectoryProfile(storage: CalibrationStorage, strokeType: CalibrationStrokeType): void {
  storage.removeItem(storageKey(strokeType));
}

export function sampleBallistic(start: THREE.Vector3, velocity: THREE.Vector3, seconds: number): THREE.Vector3 {
  return start.clone().addScaledVector(velocity, seconds).addScaledVector(new THREE.Vector3(0, BALL_CONFIG.gravity, 0), 0.5 * seconds ** 2);
}

function storageKey(strokeType: CalibrationStrokeType): string { return `${TRAJECTORY_STORAGE_PREFIX}.${strokeType}`; }
