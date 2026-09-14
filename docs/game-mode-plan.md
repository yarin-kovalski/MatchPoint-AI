# Game mode plan

Game is a named future mode. It is visible in the mode selector so the product direction is clear, but selecting it returns to Training until the Phase 1 proof-of-concept gate is complete and recorded.

## Planned gameplay

- Place visible targets at short, middle, and deep court positions.
- Score the first bounce by distance from the active target.
- Award more points for smaller target error while still requiring the ball to be IN.
- Keep speed, spin, shot shape, timing, and contact quality as separate measurements.
- Show a per-shot rank and a session rank.
- Track streaks and improvement without changing the underlying sensor-driven trajectory.

## Proposed rank rules

| Rank | Target distance | Rally requirement |
| --- | ---: | --- |
| S | up to 0.50 m | IN, valid forward swing |
| A | up to 1.00 m | IN, valid forward swing |
| B | up to 1.75 m | IN |
| C | up to 2.75 m | IN |
| No rank | farther, net, short, wide, or long | shot result remains visible |

The final thresholds should be tuned from real Training sessions before Game implementation. Targets must score the observed first-bounce point, never a predicted or assisted destination.

## Phase gate

Do not implement targets, points, ranks, streaks, or session competition until the user confirms Training works with real forehand and backhand phone swings and records the Phase 1 POC video.
