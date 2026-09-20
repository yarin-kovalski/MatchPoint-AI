import { TENNIS_COURT } from "../scene/tennisEnvironment.js";
import type { ReturnResult } from "../ball/courtRules.js";

export type GameTarget = {
  id: string;
  x: number;
  z: number;
  radius: number;
  points: number;
  difficulty: "Easy" | "Medium" | "Hard";
};

export type GameTargetHit = {
  target: GameTarget;
  distance: number;
  points: number;
  accuracy: number;
};

export function createGameTargetLayouts(netDepth: number): GameTarget[][] {
  const farBaseline = netDepth - TENNIS_COURT.length / 2;
  return [
    [
      target("service-t", 0, netDepth - TENNIS_COURT.serviceLineDistance, 0.92, 40, "Medium"),
      target("deep-left", -3.05, farBaseline + 1.25, 0.82, 80, "Hard"),
      target("deep-right", 3.05, farBaseline + 1.25, 0.82, 80, "Hard")
    ],
    [
      target("service-left", -2.75, netDepth - 4.7, 0.95, 35, "Easy"),
      target("deep-center", 0, farBaseline + 1.15, 0.78, 70, "Hard"),
      target("service-right", 2.75, netDepth - 4.7, 0.95, 35, "Easy")
    ],
    [
      target("short-left-angle", -2.85, netDepth - 2.3, 0.78, 75, "Hard"),
      target("deep-middle-left", -1.35, farBaseline + 1.8, 0.9, 55, "Medium"),
      target("short-right-angle", 2.85, netDepth - 2.3, 0.78, 75, "Hard")
    ]
  ];
}

export function isTargetFullyInSinglesCourt(target: GameTarget, netDepth: number): boolean {
  const singlesHalf = TENNIS_COURT.singlesWidth / 2;
  const farBaseline = netDepth - TENNIS_COURT.length / 2;
  return Math.abs(target.x) + target.radius <= singlesHalf &&
    target.z + target.radius <= netDepth && target.z - target.radius >= farBaseline;
}

export function scoreGameBounce(
  point: { x: number; z: number } | null,
  result: ReturnResult,
  targets: readonly GameTarget[]
): GameTargetHit | null {
  if (!point || result !== "IN") return null;
  let best: GameTargetHit | null = null;
  for (const candidate of targets) {
    const distance = Math.hypot(point.x - candidate.x, point.z - candidate.z);
    if (distance > candidate.radius) continue;
    const accuracy = Math.max(0, 1 - distance / candidate.radius);
    const points = Math.round(candidate.points * (0.7 + accuracy * 0.3));
    const hit = { target: candidate, distance, points, accuracy };
    if (!best || hit.points > best.points) best = hit;
  }
  return best;
}

function target(id: string, x: number, z: number, radius: number, points: number,
  difficulty: GameTarget["difficulty"]): GameTarget {
  return { id, x, z, radius, points, difficulty };
}
