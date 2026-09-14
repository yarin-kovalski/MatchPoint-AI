import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { solveTrainingReturn, isReturnInCourt } from "../client-pc/src/ball/trainingReturn.js";
import { stepBallPhysics } from "../client-pc/src/ball/ballPhysics.js";
import { BallController } from "../client-pc/src/ball/BallController.js";
import { BALL_CONFIG } from "../client-pc/src/ball/ballConfig.js";

test("Training returns clear the net and land in singles court across 162 contact/power/spin cases", () => {
  let cases = 0;
  for (const x of [-2, 0, 2]) for (const y of [0.5, 1.3, 2.2])
  for (const z of [1, 4]) for (const rawX of [-18, 0, 18]) for (const spinX of [-50, 0, 50]) {
    const start = new THREE.Vector3(x, y, z);
    const solved = solveTrainingReturn(start, new THREE.Vector3(rawX, 2, rawX === 0 ? 5 : -24), new THREE.Vector3(spinX, 8, 0));
    assert.ok(solved, `no solve ${x},${y},${z},${rawX},${spinX}`);
    const ball = new BallController().ball;
    ball.position.copy(start); ball.velocity.copy(solved.velocity); ball.spinVector.copy(solved.spin); ball.state = "RETURNED";
    let netHeight = 0;
    for (let frame = 0; frame < 480 && ball.bounceCount === 0; frame++) {
      const previous = ball.position.clone();
      stepBallPhysics(ball, BALL_CONFIG.physicsStepSeconds);
      if (previous.z > BALL_CONFIG.launch.netDepth && ball.position.z <= BALL_CONFIG.launch.netDepth) {
        netHeight = THREE.MathUtils.lerp(previous.y, ball.position.y,
          (previous.z - BALL_CONFIG.launch.netDepth) / (previous.z - ball.position.z));
      }
    }
    assert.ok(netHeight > BALL_CONFIG.launch.netHeight + ball.physicsRadius);
    assert.equal(ball.bounceCount, 1);
    assert.ok(isReturnInCourt(ball.position), `out ${ball.position.toArray()}`);
    cases++;
  }
  assert.equal(cases, 162);
});

test("landing judge rejects near court, wide balls and long balls", () => {
  const net = BALL_CONFIG.launch.netDepth;
  assert.equal(isReturnInCourt(new THREE.Vector3(0, 0, net - 6)), true);
  for (const p of [[5, 0, net - 6], [0, 0, net + 1], [0, 0, net - 13]]) {
    assert.equal(isReturnInCourt(new THREE.Vector3(...p)), false);
  }
});
