import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { NormalizedSensorFrame } from "../client-pc/src/motion/sensorNormalization.js";
import {
  deserializeFrame,
  MotionRecorder
} from "../client-pc/src/strokeDetection/motionRecorder.js";
import { StrokeStateMachine } from "../client-pc/src/strokeDetection/strokeStateMachine.js";
import { BackhandStyle, Handedness } from "../client-pc/src/strokeDetection/strokeTypes.js";

function frame(
  timestamp: number,
  options: Partial<NormalizedSensorFrame> = {}
): NormalizedSensorFrame {
  const relative = options.relativePhoneQuaternion ?? new THREE.Quaternion();
  return {
    timestamp,
    sensorTimestamp: timestamp / 1000,
    deltaTime: 0.02,
    currentPhoneQuaternion: relative.clone(),
    relativePhoneQuaternion: relative.clone(),
    mappedRacketQuaternion: new THREE.Quaternion(),
    angularVelocityLocal: new THREE.Vector3(),
    angularVelocityWorld: new THREE.Vector3(),
    angularSpeed: 0,
    rawAcceleration: new THREE.Vector3(),
    accelerationIncludingGravity: new THREE.Vector3(0, 9.8, 0),
    gravityCompensatedAcceleration: new THREE.Vector3(),
    smoothedAcceleration: new THREE.Vector3(),
    fastAcceleration: new THREE.Vector3(),
    accelerationMagnitude: 0,
    jerk: 0,
    racketForwardVector: new THREE.Vector3(0, 0, -1),
    racketUpVector: new THREE.Vector3(0, 1, 0),
    racketSideVector: new THREE.Vector3(1, 0, 0),
    racketFaceNormal: new THREE.Vector3(0, 1, 0),
    racketFaceAngleToCourtRadians: 0.55,
    motionForwardScore: 0,
    motionUpwardScore: 0,
    motionSidewaysScore: 0,
    valid: true,
    rejectionReason: "",
    ...options
  };
}

function preparationFrame(timestamp: number, side: number): NormalizedSensorFrame {
  return frame(timestamp, {
    relativePhoneQuaternion: new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      side * 0.5
    ),
    angularSpeed: 1.5,
    accelerationMagnitude: 6,
    motionSidewaysScore: side * 0.9
  });
}

function forwardFrame(timestamp: number, upward = 0.45): NormalizedSensorFrame {
  return frame(timestamp, {
    relativePhoneQuaternion: new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      0.25
    ),
    angularSpeed: 3.2,
    accelerationMagnitude: 9,
    jerk: 18,
    motionForwardScore: 0.9,
    motionUpwardScore: upward,
    motionSidewaysScore: 0.15
  });
}

function runStroke(
  handedness: Handedness,
  backhandStyle: BackhandStyle,
  type: "forehand" | "backhand",
  upward = 0.45,
  faceAngle = 0.55
) {
  const contacts: any[] = [];
  const machine = new StrokeStateMachine(handedness, backhandStyle, event => contacts.push(event));
  const hand = handedness === "right" ? 1 : -1;
  const preparationSide = type === "forehand" ? hand : -hand;
  const frames = [
    frame(800),
    frame(1000),
    preparationFrame(1100, preparationSide),
    preparationFrame(1160, preparationSide),
    preparationFrame(1260, preparationSide),
    preparationFrame(1360, preparationSide),
    { ...forwardFrame(1460, upward), racketFaceAngleToCourtRadians: faceAngle },
    { ...forwardFrame(1540, upward), racketFaceAngleToCourtRadians: faceAngle },
    { ...forwardFrame(1620, upward), racketFaceAngleToCourtRadians: faceAngle },
    { ...forwardFrame(1700, upward), racketFaceAngleToCourtRadians: faceAngle }
  ];
  for (const value of frames) machine.process(value);
  return { machine, contacts, frames };
}

test("sensor noise remains READY", () => {
  const machine = new StrokeStateMachine();
  for (let time = 1000; time <= 1600; time += 20) {
    machine.process(frame(time, { angularSpeed: 0.08, accelerationMagnitude: 0.3 }));
  }
  assert.equal(machine.getSnapshot(1600).currentState, "READY");
});

test("slow rotation and isolated shake do not start a stroke", () => {
  const machine = new StrokeStateMachine();
  machine.process(frame(1000));
  machine.process(frame(1100, {
    relativePhoneQuaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5),
    angularSpeed: 0.4,
    motionSidewaysScore: 0.8
  }));
  machine.process(frame(1200, { angularSpeed: 5, accelerationMagnitude: 35, motionSidewaysScore: 1 }));
  assert.equal(machine.getSnapshot(1200).currentState, "READY");
});

for (const handedness of ["right", "left"] as const) {
  test(`${handedness}-handed forehand produces one forehand contact`, () => {
    const result = runStroke(handedness, "one-handed", "forehand");
    assert.equal(result.contacts.length, 1);
    assert.equal(result.contacts[0].strokeType, "forehand");
  });

  test(`${handedness}-handed backhand produces one backhand contact`, () => {
    const result = runStroke(handedness, "one-handed", "backhand");
    assert.equal(result.contacts.length, 1);
    assert.equal(result.contacts[0].strokeType, "backhand");
  });
}

