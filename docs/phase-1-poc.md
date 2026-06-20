# Phase 1 MVP / POC Plan

## Purpose

Prove that smartphone movement can control a 3D object on the PC browser with low latency and can produce at least one live training statistic.

This is the feasibility proof for the whole smart motion trainer.

## Step 1: Server and Mobile Controller

### Build

- Minimal Node.js Socket.io server.
- Socket.io connection handling.
- Mobile HTML page.
- Start sensor capture after a user button press.
- Read:
  - `DeviceMotionEvent.accelerationIncludingGravity`
  - `DeviceMotionEvent.acceleration`
  - `DeviceOrientationEvent.alpha`
  - `DeviceOrientationEvent.beta`
  - `DeviceOrientationEvent.gamma`
- Display raw values on the phone.
- Emit sensor packets to server at a controlled rate.

### Acceptance Criteria

- Phone opens the controller page.
- Phone asks for sensor permission if needed.
- Raw values are visible and updating.
- Server logs phone connection.
- Server receives sensor packets.

## Step 2: Desktop Three.js Visualization and Basic Physics

### Build

- Desktop page with a simple Three.js scene.
- A cube at the center.
- Basic ball and wall physics if feasible in the POC window.
- Socket.io client connected to server.
- Receive latest phone orientation.
- Map `beta` and `gamma` to cube rotation.
- Show connection status and latest packet age.

### Acceptance Criteria

- Desktop opens the PC page.
- Desktop connects to the server.
- Cube rotates when phone tilts.
- Ball and wall physics are visible if included.
- Motion feels live enough to record.
- User can record an MVP/POC video.

## Step 3: POC Stats Display

### Build

- React UI overlay on the desktop.
- Calculate one simple live stat from smartphone data.
- Recommended first stat: current motion speed or peak acceleration.
- Alternative first stat: rough forehand/backhand guess from orientation direction.

### Acceptance Criteria

- Stat updates while the user moves the phone.
- The value is visible in the POC video.
- The stat is clearly connected to phone motion.

## POC Video Requirements

The video should show:

- Phone screen with live sensor numbers.
- PC screen with cube.
- User moving or tilting phone.
- Cube responding on PC.
- Basic ball/wall physics if implemented.
- Real-time stat overlay on PC.

Suggested length: 20-40 seconds.

## Definition of Done

Phase 1 is done only when:

- The POC works on the user's actual phone and PC.
- The POC video is recorded.
- We document any browser or network issues discovered.

After this, Phase 3 smart coaching expansion can begin.
