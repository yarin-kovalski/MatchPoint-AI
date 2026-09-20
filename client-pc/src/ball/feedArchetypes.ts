import * as THREE from "three";
import { BALL_CONFIG } from "./ballConfig.js";
import { FeedVariationResult, validatedForehandBase, validatedBackhandBase, validateVariation } from "./feedVariation.js";
import { solveTrajectoryProfile } from "./trajectoryCalibration.js";
import { sampleSpinFlight, solveSpinFlight } from "./spinFlight.js";

export const FEED_ARCHETYPES = {
  neutral: { label: "Neutral", speedScale: 1, spin: 0 },
  fastFlat: { label: "Fast Flat", speedScale: 1.22, spin: 0 },
  heavyTopspin: { label: "Heavy Topspin", speedScale: 1.02, spin: 18 }
} as const;
export type FeedArchetype = keyof typeof FEED_ARCHETYPES;
export type FeedStyle = FeedArchetype | "random";
export type PremiumFeed = { variation: FeedVariationResult; spin: THREE.Vector3; launchVelocity: THREE.Vector3; label: string };

export function resolveFeedStyle(style: FeedStyle, previous: FeedArchetype | null,
  random: () => number = Math.random): FeedArchetype {
  if (style !== "random") return style;
  const choices = (Object.keys(FEED_ARCHETYPES) as FeedArchetype[]).filter(choice => choice !== previous);
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
}

/** Change incoming pace/spin while preserving every bounce, contact, and timing anchor. */
export function createArchetypeFeed(base: FeedVariationResult, kind: FeedArchetype): PremiumFeed {
  const spec = FEED_ARCHETYPES[kind];
  const profile = structuredClone(base.profile);
  profile.overallSpeed *= spec.speedScale;
  const anchor = base.baseProfile === "forehand" ? validatedForehandBase : validatedBackhandBase;
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
  if (crossedNet && netClearance < 0) errors.push("PREMIUM_FEED_NET_CLEARANCE");
  if (!velocity.toArray().every(Number.isFinite)) errors.push("PREMIUM_FEED_NON_FINITE");
  if (errors.length) {
    return { variation: { ...base, fallback: true, validationErrors: errors }, spin: new THREE.Vector3(),
      launchVelocity: solveTrajectoryProfile(base.profile).preBounceVelocity, label: "Validated" };
  }
  return { variation: { ...base, profile }, spin, launchVelocity: velocity, label: spec.label };
}
