# One-Week Execution Plan

## Contact face, spin, and continuation response

- [x] Use signed racket-face pitch at contact as a direct launch-arc control.
- [x] Increase sensitivity to low-to-high and high-to-low brush paths for topspin and slice.
- [x] Sample each new phone frame during the first 260 ms of follow-through and use continued motion to refine depth and spin.
- [x] Update the live prediction and stored technique data so the bounce and session report describe the same result.
- [x] Keep continuation bounded and preserve natural net, short, long, and wide outcomes.

## Forehand contact reliability

- [x] Replay the recorded human forehand through the Training intent and contact gates.
- [x] Keep a proven valid swing usable across a brief rejected packet or natural follow-through slowdown.
- [x] Expand the Training timing and string-reach envelope while retaining finite physical limits.
- [x] Reject stationary, expired, backward, wrong-side, and clearly unreachable attempts.

## Player contact-position calibration (completed setup)

- [x] Provide separate player-facing Forehand and Backhand marking workflows.
- [x] Preview the ideal contact ball continuously and allow 5 cm left/right, height, and depth adjustments.
- [x] Provide a physical test feed before saving.
- [x] Persist both stroke positions locally and apply them to every later Training feed.
- [x] Keep calibration changes inside bounded, physically valid trajectory ranges.
- [x] Remove the setup controls after the player saved both positions while retaining the stored values.

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
- The trainer explains the racket's low-to-high or high-to-low path and measures signed racket-face openness at the exact contact frame.
- Spin, face openness, arc, and finish use animated ten-segment meters. Face level defines 1 as very closed, 5 as square, and 10 as very open; arc defines 1-3 as low, 4-7 as medium, and 8-10 as high.
- Forehand and backhand follow-through are evaluated with mirrored, handedness-aware cross-body logic and an explicit far-shoulder finish result.
- The live panel and completed-session summary show technique measurements alongside outcome, timing, speed, and accuracy.
- A completed session can be downloaded as a styled standalone HTML report with session changes, coaching, and representative strong and focus shots.
- The report states that far-shoulder completion is a phone-motion estimate because the current proof of concept does not track the player's body pose.
- TypeScript builds and the complete automated regression suite pass.

## Shot identity and professional report (2026-09-16)

Acceptance criteria:

- Every resolved contact is labeled as Regular, Topspin, Slice, Drop shot, Heavy topspin, or Side spin from measured spin, ball speed, arc, and predicted or actual landing depth.
- A drop shot requires slice, reduced ball speed, and a first bounce near the net. Heavy topspin requires strong topspin, a high arc, reduced pace, and a deep landing.
- Session totals separate in-court and out shots and calculate topspin level only from topspin-family shots and slice level only from slice-family shots.
- The export shows complete overall analysis followed by equivalent forehand and backhand reports, shot-style distribution, the player's stronger side, and separate coaching for each side.
- The player can enter a name and personal session reflection before downloading; both appear with the full session date and time.
- The exported HTML is a clean, print-ready performance document with compact tables, restrained color, and clear measurement definitions.

## Court vision and physical enclosure (2026-09-16)

Acceptance criteria:

- After every returned shot reaches its first bounce, a compact top-down court view shows the measured landing position and the in/out ruling.
- The map uses the simulation's real court dimensions and can display wide, long, short, and in-court bounces without moving the marker into a false position.
- The rear and side chain-link fences share their dimensions with the physics system. A ball below fence height reflects from the fence even when it crosses the plane between rendered frames.
- Fence contact before a first bounce is recorded as an out shot; contact after a ruled bounce does not change that first-bounce ruling.
- Downloaded session reports include a placement map of all recorded first-bounce locations, with separate in and out markers and totals.
- TypeScript build, focused physics/map tests, and the complete automated test suite pass.

## Wrong-side phantom-hit correction (2026-09-16, superseded for Training)

Acceptance criteria:

