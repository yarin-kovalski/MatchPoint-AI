import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  canLaunchPracticeFeed, FEED_VARIATION_RANGES, generateSafeFeedVariation, MAX_VARIATION_RETRIES,
  SAFE_CONTACT_ENVELOPE, validateVariation, validatedBackhandBase, validatedForehandBase
} from "../client-pc/src/ball/feedVariation.js";
import { solveTrajectoryProfile, worldToPlayerLocal } from "../client-pc/src/ball/trajectoryCalibration.js";

test("variation Off returns exact immutable validated bases", () => {
  assert.deepEqual(generateSafeFeedVariation("forehand", "off", 1).profile, validatedForehandBase);
  assert.deepEqual(generateSafeFeedVariation("backhand", "off", 1).profile, validatedBackhandBase);
  assert.equal(Object.isFrozen(validatedForehandBase), true);
});

test("practice relaunch waits for recovery and never overlaps an active ball", () => {
  assert.equal(canLaunchPracticeFeed(2000, 1900, true), false);
  assert.equal(canLaunchPracticeFeed(1800, 1900, false), false);
  assert.equal(canLaunchPracticeFeed(2000, 1900, false), true);
});

test("seeded Low and Medium feeds are reproducible, physical, and inside envelopes", () => {
  for (const level of ["low", "medium"] as const) {
    for (const strokeType of ["forehand", "backhand"] as const) {
      for (let seed = 1; seed <= 80; seed += 1) {
        const first = generateSafeFeedVariation(strokeType, level, seed);
        const second = generateSafeFeedVariation(strokeType, level, seed);
        assert.deepEqual(first, second);
        assert.equal(first.valid, true);
        assert.equal(first.fallback, false);
        assert.equal(solveTrajectoryProfile(first.profile).valid, true);
        const base = strokeType === "forehand" ? validatedForehandBase : validatedBackhandBase;
        const delta = new THREE.Vector3().fromArray(first.profile.contactPointWorld).sub(new THREE.Vector3().fromArray(base.contactPointWorld));
        assert.ok(Math.abs(delta.x) <= SAFE_CONTACT_ENVELOPE.safeLateralRange);
        assert.ok(Math.abs(delta.y) <= SAFE_CONTACT_ENVELOPE.safeVerticalRange);
        assert.ok(Math.abs(delta.z) <= SAFE_CONTACT_ENVELOPE.safeDepthRange);
        const local = worldToPlayerLocal(new THREE.Vector3().fromArray(first.profile.contactPointWorld), first.profile.playerBasisAtCalibration);
        assert.equal(strokeType === "forehand" ? local.x > 0.25 : local.x < -0.25, true);
      }
    }
  }
});

test("configured Low ranges are narrower than Medium and magnet limits", () => {
  assert.ok(FEED_VARIATION_RANGES.low.contactLateral < FEED_VARIATION_RANGES.medium.contactLateral);
  assert.ok(FEED_VARIATION_RANGES.medium.contactLateral < SAFE_CONTACT_ENVELOPE.maxMagnetCorrection.lateral);
  assert.ok(FEED_VARIATION_RANGES.medium.contactHeight < SAFE_CONTACT_ENVELOPE.maxMagnetCorrection.vertical);
  assert.ok(FEED_VARIATION_RANGES.medium.contactDepth < SAFE_CONTACT_ENVELOPE.maxMagnetCorrection.depth);
});

test("invalid candidates are rejected and retry exhaustion uses validated base", () => {
  const invalid = structuredClone(validatedForehandBase);
  invalid.contactPointWorld[0] = -1;
  assert.ok(validateVariation(invalid, validatedForehandBase).length > 0);
  const fallback = generateSafeFeedVariation("forehand", "medium", 4, () => Number.NaN);
  assert.equal(fallback.fallback, true);
  assert.equal(fallback.retryCount, MAX_VARIATION_RETRIES);
  assert.deepEqual(fallback.profile, validatedForehandBase);
});
