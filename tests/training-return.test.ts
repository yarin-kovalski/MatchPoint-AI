import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { normalizeMotionRotationRate } from "../virtucourt-mobile/deviceMotionGyro.js";
import { solveTrainingReturn, trainingFollowThroughStep } from "../client-pc/src/ball/trainingReturn.js";
import { judgeReturnBounce, netHeightAt } from "../client-pc/src/ball/courtRules.js";
import { stepBallPhysics } from "../client-pc/src/ball/ballPhysics.js";
import { BallController } from "../client-pc/src/ball/BallController.js";
import { BALL_CONFIG } from "../client-pc/src/ball/ballConfig.js";
import { EasyHitMotion } from "../client-pc/src/ball/ballTypes.js";
import { predictReturnTrajectory } from "../client-pc/src/ball/ballResponse.js";
import { SensorNormalizer } from "../client-pc/src/motion/sensorNormalization.js";
import { StrokeStateMachine } from "../client-pc/src/strokeDetection/strokeStateMachine.js";
import { EasySwingIntentDetector } from "../client-pc/src/strokeDetection/easySwingIntent.js";
import { evaluatePlayableCalibratedHit } from "../client-pc/src/ball/playableCalibratedHit.js";
import { createDefaultTrajectoryProfile } from "../client-pc/src/ball/trajectoryCalibration.js";
import { solveSpinFlight } from "../client-pc/src/ball/spinFlight.js";
import { ForwardSwingFusion } from "../client-pc/src/motion/forwardSwingFusion.js";

function motion(angularSpeed = 6, upward = 0, lateral = 0): EasyHitMotion {
  const head = new THREE.Vector3(lateral, upward * 4, -angularSpeed * 0.68);
  return { valid: true, angularSpeed, accelerationMagnitude: 8,
    racketQuaternion: new THREE.Quaternion(), racketFaceNormal: new THREE.Vector3(0, 0, -1),
    racketForwardVector: new THREE.Vector3(0, 1, 0), racketUpVector: new THREE.Vector3(0, 0, -1),
    racketSideVector: new THREE.Vector3(1, 0, 0), racketFaceAngle: 0.4,
    motionForwardScore: 0.6, motionUpwardScore: upward, motionSidewaysScore: lateral / 4,
    handedness: "right", backhandStyle: "one-handed",
    forwardSwing: { windowDurationMs: 160, sampleCount: 9, angularSpeed, faceAngleRadians: 0.4,
      forwardAcceleration: 8, upwardAcceleration: upward * 8, lateralAcceleration: lateral * 2,
      peakForwardAcceleration: 8, racketHeadVelocityWorld: head, forwardRacketHeadVelocity: -head.z,
      upwardRacketHeadVelocity: head.y, lateralRacketHeadVelocity: head.x,
      forwardDriveScore: 0.6, invalidDirectionReason: "NONE" }
  };
}
const start = new THREE.Vector3(0, 1.3, 4);

function flight(velocity: THREE.Vector3, spin = new THREE.Vector3(), position = start, spinType: "flat" | "topspin" | "slice" = "flat") {
  const ball = new BallController().ball;
  ball.position.copy(position); ball.velocity.copy(velocity); ball.spinVector.copy(spin);
  ball.state = "RETURNED"; ball.spinType = spinType;
  let touchedNet = false;
  let bounce: THREE.Vector3 | null = null;
  for (let frame = 0; frame < 600 && !bounce; frame++) {
    stepBallPhysics(ball, 1 / 120, event => {
      if (event.type === "net") touchedNet = true;
      else bounce = event.point;
    });
  }
  assert.ok(bounce);
  return { ball, bounce: bounce as THREE.Vector3, result: judgeReturnBounce(bounce, touchedNet), touchedNet };
}

