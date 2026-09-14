import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import { TENNIS_COURT } from "../scene/tennisEnvironment.js";

export type ReturnResult = "IN" | "OUT_WIDE" | "OUT_LONG" | "SHORT" | "NET" | "OUT";

/** Singles rally rules. Radius approximates the ball's contact footprint on a line. */
export function judgeReturnBounce(point: THREE.Vector3, touchedNet = false): ReturnResult {
  if (![point.x, point.y, point.z].every(Number.isFinite)) return "OUT";
  const radius = BALL_CONFIG.scale.physicalRadiusMeters;
  if (point.z >= BALL_CONFIG.launch.netDepth) return touchedNet ? "NET" : "SHORT";
  if (Math.abs(point.x) > TENNIS_COURT.singlesWidth / 2 + radius) return "OUT_WIDE";
  if (point.z < BALL_CONFIG.launch.netDepth - TENNIS_COURT.length / 2 - radius) return "OUT_LONG";
  return "IN";
}
export function isReturnInCourt(point: THREE.Vector3): boolean { return judgeReturnBounce(point) === "IN"; }

export function netHeightAt(x: number): number {
  // Smooth approximation to the net sag, from the centre strap to the posts.
  const across = Math.min(1, Math.abs(x) / (TENNIS_COURT.netWidth / 2));
  return TENNIS_COURT.netCenterHeight + (TENNIS_COURT.netPostHeight - TENNIS_COURT.netCenterHeight) * across * across;
}
export const NET_HALF_WIDTH = TENNIS_COURT.netWidth / 2;
