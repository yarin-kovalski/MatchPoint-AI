# Exercise 3: Competition Research and POC Plan

## Project Name

MatchPoint AI: Smart Motion Trainer

## Updated Project Idea

MatchPoint AI is an AI-powered tennis motion trainer that uses a smartphone as a real-time motion sensor and controller. The phone streams accelerometer and gyroscope data to a desktop browser through Socket.io. The desktop app visualizes the motion in a 3D tennis training arena and calculates coaching feedback such as swing power, forehand/backhand classification, hit timing, and session improvement.

The tennis game is not the whole product. It is the active demo environment for real-time motion capture and coaching analytics.

## Critical Feasibility Question

Can a regular smartphone stream motion sensor data to a browser-based 3D scene with low enough latency to create useful real-time tennis coaching feedback?

This is the most important technical risk. If the phone-to-PC sensor loop works, the rest of the project becomes feasible.

## Products and Projects Researched

### 1. SwingVision

Link: https://swing.vision/

App Store source: https://apps.apple.com/us/app/swingvision-tennis-pickleball/id989461317

What it does:

- Uses a phone camera for AI tennis and pickleball analysis.
- Tracks shot speed, depth, accuracy, rally length, automated stats, scoreboards, highlights, and line calling.
- Provides coaching advice after sessions.
- Supports Apple Watch features.

Strengths:

- Very polished product.
- Strong AI/video analysis positioning.
- Real tennis metrics and session review.
- Clear value for players, coaches, and teams.

Limitations / opportunity for us:

- Mostly camera/video based.
- Less focused on a live 3D interactive training arena.
- Requires specific Apple ecosystem support for best experience.
- Some users report automated scoring errors.

What we can do differently:

- Use the phone as a live motion controller, not only as a camera.
- Make the feedback immediate and visual inside a 3D training scene.
- Build a POC that is simple to understand: move phone, see racket/cube move, see live stat.

### 2. Tennis AI 2.0

Link: https://tennisai.net/

What it does:

- AI-powered personal tennis coach.
- Claims real-time stroke detection, form correction, ball trajectory tracking, and personalized drills.
- Includes video analysis, pro comparison, training plans, dashboards, and progress analytics.

Strengths:

- Very close to our smart-coaching direction.
- Strong AI coaching story.
- Good focus on progress and personalized drills.

Limitations / opportunity for us:

- Product appears focused on camera/video and training reports.
- It is not centered around a browser-based 3D playable demo.
- Harder to demonstrate the underlying sensor pipeline in a classroom POC.

What we can do differently:

- Build a transparent technical demo that visibly proves the realtime sensor pipeline.
- Combine motion-control, physics, and coaching feedback in one browser experience.
- Make the "wow factor" interactive: predictive hit, ball compression, neon feedback.

### 3. SevenSix Tennis

Link: https://sevensixtennis.com/

What it does:

- AI tennis analysis and coaching.
- Detects body movement, swing curve, timing, ball impact point, and compares swing attributes to professional players.

Strengths:

- Strong coaching and biomechanics positioning.
- Focuses on movement, timing, impact, and comparison.

Limitations / opportunity for us:

- More of an analysis product than a live interactive game/trainer.
- Does not emphasize smartphone-as-controller interaction.

What we can do differently:

- Use low-latency smartphone sensor data as the primary input.
- Give immediate arcade-style feedback during practice, not only post-analysis.

### 4. PlaySight Tennis SmartCourt

Link: https://playsight.com/our-sports/tennis/

What it does:

- AI SmartCourt platform for tennis.
- Multi-angle video, broadcast, replay, coaching tools, automated highlights, and match analytics.

Strengths:

- Professional-grade court analysis.
- Multi-angle and club/team oriented.
- Strong live replay and coaching infrastructure.

Limitations / opportunity for us:

- Requires court hardware/camera setup.
- Not accessible as a simple home/student browser demo.
- More expensive and infrastructure-heavy.

What we can do differently:

- No special court hardware.
- Run on a laptop and phone.
- Focus on a lightweight educational POC that proves core feasibility.

### 5. Tennis Swing Analyser

Link: https://play.google.com/store/apps/details?id=org.freepoc.tennisswinganalyser

What it does:

- Uses Wear OS watch sensors to recognize tennis shots.
- Shows swing speed, swing time, wrist rotation, arm rotation, and wrist elevation.
- Can display results in real time on a phone used by a partner or coach.
- Can record practice sessions and export data.

Strengths:

- Very relevant sensor-based competitor.
- Uses wearable motion data instead of only video.
- Includes swing classification and swing metrics.

Limitations / opportunity for us:

- Requires a Wear OS watch.
- Focuses on data analysis, not a 3D training arena.
- Less visually impressive for a classroom demo.

What we can do differently:

- Use a normal smartphone, no watch required.
- Make the sensor feedback visible in a 3D tennis scene.
- Add predictive hit logic and visual impact effects.

