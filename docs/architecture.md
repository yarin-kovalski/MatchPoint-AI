# Architecture

## System Overview

The project has three runtime parts:

1. Mobile controller browser.
2. Node.js Socket.io broker.
3. Desktop game browser.

The mobile browser reads sensor data and sends compact motion packets to the server. The server forwards the latest controller state to the desktop browser. The desktop browser maps orientation and swing data into a Three.js scene and computes trainer analytics.

The PC client is both display and analysis layer.

## Runtime Flow

```text
Phone sensors
  -> mobile controller page
  -> Socket.io emit controller:motion
  -> Node.js broker
  -> Socket.io broadcast controller:state
  -> desktop Three.js renderer + analytics overlay
```

## Network Assumption

Phone and PC should be on the same local network.

During development, the server should print the LAN URL so the user can open the mobile controller from the phone.

## Phase 1 Runtime Command

The supported end-to-end demo starts with:

```text
npm run all
```

The command detects the current PC LAN address, passes it to the Expo controller,
starts Expo and the HTTP/HTTPS broker, and opens `/pc`. The browser mobile
controller remains available as a fallback.

## Motion Payload Draft

```ts
type ControllerMotionPayload = {
  t: number;
  orientation: {
    alpha: number | null;
    beta: number | null;
    gamma: number | null;
  };
  acceleration: {
    x: number | null;
    y: number | null;
    z: number | null;
  };
  accelerationIncludingGravity: {
    x: number | null;
    y: number | null;
    z: number | null;
  };
  linearAcceleration?: {
    x: number;
    y: number;
    z: number;
  };
  peakAcceleration?: number;
  estimatedSpeed?: number;
};
```

## Phase 1 Mapping

For the cube POC:

```text
cube.rotation.x = beta converted to radians
cube.rotation.y = gamma converted to radians
```

Add scaling/clamping only if the raw mapping feels too sensitive.

## Start-Position Calibration

The PC begins in an uncalibrated state and renders a second copy of the racket
model as a translucent wireframe guide. This ghost racket uses the same Three.js
perspective as the active model, is scaled to `1.08`, and is fixed at the
forward-tilted start quaternion. Its color moves from red toward green as the
tracked racket approaches the target.

Before enabling calibration, Expo checks that the accelerometer magnitude is
consistent with a steady phone. When the player taps **Lock Tennis Ready
Position** on Expo or **Calibrate Ready Pose** on the PC:

1. Expo converts absolute `DeviceMotion.rotation` into a normalized quaternion
   and includes both forms in each orientation packet.
2. The PC explicitly converts the phone coordinate basis to Three.js:
   phone `+X -> +X`, phone `+Y -> -Z`, and phone `+Z -> +Y`.
3. The PC stores the converted neutral quaternion and its inverse as the session
   calibration baseline.
4. Each later racket pose is calculated as:

   `baseReadyPose * mappedRelativePhone * racketModelCorrection`

5. The PC requires the active racket to remain within the angular and positional
   tolerances of the ghost for 450ms.
6. The PC hides the ghost, enables stroke handling, and emits
   `calibration:complete` back to Expo through the broker.

This makes any valid captured phone attitude, including values such as
`x=0.798, y=-2.190`, the neutral tennis-ready pose without using those values as
literal racket rotations. The player can recalibrate after a grip change.

### Racket Model Axes

Measured GLB bounds are approximately `129.7 x 330.1 x 20.8`. The model uses:

- Local `+Y`: butt to racket head.
- Local `+X`: side-to-side across the racket.
- Local `+Z`: racket-face normal.

The fixed model correction is `-90 degrees` around `X`. It maps model `+Y` to
court-forward `-Z` and model `+Z` to world-up `+Y`. The base ready pose then adds
a `12 degree` upward tilt. The scene hierarchy is:

```text
racketRoot (world position + 12-degree ready tilt)
  orientationPivot (smoothed mapped phone-relative quaternion)
    modelCorrectionPivot (-90-degree X model-axis correction)
      racketGLTF (untouched imported model)
```

