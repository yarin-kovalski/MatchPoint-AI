# Phase 1 Step 1 Runbook

## What This Step Builds

- TypeScript Node.js Socket.io broker.
- Mobile browser page for raw sensor debugging.
- PC browser packet monitor for verifying that phone packets are echoed through the broker.

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

## Expected Result

On the phone:

- Press "Enable motion sensors".
- Accept browser sensor permission if asked.
- Raw orientation, acceleration, acceleration including gravity, and rotation rate values should update.
- Packet count should increase.

On the PC:

- Socket status should show connected.
- Mobile client count should increase.
- Latest controller packet should update continuously.
- Packet age should stay low.

## Troubleshooting

If the phone cannot open the page:

- Make sure phone and PC are on the same Wi-Fi.
- Use the LAN IP printed by the server, not `localhost`.
- Allow Node.js through Windows Firewall if prompted.

If sensors do not update:

- Press the enable button again after refreshing.
- Try Chrome on Android or Safari on iPhone.
- Some iPhone sensor APIs may require HTTPS. If that blocks us, we can add a local HTTPS tunnel in the next step.
- If the phone shows `Permission: denied`, use `docs/ios-https-tunnel-fix.md`.

If packets appear on the phone but not PC:

- Keep the PC page open at `/pc`.
- Refresh both pages.
- Check the terminal for Socket.io connection logs.
