import assert from "node:assert/strict";
import test from "node:test";
import { SENSOR_UI_INTERVAL_MS, SensorUiThrottle } from "../virtucourt-mobile/sensorUiThrottle.js";

test("phone telemetry UI is throttled without suppressing sensor callbacks", () => {
  const throttle = new SensorUiThrottle();
  let emittedPackets = 0;
  let uiUpdates = 0;
  for (let now = 0; now < 1000; now += 16) {
    emittedPackets += 1;
    if (throttle.shouldUpdate(now)) uiUpdates += 1;
  }
  assert.equal(emittedPackets, 63);
  assert.ok(uiUpdates >= 9 && uiUpdates <= Math.ceil(1000 / SENSOR_UI_INTERVAL_MS));
});

test("phone UI throttle can be reset when streaming restarts", () => {
  const throttle = new SensorUiThrottle();
  assert.equal(throttle.shouldUpdate(100), true);
  assert.equal(throttle.shouldUpdate(101), false);
  throttle.reset();
  assert.equal(throttle.shouldUpdate(101), true);
});
