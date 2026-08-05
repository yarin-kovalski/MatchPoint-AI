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

Do not manually reuse an old server IP. The launcher supplies the current address
through `EXPO_PUBLIC_SERVER_URL` every time it starts.

## Stop Everything

Press `Ctrl+C` in the original terminal that ran `npm run all`. The launcher also
closes the Expo terminal it created.

If ports `3000` or `3443` are already in use, stop the older project terminal
before running the shortcut again.
