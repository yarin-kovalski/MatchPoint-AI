import * as THREE from "three";
import type { PlayerAssistLevel } from "../ball/ballTypes.js";
import type { StrokeState } from "../strokeDetection/strokeTypes.js";

/** Keep the calibrated neutral grip origin exact after a Training recovery. */
export function stabilizeTrainingRacketOrigin(
  position: THREE.Vector3,
  strokeState: StrokeState | null,
  assistLevel: PlayerAssistLevel
): boolean {
  if (assistLevel !== "training" || strokeState !== "READY") return false;
  position.set(0, 0, 0);
  return true;
}