test("Training power continuously changes speed and depth; weak and overhit shots can miss", () => {
  const shots = [3, 6, 10].map(speed => solveTrainingReturn(start, motion(speed)));
  const flights = shots.map(shot => flight(shot.velocity, shot.spin));
  assert.ok(shots[1].velocity.length() > shots[0].velocity.length() + 3);
  assert.ok(shots[2].velocity.length() > shots[1].velocity.length() + 3);
  assert.ok(flights[1].bounce.z < flights[0].bounce.z - 3);
  assert.ok(flights[2].bounce.z < flights[1].bounce.z - 3);
  assert.notEqual(flights[0].result, "IN");
  assert.equal(flights[1].result, "IN");
  assert.equal(flights[2].result, "OUT_LONG");
});

test("signed swing path creates distinct topspin, slice and flat arcs and rebound", () => {
  const flat = solveTrainingReturn(start, motion(6));
  const top = solveTrainingReturn(start, motion(6, 0.55));
  const slice = solveTrainingReturn(start, motion(6, -0.55));
  assert.equal(flat.spinType, "FLAT"); assert.equal(top.spinType, "TOPSPIN"); assert.equal(slice.spinType, "SLICE");
  assert.ok(top.spin.x < -10); assert.ok(slice.spin.x > 10);
  assert.ok(top.velocity.y > flat.velocity.y); assert.ok(slice.velocity.y < flat.velocity.y);
  assert.notEqual(top.prediction.bouncePoint?.z, slice.prediction.bouncePoint?.z);
  assert.equal(flight(slice.velocity, slice.spin).result, "IN");
  assert.equal(flight(top.velocity, top.spin).result, "IN");
  assert.ok(slice.prediction.apexPoint.y < flat.prediction.apexPoint.y);
  assert.ok(slice.prediction.bouncePoint!.z > flat.prediction.bouncePoint!.z);
  const down = new THREE.Vector3(0, -4, -8), atFloor = new THREE.Vector3(0, 0.11, -10);
  const topBounce = flight(down, top.spin, atFloor, "topspin").ball;
  const sliceBounce = flight(down, slice.spin, atFloor, "slice").ball;
  assert.ok(topBounce.velocity.y > sliceBounce.velocity.y);
});

test("lateral swing direction changes aim and extreme aim remains wide", () => {
  const left = solveTrainingReturn(start, motion(6, 0, -4));
  const right = solveTrainingReturn(start, motion(6, 0, 4));
  assert.ok(left.velocity.x < -2); assert.ok(right.velocity.x > 2);
  assert.ok(left.prediction.bouncePoint!.x < -2); assert.ok(right.prediction.bouncePoint!.x > 2);
  assert.equal(flight(right.velocity, right.spin).result, "OUT_WIDE");
  assert.ok(right.velocity.clone().sub(right.rawVelocity).length() <= 0.60001);
  assert.equal(right.velocity.x, right.rawVelocity.x);
});

test("singles lines count in; doubles alley, long, short and nonfinite points do not", () => {
  const net = BALL_CONFIG.launch.netDepth, edge = 8.23 / 2 + BALL_CONFIG.scale.physicalRadiusMeters;
  assert.equal(judgeReturnBounce(new THREE.Vector3(edge, 0, net - 6)), "IN");
  assert.equal(judgeReturnBounce(new THREE.Vector3(edge + 0.001, 0, net - 6)), "OUT_WIDE");
  assert.equal(judgeReturnBounce(new THREE.Vector3(0, 0, net - 11.885 - BALL_CONFIG.scale.physicalRadiusMeters)), "IN");
  assert.equal(judgeReturnBounce(new THREE.Vector3(0, 0, net - 12)), "OUT_LONG");
  assert.equal(judgeReturnBounce(new THREE.Vector3(0, 0, net + 1)), "SHORT");
  assert.equal(judgeReturnBounce(new THREE.Vector3(0, 0, net + 1), true), "NET");
  assert.equal(judgeReturnBounce(new THREE.Vector3(NaN, 0, net - 1)), "OUT");
});

