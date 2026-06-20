# Roadmap

## Project Objective

Create a high-quality AI-powered tennis motion trainer in one week, with a strong MVP/POC first and a smart coaching expansion afterward.

The desktop tennis arena is the visual demo environment. The core project is sensor-based motion analysis and player feedback.

## Phase 1: MVP / POC, Days 1-3

### Goal

Prove that the phone can control a desktop 3D object with low latency and that the system can compute at least one real-time player-facing statistic.

### Scope

- Set up a minimal Node.js Socket.io server.
- Serve or connect two clients:
  - Mobile controller.
  - Desktop display.
- Read phone motion and orientation data.
- Show raw values on the phone.
- Send values to the server.
- Broadcast values to the desktop.
- Render a Three.js cube.
- Rotate the cube using phone `beta` and `gamma`.
- Add basic ball and wall physics if feasible.
- Display one live stat in a React overlay, such as current speed or a forehand/backhand guess.

### Out of Scope

- Full tennis racket behavior.
- Scoring.
- Wall targets.
- Squish animation.
- Polished graphics.
- Full AI coaching.
- MediaPipe pose tracking.

### Exit Criteria

- Phone and PC connect on the same local network.
- Sensor values update live on the phone.
- Desktop cube rotates when the phone moves.
- One stat updates live from phone data.
- Basic ball/wall physics is visible if included in the POC build.
- Latency feels acceptable for a motion-controller demo.
- User records the MVP/POC video.

## Phase 2: Reliability Buffer

### Goal

Make the POC stable enough to build gameplay on top of it.

### Scope

- Sensor permission button for mobile browsers.
- Connection status indicators.
- Calibration button.
- Smoothing using exponential moving average.
- Basic packet timestamp and latency estimate.
- Cleaner event names and shared payload shape.
- Basic swing event detector.

### Exit Criteria

- Controller can reconnect.
- Desktop can detect stale input.
- Motion is stable enough to avoid jittery gameplay.

## Phase 3: Smart Coaching and Wow Factor, Days 4-7

### Goal

Create the full smart coaching loop, using wall-tennis gameplay as the active demo.

### Scope

- Three.js arena scene.
- Racket model or stylized mesh.
- Ball mesh.
- Cannon.js physics world.
- Wall collision and racket collision.
- Reflection vector from racket orientation.
- Hit velocity from recent phone acceleration peak.
- Predictive hit logic using a swing event plus a ball hit zone instead of waiting only for exact collision.
- Forehand/backhand classification.
- Swing speed estimation.
- Early/perfect/late timing detection.
- Anime.js mesh squish on impact.
- Neon coaching text on impact.
- Performance stats aggregation.
- Improvement tracking and coaching advice.
- Score targets on the wall.
- Ball trails, lights, particles, or screen shake.

### Exit Criteria

- Player can hit the ball back into the wall.
- Targets award points.
- Stronger swings produce stronger returns.
- Ball visibly deforms on impact.
- Trainer classifies motion and shows coaching feedback.
- Demo feels responsive, analytical, and impressive.

## Final Presentation Checklist

- POC video.
- Final gameplay video.
- Clear explanation of phone sensors.
- Clear explanation of WebSocket architecture.
- Clear explanation of swing analytics.
- Clear explanation of predictive coaching hit logic and physics assistance.
- Mention limitations and future improvements.
