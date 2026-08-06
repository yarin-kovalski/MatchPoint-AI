# Latest Real Hit Attempt

Card: `BALL-D1-READABILITY` (open)

## Recorded Result

- Attempt: forehand
- Result: MISS (`second bounce before contact`)
- Frames: 247 over 2758.7 ms
- First bounce: 59856.9 ms at `[0.6112, 0.1035, -4.4077]`
- Closest approach: 60915.0 ms, 1.2361 m
- Ball world position: `[1.3718, 1.7911, -0.8897]`
- String-bed center: `[1.4022, 1.3611, -2.0482]`
- World miss, ball minus strings: `[-0.0304, 0.4300, 1.1585]` m
- Racket-local ball: `[-57.4854, -104.1936, 33.4516]` model units
- Incoming velocity: `[0.6733, -3.6505, 3.1139]` m/s
- Incoming direction: `[0.1390, -0.7534, 0.6427]`
- Racket face normal: `[0.7570, -0.5962, 0.2676]`
- Velocity dot face normal: `+3.5192`

The local miss was left of center, below center, and on local `+Z`. In world axes the ball was slightly left, above the moving string center, and 1.159 m too far toward the player. The prior `WRONG_APPROACH_SIDE` result was a sign error: this calibrated model crosses from local `-Z` to `+Z`, so the positive velocity/normal dot is the valid incoming direction.

## Motion Evidence

- Recorded states: READY only
- Relative orientation angle: 1.499-2.166 rad from calibration neutral
- Peak angular speed: 11.611 rad/s
- Peak acceleration: 28.401 m/s^2
- Peak jerk: 384.018 m/s^3
- Peak estimated racket speed: 37.157 km/h (`angularSpeed * 3.2`)
- Peak preparation score: 0.8983
- Peak forward score: 1.0000
- Peak contact score: 0.8677
- Recorded confidence: 0 because the state never left READY

The value 37.2 is the UI's estimated km/h value, but it is not consumed by the state machine. The state machine correctly consumes angular speed in rad/s. Expo frames were not connected to the UI speed path, so the card stayed at zero until a contact event; that signal path is now connected.

READY failed for two measured reasons:

1. Ready stability required orientation within 0.25 rad of calibration neutral, but the stationary real stance began at 1.499 rad. This continuously cleared `readyStableSince`.
2. Stationary gyro noise reached 0.778 rad/s while the ready ceiling was 0.45 rad/s. After stable arming, the first deliberate frame scored 0.3361 against the hardcoded 0.34 start gate, clearing stability without starting the stroke.

## Applied Corrections

- Ready arming now uses 140 ms of low motion rather than a single exact calibrated stance.
- Ready angular-speed ceiling: 0.45 -> 0.80 rad/s.
- Preparation start score: 0.34 -> 0.33.
- Classification lock remains 0.56 with 0.14 margin; contact thresholds are unchanged.
- The expected Easy contact transform now includes the measured correction `[+0.2703, -1.1803, -0.0492]` m for a right-handed forehand, mirrored laterally for the opposite stroke side.
- Old target: `[1.1319, 2.5414, -1.9991]` m.
- New target: `[1.4022, 1.3611, -2.0482]` m.
- Contact time after bounce: 0.9000 -> 1.0581 s.
- New bounce point: `[0.7712, 0.1035, -4.3500]` m.
- Predicted second-bounce time: 1.3004 s after bounce; safety margin: 242.3 ms.
- Redundant Easy trajectory steering is disabled; rendered and physical motion use the same deterministic solve.
- Moving-racket collision now transforms the previous ball point with the previous collider matrix and the current point with the current matrix.

The original recording changed local plane sides from `-1.6133` to `+6.7732` between 60873.9 and 60882.0 ms. The old current-matrix-only sweep missed this relative crossing.

## Corrected Replay

- States: READY -> PREPARATION -> BACKSWING -> FORWARD_SWING -> CONTACT_WINDOW -> FOLLOW_THROUGH
- Peak replay preparation: 0.8983
- Peak replay reversal: 0.9561
- Peak replay forward: 1.0000
- Peak replay contact: 0.8677
- Peak replay confidence: 0.8127
- Target-to-recorded-string-center distance: less than 0.001 m
- Moving-racket plane crossing: detected
- Hit count: exactly 1
- Outgoing speed: greater than 0
- Outgoing direction: toward the far court (`-Z`)

This deterministic replay passes. The card remains open until a new real phone attempt produces `HIT`.
