# Project Startup Shortcut

## Start Everything

From the project root, run one command:

The launcher performs no Expo login check and starts a local Expo Go server.
The project uses SDK 57, matching the physical iPhone's confirmed Expo Go version.
Expo Go on iPhone enforces its own account requirement; the launcher adds no login gate.

```powershell
npm run all
```

This command automatically:

- Detects the PC's current LAN IP address.
- Installs root and Expo dependencies if they are missing.
- Builds the server, browser controller, and PC visualization.
- Opens a terminal running the Node.js Socket.io server.
- Opens a second terminal running Expo in LAN mode.
- Passes the correct PC server URL to the Expo application.
- Opens `http://localhost:3000/pc` in the browser.

## Connect the Phone

1. Keep the phone and PC on the same Wi-Fi network.
2. Open Expo Go on the phone (subject to the iPhone limitation above).
3. Scan the QR code shown in the Expo terminal.
4. In the controller, tap **Connect** and then **Start**.
5. Confirm that the PC page shows one mobile client and an increasing packet count.

The address below the QR code must contain the PC's LAN IP, for example
`exp://192.168.18.57:8081`. Never scan `exp://127.0.0.1:8081`: on the phone,
`127.0.0.1` points back to the phone instead of the PC. The shortcut forces the
detected LAN address with `REACT_NATIVE_PACKAGER_HOSTNAME` and a local
`EXPO_PACKAGER_PROXY_URL`. Expo runs with `--lan --go --port 8081 --clear`.
The launcher rejects non-private/loopback addresses and sets `EXPO_OFFLINE=0`
for the child process so Expo can fetch its configuration schema. It restores
the parent environment afterward. No EAS linking, update, or tunnel is used.

Manifest asset warnings that say the operation was aborted come from a failed
Expo configuration-schema request. The current app config has no icon, splash,
or font paths. Direct schema fetching reproduced `ECONNRESET`; later manifest
requests succeeded. The warning is not suppressed. If it recurs, connectivity
to Expo's schema service remains the blocker.

Do not manually reuse an old server IP. The launcher supplies the current address
through `EXPO_PUBLIC_SERVER_URL` every time it starts.

## Expected Terminals

The original terminal runs the TypeScript build and Node.js Socket.io server. It
must show the local PC URL and the LAN server URL without an `EADDRINUSE` error.

The second terminal runs the project's installed Expo CLI in
`virtucourt-mobile`. It should show a QR code and use Expo SDK 57 with a matching
Expo Go version on the phone.

If the Expo terminal shows red PowerShell errors, asks to install Expo, or
shows an old IP address, press `Ctrl+C` in both terminals and start again with:

```powershell
npm run all
```

Do not run `npx expo start` from the project root. The shortcut starts it from
the correct `virtucourt-mobile` directory and supplies the current server URL.

After pulling an SDK upgrade, refresh the controller dependencies even if
`node_modules` already exists:

```powershell
npm ci --prefix virtucourt-mobile
npm run all
```

Stop the previous project terminals first. The launcher clears Metro's cache
on startup; scan the new QR code after restarting.

## Stop Everything

Press `Ctrl+C` in the original terminal that ran `npm run all`. The launcher also
closes the Expo terminal it created.

If ports `3000` or `3443` are already in use, stop the older project terminal
before running the shortcut again.