test("forehand and backhand preparation lock positive distinct evidence", () => {
  const forehand = runStroke("right", "one-handed", "forehand");
  const backhand = runStroke("right", "one-handed", "backhand");
  assert.equal(forehand.contacts[0].strokeType, "forehand");
  assert.equal(backhand.contacts[0].strokeType, "backhand");
});

test("ambiguous center movement is rejected", () => {
  const machine = new StrokeStateMachine();
  for (let time = 1000; time <= 2100; time += 100) {
    machine.process(frame(time, {
      relativePhoneQuaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.4),
      angularSpeed: 1.2,
      accelerationMagnitude: 4,
      motionSidewaysScore: 0
    }));
  }
  assert.equal(machine.getSnapshot(2100).lockedStrokeType, "unknown");
  assert.equal(machine.getSnapshot(2100).currentState, "READY");
});

test("invalid packet gap safely resets an active stroke", () => {
  const machine = new StrokeStateMachine();
  machine.process(frame(800));
  machine.process(frame(1000));
  machine.process(preparationFrame(1000, 1));
  machine.process(frame(1020, { valid: false, rejectionReason: "packet gap" }));
  assert.equal(machine.getSnapshot(1020).currentState, "READY");
  assert.equal(machine.getSnapshot(1020).rejectionReason, "packet gap");
});

test("CONTACT_WINDOW cannot occur directly from READY", () => {
  const contacts: any[] = [];
  const machine = new StrokeStateMachine("right", "one-handed", event => contacts.push(event));
  machine.process(frame(1000));
  machine.process(forwardFrame(1020, 0.8));
  assert.equal(contacts.length, 0);
  assert.notEqual(machine.getSnapshot(1020).currentState, "CONTACT_WINDOW");
});

test("one stroke cannot emit a second contact", () => {
  const result = runStroke("right", "one-handed", "forehand");
  for (let time = 1720; time <= 1900; time += 20) {
    result.machine.process(forwardFrame(time, 0.8));
  }
  assert.equal(result.contacts.length, 1);
});

test("quaternion sign change does not create a stroke", () => {
  const machine = new StrokeStateMachine();
  const orientation = new THREE.Quaternion(0.1, 0.05, 0.02, 0.99).normalize();
  machine.process(frame(1000, { relativePhoneQuaternion: orientation }));
  machine.process(frame(1020, {
    relativePhoneQuaternion: new THREE.Quaternion(
      -orientation.x,
      -orientation.y,
      -orientation.z,
      -orientation.w
    ),
    angularSpeed: 0,
    accelerationMagnitude: 0
  }));
  assert.equal(machine.getSnapshot(1020).currentState, "READY");
});

test("incomplete stroke returns to READY without contact", () => {
  const contacts: any[] = [];
  const machine = new StrokeStateMachine("right", "one-handed", event => contacts.push(event));
  machine.process(frame(700));
  machine.process(frame(900));
  for (const time of [1000, 1100, 1200, 1300]) {
    machine.process(preparationFrame(time, 1));
  }
  machine.process(preparationFrame(2500, 1));
  assert.equal(contacts.length, 0);
  assert.equal(machine.getSnapshot(2500).currentState, "READY");
});

test("low-to-high swing scores more topspin than flat swing", () => {
  const topspin = runStroke("right", "one-handed", "forehand", 0.9).contacts[0];
  const flat = runStroke("right", "one-handed", "forehand", 0.05).contacts[0];
  assert.ok(topspin.topspinScore > flat.topspinScore);
});

test("low-to-high backhand scores more topspin than flat backhand", () => {
  const topspin = runStroke("right", "one-handed", "backhand", 0.9).contacts[0];
  const flat = runStroke("right", "one-handed", "backhand", 0.05).contacts[0];
  assert.ok(topspin.topspinScore > flat.topspinScore);
});

test("high-to-low backhand scores slice above topspin", () => {
  const contact = runStroke("right", "one-handed", "backhand", -0.9).contacts[0];
  assert.ok(contact.sliceScore > contact.topspinScore);
});

test("two-handed backhand uses a tighter face range", () => {
  const oneHanded = runStroke("right", "one-handed", "backhand", 0.4, 1.1);
  const twoHanded = runStroke("right", "two-handed", "backhand", 0.4, 1.1);
  assert.equal(oneHanded.contacts.length, 1);
  assert.equal(twoHanded.contacts.length, 0);
});

test("recording replay produces the same contact classification", () => {
  const original = runStroke("right", "one-handed", "forehand");
  const recorder = new MotionRecorder();
  recorder.start("forehand");
  for (const value of original.frames) recorder.capture(value);
  const recording = recorder.stop();
  assert.ok(recording);

  const contacts: any[] = [];
  const replayMachine = new StrokeStateMachine("right", "one-handed", event => contacts.push(event));
  for (const value of recording.frames) replayMachine.process(deserializeFrame(value));
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].strokeType, original.contacts[0].strokeType);
  assert.deepEqual(
    replayMachine.getSnapshot(recording.frames.at(-1)!.timestamp).transitions,
    original.machine.getSnapshot(original.frames.at(-1)!.timestamp).transitions
  );
});