test("net-body contact deflects the ball; tape clip can remain a valid rally return", () => {
  const nearNet = new THREE.Vector3(0, 0.4, BALL_CONFIG.launch.netDepth + 0.1);
  const blocked = flight(new THREE.Vector3(0, 0, -8), new THREE.Vector3(), nearNet);
  assert.equal(blocked.result, "NET"); assert.ok(blocked.bounce.z > BALL_CONFIG.launch.netDepth);
  const tape = nearNet.clone().setY(netHeightAt(0) + 0.02);
  const clip = flight(new THREE.Vector3(0, 1, -8), new THREE.Vector3(), tape);
  assert.equal(clip.touchedNet, true); assert.equal(clip.result, "IN");
});

test("flat prediction matches live drag and first-bounce coordinates", () => {
  const velocity = new THREE.Vector3(1, 4, -13);
  const predicted = predictReturnTrajectory(start, velocity);
  const actual = flight(velocity);
  assert.equal(actual.touchedNet, false);
  assert.ok(predicted.bouncePoint!.distanceTo(actual.bounce) < 1e-8);
});

test("Expo gyro and gravity-free acceleration reach shot power through normalized fusion", () => {
  const basis = { forward: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0], origin: [0, 0, 0] } as const;
  const powers = [3, 8].map(speed => {
    const normalizer = new SensorNormalizer(), fusion = new ForwardSwingFusion();
    let last;
    for (let timestamp = 1000; timestamp <= 1160; timestamp += 20) {
      last = normalizer.process({ timestamp, sensorTimestamp: timestamp / 1000,
        currentPhoneQuaternion: new THREE.Quaternion(), relativePhoneQuaternion: new THREE.Quaternion(),
        mappedRacketQuaternion: new THREE.Quaternion(), sensorToWorldQuaternion: new THREE.Quaternion(),
        angularVelocityPhoneRadPerSecond: new THREE.Vector3(-speed, 0, 0),
        accelerationMps2: new THREE.Vector3(0, speed, 0), accelerationIncludingGravityMps2: new THREE.Vector3(0, speed, -9.80665) });
      fusion.add(last);
    }
    const sample = motion(speed);
    sample.forwardSwing = fusion.snapshot(1160, { forward: [...basis.forward], right: [...basis.right], up: [...basis.up], origin: [...basis.origin] })!;
    assert.ok(sample.forwardSwing.forwardRacketHeadVelocity > 0);
    assert.equal(last!.angularSpeed, speed);
    return solveTrainingReturn(start, sample).power;
  });
  assert.ok(powers[1] > powers[0] + 0.4);
});


test("first-bounce rulings agree at 30/60/120 FPS and stay final after the ball leaves court", () => {
  const snapshot = new StrokeStateMachine().getSnapshot(0);
  for (const fps of [30, 60, 120]) for (const [x, expected] of [[4.10, "IN"], [4.23, "OUT_WIDE"]] as const) {
    const results: string[] = [];
    const bouncePoints: Array<THREE.Vector3 | null> = [];
    const controller = new BallController(undefined, undefined, (result, point) => {
      results.push(result);
      bouncePoints.push(point);
    });
    const target = new THREE.Vector3(x, BALL_CONFIG.courtHeight + controller.ball.physicsRadius, -12);
    controller.ball.position.copy(start);
    controller.ball.velocity.copy(solveSpinFlight(start, target, 1.4, new THREE.Vector3()));
    controller.ball.active = true; controller.ball.hit = true; controller.ball.state = "RETURNED";
    for (let i = 1; i <= fps * 2; i++) {
      controller.update(1 / fps, i * 1000 / fps, new THREE.Matrix4(), snapshot, null, "off", null, false);
    }
    assert.deepEqual(results, [expected], `${fps} FPS, target ${x}`);
    assert.ok(bouncePoints[0], "the trainer should receive the physical first-bounce point");
    assert.ok(Math.abs(bouncePoints[0]!.x - x) < 0.15);
    controller.ball.position.set(30, 0.2, -40);
    controller.update(1 / fps, 2050, new THREE.Matrix4(), snapshot, null, "off", null, false);
    assert.deepEqual(results, [expected]);
  }
});

