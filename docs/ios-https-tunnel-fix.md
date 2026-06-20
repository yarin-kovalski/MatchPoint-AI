# iPhone Motion Sensor HTTPS Fix

## Why This Is Needed

The phone can connect to the local server, but iPhone Safari may deny `DeviceMotionEvent` and `DeviceOrientationEvent` on plain local `http://` pages.

When the mobile page shows:

```text
Permission: denied
Sensors: permission denied
```

the first fix is to open the same local app through the built-in local HTTPS server.

The server prints secure LAN URLs like:

```text
https://YOUR_PC_LAN_IP:3443/mobile
```

Use that URL on the iPhone. Safari may show a certificate warning because this is a local development certificate. Tap details and continue to the page.

If local HTTPS does not work on your network, the backup fix is a temporary public HTTPS tunnel.

We use Cloudflare Tunnel for the main fix because it is usually more reliable than localtunnel on iPhone.

## Backup Tunnel Step 1: Keep The Server Running

Terminal 1:

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
npm run dev
```

Keep this terminal open.

## Backup Tunnel Step 2: Open A Second Terminal

Terminal 2:

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
npm run tunnel
```

This should print a temporary public HTTPS URL, for example:

```text
https://something.trycloudflare.com
```

## Backup Tunnel Step 3: Open The HTTPS Mobile URL

On the iPhone, open:

```text
https://something.trycloudflare.com/mobile
```

Press:

```text
Enable motion sensors
```

Safari should now ask for permission. Tap:

```text
Allow
```

## Backup Tunnel Step 4: Open The PC Monitor

On the PC, either use:

```text
http://localhost:3000/pc
```

or:

```text
https://something.trycloudflare.com/pc
```

## Notes

- The tunnel URL changes each time unless configured otherwise.
- Keep both terminals open during testing.
- If Cloudflare prints several `https://...trycloudflare.com` links, use any one of them.
- If the tunnel is closed, the URL stops working. Run `npm run tunnel` again to get a fresh URL.
