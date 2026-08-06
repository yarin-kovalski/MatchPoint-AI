import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import { estimateSecondBounceDelay, getBallDeliveryTarget, getExpectedRacketContactTransform, solveVelocity } from "./ballDelivery.js";
import { BackhandStyle } from "../strokeDetection/strokeTypes.js";
import { Handedness } from "../strokeDetection/strokeTypes.js";
import { BallSpeedPreset, LaunchPreset } from "./ballTypes.js";

export function getLaunchParameters(
  preset: LaunchPreset,
  handedness: Handedness,
  speed: BallSpeedPreset,
  backhandStyle: BackhandStyle = "one-handed",
  targetOffsets?: { heightOffset?: number; sideOffset?: number; depthOffset?: number }
): { position: THREE.Vector3; velocity: THREE.Vector3; bouncePoint: THREE.Vector3; contactTarget: THREE.Vector3; contactQuaternion: THREE.Quaternion; strokeType: "forehand" | "backhand"; contactTimeAfterBounce: number; predictedSecondBounceTimeAfterBounce: number } {
  const values = BALL_CONFIG.launch[preset];
  const position = new THREE.Vector3(...BALL_CONFIG.launch.launchPosition);
  const contactTarget = getBallDeliveryTarget({ preset, handedness, backhandStyle, ...targetOffsets });
  const strokeType = preset === "easyBackhand" ? "backhand" : "forehand";
  const expected = getExpectedRacketContactTransform({ strokeType, handedness, backhandStyle });
  const bouncePoint = new THREE.Vector3(
    contactTarget.x * 0.55,
    BALL_CONFIG.courtHeight + BALL_CONFIG.scale.physicalRadiusMeters,
    BALL_CONFIG.launch.bounceDepth
  );
  const speedMultiplier = BALL_CONFIG.launch.speedMultipliers[speed];
  const bounceTime = values.bounceTime / speedMultiplier;
  const contactTimeAfterBounce = values.contactTimeAfterBounce / speedMultiplier;
  const postBounceVelocity = solveVelocity(bouncePoint, contactTarget, contactTimeAfterBounce);
  const predictedSecondBounceTimeAfterBounce = estimateSecondBounceDelay(postBounceVelocity.y);
  if (contactTimeAfterBounce * 1000 >= predictedSecondBounceTimeAfterBounce * 1000 - BALL_CONFIG.easyAssist.secondBounceSafetyMarginMs) {
    throw new Error(`${preset} delivery would bounce a second time before the safe contact window`);
  }
  return {
    position,
    velocity: solveVelocity(position, bouncePoint, bounceTime),
    bouncePoint,
    contactTarget,
    contactQuaternion: expected.quaternion.clone(),
    strokeType,
    contactTimeAfterBounce,
    predictedSecondBounceTimeAfterBounce
  };
}