test("a 25 km/h phone slice clears the net and lands in without making every slice safe", () => {
  const playable = solveTrainingReturn(start, motion(25 / 3.2, -0.55));
  const overhit = solveTrainingReturn(start, motion(30 / 3.2, -0.55));
  const playableFlight = flight(playable.velocity, playable.spin);
  const overhitFlight = flight(overhit.velocity, overhit.spin);
  assert.equal(playable.spinType, "SLICE");
  assert.equal(playableFlight.touchedNet, false);
  assert.equal(playableFlight.result, "IN");
  assert.equal(overhitFlight.result, "OUT_LONG");
  assert.ok(overhit.velocity.length() > playable.velocity.length());
  assert.ok(overhitFlight.bounce.z < playableFlight.bounce.z);
});

test("a soft slice clears the net even with a closed phone face", () => {
  const closedSliceMotion = motion(16 / 3.2, -0.55);
  const closedRadians = THREE.MathUtils.degToRad(-25);
  closedSliceMotion.racketFaceNormal.set(0, Math.sin(closedRadians), -Math.cos(closedRadians));
  const soft = solveTrainingReturn(start, closedSliceMotion);
  const softFlight = flight(soft.velocity, soft.spin);
  assert.equal(soft.spinType, "SLICE");
  assert.equal(softFlight.touchedNet, false);
  assert.equal(softFlight.result, "IN");

  const harder = solveTrainingReturn(start, motion(30 / 3.2, -0.55));
  const harderFlight = flight(harder.velocity, harder.spin);
  assert.ok(harder.velocity.length() > soft.velocity.length());
  assert.ok(harderFlight.bounce.z < softFlight.bounce.z);
  assert.equal(harderFlight.result, "OUT_LONG");
});

test("racket-face openness directly raises arc while a closed face lowers it", () => {
  const closedMotion = motion(6), squareMotion = motion(6), openMotion = motion(6);
  closedMotion.racketFaceNormal.set(0, -0.5, -0.866).normalize();
  openMotion.racketFaceNormal.set(0, 0.5, -0.866).normalize();
  const closed = solveTrainingReturn(start, closedMotion);
  const square = solveTrainingReturn(start, squareMotion);
  const open = solveTrainingReturn(start, openMotion);
  assert.ok(closed.launchAngleDegrees < square.launchAngleDegrees - 12);
  assert.ok(open.launchAngleDegrees > square.launchAngleDegrees + 15);
  assert.ok(closed.prediction.apexPoint.y < square.prediction.apexPoint.y);
  assert.ok(open.prediction.apexPoint.y > square.prediction.apexPoint.y);
});

test("continued slice follow-through adds bounded depth and backspin per new sensor sample", () => {
  const continuing = motion(6, -0.6);
  const stopped = motion(0.2, -0.05);
  const activeStep = trainingFollowThroughStep(continuing, "slice", 100, 0.02);
  const stoppedStep = trainingFollowThroughStep(stopped, "slice", 100, 0.02);
  const duplicateStep = trainingFollowThroughStep(continuing, "slice", 100, 0);
  assert.ok(activeStep.forwardSpeedDelta > 0);
  assert.ok(activeStep.signedSpinDelta < 0);
  assert.equal(stoppedStep.forwardSpeedDelta, 0);
  assert.equal(duplicateStep.forwardSpeedDelta, 0);
  assert.ok(activeStep.forwardSpeedDelta < 0.11);
});

test("separate swings reset their peak speed and expired Expo intent cannot hit", () => {
  const detector = new EasySwingIntentDetector();
  const common = { valid: true, accelerationMagnitude: 10, forwardScore: 0.8, preparationScore: 0.8, racketFaceAngle: 0.4 };
  detector.update({ ...common, timestamp: 1000, angularSpeed: 10 }, "forehand");
  const slow = detector.update({ ...common, timestamp: 2000, angularSpeed: 3 }, "forehand");
  assert.equal(slow.peakAngularSpeed, 3); assert.equal(slow.startedAt, 2000);
  const sample = motion(); sample.swingIntent = slow;
  const expiredAt = slow.expiresAt + 1;
  const decision = evaluatePlayableCalibratedHit({ now: expiredAt, contactTime: expiredAt, bounceCount: 1,
    alreadyHit: false, expectedStrokeType: "forehand", profile: createDefaultTrajectoryProfile("forehand", "right"), motion: sample });
  assert.equal(decision.accepted, false);
});

