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

Phase 1 should also compute one player-facing stat:

```text
current speed estimate, peak acceleration, or forehand/backhand guess
```

## Later Gameplay Mapping

For the racket:

```text
racket.rotation.x = beta converted to radians
racket.rotation.y = gamma converted to radians
```

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
