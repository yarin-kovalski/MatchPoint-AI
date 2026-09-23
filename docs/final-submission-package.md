# MatchPoint AI - Final submission information

## Submission identity

**Project name:** MatchPoint AI - Smart Tennis Motion Trainer

**One-line explanation:** MatchPoint AI turns an ordinary smartphone into a motion-tracked tennis racket and provides real-time 3D practice, shot analysis, and coaching on a computer.

**GitHub repository:** https://github.com/yarin-kovalski/Assignment4_exe3

**Kanban board:** https://trello.com/b/892SCMYP/matchpoint-ai-final-project

**Video link:** PASTE THE PUBLIC GOOGLE DRIVE VIDEO LINK HERE AFTER RECORDING

## The problem and solution

Traditional tennis analysis often needs a coach, a camera system, or dedicated sensors. MatchPoint AI uses a phone the player already owns. Expo reads the phone's motion sensors, streams calibrated motion to a computer, and turns it into a responsive racket inside a 3D tennis court. The desktop combines the live motion with custom ball physics and converts the session into clear feedback about stroke side, speed, timing, placement, spin, racket face, arc, follow-through, consistency, and practice results.

The product is a smart motion trainer. The 3D court is the live training and demonstration environment.

## Major implemented features

### Connection and calibration

- One-command Windows startup with `npm run all`.
- Cinematic Three.js welcome experience with product explanation and setup flow.
- Working Expo Go QR code generated for the current local network.
- Smartphone-to-PC Socket.IO connection over the LAN.
- Live connection status and reconnect handling.
- Tennis-ready calibration with a ghost racket and stable-pose validation.
- Quaternion-based phone orientation mapped into the Three.js court coordinate system.

### Motion and stroke analysis

- Continuous phone orientation, angular velocity, acceleration, and gravity-compensated motion packets.
- Noise smoothing, packet-gap handling, invalid quaternion rejection, and spike protection.
- Live racket visualization driven by the phone.
- Forehand, backhand, and uncertain stroke classification.
- Estimated swing speed with average and peak values.
- Early, on-time, late, and no-contact timing feedback.
- Phone-derived power, lateral direction, upward/downward brush, and racket-face influence.

### Tennis simulation and training

- Detailed outdoor 3D tennis court, net, racket, felt tennis ball, fences, and stadium seating.
- Fixed-step custom ball physics with gravity, drag, Magnus force, bounce, net contact, and court rulings.
- Continuous/swept racket collision checks to reduce tunnelling during fast swings.
- Forehand and backhand feeds.
- Neutral, Fast Flat, Heavy Topspin, and Random feed styles.
- Repeat one side, alternate sides, or play one ball at a time.
- Low and Medium feed variation.
- Training assistance that keeps contact playable while preserving misses and shot variation.
- Court Vision mini-map showing physical first-bounce position and in/out context.

### Target-cone practice

- Deep Shot, Regular, and Short Shot practice choices.
- Realistic 3D cone clusters placed in valid opponent-court areas.
- Cones fall independently after a physical first-bounce hit and reset in valid locations.
- Cone score, hit rate, cones knocked down, and best target streak.
- Cone results included in the session report.

### Wind training

- Wind can be turned off or set to Light, Medium, or Strong.
- Eight selectable directions: left, right, toward player, toward opponent, and four diagonals.
- Wind changes ball drift and pace within playable limits.
- Animated translucent flow visualization communicates direction and intensity.
- Procedural wind sound with a mute option.
- Used wind conditions are included in the session report.

### Feedback, audio, and reports

- Realistic procedural racket-hit, tennis-ball bounce, cone-fall, and wind audio.
- Animated 1-10 gauges for spin, racket-face position, shot arc, and ending/follow-through.
- Hit/miss ratio, stroke counts, average speed, target accuracy, and best streak.
- Detected shot styles: regular, topspin, heavy topspin, slice, drop shot, and side spin.
- Session feedback with measured coaching priorities and comparison with the previous session.
- Player name and personal session reflection.
- Downloadable self-contained HTML performance report.
- Raw sensor recording, JSON export, and replay of the last sensor recording for diagnostics.