test("normalized Expo high-to-low and low-to-high paths produce opposite spin", () => {
  const results = [-1, 1].map(sign => {
    const normalizer = new SensorNormalizer(), fusion = new ForwardSwingFusion();
    let last;
    for (let t = 1000; t <= 1160; t += 20) {
      last = normalizer.process({ timestamp: t, sensorTimestamp: t / 1000,
        currentPhoneQuaternion: new THREE.Quaternion(), relativePhoneQuaternion: new THREE.Quaternion(),
        mappedRacketQuaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), sign * 0.6),
        sensorToWorldQuaternion: new THREE.Quaternion(), angularVelocityPhoneRadPerSecond: new THREE.Vector3(-6, 0, 0),
        accelerationMps2: new THREE.Vector3(0, 8, sign * 4), accelerationIncludingGravityMps2: new THREE.Vector3(0, 8, sign * 4 - 9.80665) });
      fusion.add(last);
    }
    const sample = motion(6);
    sample.motionUpwardScore = last!.motionUpwardScore;
    sample.forwardSwing = fusion.snapshot(1160, { forward: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0], origin: [0, 0, 0] })!;
    return solveTrainingReturn(start, sample);
  });
  assert.equal(results[0].spinType, "SLICE"); assert.equal(results[1].spinType, "TOPSPIN");
  assert.ok(results[0].spin.x > 0); assert.ok(results[1].spin.x < 0);
});


test("Expo native platform axes and units normalize identically", () => {
  const ios = normalizeMotionRotationRate({ alpha: 270, beta: 180, gamma: 90 }, "ios");
  const android = normalizeMotionRotationRate({ alpha: 90, beta: 180, gamma: 270 }, "android");
  const web = normalizeMotionRotationRate({ alpha: 270, beta: 90, gamma: 180 }, "web");
  assert.deepEqual(ios, android); assert.deepEqual(ios, web);
  assert.equal(ios!.x, Math.PI / 2); assert.equal(ios!.y, Math.PI); assert.equal(ios!.z, 1.5 * Math.PI);
  assert.equal(normalizeMotionRotationRate(null, "ios"), null);
  assert.equal(normalizeMotionRotationRate({ alpha: NaN, beta: 0, gamma: 0 }, "android"), null);
});

test("deep return beyond old world cutoff is judged IN at the actual baseline-side bounce", () => {
  const results: string[] = [];
  const controller = new BallController(undefined, undefined, result => results.push(result));
  const target = new THREE.Vector3(0, BALL_CONFIG.courtHeight + controller.ball.physicsRadius, -16);
  controller.ball.position.copy(start);
  controller.ball.velocity.copy(solveSpinFlight(start, target, 1.6, new THREE.Vector3()));
  controller.ball.active = true; controller.ball.hit = true; controller.ball.state = "RETURNED";
  const snapshot = new StrokeStateMachine().getSnapshot(0);
  for (let i = 1; i < 230; i++) controller.update(1 / 120, i * 1000 / 120, new THREE.Matrix4(), snapshot, null, "off", null, false);
  assert.deepEqual(results, ["IN"]);
});


test("racket face angle shapes launch independently of swing power", () => {
  const closed = motion(6), open = motion(6), right = motion(6);
  closed.racketFaceNormal.set(0, -0.3, -1).normalize();
  open.racketFaceNormal.set(0, 0.3, -1).normalize();
  right.racketFaceNormal.set(0.5, 0, -1).normalize();
  const low = solveTrainingReturn(start, closed), high = solveTrainingReturn(start, open);
  assert.equal(low.power, high.power);
  assert.ok(high.velocity.y > low.velocity.y + 2);
  assert.ok(solveTrainingReturn(start, right).velocity.x > 2);
});
