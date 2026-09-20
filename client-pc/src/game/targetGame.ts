import { TENNIS_COURT } from "../scene/tennisEnvironment.js";
import type { ReturnResult } from "../ball/courtRules.js";

export const GAME_TARGET_DURATION_MS = 10_000;

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
      target("short-center", 0, netDepth - 2.9, 1.45, 20, "Easy"),
      target("deep-left", -2.65, farBaseline + 1.3, 1, 70, "Hard"),
      target("deep-right", 2.55, farBaseline + 2.25, 1.15, 50, "Medium")
    ],
    [
      target("service-left", -2.25, netDepth - 5.2, 1.3, 30, "Easy"),
      target("deep-center", 0, farBaseline + 1.25, 1.05, 60, "Hard"),
      target("short-right", 2.75, netDepth - 2.35, 1, 80, "Hard")
    ],
    [
      target("short-left", -2.75, netDepth - 2.45, 1, 70, "Hard"),
      target("mid-center", 0.35, netDepth - 6.1, 1.35, 30, "Easy"),
      target("deep-right-corner", 2.75, farBaseline + 1.2, 1, 100, "Hard")
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
