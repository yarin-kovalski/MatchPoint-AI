# MATCHPOINT-D7-VISUAL-MAX-AND-MECHANICS-PASS

Status: automated tests, build and browser checks pass; physical-phone acceptance required. This is an additive
upgrade of the functional, recorded trainer, not a new phase reset.

## Recording reviewed before code changes

`TENNIS VIDEO 1.mp4`: 45.21 seconds, 1728 x 1080, captured at 10 fps.
ASTRA was explicitly invoked but hit its usage limit before returning findings.
The primary agent inspected an overview at three-second intervals and all
captured frames from 3.0–4.9 seconds. These findings are not an ASTRA review.

- 0–18s: both forehand and backhand play paths are visible; incoming feeds and
  returns work. Preserve their calibration and validated anchors.
- 3.0–4.9s: the racket moves through contact and recovery. A return covers a
  large distance between 3.9 and 4.0s. At 10 fps this cannot distinguish a
  dropped render frame from fast flight; do not claim measured game FPS.
- 21–30s: stationary racket and no active feed; the recording does not show
  phone movement, so this is not proof of a sensor freeze.
- Throughout: coarse screen-space net grid, flat sky, abrupt dark perimeter,
  uniformly yellow racket frame/white grip, hard shadows, dense scoreboard and
  prototype branding. Court lines and ball remain readable. Ball felt/seam and
  fine spin cannot be assessed reliably at this video scale.
- Baseline: all 160 existing application tests pass.

## Implementation and preservation contract

1. Recover safely after rejected sensor spikes; use time-based visual smoothing,
   quaternion continuity and bounded prediction without changing calibration.
2. Keep fixed-step simulation; separate visual ball sampling from collisions;
   correct world-space spin visualization and remove contact-position resets.
3. Add deterministic, validated feed archetypes around immutable anchors; keep
   Validated/variation-off and storage schemas unchanged.
4. Audit grip/head kinematics and spin basis; retain intent and collision gates.
5. Improve court, net, racket, ball, lighting and background with bounded geometry.
6. Add rolling frame-time telemetry and consolidate Player Mode feedback.
7. Regression tests and before/after browser checks under identical conditions.

No Expo or server protocol edits; no localStorage migrations, deletes or writes
from automation against the user's browser. No baseline position changes or
recalibration. Existing preset JSON must remain byte-identical.

## Acceptance

- Existing forehand/backhand, calibration, storage and contact tests pass.
- New tests cover spike recovery, frame-independent smoothing, bounded prediction,
  continuous ball visuals, world spin, deterministic safe feeds, contact fidelity,
  scene structure, Player Mode visibility and rolling P95 telemetry.
- Measure comparable browser frame timings; report software-renderer limitations.
- Manual 60 fps phone-controlled capture must confirm fast-swing stability,
  no freezing, continuous flight, believable bounce and shot differentiation.
- Do not mark the card Done on automated evidence alone.

## Implementation report

- Motion: rejected angular spikes rebase the comparison pose, avoiding persistent
  rejection against an old quaternion. Resampler angular velocity now uses the
  quaternion's coordinate basis. Existing sign continuity and 40 ms timestamp
  interpolation remain; prediction tapers to rest over a bounded 50 ms. Visual
  smoothing is time-based, faster during swings, with a visual-only recovery cap.
  Holding after the prediction horizon during a network outage is intentional.
- Ball: render interpolation samples completed 120 Hz physics states. Calibrated
  contacts retain the actual position and enforce existing reach limits per axis.
  Swept physical contacts consume the remaining frame along the rebound instead
  of stopping at a rewound contact point. Spin visualization uses the physical
  world axis, with no invented incoming rotation.
- Feeds: optional Neutral, Deep, Looping, Fast Flat, Heavy Topspin and Soft High
  vary launch height/speed, bounce depth, spin and bounded arrival timing. They
  preserve contact anchors, use the live drag/Magnus law and reject unsafe paths.
  Variation Off retains the original feed. First-bounce retargeting is retained.
- Shot model: existing angular-velocity/contact response, classification, safety
  limits and bounce coefficients are retained. No broad shot-model rewrite or new
  inferred phone translation was introduced in this continuation. Flat/topspin/
  slice and weak/strong regressions pass; visual differentiation needs phone QA.
- Court/net: restrained hard-court colors, baked micro-normal and roughness maps,
  thin regulation lines, real 40 mm net cords nearby and filtered cords at a
  distance, center sag, white band/posts and stable shadows. Cheap service-box
  tints replace redundant transparent PBR shading.
- Racket/ball: calibrated GLB geometry gets composite-frame, string and textured
  grip finishes. The calibration ghost retains its alignment silhouette without
  duplicate strings/wire clutter. Ball felt/seam shading is non-emissive, with a
  soft contact shadow and short high-speed trail. Impact deformation is not enabled.
- Lighting/environment: coherent sunlight and hemisphere fill, procedural sky,
  distant foliage and opaque windscreens. No HDR downloads, PMREM, bloom, depth
  of field or post-processing chain. Camera pose and shadow resolution remain;
  the wider viewport improves framing.
- Performance/UI: 700,000-pixel court budget (HTML remains native resolution),
  reused geometry/materials, reduced texture sampling, rolling FPS/average/P95/
  long-frame telemetry alongside packet rate/jitter. Player Mode hides debug
  geometry; concise contact feedback shows km/h, power, spin and quality.

Developer trajectory preview intentionally pauses at the calibrated contact
anchor. This calibration tool is preserved; it is not the gameplay contact path.