## Technology stack

| Layer | Technology | Purpose |
|---|---|---|
| Mobile controller | Expo SDK 57, React 19, React Native 0.86 | Runs the phone controller in Expo Go |
| Motion sensors | `expo-sensors` DeviceMotion | Reads orientation, acceleration, gravity, and rotation rate |
| Realtime transport | Socket.IO 4.7 | Streams motion and calibration events between phone, server, and PC |
| Server | Node.js, TypeScript | Serves the clients, manages runtime setup, and relays realtime events |
| Desktop 3D | Three.js 0.184, WebGL, GLTFLoader | Renders the court, racket, ball, targets, lighting, and cinematic welcome scene |
| Physics | Project-owned TypeScript modules | Fixed-step flight, drag, Magnus force, bounce, net, bounds, and swept racket collision |
| Audio | Browser Web Audio API | Procedurally creates hit, bounce, cone, and wind sounds |
| UI | HTML, CSS, TypeScript | Player controls, HUD, reports, responsive welcome experience, and accessibility fallbacks |
| Local data | Browser localStorage and downloaded HTML/JSON | Stores recent session comparisons and exports reports/recordings |
| Automation | PowerShell, npm scripts | Finds the LAN address, builds the project, starts Metro/server, warms iOS bundle, opens PC page, and prints QR |
| Quality | TypeScript compiler, Node test runner, browser smoke checks | Verifies physics, sensors, reports, welcome flow, sockets, and responsive behavior |
| Project management | Git, GitHub, Trello | Source history, private repository submission, and Kanban evidence |

## Architecture and runtime flow

```text
Phone movement
    |
    v
Expo Go controller
DeviceMotion -> permission -> calibration -> normalized motion packet
    |
    | Socket.IO: continuous_orientation / controller:motion
    v
Node.js + Socket.IO broker
Tracks mobile/PC connections and forwards the latest controller state
    |
    | Socket.IO: controller:state and calibration events
    v
Desktop browser
Sensor normalization -> racket pose -> stroke state machine -> collision window
    |
    +--> Three.js court, racket, ball, cones, wind, Court Vision
    |
    +--> Custom fixed-step physics and first-bounce ruling
    |
    +--> Live gauges, hit/miss, timing, placement, coaching
    |
    +--> Session history, downloadable report, diagnostic recording/replay
```

### Event flow explanation

1. The player opens Expo Go from the startup QR and taps Connect and Start.
2. Expo requests motion permission and samples DeviceMotion at the configured interval.
3. The phone sends orientation and acceleration packets through Socket.IO.
4. The Node.js broker identifies the mobile and PC roles and forwards the latest state.
5. The PC validates and normalizes each packet, applies the saved calibration quaternion, and updates the racket pose.
6. The stroke state machine looks for deliberate forward motion and classifies the stroke side.
7. During the ball contact window, swept collision and bounded training assistance decide whether contact occurred.
8. Custom physics calculates the return from phone-derived speed, direction, face angle, and brush/spin evidence. Wind is applied every physics step when enabled.
9. The observed first bounce determines IN, NET, SHORT, LONG, WIDE, and cone scoring. The simulation does not award a target from a predicted landing point.
10. The desktop updates the HUD and accumulates the session. Finish Session creates coaching feedback and enables the full report download.

## Honest technical positioning

- The application uses deterministic sensor processing, classification rules, and coaching heuristics. It does not claim a trained neural-network model.
- Swing speed and technique values are estimates derived from one phone, not laboratory measurements.
- Raw replay is a sensor-data replay, not a camera video replay.
- The application does not perform body-pose analysis and does not claim to evaluate feet, hips, shoulders, or injury risk.
- Cannon.js, Anime.js, and MediaPipe appeared in early plans but are not part of the final runtime. The finished project uses custom TypeScript physics, Three.js animation, and phone motion sensors.

## Suggested video structure - maximum 5 minutes

