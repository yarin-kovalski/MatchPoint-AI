# Phase 1 Step 1 Runbook

## What This Step Builds

- TypeScript Node.js Socket.io broker.
- Mobile browser page for raw sensor debugging.
- PC browser Three.js visualization for verifying that phone packets control a 3D object.

## Install

Node.js must be installed first.

From the project root:

```bash
npm install
```

## Build and Run Everything

```bash
npm run all
```

This is the main shortcut for the phone-to-racket demo. It builds all three
TypeScript projects, starts the HTTP and HTTPS Socket.io broker, launches Expo
with the current LAN server address, and opens the PC racket page. Scan the Expo
QR code with Expo Go, then tap **Connect** and **Start**.

Use `npm run dev` only when you do not want the PC browser to open automatically.

The server runs on:

```text
http://localhost:3000
```

It also runs a local HTTPS server for iPhone sensor testing:

```text
https://localhost:3443
```

## Pages

Open on the PC:

```text
http://localhost:3000/pc
```

Open on the phone, using the LAN URL printed by the server:

```text
http://YOUR_PC_LAN_IP:3000/mobile
```

The phone and PC must be on the same Wi-Fi network.

For iPhone motion sensor permission, prefer the secure LAN URL printed by the server:

```text
https://YOUR_PC_LAN_IP:3443/mobile
```

Safari may show a certificate warning because this is a temporary local development certificate. Open details and continue to the site.

## Expected Result

On the phone:

- Press "Enable motion sensors".
- Accept browser sensor permission if asked.
- Raw orientation, acceleration, acceleration including gravity, and rotation rate values should update.
- Packet count should increase.

On the PC:

- Socket status should show connected.
- Mobile client count should increase.
- The dark grid court should render.
- The neon-green racket cube should rotate when phone/simulator values change.
- Packet age should stay low.

## Phase 1 Step 2: PC Three.js Visualization

The PC page is:

```text
http://localhost:3000/pc
```

It includes:

- Perspective camera.
- Basic ambient, directional, and rim lighting.
- Dark court plane.
- Grid-pattern court helper.
- External `racket.glb` model loaded with Three.js `GLTFLoader`.
- The loaded racket model is centered, scaled to fit the view, and controlled by the same phone rotation data.
- Procedural scuffed court texture.
- Animated green impact ripple on the strings.
- Neon court tube lines with local green light spill.
- Blue/purple atmospheric haze and floating dust particles for a cinematic training-arena feel.
- WebSocket mapping from phone data to cube rotation.

Mapping:

```text
orientation.beta  -> cube.rotation.x
orientation.gamma -> cube.rotation.y
```

If real orientation data is unavailable, the PC page falls back to simulator acceleration values:

```text
acceleration.y -> cube.rotation.x
acceleration.x -> cube.rotation.y
```

For testing:

1. Open `http://localhost:3000/pc` on the PC.
2. Open `http://YOUR_PC_LAN_IP:3000/mobile` on the phone.
3. Press `Enable motion sensors`, or use `Use touch simulator fallback`.
4. Move the phone or drag on the simulator pad.
5. Confirm that the racket rotates with low latency.

## Phase 1 Step 3: Live Stats Overlay

The PC HUD now includes:

- Estimated swing speed.
- Peak swing speed.
- Input mode.
- Packet age.

Estimated swing speed is calculated from the latest socket packets using:

- Fast orientation changes between packets.
- Acceleration or simulator drag speed magnitude.

For testing:

1. Open `http://localhost:3000/pc`.
2. Open the Expo mobile controller and start sensor streaming.
3. Confirm that the PC shows a red, perspective-angled wireframe racket guide.
4. Hold the phone in the neutral pose: screen toward the player and top toward
   the court.
5. Tap **Lock Tennis Ready Position** on the phone or **Calibrate Ready Pose** on
   the PC.
6. Align the tracked racket inside the ghost and hold steady until it turns green.
7. Confirm that the ghost disappears and the phone reports calibration complete.
8. Confirm the handle points toward the camera, the head points down-court, and
   the face is nearly horizontal with a small upward tilt.
9. Move the phone and confirm small rotations are smooth and follow the expected
   axes without flipping.
10. Perform a fast phone movement and confirm that `Estimated swing speed` jumps.

If the neutral racket position drifts, hold the phone in the intended start pose
and tap **Calibrated - Set Again**.

### Phase B Motion Debugging

Expand **Orientation debug** on the PC page and verify:

- Sensor validity remains `valid` during ordinary movement.
- Acceleration is displayed in m/s² and returns near zero while stationary.
- Angular speed is displayed in rad/s.
- Forward, up, and side scores respond with the expected sign.
- Racket basis `F`, `U`, and `S` vectors change smoothly without sign flips.
- A pause longer than 250ms reports `packet gap` and recovers on the next packet.

Run the pure Phase B tests with:

```powershell
npm run test:phase-b
```

## Troubleshooting

If the phone cannot open the page:

- Make sure phone and PC are on the same Wi-Fi.
- Use the LAN IP printed by the server, not `localhost`.
- Allow Node.js through Windows Firewall if prompted.

If sensors do not update:

- Press the enable button again after refreshing.
- Try Chrome on Android or Safari on iPhone.
- Some iPhone sensor APIs require HTTPS.
- If the phone shows `Permission: denied`, use the secure local URL on port `3443`.
- If local HTTPS still fails, use `docs/ios-https-tunnel-fix.md`.

If packets appear on the phone but not PC:

- Keep the PC page open at `/pc`.
- Refresh both pages.
- Check the terminal for Socket.io connection logs.
