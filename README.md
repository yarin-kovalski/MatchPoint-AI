# MatchPoint AI: Smart Motion Trainer

An AI-powered Smart Tennis Motion Trainer and Analysis System using a smartphone as a real-time motion controller.

The phone reads accelerometer and gyroscope data and streams it in real time through Socket.io to a desktop browser. The desktop uses this data to visualize racket motion, estimate swing speed, classify forehand/backhand movement, and provide coaching feedback.

The 3D wall-tennis game is the demo environment, not the whole project. The main value is motion capture, predictive hit logic, analytics, and training feedback.

## Current Status

Phase 1 Step 1 implementation has started.

Current target: Phase 1 MVP / Proof of Concept.

## Run Phase 1 Step 1

Install dependencies:

```bash
npm install
```

Build and run the local broker:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000/pc
```

On the phone, open the LAN mobile URL printed by the server:

```text
http://YOUR_PC_LAN_IP:3000/mobile
```

More details are in `docs/phase1-step1-runbook.md`.

## One-Week Goal

Yes: this can be built in one week if we stay disciplined.

The key is to prove the riskiest part first: phone sensor data reaching the PC with low enough latency to feel responsive, while also showing one live training statistic.

## Phase Plan

### Phase 1: MVP / Proof of Concept, Days 1-3

Goal: prove low-latency transmission and one live analytics feature.

Deliverables:

- Node.js Socket.io server.
- Mobile sensor page.
- Desktop Three.js cube page.
- Basic ball and wall physics if feasible.
- React UI overlay showing one live stat from smartphone data.
- Live mapping from phone tilt to cube rotation.
- MVP video showing phone movement controlling the cube, simple physics, and real-time stat display.

### Phase 2: Stabilization, Optional Buffer

Goal: improve reliability before gameplay.

Deliverables:

- Better connection UI.
- Sensor permission handling.
- Network instructions.
- Smoothing and calibration.
- Basic latency display.
- First swing-speed or classification heuristic.

### Phase 3: Smart Coaching Expansion, Days 4-7

Goal: turn the POC into a smart coaching trainer with an arcade wall-tennis demo.

Deliverables:

- Three.js arena.
- Racket, ball, and target wall.
- Cannon.js physics loop.
- Swing velocity calculation.
- Collision impact handling.
- Anime.js ball squish effect.
- Early/perfect/late timing feedback.
- Forehand/backhand classification.
- Session stats and improvement tracking.
- Coaching advice.
- Scoring and target tiles.
- Visual polish such as trails and lighting.

Phase 3 starts only after Phase 1 is confirmed functional and the POC video is recorded.

## Planned Project Shape

```text
.
├── server/
│   └── Socket.io broker
├── client-pc/
│   └── React + TypeScript + Three.js desktop display
├── client-mobile/
│   └── phone controller page
├── docs/
│   ├── roadmap.md
│   ├── architecture.md
│   ├── phase-1-poc.md
│   ├── weekly-plan.md
│   └── risks.md
└── AGENTS.md
```

## Success Criteria

The project is considered strong for presentation if it shows:

- Real phone motion controls.
- Stable realtime connection.
- Clear 3D response on PC.
- At least one real-time motion stat in Phase 1.
- Physics-based tennis interaction in the expansion phase.
- A visible wow factor: ball deformation on impact.
- Smart coaching feedback, not only arcade feedback.
