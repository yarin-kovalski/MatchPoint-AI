# MatchPoint AI: Agent Guide

## Mission

Build an AI-powered Smart Tennis Motion Trainer and Analysis System. The smartphone acts as a motion controller and sensor source, while the desktop browser uses the incoming data to visualize movement, estimate swing metrics, and provide coaching feedback.

The 3D wall-tennis environment is the active demo arena for the trainer. The main technical value is motion capture, swing analysis, predictive hit logic, and performance feedback.

The project should be developed in strict phases. Do not jump into advanced game code until the proof of concept is working and recorded.

## Current Phase

Phase 1: Minimum Viable Product / Proof of Concept.

Goal: prove low-latency phone-to-PC motion transmission and show one real-time coaching/stat signal.

Phase 1 includes only:

- A Node.js Socket.io server.
- A mobile controller page that reads sensor data and shows raw values.
- A desktop test page with a simple 3D cube.
- Basic ball and wall physics if feasible within the POC window.
- A React UI overlay showing one live stat from phone data, such as current swing speed or forehand/backhand guess.
- Mapping phone orientation to cube rotation.
- A short POC video showing phone movement controlling the cube, simple physics, and the live stat display.

## Phase Gate Rule

Do not implement Phase 3 smart coaching expansion until the user confirms Phase 1 works and has recorded the POC video.

Phase 3 includes full swing classification, speed estimation, early/late timing, stats aggregation, coaching advice, target accuracy, ball deformation, trails, and polished game mechanics.

## Technical Stack

- Desktop client: React, TypeScript, Three.js.
- Mobile controller: HTML5, JavaScript or TypeScript, browser sensor APIs.
- Realtime transport: Node.js, Socket.io.
- Later gameplay physics: Cannon.js.
- Later deformation animation: anime.js.
- Optional later body-pose tracking: Google MediaPipe.

## Engineering Priorities

1. Low latency first.
2. Real-time analytics and coaching value.
3. Clear sensor debugging on the phone.
4. Simple visual proof on desktop.
5. Small commits and testable milestones.
6. Browser compatibility notes, especially mobile permissions.
7. Keep Phase 1 minimal and reliable.

## Sensor Logic Requirements

Mobile controller must eventually support:

- `DeviceMotionEvent.accelerationIncludingGravity`
- `DeviceOrientationEvent`
- Linear acceleration estimation by removing gravity influence.
- Exponential moving average smoothing.
- Peak acceleration or estimated velocity tracking over a swing window.
- Swing event detection.
- Forehand/backhand classification from orientation changes during acceleration peaks.
- Early/perfect/late timing detection once ball trajectory exists.
- Orientation mapping:
  - `beta` maps to racket or cube `rotation.x`
  - `gamma` maps to racket or cube `rotation.y`

For Phase 1, raw sensor reading, orientation-to-cube mapping, and one real-time stat are enough.

## Coaching Brain Requirements

The trainer must eventually analyze:

- Total hits and misses.
- Accuracy based on target distance.
- Peak swing speed.
- Forehand and backhand counts.
- Average accuracy improvement over a session.
- Timing feedback: early, perfect, or late.
- Short coaching advice based on repeated patterns.

## Predictive Hit Logic

For good user experience, do not rely only on exact mesh collision.

When a swing is detected with high confidence and the ball is inside a defined hit zone, around 30ms from visual impact, predict a hit and trigger both:

- Performance analysis.
- Ball impact visuals.

## Later Wow Factor Requirements

When Phase 3 begins, the impact function must include:

- `onImpact(hitVelocity, hitTiming)`
- Anime.js non-uniform ball scaling on local Z.
- Neon coaching text such as "Forehand", "Fast Swing", or "Late Hit".
- Deformation formula:

```ts
deformationFactor = 1.0 - (hitVelocity * deformationCoefficient)
```

- Fast squish around 50ms.
- Elastic snap back around 100ms.
- Return trajectory based on racket reflection vector and hit velocity.

## Development Notes

- Keep planning docs updated after each major decision.
- Record blockers immediately in `docs/risks.md`.
- Add acceptance criteria before implementing a phase.
- Prefer working demos over overbuilt architecture.
- Use local network testing early because phone and PC must communicate over LAN.
