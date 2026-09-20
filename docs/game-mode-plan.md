# Target Game mode

Target Game is the competitive layer over the completed smart trainer. It keeps the same forgiving contact logic and all sensor-driven speed, spin, racket-face, arc, timing, follow-through, and session-report measurements.

## Implemented behavior

- Three orange-cone clusters are visible on the opponent court at a time. Each cluster uses three full 3D cones in a compact triangle.
- The complete target radius stays inside the singles court; targets never extend into the doubles alley or beyond a baseline.
- Cone clusters remain fixed until the ball hits them. The cones then fall in different directions and that cluster alone moves to a new valid location.
- Points use the observed physical first bounce, never a predicted or assisted destination.
- A shot must first be ruled `IN` before it can score.
- Smaller targets and difficult short/deep corner locations award more points.
- A center hit earns the displayed value; an edge hit earns 70–100% according to precision.
- Court Vision shows the active targets and the latest physical bounce together.
- Play stays focused on the court without a separate challenge panel or live score counter.
- Game score, target hits, hit rate, and best target streak appear in the completed session report and downloaded report only.
- Switching back to Training hides targets and restores the normal Court Vision state.

## Target layouts

The replacement pool uses regulation-safe tactical locations such as the service-line T, deep corners, deep center, service-box corners, and short angles. Glossy orange cone bodies, reflective white bands, weighted bases, contact shadows, and individual fall directions make each cluster readable and physical. Easy clusters award 35 points, medium clusters 40–55 points, and hard short/deep placements 70–80 points.

The game does not steer the ball toward a target or alter its trajectory. Phone motion continues to determine speed, direction, spin, slice, racket-face launch, and follow-through depth.

## Verification

Automated tests prove that every target and its full radius remains inside the opponent singles court, out balls cannot score, a bounce outside all targets cannot score, and a hard small target pays more than an easy large target.