## Regression evidence

Baseline commit: `b46986f5ba0c04270695d4ccd624a1b6ad516414`.
No changes to preset JSON, storage keys/loading/saving, calibration transforms,
baseline player position, Expo controller, server or WebSocket payloads.

- `npm test`: 185 application tests and 6 Kanban tests, all passing.
- `npm run build`: server, browser mobile controller and PC TypeScript pass.
- `git diff --check`: no whitespace errors.
- Browser QA: no page errors, no horizontal overflow at 1440 x 900 or 900 x 700,
  Advanced closed by default, all six style options available.
- Both validated Forehand/Backhand play paths still resolve exactly one hit.
- 96 live-flight cases: six styles x two sides x two variation levels x four seeds.
  All clear the net, bounce once, reach within 15 cm of the contact target and
  satisfy a per-step position-continuity bound.
- Additional coverage: quaternion continuity, spike recovery, interpolation,
  bounded extrapolation, visual recovery, fixed stepping, zero-dt physical contact,
  calibrated contact without repositioning, spin rotation/differentiation,
  weak/strong response, scene creation, pixel budget, telemetry and saved profiles.
- Two previous tests expected a contact-position reset; updated to assert actual
  contact continuity. A far-ball fixture used an identity (102-metre) collider;
  it now uses the real centimetre scale. New tests are explicitly in tsconfig.

## Performance and browser evidence

Fresh Chromium contexts, Windows Chrome, SwiftShader software rendering,
1440 x 900 viewport, 5-second warmup, 120 consecutive frame intervals per run.
Baseline assets were built from a temporary archive of the baseline commit;
request interception served them without modifying the working tree. The active
loop uses a synthetic local calibrated state without sending calibration events,
phone packets or writing the user's browser storage. It exercises feeds and misses,
not real-phone hits. Browser automation used Playwright after the in-app browser
reported unavailable. No application dependency was added.

| Active feed loop | Before | Final |
| --- | ---: | ---: |
| Average frame ms | 107.36 | 103.54 |
| P95 frame ms | 125.00 | 116.60 |
| Approximate FPS | 9.31 | 9.66 |
| Frames over 33.34 ms / 120 | 116 | 119 |
| Drawing buffer | 864 x 900 | 898 x 779 |

Average and P95 improve; both software-rendered runs are far below gameplay FPS.
The long-frame count does not improve and cannot certify absence of stutter.
Hardware-accelerated PC + physical iPhone acceptance remains necessary. The pixel
budget is part of the final optimization; this is not an equal-resolution comparison.
Initial reflection/texture-heavy candidates regressed and were removed/optimized.
The benchmark harness and logs are retained in `%TEMP%/matchpoint-d7-tools` and
`%TEMP%/matchpoint-d7-active-final.txt` for this session.

## Remaining real iPhone acceptance

Evidence: [before](quality-pass-assets/d7-before.png),
[after](quality-pass-assets/d7-after.png),
[raw performance output](quality-pass-assets/d7-performance.txt).
Screenshots use a synthetic local calibrated state for visual QA, not a real
phone session. Zero hits without incoming phone motion are expected.

1. Start the existing `npm run all` LAN flow and Expo Go controller. Use current
   calibration/profiles; do not Reset or Restore. Confirm saved values and baseline.
2. Hold still 5 seconds, then make 15 fast alternating swings. Record phone and
   desktop together at 60 fps. Check response, continuous rotation and recovery
   without a latched pose or recalibration.
3. Validated feeds: 10 forehands, 10 backhands, then 20 alternating. Check one
   contact per hit, no repositioning/stop at impact and no stationary-phone hits.
4. Low variation: each of six styles, three feeds per side. Check net clearance,
   one bounce and reachable contact. Compare three flat/topspin/slice swings per
   side plus weak/strong swings; check rotation, rebound and feedback.
5. Run a 60-second alternating loop on the normal hardware-accelerated PC browser.
   Record Advanced FPS/average/P95/long frames and packet rate/jitter, then close
   Advanced to check Player Mode. On 60 Hz aim for approximately 60 FPS, P95 below
   33 ms, no swing-linked stalls and no missed collisions. Do not mark Done yet.

## Files changed

- `client-pc/public/index.html`, `styles.css`: Player Mode presentation and feedback.
- `client-pc/src/main.ts`: integration, visual sampling, feedback and render budget.
- `client-pc/src/motion/sensorNormalization.ts`, `sensorResampler.ts`: spike recovery,
  quaternion prediction and visual smoothing.
- `client-pc/src/ball/BallController.ts`, `fixedStepBallPhysics.ts`, `ballPhysics.ts`,
  `ballVisuals.ts`: contact continuity, render interpolation and spin visualization.
- `client-pc/src/ball/feedArchetypes.ts`, `spinFlight.ts`: optional safe feed shapes.
- `client-pc/src/scene/tennisEnvironment.ts`, `premiumVisuals.ts`: court, net,
  environment, finishes and performance bounds.
- `client-pc/src/diagnostics/frameTelemetry.ts`: rolling frame-time statistics.
- `tests/premium-quality.test.ts`, `contact-realism.test.ts`,
  `playable-calibrated-hit.test.ts`, `validated-trajectory-preset.test.ts`,
  `pc-layout-integration.test.ts`, `tsconfig.json`: regression coverage.
- This report, `docs/risks.md`, and `docs/quality-pass-assets/`: acceptance evidence.
