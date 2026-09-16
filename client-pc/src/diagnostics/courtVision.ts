import { BALL_CONFIG } from "../ball/ballConfig.js";
import { TENNIS_COURT, tennisFenceBounds } from "../scene/tennisEnvironment.js";
import type { TrainingReturnOutcome } from "./smartTrainingSession.js";

export type CourtBounce = {
  x: number;
  z: number;
  outcome: TrainingReturnOutcome;
};

export type CourtMapPoint = { x: number; y: number };

const VIEW_WIDTH = 160;
const VIEW_HEIGHT = 250;
const MAP_PADDING = 10;

export function courtPointToMap(x: number, z: number): CourtMapPoint {
  const bounds = tennisFenceBounds(BALL_CONFIG.launch.netDepth);
  return {
    x: MAP_PADDING + (x - bounds.left) / (bounds.right - bounds.left) * (VIEW_WIDTH - MAP_PADDING * 2),
    y: MAP_PADDING + (z - bounds.far) / (bounds.near - bounds.far) * (VIEW_HEIGHT - MAP_PADDING * 2)
  };
}

export function createCourtMapSvg(bounces: CourtBounce[], accessibleLabel = "Shot placement map"): string {
  const netDepth = BALL_CONFIG.launch.netDepth;
  const halfLength = TENNIS_COURT.length / 2;
  const doublesHalf = TENNIS_COURT.doublesWidth / 2;
  const singlesHalf = TENNIS_COURT.singlesWidth / 2;
  const topLeft = courtPointToMap(-doublesHalf, netDepth - halfLength);
  const bottomRight = courtPointToMap(doublesHalf, netDepth + halfLength);
  const singlesLeft = courtPointToMap(-singlesHalf, netDepth).x;
  const singlesRight = courtPointToMap(singlesHalf, netDepth).x;
  const netY = courtPointToMap(0, netDepth).y;
  const farServiceY = courtPointToMap(0, netDepth - TENNIS_COURT.serviceLineDistance).y;
  const nearServiceY = courtPointToMap(0, netDepth + TENNIS_COURT.serviceLineDistance).y;
  const markers = bounces.filter(validBounce).map((bounce, index) => {
    const point = courtPointToMap(bounce.x, bounce.z);
    const inCourt = bounce.outcome === "IN";
    const fill = inCourt ? "#c8f268" : "#ff765f";
    const label = `Shot ${index + 1}: ${bounce.outcome.replace(/_/g, " ")}`;
    return `<g class="court-map-marker ${inCourt ? "is-in" : "is-out"}"><title>${label}</title><circle cx="${round(point.x)}" cy="${round(point.y)}" r="5.2" fill="${fill}" stroke="#fff" stroke-width="2"/><circle cx="${round(point.x)}" cy="${round(point.y)}" r="8.5" fill="none" stroke="${fill}" stroke-width="1.5" opacity=".48"/></g>`;
  }).join("");
  return `<svg class="court-map-svg" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}" role="img" aria-label="${accessibleLabel}">
    <rect x="2" y="2" width="156" height="246" rx="8" fill="#264d3e" stroke="#73907d" stroke-width="2"/>
    <rect x="${round(topLeft.x)}" y="${round(topLeft.y)}" width="${round(bottomRight.x - topLeft.x)}" height="${round(bottomRight.y - topLeft.y)}" fill="#48738f" stroke="#f4f3e9" stroke-width="2"/>
    <path d="M ${round(singlesLeft)} ${round(topLeft.y)} V ${round(bottomRight.y)} M ${round(singlesRight)} ${round(topLeft.y)} V ${round(bottomRight.y)} M ${round(singlesLeft)} ${round(farServiceY)} H ${round(singlesRight)} M ${round(singlesLeft)} ${round(nearServiceY)} H ${round(singlesRight)} M 80 ${round(farServiceY)} V ${round(nearServiceY)}" fill="none" stroke="#f4f3e9" stroke-width="1.35"/>
    <line x1="${round(topLeft.x - 5)}" y1="${round(netY)}" x2="${round(bottomRight.x + 5)}" y2="${round(netY)}" stroke="#17252a" stroke-width="3"/>
    <line x1="${round(topLeft.x - 5)}" y1="${round(netY - 1)}" x2="${round(bottomRight.x + 5)}" y2="${round(netY - 1)}" stroke="#f3f0df" stroke-width="1"/>
    ${markers}
  </svg>`;
}

function validBounce(bounce: CourtBounce): boolean {
  return Number.isFinite(bounce.x) && Number.isFinite(bounce.z);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