### 0:00-0:20 - Opening

Show the cinematic welcome screen and say:

> This is MatchPoint AI, a smart tennis motion trainer that turns an ordinary smartphone into a motion-tracked racket and provides real-time 3D practice, shot analysis, and coaching on a computer.

### 0:20-0:45 - Problem and architecture

Show the architecture diagram and say:

> The phone runs an Expo Go controller and reads DeviceMotion data. Socket.IO sends calibrated motion through a Node.js broker to the desktop. The PC maps the phone to a Three.js racket, runs custom tennis physics, and produces live feedback and a final report.

### 0:45-1:20 - Setup and calibration

- Show `npm run all` reaching the ready state.
- Show the PC page opening automatically.
- Scan the QR and tap Connect, then Start.
- Hold the phone securely and show the on-screen racket responding.
- Align the racket with the ghost and calibrate.

Say that both devices use the same Wi-Fi and that the calibration makes the current grip the neutral tennis-ready pose.

### 1:20-2:25 - Training mode

- Choose Forehand and hit a ball.
- Choose Backhand and hit a ball.
- Show Fast Flat or Heavy Topspin feed and the single-shot state.
- Point out racket motion, ball bounce, realistic sound, Court Vision, timing, speed, and the four technique gauges.
- If possible, demonstrate both an in shot and a miss so the feedback is credible.

### 2:25-3:20 - Target-cone practice

- Switch to Target Cones Practice.
- Select Deep Shot, then demonstrate that the cones appear near the baseline.
- Hit a cone and show it fall and reset.
- Briefly show that Regular and Short Shot can be selected again.

Explain that scoring uses the observed physical first bounce and that the report stores cones knocked down and the selected practice focus.

### 3:20-3:50 - Wind training

- Enable Light wind and choose a direction.
- Show the subtle wind volume and ball drift.
- Switch briefly to Medium or Strong to show the different speed.
- Show the wind mute option.

Explain that wind influences the live physics and is recorded in the report.

### 3:50-4:35 - Session analysis

- Click Finish Session.
- Show player name and reflection fields.
- Point to hit/miss, stroke counts, speed, accuracy, streak, timing, shot styles, technique levels, cone results, wind conditions, and coaching feedback.
- Download and open the full report.
- Mention that the advanced panel can record, export, and replay sensor data.

### 4:35-4:55 - Engineering evidence and close

Show GitHub and the final Trello board and say:

> The project was developed incrementally with Git and Trello. Automated checks cover sensor normalization, stroke detection, fixed-step physics, collision, first-bounce rulings, reports, sockets, and responsive browser behavior.

Finish with:

> MatchPoint AI makes advanced tennis practice accessible with equipment the player already owns: a phone and a computer.

## Recording checklist

- Record at 1920x1080 or higher and export at 1080p.
- Keep the final video at 5:00 or less; target approximately 4:45.
- Record the PC screen cleanly without the IDE covering the application.
- Keep the phone visible for the connection, calibration, and at least one real swing.
- Confirm the QR is working before recording, but avoid leaving the QR visible long enough to distract from the product.
- Demonstrate every feature you mention. Do not narrate planned features as implemented.
- Make text large enough to read in the exported video.
- Use a quiet space so tennis sounds and narration are clear.
- End the session and open the downloaded report before stopping the recording.
- Check the exported video from beginning to end before uploading.

## Moodle submission checklist

1. Push the final approved commits to the private GitHub repository.
2. Confirm the instructor still has access to the repository.
3. Record and export the video at 1080p, maximum five minutes.
4. Upload it to Google Drive.
5. Set sharing to **Anyone with the link - Viewer**.
6. Test the video URL in a private/incognito browser window.
7. Replace the placeholder video URL in the submission PDF.
8. Confirm the PDF contains the video URL, GitHub URL, and final Kanban screenshot.
9. Upload the PDF to Moodle.
10. Upload `finalproject.zip` to Moodle.
11. Download both Moodle uploads once and open them to verify they are not corrupted.

