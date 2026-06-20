# One-Week Execution Plan

## Day 1

Focus: project setup and sensor capture.

- Create project structure.
- Add Node.js Socket.io server.
- Add mobile controller page.
- Verify phone can open the controller page.
- Verify sensor permission flow.
- Show raw sensor values on phone.

## Day 2

Focus: realtime transport.

- Emit sensor packets from phone.
- Receive packets on server.
- Broadcast latest state to desktop.
- Add packet timestamps.
- Add connection status.

## Day 3

Focus: desktop MVP/POC and video.

- Add desktop Three.js cube page.
- Map `beta` and `gamma` to cube rotation.
- Add basic ball/wall physics if the connection loop is stable.
- Add React stat overlay.
- Show one live stat from phone data.
- Tune smoothing if needed.
- Test on local network.
- Record MVP/POC video.

## Day 4

Focus: smart trainer arena foundation.

- Add Three.js wall-tennis arena.
- Add racket mesh controlled by phone orientation.
- Add ball mesh.
- Add Cannon.js physics world.
- Add hit zone model for predictive coaching hits.

## Day 5

Focus: motion analytics and timing.

- Detect swing events.
- Classify forehand/backhand.
- Estimate swing speed.
- Detect early/perfect/late timing.
- Detect racket-ball collision or predictive hit.
- Calculate hit velocity from recent acceleration peak.
- Reflect ball based on racket orientation.
- Tune return speed and control.

## Day 6

Focus: wow factor.

- Add anime.js ball squish.
- Add snap-back animation.
- Add coaching text like "PERFECT FOREHAND".
- Add visual trails.
- Add impact feedback.

## Day 7

Focus: game polish and final demo.

- Add target wall and scoring.
- Add session stats and improvement tracking.
- Add coaching advice.
- Add start/restart flow.
- Polish lighting and camera.
- Fix bugs.
- Record final gameplay demo.
- Prepare short explanation for presentation.

## Daily Rule

Each day should end with something demonstrable.