Phase 1 should also compute one player-facing stat:

```text
current speed estimate, peak acceleration, or forehand/backhand guess
```

## Later Gameplay Mapping

For the Expo racket after calibration:

```text
racket.quaternion = baseReady * mappedRelativePhone * modelCorrection
```

## Phase B Sensor Processing

Expo sends one `continuous_orientation` packet at a requested interval of 16ms.
The packet contains:

- Normalized absolute phone quaternion, unitless.
- Attitude angles in radians.
- Rotation rate in degrees per second, retained as `alpha/beta/gamma` metadata.
- Gravity-compensated DeviceMotion acceleration in m/s².
- Acceleration including gravity in m/s².
- Sensor timestamp in seconds and transport timestamp in Unix milliseconds.
- Screen orientation in degrees: `0`, `90`, `180`, or `-90`.

`SensorNormalizer` converts phone vectors explicitly with
`(x, y, z) -> (x, z, -y)`, clamps packet delta time to 8-50ms, and rejects packet
gaps above 250ms. Angular velocity is derived from quaternion differences in
rad/s instead of trusting platform-dependent rotation-rate axis labels.

Two acceleration paths are maintained:

- Visualization/filter path: EMA factor `0.25`.
- Peak-response path: EMA factor `0.65`.

Frames are rejected for non-finite or zero-length quaternions, quaternion lengths
outside `0.5-1.5`, acceleration above `80 m/s²`, angular speed above `25 rad/s`,
or invalid packet timing. Quaternion signs are corrected against the previous
sample to prevent long-path interpolation flips.

Each normalized frame exposes racket forward, up/face-normal, and side vectors;
angular velocity; smoothed and fast acceleration; jerk; signed forward/up/side
motion scores; racket-face angle; validity; and an explicit rejection reason.

Swing strength:

```text
hitVelocity = peak linear acceleration from the last 200ms
```

Classification:

```text
forehand/backhand = decision tree over beta/gamma changes during the acceleration peak
```

Timing:

```text
hitTiming = early/perfect/late based on swing peak vs. predicted ball arrival in hit zone
```

## Smoothing Plan

Use exponential moving average:

```ts
smoothed = previous * smoothingFactor + current * (1 - smoothingFactor)
```

Suggested starting value:

```text
smoothingFactor = 0.75
```

This should reduce sensor noise while keeping the motion responsive.

## Predictive Coaching Hit Plan

Exact collisions can feel delayed or unfair with a phone controller. The trainer should use a predictive hit when:

- Swing confidence is high.
- Ball is inside the hit zone.
- Ball is roughly 30ms from visual impact.

This predicted hit should trigger:

- Ball return physics.
- Performance analysis.
- Coaching labels.
- Ball deformation.

## Impact and Deformation Plan

When the ball collides with the racket or a predictive hit is accepted:

1. Read recent `hitVelocity`.
2. Read `hitTiming`.
3. Reflect ball velocity from racket orientation.
4. Scale reflected velocity by hit strength.
5. Trigger `onImpact(hitVelocity, hitTiming)`.

Deformation:

```ts
const deformationFactor = Math.max(
  0.55,
  1.0 - hitVelocity * deformationCoefficient
);
```

Animation:

- Scale ball local Z down in roughly 50ms.
- Snap back to `1.0` with elastic easing in roughly 100ms.

## Key Risks

- iOS requires explicit permission for motion sensors.
- Sensor APIs may require HTTPS on some browsers.
- Local network firewalls can block phone-to-PC access.
- Raw accelerometer data is noisy.
- Latency can make true physical collision feel unfair.
- Swing classification can be rough without calibration or training data.

Mitigation: Phase 1 focuses on proving transport, orientation, and one simple real-time stat. Phase 3 can start with a robust decision tree before attempting a more advanced model.

## Phase C Stroke State Machine

The reusable forehand/backhand detector, thresholds, recording workflow, debug
signals, contact contract, and physical test instructions are documented in
[`phase-c-stroke-detection.md`](phase-c-stroke-detection.md).
