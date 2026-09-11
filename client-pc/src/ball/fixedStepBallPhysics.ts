import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import { stepBallPhysics } from "./ballPhysics.js";
import { BallSnapshot } from "./ballTypes.js";

export type FixedStepPhysicsState = {
  accumulatorSeconds: number;
  droppedSeconds: number;
  totalSteps: number;
  frameStartPosition: THREE.Vector3;
  previousStepPosition: THREE.Vector3;
};

export type FixedStepPhysicsResult = {
  bounced: boolean;
  steps: number;
  droppedSeconds: number;
};

export function createFixedStepPhysicsState(): FixedStepPhysicsState {
  return {
    accumulatorSeconds: 0,
    droppedSeconds: 0,
    totalSteps: 0,
    frameStartPosition: new THREE.Vector3(),
    previousStepPosition: new THREE.Vector3()
  };
}

export function advanceBallFixedStep(
  ball: BallSnapshot,
  frameDeltaSeconds: number,
  state: FixedStepPhysicsState
): FixedStepPhysicsResult {
  const frameDelta = THREE.MathUtils.clamp(frameDeltaSeconds, 0, BALL_CONFIG.maximumFrameDeltaSeconds);
  const fixedDelta = BALL_CONFIG.physicsStepSeconds;
  state.frameStartPosition.copy(ball.position);
  state.accumulatorSeconds += frameDelta;
  let bounced = false;
  let steps = 0;

  while (state.accumulatorSeconds >= fixedDelta && steps < BALL_CONFIG.maximumPhysicsSubsteps) {
    state.previousStepPosition.copy(ball.position);
    bounced = stepBallPhysics(ball, fixedDelta) || bounced;
    state.accumulatorSeconds -= fixedDelta;
    steps += 1;
  }

  let droppedSeconds = 0;
  if (state.accumulatorSeconds >= fixedDelta) {
    droppedSeconds = state.accumulatorSeconds - state.accumulatorSeconds % fixedDelta;
    state.accumulatorSeconds %= fixedDelta;
    state.droppedSeconds += droppedSeconds;
  }
  state.totalSteps += steps;

  // Collision remains swept across the full render interval, not only the final substep.
  if (steps > 0) ball.previousPosition.copy(state.frameStartPosition);
  return { bounced, steps, droppedSeconds };
}

/** Interpolate completed physics states, never feed this transform into collision. */
export function sampleBallVisualPosition(ball: BallSnapshot, state: FixedStepPhysicsState, output: THREE.Vector3): THREE.Vector3 {
  return output.copy(state.previousStepPosition).lerp(ball.position,
    THREE.MathUtils.clamp(state.accumulatorSeconds / BALL_CONFIG.physicsStepSeconds, 0, 1));
}
