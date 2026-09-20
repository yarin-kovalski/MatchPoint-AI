import test from "node:test";
import assert from "node:assert/strict";
import { BALL_CONFIG } from "../client-pc/src/ball/ballConfig.js";
import {
  createGameTargetLayouts, isTargetFullyInSinglesCourt, scoreGameBounce
} from "../client-pc/src/game/targetGame.js";

test("every game target and its full radius stays inside the opponent singles court", () => {
  const layouts = createGameTargetLayouts(BALL_CONFIG.launch.netDepth);
  assert.equal(layouts.length, 3);
  assert.ok(layouts.every(layout => layout.length === 3));
  for (const target of layouts.flat()) {
    assert.equal(isTargetFullyInSinglesCourt(target, BALL_CONFIG.launch.netDepth), true, target.id);
  }
});

test("hard small targets pay more and only an in-court bounce can score", () => {
  const targets = createGameTargetLayouts(BALL_CONFIG.launch.netDepth).flat();
  const easy = targets.find(target => target.difficulty === "Easy")!;
  const hard = targets.find(target => target.points === 80)!;
  assert.ok(scoreGameBounce({ x: hard.x, z: hard.z }, "IN", [hard])!.points >
    scoreGameBounce({ x: easy.x, z: easy.z }, "IN", [easy])!.points);
  assert.equal(scoreGameBounce({ x: hard.x, z: hard.z }, "OUT_LONG", [hard]), null);
  assert.equal(scoreGameBounce({ x: hard.x + hard.radius + 0.01, z: hard.z }, "IN", [hard]), null);
});

test("target edge earns less than its center", () => {
  const target = createGameTargetLayouts(BALL_CONFIG.launch.netDepth)[0][0];
  const center = scoreGameBounce({ x: target.x, z: target.z }, "IN", [target])!;
  const edge = scoreGameBounce({ x: target.x + target.radius * 0.9, z: target.z }, "IN", [target])!;
  assert.equal(center.points, target.points);
  assert.ok(edge.points < center.points && edge.points >= Math.round(target.points * 0.7));
});
