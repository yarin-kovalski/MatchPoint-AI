# Risks and Mitigations

## D7 physical-phone and GPU acceptance

Automated regressions and software-renderer comparisons cannot establish real
phone swing latency or stable hardware-accelerated FPS. The supplied recording
is only 10 fps. ASTRA was requested but reached its usage limit before findings;
the primary agent reviewed extracted frames instead, without restarting ASTRA.
The in-app browser was unavailable; isolated local Chromium was used for QA.
Keep D7 acceptance open until the real-phone checks in
`docs/matchpoint-d7-quality-pass.md` pass. No saved calibration or presets were reset.

## Expo Go SDK Compatibility

The physical iPhone confirms SDK 57 support. SDK 54 was incompatible and is no longer the target. The launcher has no login gate, but Expo Go on iPhone enforces its own authentication requirement; changing SDK versions does not bypass it.

Source: https://expo.dev/changelog/expo-go-57-login

## Expo Schema Connectivity

The earlier manifest-assets warning came from Expo CLI fetching its configuration schema; ECONNRESET was reproduced. No icon, splash, adaptive-icon, or font paths are configured. No warnings are suppressed or dependency internals patched. SDK 57 startup uses online LAN mode to allow schema requests.

Latest verification: the SDK 57 schema resolved successfully and repeated LAN
manifest requests plus the iOS development bundle returned HTTP 200. Intermittent
network resets occurred during installation but retries succeeded.

## Sensor Permission Issues

Risk: iOS Safari requires explicit user permission for motion and orientation events.

Mitigation:

- Use a visible "Enable Motion" button.
- Call permission APIs inside a user gesture.
- Document browser used for testing.

## HTTPS Requirement

Risk: Some mobile browsers restrict sensor APIs to secure contexts.

Mitigation:

- Start with local LAN testing.
- If blocked, use a temporary HTTPS tunnel or local certificate.

## Local Network Problems

Risk: Phone cannot reach the PC server because of firewall, Wi-Fi isolation, or wrong IP.

Mitigation:

- Print LAN IP in server output.
- Test with phone and PC on same Wi-Fi.
- Allow Node.js through Windows Firewall if prompted.

## Sensor Noise

Risk: Accelerometer data jitters and creates unstable movement.

Mitigation:

- Use exponential moving average smoothing.
- Add dead zones.
- Add calibration.

## Latency

Risk: Motion feels delayed.

Mitigation:

- Send compact packets.
- Throttle to a practical rate, around 30-60 Hz.
- Use latest-state rendering instead of processing every old packet.
- Later, use predictive motion and physics assistance.

## Mobile JavaScript Thread Saturation

Risk: Expo sensor callbacks, React UI rendering, and Socket.IO emission share the
same JavaScript thread. Publishing several React state changes on every 16 ms
sensor callback can delay outgoing motion packets for seconds even though the
native sensors continue sampling.

Mitigation:

- Keep `continuous_orientation` emission at the native sensor callback cadence.
- Update the phone's visible raw-value display at 10 Hz from refs.
- Compare existing phone and server timestamps and display phone-to-server,
  server-to-PC, resampler, render, physics, and racket-transform telemetry in Developer mode.
- Preserve a three-second rolling trace when `STALL_DETECTED` fires.

## Orientation Drift

Risk: Absolute device attitude can still shift when the operating system adjusts
its heading estimate, or when the player changes grip.

Mitigation:

- Require an explicit centered start-position calibration.
- Keep recalibration available from the phone throughout the session.
- Use absolute `DeviceMotion.rotation` rather than integrating gyroscope rates.
- Apply phone motion relative to a captured quaternion baseline.

## Cross-Platform Sensor Units

Risk: Expo exposes absolute attitude, rotation rate, and acceleration through
different native APIs whose axis labels and timing details can vary by platform.

Mitigation:

- Preserve `alpha/beta/gamma` rotation-rate metadata instead of relabeling it as
  literal world axes.
- Derive angular velocity from consecutive normalized quaternions.
- Normalize acceleration to m/s² and vectors to the Three.js basis in one module.
- Use transport timestamps for frame timing and retain sensor timestamps for
  diagnostics.

## Predictive Hit Fairness

Risk: Real collision detection may feel unfair if phone and ball positions are slightly out of sync.

Mitigation:

- Use generous racket bounds.
- Use predictive swing windows.
- Apply physics cheating in favor of the player.

## Swing Classification Accuracy

Risk: Forehand/backhand detection may be noisy or wrong because users hold the phone differently.

Mitigation:

- Start with a simple decision tree.
- Add calibration.
- Display confidence.
- Treat the first version as coaching assistance, not a perfect AI model.

## Instructor Value Perception

Risk: The project may look like only a game if analytics are hidden.

Mitigation:

- Show a visible stats overlay from Phase 1.
- Explain that the game is the demo environment.
- Emphasize sensor analysis, predictive hit logic, and coaching feedback in the presentation.

## 2026-09-14 repair verification
- In-app browser returned unavailable, so visual browser QA could not run. Build, tests, and HTTP asset checks pass; verify the new landing overlay on the desktop with a fresh phone session.
- Training assistance deliberately favors successful court returns; it is not an accurate reconstruction of physical racket impact. Realistic mode retains the existing impact model.

## Sensor-driven shots verification (2026-09-14)
- In-app browser again reports unavailable. HTTP/compiled asset checks are available; desktop visual QA and a live Expo swing session remain unverified.
- Phone-derived velocity/spin gains, net deflection and bounce friction are approximations. Verify fresh iOS and Android swings after reloading the controller, especially grip-dependent face orientation. Expo SDK upgrades must re-check native rotationRate axis mapping.

## Backhand field verification (2026-09-14)

- Automated replay and symmetry checks pass, but the widened backhand timing/strike envelope needs a fresh real-phone backhand session. If it still misses, record the new diagnostic attempt before changing thresholds again.
- Game scoring thresholds are provisional planning values. Do not implement or tune them until Phase 1 Training is confirmed and the POC video is recorded.

## Outdoor scene performance (2026-09-15)

- Transparent fence and cloud layers can increase overdraw on low-power laptops. The fence uses one procedural material per run, clouds use a small fixed mesh count, and neither casts shadows.
- The outdoor motion is decorative and time-based. It has no effect on phone telemetry, hit detection, or ball physics.
- Automated scene tests and HTTP verification pass. The configured in-app browser was unavailable, so final visual inspection on the target PC remains the only open QA step.
