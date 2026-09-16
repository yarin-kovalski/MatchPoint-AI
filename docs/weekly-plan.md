# One-Week Execution Plan

## Expo SDK 57 Compatibility

The physical iPhone confirms its Expo Go requires SDK 57. Restore SDK 57 and align dependencies using Expo install --fix. Keep the existing LAN detection, force Expo Go, and remove SDK 54 offline startup. No controller or game changes are in scope.

Acceptance: install --check, mobile TypeScript, root build, and LAN manifest/iOS bundle checks pass; the manifest advertises exposdk:57.0.0 and a private LAN host. Phone launch remains a manual check.

Verified: Expo 57.0.21, React 19.2.3, React Native 0.86.3, sensors 57.0.2,
and Babel preset 57.0.11. Expo install --fix/--check passed, Expo Doctor passed
21/21, mobile TypeScript and root build passed. LAN manifest and iOS development
bundle returned HTTP 200 at 10.100.102.217:8081; the bundle contains the matching
PC server URL. The SDK 57 asset schema resolved successfully.

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

## 2026-09-14 requested run/playability repair
Resolved nested conflict markers in PC imports while retaining both diagnostic modules. Added Training court-targeted return assistance, a less brittle active-swing gate, and landing announcements. Automated validation complete (222 app + 6 kanban tests); fresh phone verification remains. Run `npm run all` for the Expo controller workflow, or `npm run dev` for the browser controller and desktop.

## Sensor-driven return variation (2026-09-14)
Removed safe landing targets at user request. Expo motion now drives power, vertical brush and lateral aim; axis normalization is explicit for iOS/Android. Added physical net contact, singles first-bounce calls and persistent outcomes. Build, Expo typecheck, automated regression tests and HTTP verification are required; real phone validation follows reload/recalibration. See docs/shot-behavior.md.

## Training and Game mode split (2026-09-14)

The player UI now exposes Training and a clearly labeled future Game mode; Realistic is removed from the player workflow. Training keeps sensor-driven shot physics. Backhand uses the same intent and return pipeline as forehand with mirrored contact geometry, a slightly larger cross-body strike envelope, 42 ms more early tolerance, 120 ms more late tolerance, and a lower forward-score floor while still rejecting backward motion. Game targets and ranks remain behind the Phase 1 video gate; see `docs/game-mode-plan.md`.

## Outdoor court visual pass (2026-09-15)

Acceptance criteria:

- The playing area reads clearly as a blue hard court inside a green surround.
- The enclosure uses transparent black diamond chain-link mesh, substantial posts, and top/bottom rails like the supplied reference.
- The sky is bright blue with a visible sun, soft drifting clouds, and small animated bird silhouettes.
- Distant landscaping, daylight, haze, and materials add depth without changing sensor, swing, ball, or training behavior.
- Animation remains time-based and the scene continues to fit the existing render pixel budget.
- TypeScript build and the complete automated test suite pass before delivery.

## Sunset resort refinement (2026-09-15)

Acceptance criteria:

- Rear and side fence meshes terminate at one shared corner with no doubled mesh, rail, or post.
- The existing blue and green court surfaces remain unchanged.
- A warm sunset, green privacy screens, tropical palms, dense trees, court lights, and small courtside details match the supplied resort reference.
- Tree crowns and palm fronds move gently with time-based wind while trunks and fence remain stable.
- Decorative geometry stays outside the playable court and does not affect training physics or phone sensor handling.
- Build, scene tests, and the full regression suite pass.

## Smart Training sessions (2026-09-16)

Acceptance criteria:

- Training shows detected forehand/backhand, per-shot swing speed, early/on-time/late contact, hit/miss ratio, and placement accuracy.
- Training accuracy uses a consistent deep-center aim zone without adding visible Game-mode targets.
- Session summaries include averages, peak speed, stroke counts, timing distribution, accuracy, and best streak.
- Completing a session produces concise coaching feedback based on the measured weakness.
- The latest 20 completed reports persist locally and the next report compares hit ratio, accuracy, and speed against the previous session.
- Game mode remains a future extension for visible shooting targets, points, and ranks.

Outcome correction:

- Racket contact is provisional. A shot enters the session record only after the outgoing ball receives its first-bounce ruling.
- Only `IN` is a successful shot. `NET`, `SHORT`, `OUT_WIDE`, `OUT_LONG`, `OUT`, and no-contact outcomes are misses.
- Target accuracy uses the physical first-bounce point for successful shots; every failed return receives zero placement accuracy.
- Stroke type comes from strict motion-state classification when available, with a sensor-evidence fallback based on the strongest forehand/backhand preparation-side score across the feed. The expected feed side is never used as the detected side.

## Advanced stroke technique report (2026-09-16)

Acceptance criteria:

- Every returned shot reports spin type and intensity, including topspin and slice levels derived from the physical impact model.
- The trainer explains the racket's low-to-high or high-to-low path, estimates how well the player got under the ball, and reports launch angle, apex, and net clearance.
- Forehand and backhand follow-through are evaluated with mirrored, handedness-aware cross-body logic and an explicit far-shoulder finish result.
- The live panel and completed-session summary show technique measurements alongside outcome, timing, speed, and accuracy.
- A completed session can be downloaded as a styled standalone HTML report with session changes, coaching, and representative strong and focus shots.
- The report states that far-shoulder completion is a phone-motion estimate because the current proof of concept does not track the player's body pose.
- TypeScript builds and the complete automated regression suite pass.
