# iPhone Motion Sensor HTTPS Fix

## Why This Is Needed

The phone can connect to the local server, but iPhone Safari may deny `DeviceMotionEvent` and `DeviceOrientationEvent` on plain local `http://` pages.

When the mobile page shows:

```text
Permission: denied
Sensors: permission denied
```

the next fix is to open the same local app through a temporary HTTPS tunnel.

## Step 1: Keep The Server Running

Terminal 1:

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
npm run dev
```

Keep this terminal open.

## Step 2: Open A Second Terminal

Terminal 2:

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
npm run tunnel
```

This should print a temporary public HTTPS URL, for example:

```text
your url is: https://something.loca.lt
```

## Step 3: Open The HTTPS Mobile URL

On the iPhone, open:

```text
https://something.loca.lt/mobile
```

Press:

```text
Enable motion sensors
```

Safari should now ask for permission. Tap:

```text
Allow
```

## Step 4: Open The PC Monitor

On the PC, either use:

```text
http://localhost:3000/pc
```

or:

```text
https://something.loca.lt/pc
```

## Notes

- The tunnel URL changes each time unless configured otherwise.
- Keep both terminals open during testing.
- If localtunnel asks for a password, it usually wants the public IP shown on the localtunnel page. We can switch to another tunnel tool if needed.

