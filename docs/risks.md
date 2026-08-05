# Risks and Mitigations

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

## Orientation Drift

Risk: Absolute device attitude can still shift when the operating system adjusts
its heading estimate, or when the player changes grip.

Mitigation:

- Require an explicit centered start-position calibration.
- Keep recalibration available from the phone throughout the session.
- Use absolute `DeviceMotion.rotation` rather than integrating gyroscope rates.
- Apply phone motion relative to a captured quaternion baseline.

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
