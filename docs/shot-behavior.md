# Sensor-driven shots and rally rules

This replaces the guaranteed safe-landing Training solver. Easy contact timing remains; shots are no longer aimed at a predetermined landing point.

## Swing to ball

| Phone motion | Ball response |
| --- | --- |
| Weak forward swing | Less launch speed and a shorter return; may drop short or into the net |
| Faster forward swing | More speed and depth; excessive power can go long |
| Low-to-high brushing | Topspin, a higher launch arc and downward Magnus acceleration; a stronger forward rebound |
| High-to-low brushing | Slice/backspin, a lower, slower launch and lower rebound |
| Sideways path or angled face | Lateral aim and sidespin; excessive aim can go wide |
| Open/closed face | Higher/lower launch angle independent of the power label |

Power and shape are independent: a shot can be Weak Slice, Fast Topspin, Flat Drive, Side Spin or Mixed. These are continuous inputs; no randomized destinations are used. Ball rotation uses the same angular-velocity vector as flight physics. Bounce response uses the spin vector projected onto the travel direction, not the displayed label.

The desktop combines the preceding 180 ms of normalized sensor motion with the current face orientation. Forward angular motion, estimated racket-head velocity and gravity-free acceleration determine a continuous power score. Signed vertical motion determines brush direction; lateral motion and the face determine aim. Training can add at most 0.6 m/s of upward velocity for marginal net clearance. It does not solve for a landing target or pull a ball back into court. Realistic mode continues to use its contact/impulse model; both modes share flight physics and court rulings.

Expo DeviceMotion acceleration is in m/s^2, with gravity already removed. Its rotationRate is in degrees/s. The installed expo-sensors 57 native implementations use different rotationRate axis orders: iOS Z/Y/X and Android X/Y/Z. The controller now emits an explicit `angularVelocityRadPerSecond` vector in phone X/Y/Z. The desktop transforms it into the calibrated court frame, excluding the racket mesh correction. Older controller packets use quaternion differences. Each new swing starts a fresh peak measurement, and expired intent cannot hit another feed.

## Singles rally rules

- Judge only the first floor contact after a return, at the physics-step impact position.
- IN: first contact in the opposite singles court. The sideline and baseline count in; ball radius approximates its footprint at the edge.
- OUT - wide: first contact beyond a singles sideline, including the doubles alley.
- OUT - long: first contact beyond the far baseline.
- SHORT: first contact on the player's side without a net collision.
- NET: the ball contacts the net and falls back on the player's side. Net-body collisions dissipate energy and deflect the ball instead of allowing it through.
- A tape clip that continues across and lands in is still IN for this rally drill.
- A later bounce or roll outside cannot change an IN call. Camera/feed bounds do not end a return before landing. Nonfinite/expired flights still use a generic OUT cleanup.

Net height is approximated by a smooth sag between 0.914 m at centre and 1.07 m at the posts. Net-cord deflection and bounce friction are simplified. This is a phone-based trainer with estimated shot speed/spin, not a calibrated physical racket measurement. Serve lets, opponent play and net-post collisions are outside this rally drill.

## Validation and use

Tests cover the Expo normalization/fusion-to-shot path, native axis mapping, weak/medium/fast depth ordering, flat/topspin/slice flight and rebound, face angle, wide/long/short/net/tape cases, line touches, frame rates of 30/60/120 FPS, first-bounce-only announcements and deep returns beyond the old world cutoff. Earlier tests that required every shot to land in were replaced because that guarantee conflicts with realistic misses.

Reload the Expo app and desktop page, then recalibrate in your normal ready stance. Compare controlled flat, low-to-high and high-to-low swings at similar effort. A fresh phone session remains necessary to tune the gain for your grip and device.

Sources: [Expo DeviceMotion documentation](https://docs.expo.dev/versions/v55.0.0/sdk/devicemotion/), installed `expo-sensors/ios/DeviceMotionModule.swift` and `android/.../DeviceMotionModule.kt`, and [ITF Rules of Tennis](https://m.itftennis.com/media/7221/2025-rules-of-tennis-english.pdf), rules 12 and 25 (line touches and good returns).
