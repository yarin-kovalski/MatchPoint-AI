# Phase C Stroke Detection

Phase C consumes the normalized Phase B frame and does not alter calibration,
the neutral ready pose, or the phone-to-racket quaternion mapping. Start the
complete phone, server, and desktop demo with:

```powershell
npm run all
```

Run all Phase B and Phase C tests with `npm test`, or only Phase C with
`npm run test:phase-c`.

## Architecture

`StrokeStateMachine` owns one shared pipeline:

`READY -> PREPARATION -> BACKSWING -> RACKET_DROP (optional) -> FORWARD_SWING
-> CONTACT_WINDOW -> FOLLOW_THROUGH -> RECOVERY -> READY`

`strokeProfiles.ts` supplies forehand, one-handed backhand, and two-handed
backhand rules. `strokeScoring.ts` calculates competing classification,
direction reversal, forward swing, contact, follow-through, and experimental
spin scores. A stroke type locks only after sustained evidence and cannot
change until rejection or recovery.

World coordinates are `+X` player-right, `-X` player-left, `+Y` up, and `-Z`
court-forward. For a right-handed forehand, preparation is `+X`; for a
right-handed backhand it is `-X`. Follow-through crosses to the opposite side.
Left-handed mode applies a `-1` handedness multiplier to mirror those rules.

The visual path uses bounded offsets on `proceduralPositionPivot`, below the
scaled racket root and above the existing orientation pivot. Live quaternion
orientation remains authoritative. No acceleration is integrated into absolute
position.

## Initial Thresholds

- READY hold: 140 ms, angular speed at most 0.45 rad/s, acceleration at most
  1.6 m/s2.
- Preparation start: at least 0.8 rad/s, orientation change at least 0.12 rad,
  acceleration below 24 m/s2.
- Classification: score at least 0.56, margin at least 0.14, sustained 90 ms.
- Contact: at least 1.7 rad/s, 4.5 m/s2, and contact score 0.58.
- Forehand face range: 0.05-1.25 rad.
- One-handed backhand face range: 0.08-1.32 rad; minimum backswing 95 ms and
  follow-through 130 ms.
- Two-handed backhand face range: 0.08-0.95 rad; minimum backswing 65 ms and
  follow-through 85 ms. This is a compact racket-orientation profile and does
  not claim to track the second hand.
- Topspin/slice threshold: 0.48. These labels are experimental and do not
  estimate RPM.

All values live in `client-pc/src/strokeDetection/strokeConfig.ts` and
`strokeProfiles.ts`; real labeled recordings should be used for tuning.

## Physical Testing

1. Connect Expo Go, hold the phone in the ghost racket, and calibrate.
2. Return to neutral and hold still briefly before every stroke.
3. Forehand: prepare on the dominant-hand side, move back, reverse forward
   toward the court, then finish upward and across the body.
4. Backhand: prepare on the opposite side, reverse forward, and finish upward
   toward/across the dominant-hand side. Select one- or two-handed mode first.
5. For topspin, use a deliberate low-to-high forward path. For slice, use a
   deliberate high-to-low forward path.

During preparation, the matching candidate score and preparation score rise.
During the forward swing, reversal, forward, acceleration, and angular-speed
values rise. At contact, the state reaches `CONTACT_WINDOW` once and the last
contact fields update. Follow-through raises the follow-through and upward/
sideways scores before recovery returns to `READY`. Rejected sequences show a
reason and recent transition timeline.

Use the recording controls to label, capture, download, and replay normalized
frames. Live and replay input call the same processing function.

## Contact Contract

`onEstimatedRacketContact(event)` receives exactly one event for a valid swing.
It includes IDs and timestamp; stroke type, handedness, backhand style, spin,
and confidence; estimated speed and directional scores; racket quaternion,
position, forward/up/side/face vectors and face angle; peak angular velocity,
acceleration, and jerk; and preparation/forward-swing durations. The future ball
system should consume this event without changing stroke detection.

## Legacy Detector

The old 1.5g mobile detector remains in `virtucourt-mobile/App.tsx`, and the old
PC visual burst handler remains in `client-pc/src/main.ts`. Both are guarded by
`USE_LEGACY_STROKE_DETECTOR = false`, so they cannot duplicate Phase C events.
Remove those guarded blocks after sufficient real-phone recordings validate the
new thresholds.

Known limitations: one phone measures racket/handle motion, not the player's
body, arm, contact point, or second hand. Position is a bounded procedural
visual estimate, and contact/spin remain estimates until the ball phase exists.
