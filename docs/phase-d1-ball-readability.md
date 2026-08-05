# Phase D.1 Ball Readability And Delivery

Phase D.1 preserves calibration, racket mapping, stroke detection, procedural
racket animation, swept collision, hit validation, spin, and event types. It
corrects the ball's visual readability and aims delivery at the actual expected
string-bed transform.

## Scale Audit

The scene treats one world unit as one meter. The court plane is 18 x 24 units.
There is currently no visible net mesh; trajectory validation uses a standard
0.914 m reference height plus 0.28 m clearance at `z=-5.5`.

The GLTF bounds are approximately 1.30 x 3.30 x 0.21 world units after the only
non-unit parent scale, `racketRoot.scale=0.01`. The procedural, orientation,
model-correction, and GLTF nodes have unit scale. The handle mesh is roughly
0.19 x 0.91 x 0.18 m. Head meshes are roughly 1.17-1.30 m wide and 1.52-1.64 m
high. This racket is stylized and oversized relative to real equipment. The
configured string ellipse is 1.02 x 1.36 m with 0.10 m total thickness.

The physical ball radius is 0.0335 m. Collision always uses this radius. The
default readable visual radius is 0.045225 m (`1.35x`), limited to `1.5x`; the
visual multiplier never changes collision acceptance.

At a 1024 px-high viewport, the default ball projects to approximately 6.5 px
at launch, 7.8 px at bounce, and 9.4 px at contact. The earlier ball was hard to
see because it used the physical 6.8 cm diameter against an oversized racket,
started far from the camera, had a 55-degree FOV, and had no seams or trail.

## Camera

The camera correction is intentionally modest:

- Position: `(0, 4.6, 7.6)`
- Target: `(0, 1.25, -1.2)`
- Vertical FOV: 50 degrees
- Near/far: `0.1/100`

It moves attention toward the delivery/contact region without changing the
racket's world transform.

## Racket-Derived Targets

`getExpectedRacketContactTransform()` reproduces the configured contact-window
procedural offset, base ready quaternion, -90-degree model correction, GLTF
scale, and collider-head center without moving the live racket.

For a right-handed player:

- Expected forehand string center: approximately `(0.139, 2.213, -2.819)`
- Forehand delivery target: approximately `(0.279, 2.176, -2.643)`
- Expected backhand string center: approximately `(-0.139, 2.213, -2.819)`
- Backhand delivery target: approximately `(-0.279, 2.176, -2.643)`

Each target is about 0.228 m from the expected collider center and remains well
inside the ellipse. Target offsets use the string-bed's verified local axes, so
the default target has zero distance from the racket plane. Left-handed mode
mirrors X. Defaults use a 0.14 m local side offset, -0.18 m local head-axis
offset, and zero face-normal depth offset.

## Deterministic Delivery

Launch begins at `(0, 1.85, -7.5)`. Initial velocity is analytically solved to
reach a bounce point at `z=-4.35` after 1.05 seconds. At the first physical
bounce, post-bounce velocity is solved from the actual bounce position to the
racket-derived target over 0.58 seconds. Gravity and the regular fixed-step
physics loop remain authoritative in both phases.

The normal preset clears the configured net reference and bounces exactly once
before reaching the target. Slow/normal/fast scale both timing intervals.

## Appearance And Rotation

`createProceduralTennisBallTexture()` creates and caches one 512 x 256 canvas
texture. It uses a yellow-green felt base, deterministic fine noise, and two
periodic curved white seam bands. The physical material uses high roughness,
zero metalness, very low clearcoat, and only a minimal emissive contribution.

The ball stores angular velocity in radians per second. Each frame integrates a
quaternion by `angularSpeed * deltaTime` and normalizes it. This is frame-rate
independent. Phase D topspin and slice vectors replace angular velocity after a
hit, so their opposite axes are visible in the moving seam pattern.

A reusable short trail, height-sensitive soft ground shadow, bounce ring,
contact flash, 3D target ellipsoid, vertical height guide, and expected string
center marker improve depth perception. Helpers remain optional.

## Manual Test

1. Run `npm run all`, open `http://localhost:3000/pc`, connect Expo Go, and
   calibrate normally.
2. Keep `Readable`, normal speed, and prototype assistance selected.
3. Enable Contact target, Trajectory, and String center in Ball delivery tuning.
4. Launch a forehand ball. It should bounce once and rise through the cyan
   target close to the pink expected string-center marker.
5. Repeat for backhand and then left-handed mode; X should mirror.
6. Swing naturally as the ball reaches the target. Collision still requires
   physical plane/ellipse crossing plus the Phase C contact window.
7. Open Orientation debug to inspect physical/visual diameter, projected pixels,
   target gap, angular velocity/quaternion, closest approach, and miss direction.

Run `npm test` for all 65 tests or `npm run test:phase-d1` for D.1 only.

Known limitations: the racket remains intentionally oversized, there is no net
mesh, projected pixels vary by viewport, and the expected transform models the
configured procedural state rather than sampling an individual player's hand
position. The tuning controls allow small development corrections without
changing collision radius or the live racket.
