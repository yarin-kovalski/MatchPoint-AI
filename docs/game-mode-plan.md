# Target Game mode

Target Game is the competitive layer over the completed smart trainer. It keeps the same forgiving contact logic and all sensor-driven speed, spin, racket-face, arc, timing, follow-through, and session-report measurements.

## Implemented behavior

- Three targets are visible on the opponent court at a time.
- The complete target radius stays inside the singles court; targets never extend into the doubles alley or beyond a baseline.
- The layout changes every 10 seconds, even when no shot is played.
- Points use the observed physical first bounce, never a predicted or assisted destination.
- A shot must first be ruled `IN` before it can score.
- Smaller targets and difficult short/deep corner locations award more points.
- A center hit earns the displayed value; an edge hit earns 70–100% according to precision.
- Court Vision shows the active targets and the latest physical bounce together.
- Play stays focused on the court without a separate challenge panel or live score counter.
- Game score, target hits, hit rate, and best target streak appear in the completed session report and downloaded report only.
- Switching back to Training hides targets and restores the normal Court Vision state.

## Target layouts

Three regulation-safe layouts rotate. Larger professional court-level targets use distinct cyan, lime, and gold difficulty colors, concentric precision rings, tick marks, and an integrated point medallion. Easy targets award 20–30 points, medium targets about 50 points, and hard targets at demanding short or deep locations award 60–100 points.

The game does not steer the ball toward a target or alter its trajectory. Phone motion continues to determine speed, direction, spin, slice, racket-face launch, and follow-through depth.

## Verification

Automated tests prove that every target and its full radius remains inside the opponent singles court, out balls cannot score, a bounce outside all targets cannot score, and a hard small target pays more than an easy large target.
