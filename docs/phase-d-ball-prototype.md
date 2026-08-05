# Phase D Ball Prototype

Start the complete system with `npm run all`, open `http://localhost:3000/pc`,
connect Expo Go, and complete the existing racket calibration. Phase D does not
change the Phase B quaternion pipeline or Phase C stroke detector.

## World And Launch Scale

One world unit is treated as approximately one meter. The court surface is
`y=0`, world up is `+Y`, opponent/court-forward is `-Z`, and player-right is
`+X`. Phase D.1 keeps the physical tennis-ball radius at `0.0335` units and
separates it from the readable visual radius.

Both deterministic presets start at `(0, 1.85, -7.5)`. Phase D.1 analytically
solves velocity through a configured bounce point and a racket-derived forehand
or backhand target instead of using the original fixed velocity. See
[`phase-d1-ball-readability.md`](phase-d1-ball-readability.md) for current launch
and target values.

Gravity is `-9.81 m/s2`, air drag is `0.018`, incoming restitution is `0.68`,
returned restitution is `0.58`, and ground friction is `0.94`. Physics uses
substeps no larger than 1/60 second.

## String Collider And Hit Rule

The measured GLB is 330 model units from butt to head and the scene scales it
by `0.01`. The collider is attached to `modelCorrectionPivot` at local
`(0, 245, 0)`. Its ellipse has local half-width `51`, half-height `68`, and
half-thickness `5`, giving an approximate world string area of 1.02 x 1.36 m in
this stylized racket model.

Each frame transforms the ball's previous and current world positions into
collider-local space. It intersects the segment with local `z=0`, then tests:

```text
(x / halfWidth)^2 + (y / halfHeight)^2 <= 1
abs(z) <= thickness + ballRadius + configured tolerance
```

This swept segment-plane test prevents tunneling. The approximation uses the
current racket matrix and a small assist-dependent motion tolerance instead of
interpolating the previous racket matrix.

A hit requires all of the following: active incoming ball, not previously hit,
ellipse/plane collision, `CONTACT_WINDOW` or a Phase C contact no older than
130 ms, estimated stroke speed at least 4.8, and racket-face angle at most 1.45
radians. A contact event without spatial collision cannot hit the ball.

## Return And Spin

Return direction blends the racket face normal (`0.34`) with court-forward
(`0.58`), base lift (`0.20`), upward score (up to `0.34`), and limited lateral
input (maximum `0.22`). Direction is clamped toward the opponent. Stroke speed
uses a square-root curve and maps to `6.5-13.5 m/s`, with base speed `7.5`.

Spin is an experimental vector, not RPM. Topspin uses the negative racket-side
axis, slice uses the positive axis, with strengths `14` and `11`. Flight applies
`0.018 * cross(spin, velocity)` and clamps Magnus acceleration to `4.2 m/s2`.
Topspin receives stronger forward bounce; slice loses more forward speed.

## Assistance

- `off`: exact configured collider and no extra moving-racket tolerance.
- `prototype`: collider dimensions are 1.08x with 2.5 local units of plane
  tolerance.
- `easy`: collider dimensions are 1.18x with 5 local units of plane tolerance.

The ball never teleports. Hit events record whether expanded assistance was
needed, and the active mode appears in debug output.

## Manual Test

1. Calibrate and hold the neutral pose briefly.
2. Select normal speed and prototype assistance.
3. Press `Launch Forehand Ball`; prepare on the forehand side as the ball
   bounces, then swing through the visible racket collider.
4. Repeat with `Launch Backhand Ball` and the appropriate backhand profile.
5. Enable Ball debug to inspect the ellipse, face-normal arrow, velocity arrow,
   predicted path, local ball coordinates, plane distance, contact age, and the
   exact hit/miss result.
6. Test topspin with a low-to-high forward stroke and slice with a high-to-low
   stroke.
7. Start a labeled recording before launch, stop after the result, then replay
   or download it. The export includes normalized frames, deterministic launch,
   and the final hit/miss event.

Run `npm test` for all Phase B/C/D tests or `npm run test:phase-d` for Phase D.

## Limitations And Future Assets

The phone supplies orientation and stroke evidence, not absolute hand position,
so the collider is intentionally generous in prototype mode. The current
collision uses the latest racket transform, there is no net mesh collision,
and no scoring, opponent, serving, or rally AI exists.

A future Blender ball can replace `ballMesh` and a future racket can change the
collider attachment/dimensions. `BallController`, swept collision, response,
events, and tests depend only on transforms and configuration, so physics does
not need to change when visual assets change.
