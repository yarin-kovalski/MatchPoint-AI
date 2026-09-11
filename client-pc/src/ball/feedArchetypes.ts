import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import { FeedVariationResult, SAFE_CONTACT_ENVELOPE, validatedForehandBase, validatedBackhandBase, validateVariation } from "./feedVariation.js";
import { solveTrajectoryProfile, synchronizeProfileApexFromTiming } from "./trajectoryCalibration.js";
import { sampleSpinFlight, solveSpinFlight } from "./spinFlight.js";

export const FEED_ARCHETYPES = {
  neutral: { label: "Neutral", speed: 7.4, height: 1.9, bounceDepth: 1.8, timeMs: 0, spin: 0 },
  deep: { label: "Deep", speed: 8.3, height: 2.2, bounceDepth: 2.4, timeMs: -15, spin: 5 },
  looping: { label: "Looping", speed: 5.5, height: 3.0, bounceDepth: 1.3, timeMs: 30, spin: 8 },
  fastFlat: { label: "Fast Flat", speed: 10.0, height: 1.8, bounceDepth: 2.0, timeMs: -30, spin: 0 },
  heavyTopspin: { label: "Heavy Topspin", speed: 8.4, height: 2.5, bounceDepth: 1.9, timeMs: 10, spin: 22 },
  softHigh: { label: "Soft High", speed: 4.8, height: 3.2, bounceDepth: 1.6, timeMs: 40, spin: 3 }
} as const;
export type FeedArchetype = keyof typeof FEED_ARCHETYPES;
export type PremiumFeed = { variation: FeedVariationResult; spin: THREE.Vector3; launchVelocity: THREE.Vector3; label: string };

/** Optional flight shapes; preserve contact anchors and never edit stored profiles. */
export function createArchetypeFeed(base: FeedVariationResult, kind: FeedArchetype): PremiumFeed {
  const spec = FEED_ARCHETYPES[kind];
  const profile = structuredClone(base.profile);
  profile.launchPointWorld = [profile.bouncePointWorld[0] * 0.7, spec.height, -9.2];
  profile.bouncePointWorld[2] += spec.bounceDepth;
  const anchor = base.baseProfile === "forehand" ? validatedForehandBase : validatedBackhandBase;
  profile.bounceToContactMs = THREE.MathUtils.clamp(profile.bounceToContactMs + spec.timeMs,
    anchor.bounceToContactMs - SAFE_CONTACT_ENVELOPE.safeTimingRangeMs,
    anchor.bounceToContactMs + SAFE_CONTACT_ENVELOPE.safeTimingRangeMs);
  profile.overallSpeed = spec.speed;
  synchronizeProfileApexFromTiming(profile);
  // Validate relative to the caller's anchor, so user profiles are never written.
  const errors = validateVariation(profile, anchor);
  const solved = solveTrajectoryProfile(profile);
  const spin = new THREE.Vector3(spec.spin, 0, 0); // +X dips a feed traveling +Z.
  const start = new THREE.Vector3().fromArray(profile.launchPointWorld);
  const bounce = new THREE.Vector3().fromArray(profile.bouncePointWorld);
  const velocity = solveSpinFlight(start, bounce, solved.launchToBounceSeconds, spin);
  let netClearance = Infinity, crossedNet = false;
  let previous = start;
  for (let t = BALL_CONFIG.physicsStepSeconds; t <= solved.launchToBounceSeconds + 1e-8; t += BALL_CONFIG.physicsStepSeconds) {
    const point = sampleSpinFlight(start, velocity, Math.min(t, solved.launchToBounceSeconds), spin);
    if (previous.z <= BALL_CONFIG.launch.netDepth && point.z >= BALL_CONFIG.launch.netDepth) {
      const f = (BALL_CONFIG.launch.netDepth - previous.z) / (point.z - previous.z);
      netClearance = THREE.MathUtils.lerp(previous.y, point.y, f) - BALL_CONFIG.launch.netHeight - BALL_CONFIG.scale.physicalRadiusMeters;
      crossedNet = true;
    }
    previous = point;
  }
  if (!crossedNet || netClearance < 0.08) errors.push("PREMIUM_FEED_NET_CLEARANCE");
  if (!velocity.toArray().every(Number.isFinite)) errors.push("PREMIUM_FEED_NON_FINITE");
  if (errors.length) {
    return { variation: { ...base, fallback: true, validationErrors: errors }, spin: new THREE.Vector3(),
      launchVelocity: solveTrajectoryProfile(base.profile).preBounceVelocity, label: "Validated" };
  }
  return { variation: { ...base, profile }, spin, launchVelocity: velocity, label: spec.label };
}
