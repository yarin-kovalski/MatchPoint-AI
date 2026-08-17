# Project Startup Shortcut

## Start Everything

From the project root, run one command:

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
2. Open Expo Go on the phone.
3. Scan the QR code shown in the Expo terminal.
4. In the controller, tap **Connect** and then **Start**.
5. Confirm that the PC page shows one mobile client and an increasing packet count.

The address below the QR code must contain the PC's LAN IP, for example
`exp://192.168.18.57:8081`. Never scan `exp://127.0.0.1:8081`: on the phone,
`127.0.0.1` points back to the phone instead of the PC. The shortcut forces the
detected LAN address with `REACT_NATIVE_PACKAGER_HOSTNAME` and starts Expo in
offline mode so an unavailable Expo API does not prevent Metro from starting.

Do not manually reuse an old server IP. The launcher supplies the current address
through `EXPO_PUBLIC_SERVER_URL` every time it starts.

## Expected Terminals

The original terminal runs the TypeScript build and Node.js Socket.io server. It
must show the local PC URL and the LAN server URL without an `EADDRINUSE` error.

The second terminal runs the project's installed Expo CLI in
`virtucourt-mobile`. It should show a QR code and use Expo 54. It should not ask
to install Expo 57.

If the Expo terminal shows red PowerShell errors, asks to install Expo 57, or
shows an old IP address, press `Ctrl+C` in both terminals and start again with:

```powershell
npm run all
```

Do not run `npx expo start` from the project root. The shortcut starts it from
the correct `virtucourt-mobile` directory and supplies the current server URL.

## Stop Everything

Press `Ctrl+C` in the original terminal that ran `npm run all`. The launcher also
closes the Expo terminal it created.

If ports `3000` or `3443` are already in use, stop the older project terminal
before running the shortcut again.
