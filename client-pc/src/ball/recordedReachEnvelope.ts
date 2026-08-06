import * as THREE from "three";
import { Handedness } from "../strokeDetection/strokeTypes.js";

export type RecordedReachEnvelope = {
  center: THREE.Vector3;
  min: THREE.Vector3;
  max: THREE.Vector3;
  comfortableCenter: THREE.Vector3;
  dominantContactPlane: THREE.Vector3;
  timeRangeAfterLaunchMs: { minimum: number; maximum: number };
};

const RIGHT_HANDED = {
  forehand: {
    center: [-0.7132710594, 0.5374437995, -1.9047420916],
    min: [-0.8365643903, 0.0734054519, -2.2074227673],
    max: [-0.5723004583, 1.6067554725, -1.6988372213],
    normal: [-0.0068063189, 0.9631650755, -0.2688246853],
    timeRange: [771, 1091]
  },
  backhand: {
    center: [-0.7621310012, 0.4009542159, -1.7888857811],
    min: [-1.0123283254, 0.0748340702, -2.1428784276],
    max: [-0.5694672929, 0.9345550702, -1.6378715681],
    normal: [0.4635902845, 0.6683858655, -0.5816737771],
    timeRange: [526, 846]
  }
} as const;

export function getRecordedReachEnvelope(
  strokeType: "forehand" | "backhand",
  handedness: Handedness = "right"
): RecordedReachEnvelope {
  const value = RIGHT_HANDED[strokeType];
  const mirror = handedness === "right" ? 1 : -1;
  const vector = (source: readonly number[]) => new THREE.Vector3(source[0] * mirror, source[1], source[2]);
  const min = vector(value.min);
  const max = vector(value.max);
  if (mirror < 0) [min.x, max.x] = [max.x, min.x];
  const center = vector(value.center);
  return {
    center,
    min,
    max,
    comfortableCenter: center.clone(),
    dominantContactPlane: vector(value.normal).normalize(),
    timeRangeAfterLaunchMs: { minimum: value.timeRange[0], maximum: value.timeRange[1] }
  };
}