### 6. TennisKeeper: Swings & Scores

Link: https://apps.apple.com/ru/app/tenniskeeper-swings-scores/id1097388824

What it does:

- Tracks tennis activities, scores, swing path, counts, steps, distance, and heart rate.
- With Apple Watch subscription, includes 3D swing view, speed by stroke type, impact time, swing path analysis, calibration, and AR replay.

Strengths:

- Combines scoring, tracking, Apple Watch, health data, and swing analysis.
- Includes 3D swing concepts and calibration.

Limitations / opportunity for us:

- Apple Watch focused.
- Some user feedback mentions swing detection accuracy problems.
- More tracking/dashboard oriented than realtime browser training.

What we can do differently:

- Build a web-first prototype.
- Make calibration and confidence visible.
- Prioritize real-time response and presentation-friendly visuals.

## Market Pattern Found

Most existing solutions fall into one of three categories:

1. Camera/video AI analysis, such as SwingVision and Tennis AI.
2. Smart court systems, such as PlaySight.
3. Wearable/racket sensor analysis, such as Tennis Swing Analyser and TennisKeeper.

Our project combines parts of these categories but stays simpler and more demonstrable:

- Smartphone sensor input.
- Browser-based 3D visualization.
- Realtime coaching feedback.
- Predictive hit logic.
- Arcade-style feedback that makes the analytics understandable.

## Things We Want To Add / Do Better / Do Differently

- Use a normal smartphone as the sensor, without requiring Apple Watch, Wear OS, racket sensors, or smart court hardware.
- Provide immediate visual feedback in a browser-based 3D arena.
- Show analytics live, not only after the session.
- Make the system transparent for a university demo: raw sensor values, connection status, and live stats are visible.
- Use predictive hit logic to compensate for latency instead of relying only on exact physical collision.
- Add a clear "wow factor": ball squish animation proportional to hit strength.
- Add coaching labels such as "Perfect Forehand", "Late Hit", and "Fast Swing".
- Track session stats: hits, misses, accuracy, swing speed, forehand/backhand count, and improvement.
- Keep the POC achievable in one week.

## Proposed POC For Exercise 3

### POC Goal

Prove that the smartphone can control a desktop 3D scene and generate a live coaching stat.

### POC Features

- Node.js Socket.io server.
- Mobile web controller that reads accelerometer and orientation data.
- Phone screen shows raw sensor values.
- Desktop React/Three.js page.
- A cube or racket-like object rotates according to the phone orientation.
- Basic ball/wall physics if time allows.
- Live stat overlay showing motion power or estimated swing speed.

### POC Video

The 2-minute video should show:

- The project idea in one sentence.
- Phone screen with live sensor data.
- Desktop 3D scene.
- Phone movement controlling the cube/racket.
- Live stat changing based on motion.
- Explanation that this proves the feasibility of the final smart trainer.

## Suggested 2-Minute Video Script

Hi, this is MatchPoint AI, a smart tennis motion trainer that uses a regular smartphone as a motion sensor.

The problem is that tennis coaching is expensive, and most analysis tools either need a camera setup, a smartwatch, or special court hardware. Our idea is to use sensors that already exist inside the phone to create realtime coaching feedback.

In this proof of concept, the phone reads accelerometer and gyroscope data and sends it through Socket.io to the computer. On the computer, a Three.js scene receives the data and maps the phone orientation to a 3D object. The overlay also shows a live motion stat calculated from the phone data.

This proves the most important technical part of the final project: low-latency motion capture from phone to browser. In the final version, this will become a smart tennis training arena with swing classification, swing speed estimation, early/perfect/late timing feedback, predictive hit detection, and ball deformation on impact.

The wow factor is that the system will not only show the movement, but also coach the player in real time.

## Spreadsheet Row Draft

Project name:

MatchPoint AI: Smart Motion Trainer

Short description:

AI-powered tennis motion trainer using a smartphone as a realtime motion controller. The desktop browser visualizes the motion in a 3D tennis arena and calculates coaching stats such as swing power, forehand/backhand guess, and timing feedback.

Competition:

SwingVision, Tennis AI 2.0, SevenSix Tennis, PlaySight SmartCourt, Tennis Swing Analyser, TennisKeeper.

What is different:

Uses a normal smartphone as a live motion sensor and controller, runs in the browser, provides realtime 3D visual feedback, and focuses on predictive coaching feedback rather than only post-session video analysis or expensive court hardware.

POC:

Phone reads accelerometer/gyroscope data and sends it with Socket.io to a desktop React/Three.js page. Desktop object rotates with the phone and displays one live motion stat.

Wow factor:

Realtime phone-controlled 3D tennis trainer with predictive hit detection, ball squish animation, and neon coaching labels such as "Perfect Forehand" and "Late Hit".

