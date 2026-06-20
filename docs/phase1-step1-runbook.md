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

## Build and Run

```bash
npm run dev
```

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
- A neon-green cube representing the racket.
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
5. Confirm that the cube rotates with low latency.

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
2. Open the mobile controller.
3. Use real sensors or the touch simulator fallback.
4. Perform a fast phone movement or a fast drag on the simulator pad.
5. Confirm that `Estimated swing speed` jumps immediately and `peak` stores the highest value.

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