- Court Vision is visible before the first shot, uses a smaller footprint, and contains no first-bounce/fence caption.
- Training derives forehand/backhand intent from measured preparation-side evidence rather than assigning the launched feed type to the swing.
- Realistic mode rejects a forehand swing at a backhand feed and the mirrored case as `WRONG_STROKE_SIDE`. Training now follows the feed-side rule requested after this milestone.
- Timing and swing intent alone cannot create contact: the simulated string-bed center must also be within assisted racket reach of the physical ball.
- Correct forehand and backhand recordings remain playable, while the false-contact pattern visible in the supplied recording becomes a miss.
- PC build and the full automated regression suite pass.

Training forgiveness refinement:

- The contact-time allowance expands by 40 ms on each side while timing feedback continues to use the original measured offset.
- Assisted reach covers the full elliptical string bed plus ball radius and a small motion-sampling allowance; it remains bounded well below the separation seen in the false-hit recording.
- Unlocked stroke-side evidence may classify slightly earlier, but ambiguous and opposite-side motion still cannot inherit the feed type or produce a hit.

## Fast-swing continuity correction (2026-09-16)

Acceptance criteria:

- A finite phone quaternion continues through the visual resampler even when the same frame is excluded from analytics because of acceleration, timing, or motion-quality validation.
- Analytics-invalid frames remain unable to create swing intent or racket contact.
- Fast rotations corroborated by Expo's native gyroscope are treated as real motion; an uncorroborated one-frame orientation teleport remains rejected.
- Rendering uses visual-pose validity rather than analytics validity, preventing the racket from dropping into stationary smoothing during a real fast swing.
- Interpolation latency falls dynamically from 32 ms at rest to 10 ms during a fast swing, and short network gaps use bounded, tapered prediction without allowing an indefinitely moving racket.
- Recorded forehand/backhand behavior, wrong-side rejection, contact proximity, and all trainer measurements remain intact.
# Forgiving sensor-driven training contact

- [x] Keep a detected real swing active through its natural follow-through instead of dropping contact assist when the latest frame slows.
- [x] Widen the Training timing and reachable-string zones without changing Realistic mode.
- [x] Preserve the peak sensor timestamp so return speed, spin, slice, arc, direction, and depth still come from the player's swing.
- [x] Continue rejecting stationary motion, backward intent, expired swings, and forehand/backhand side mismatches.

## Saved contact position and phone-power forgiveness (2026-09-16)

- [x] Keep the player's saved forehand and backhand contact positions active while removing the completed calibration controls.
- [x] Calibrate slice transfer to phone-handle speed so a deliberate 25 km/h swing clears the net and can land in court.
- [x] Keep weaker slices short and faster slices capable of going long so power and follow-through still matter.
- [x] Preserve racket-face, spin, swing-path, direction, and follow-through effects in the outgoing shot.

## Feed-side stroke guidance and bounded contact assist (2026-09-16)

- [x] In Training, label and resolve the stroke from the incoming feed: forehand feed means forehand and backhand feed means backhand.
- [x] Move the assisted racket toward the feed side even when phone preparation-side classification is noisy.
- [x] Expand the near-racket distance and timing gates modestly while keeping stationary, backward, expired, and clearly distant attempts as misses.
- [x] Keep outgoing speed, spin, slice, racket face, arc, direction, and follow-through driven by the measured phone motion.
- [x] Keep Realistic mode's strict motion-side classification unchanged.

## Playable soft slice and contact refinement (2026-09-17)

- [x] Give detected slice shots a modest phone-speed floor so a soft high-to-low swing can cross the net.
- [x] Protect slice net clearance against noisy closed-face readings without removing face-driven arc and depth changes.
- [x] Preserve power progression: harder slices travel deeper and can still finish long.
- [x] Extend the Training swing latch, timing window, and near-racket gate while retaining stationary, backward, expired, and clearly distant misses.
