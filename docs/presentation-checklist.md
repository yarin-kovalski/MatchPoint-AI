# Presentation Checklist

## Problem Statement

We are building a smart tennis motion trainer that uses a smartphone as a motion sensor and controller. The 3D tennis scene is the live demo environment for motion capture, analysis, and coaching.

## Technical Highlights

- Browser sensor APIs for phone motion.
- Socket.io realtime communication.
- Three.js 3D rendering.
- Real-time speed or acceleration estimation.
- Forehand/backhand classification.
- Predictive hit logic to compensate for latency.
- Early/perfect/late timing feedback.
- Cannon.js physics in the full game phase.
- Anime.js ball deformation for visual impact.
- Optional MediaPipe pose tracking in a future phase.

## POC Demo

Show:

- Phone sensor page.
- Live raw accelerometer and gyroscope values.
- Desktop Three.js cube.
- Cube rotating when the phone tilts.
- One live stat from phone data.
- Basic ball/wall physics if included.

Explain:

- The phone sends sensor packets to the server.
- The server broadcasts the latest controller state to the desktop.
- The desktop maps orientation to 3D rotation.
- The PC also calculates a first real-time training stat.

## Final Demo

Show:

- Phone controlling racket orientation.
- Ball bouncing in a wall-tennis loop.
- Stronger swings causing stronger returns.
- Ball squishing on impact.
- Forehand/backhand labels.
- Early/perfect/late timing feedback.
- Session stats and coaching advice.
- Target tiles and scoring.

## "100 Grade" Talking Points

- We attacked the biggest technical risk first: real phone motion over WebSockets.
- We used a phased plan with a clear POC gate.
- The game is only the demo surface; the real value is smart motion analysis.
- Predictive motion and physics assistance make the experience feel better than raw collision detection.
- The wow factor is visible and easy to understand: the ball deforms based on swing strength.
- The trainer provides feedback a player can understand: speed, timing, swing type, accuracy, and advice.
