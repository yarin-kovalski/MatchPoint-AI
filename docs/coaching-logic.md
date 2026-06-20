# Coaching Logic

## Purpose

This project should be judged as a smart motion trainer, not only as a browser tennis game. The trainer analyzes smartphone sensor data and turns it into understandable feedback for the player.

## Phase 1 Minimum Analytics

Phase 1 must show at least one real-time stat on the PC overlay.

Recommended first stat:

```text
Current Speed / Peak Motion
```

This can be estimated from acceleration magnitude:

```text
accelMagnitude = sqrt(x*x + y*y + z*z)
```

For the MVP, this can be presented as an approximate "motion power" value if a true physical velocity estimate is too noisy.

Alternative first stat:

```text
Forehand / Backhand Guess
```

This can be estimated from the direction of orientation change during a movement burst.

## Swing Detection

A swing event begins when smoothed acceleration magnitude rises above a threshold.

Suggested first version:

```text
if accelMagnitude > swingStartThreshold:
  start swing window
```

Within the swing window, track:

- Peak acceleration.
- Orientation at start.
- Orientation at peak.
- Orientation at end.
- Timestamp of peak motion.

## Forehand vs. Backhand Classification

Start with a robust decision tree before attempting a trained model.

Inputs:

- Change in `beta`.
- Change in `gamma`.
- Sign and magnitude of lateral acceleration.
- Phone orientation at peak acceleration.

Initial output:

```text
Forehand, Backhand, or Unknown
```

The UI should show low confidence honestly instead of pretending the model is perfect.

## Swing Speed Estimation

Raw phone acceleration is noisy, so exact speed is difficult.

Phase 1 can show:

```text
Motion Power
```

Phase 3 can improve this into:

```text
Estimated Swing Speed
```

Methods:

- Smooth acceleration with EMA.
- Track acceleration magnitude over the swing window.
- Integrate acceleration over a short time window cautiously.
- Clamp unrealistic values.
- Present the output as an estimate.

## Timing Detection

Timing is based on the relationship between the swing peak and ball arrival in the hit zone.

Suggested labels:

- Early: swing peak happens before the ideal hit window.
- Perfect: swing peak overlaps the ideal hit window.
- Late: swing peak happens after the ideal hit window.

First model:

```text
delta = swingPeakTime - predictedBallHitTime
```

Suggested thresholds:

```text
delta < -80ms  => Early
-80ms..80ms   => Perfect
delta > 80ms  => Late
```

Tune these by feel during testing.

## Predictive Hit Logic

The trainer should not wait only for exact racket-ball mesh collision.

A predictive hit is accepted when:

- A swing is detected.
- Swing confidence is high enough.
- Ball is inside or near the hit zone.
- Predicted ball arrival is within roughly 30ms of visual impact.

This improves responsiveness and makes the demo feel more like a real coaching system.

## Session Stats

Track these in React state during Phase 3:

- Total hits.
- Total misses.
- Accuracy percentage.
- Distance from target center.
- Peak swing speed.
- Forehand count.
- Backhand count.
- Early/perfect/late counts.
- Average accuracy improvement.

## Coaching Advice

Generate simple advice from repeated patterns:

- If many late hits: "Try starting your swing earlier."
- If backhand accuracy is low: "Backhand contact is drifting; aim closer to center."
- If swing speed drops: "Your swing power is fading. Reset and focus on follow-through."
- If accuracy improves: "Accuracy is improving. Keep the same timing."

Keep advice short and visible after rallies or every few hits.
