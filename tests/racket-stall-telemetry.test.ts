import assert from "node:assert/strict";
import test from "node:test";
import { detectRacketStall, RacketStallTelemetry } from "../client-pc/src/diagnostics/racketStallTelemetry.js";

const healthy = {
  at: 1000, packetAgeMs: 10, physicsUpdateAgeMs: 0, visualUpdateAgeMs: 0,
  packetRateHz: 60, packetJitterMs: 1, duplicatePackets: 0, stalePackets: 0, rejectedPackets: 0,
  visualChangeAgeMs: 0, frameDeltaMs: 16, physicsSteps: 2, extrapolationMs: 0,
  resamplerState: "interpolating" as const, posePending: false,
  quaternionX: 0, quaternionY: 0, quaternionZ: 0, quaternionW: 1,
  quaternionAgeMs: 10, runtimeErrors: 0
};

test("stall detector identifies each pipeline failure stage", () => {
  assert.deepEqual(detectRacketStall({ ...healthy, packetAgeMs: 251 }), ["packet_age"]);
  assert.deepEqual(detectRacketStall({ ...healthy, physicsUpdateAgeMs: 251 }), ["packets_arriving_physics_not_updated"]);
  assert.deepEqual(detectRacketStall({ ...healthy, posePending: true, visualChangeAgeMs: 251 }), ["render_alive_racket_not_advancing"]);
  assert.deepEqual(detectRacketStall({ ...healthy, frameDeltaMs: 251 }), ["main_thread_long_frame"]);
});

test("stall telemetry retains a fixed rolling history for post-stall inspection", () => {
  const telemetry = new RacketStallTelemetry(3);
  telemetry.record({ ...healthy, at: 1 });
  telemetry.record({ ...healthy, at: 2 });
  telemetry.record({ ...healthy, at: 3 });
  telemetry.record({ ...healthy, at: 4, packetAgeMs: 300 });
  assert.deepEqual(telemetry.snapshot().map(sample => sample.at), [2, 3, 4]);
  assert.deepEqual(telemetry.getLastStall()?.reasons, ["packet_age"]);
  assert.deepEqual(telemetry.getLastStall()?.trace.map(sample => sample.at), [2, 3, 4]);
});
