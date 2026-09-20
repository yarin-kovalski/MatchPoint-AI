import type { ShotTechnique } from "./strokeTechniqueAnalysis.js";

export type TrainingStroke = "forehand" | "backhand";
export type DetectedTrainingStroke = TrainingStroke | "unknown";
export type TrainingTiming = "early" | "on-time" | "late" | "no-contact";
export type TrainingReturnOutcome = "IN" | "NET" | "OUT_WIDE" | "OUT_LONG" | "SHORT" | "OUT";

export function isSuccessfulTrainingReturn(outcome: TrainingReturnOutcome): boolean {
  return outcome === "IN";
}

export type TrainingStrokeEvidenceInput = {
  lockedStrokeType: DetectedTrainingStroke;
  confidence: number;
  forehandCandidateScore: number;
  backhandCandidateScore: number;
  angularSpeed: number;
};

export type TrainingStrokeDetection = {
  strokeType: DetectedTrainingStroke;
  confidence: number;
  source: "feed-side" | "strict-state-machine" | "motion-evidence" | "insufficient-evidence";
};

/**
 * Preserves the strongest sensor-side preparation evidence across the whole feed.
 * This gives Training a useful classification when the strict stroke state machine
 * sees a real swing but cannot complete every preparation/contact transition.
 */
export class TrainingStrokeEvidence {
  private strictDetection: TrainingStrokeDetection | null = null;
  private strongestSignedLead = 0;
  private evidenceSamples = 0;

  observe(input: TrainingStrokeEvidenceInput): void {
    if (input.lockedStrokeType !== "unknown") {
      this.strictDetection = {
        strokeType: input.lockedStrokeType,
        confidence: clamp(input.confidence, 0, 1),
        source: "strict-state-machine"
      };
    }
    if (!Number.isFinite(input.angularSpeed) || input.angularSpeed < 0.35) return;
    const forehand = finiteNonNegative(input.forehandCandidateScore);
    const backhand = finiteNonNegative(input.backhandCandidateScore);
    if (Math.max(forehand, backhand) < 0.12) return;
    const motionWeight = 0.65 + clamp(input.angularSpeed / 7, 0, 1) * 0.35;
    const signedLead = (forehand - backhand) * motionWeight;
    if (Math.abs(signedLead) > Math.abs(this.strongestSignedLead)) this.strongestSignedLead = signedLead;
    this.evidenceSamples += 1;
  }

  resolve(): TrainingStrokeDetection {
    if (this.strictDetection) return { ...this.strictDetection };
    const lead = this.strongestSignedLead;
    if (this.evidenceSamples === 0 || Math.abs(lead) < 0.035) {
      return { strokeType: "unknown", confidence: 0, source: "insufficient-evidence" };
    }
    return {
      strokeType: lead > 0 ? "forehand" : "backhand",
      confidence: clamp(0.5 + Math.abs(lead) * 0.72, 0.5, 0.94),
      source: "motion-evidence"
    };
  }

  reset(): void {
    this.strictDetection = null;
    this.strongestSignedLead = 0;
    this.evidenceSamples = 0;
  }
}

export type TrainingShot = {
  timestamp: number;
  expectedStroke: TrainingStroke;
  detectedStroke: DetectedTrainingStroke;
  hit: boolean;
  swingSpeedKmh: number;
  timingOffsetMs: number | null;
  placementAccuracy: number;
  missReason?: string;
  technique?: ShotTechnique | null;
  returnOutcome?: TrainingReturnOutcome;
  bouncePoint?: { x: number; z: number } | null;
};

export type TrainingSessionSummary = {
  attempts: number;
  hits: number;
  misses: number;
  hitRatio: number;
  forehands: number;
  backhands: number;
  unknownStrokes: number;
  averageSwingSpeedKmh: number;
  peakSwingSpeedKmh: number;
  targetAccuracy: number;
  earlyHits: number;
  onTimeHits: number;
  lateHits: number;
  noContact: number;
  bestStreak: number;
  netMisses: number;
  wideMisses: number;
  longMisses: number;
  shortMisses: number;
  regularShots: number;
  topspinShots: number;
  sliceShots: number;
  dropShots: number;
  heavyTopspinShots: number;
  sideSpinShots: number;
  averageSpinLevel: number;
  averageTopspinLevel: number;
  averageSliceLevel: number;
  averageFaceOpennessLevel: number;
  averageArcLevel: number;
  followThroughCompletion: number;
};

export type TrainingImprovement = {
  hitRatioPoints: number;
  targetAccuracyPoints: number;
  averageSpeedKmh: number;
  spinLevelPoints: number;
  faceOpennessPoints: number;
  followThroughPoints: number;
};

export type GameSessionResult = {
  practiceType?: "Deep shot" | "Regular" | "Short shot" | "Mixed";
  score: number;
  shots: number;
  targetsHit: number;
  targetHitRate: number;
  bestTargetStreak: number;
};

export type TrainingSessionReport = TrainingSessionSummary & {
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  improvement: TrainingImprovement | null;
  feedback: string[];
  shots: TrainingShot[];
  game?: GameSessionResult;
};

export class SmartTrainingSession {
  private readonly shots: TrainingShot[] = [];
  private startedAt: number;

  constructor(startedAt = Date.now()) {
    this.startedAt = startedAt;
  }

  record(shot: TrainingShot): TrainingSessionSummary {
    this.shots.push({
      ...shot,
      swingSpeedKmh: finiteNonNegative(shot.swingSpeedKmh),
      placementAccuracy: clamp(Math.round(finiteNonNegative(shot.placementAccuracy)), 0, 100)
    });
    return this.summary();
  }

  reset(startedAt = Date.now()): void {
    this.shots.length = 0;
    this.startedAt = startedAt;
  }

  summary(): TrainingSessionSummary {
    let hits = 0;
    let forehands = 0;
    let backhands = 0;
    let unknownStrokes = 0;
    let speedTotal = 0;
    let peakSwingSpeedKmh = 0;
    let accuracyTotal = 0;
    let earlyHits = 0;
    let onTimeHits = 0;
    let lateHits = 0;
    let noContact = 0;
    let streak = 0;
    let bestStreak = 0;
    let netMisses = 0;
    let wideMisses = 0;
    let longMisses = 0;
    let shortMisses = 0;
    let regularShots = 0;
    let topspinShots = 0;
    let sliceShots = 0;
    let dropShots = 0;
    let heavyTopspinShots = 0;
    let sideSpinShots = 0;
    let techniqueShots = 0;
    let topspinTechniqueShots = 0;
    let sliceTechniqueShots = 0;
    let spinLevelTotal = 0;
    let topspinLevelTotal = 0;
    let sliceLevelTotal = 0;
    let faceOpennessTotal = 0;
    let arcLevelTotal = 0;
    let completeFinishes = 0;

    for (const shot of this.shots) {
      if (shot.hit) {
        hits += 1;
        streak += 1;
        bestStreak = Math.max(bestStreak, streak);
      } else {
        streak = 0;
      }
      if (shot.detectedStroke === "forehand") forehands += 1;
      else if (shot.detectedStroke === "backhand") backhands += 1;
      else unknownStrokes += 1;
      speedTotal += shot.swingSpeedKmh;
      peakSwingSpeedKmh = Math.max(peakSwingSpeedKmh, shot.swingSpeedKmh);
      accuracyTotal += shot.placementAccuracy;
      const timing = classifyTrainingTiming(shot.timingOffsetMs, shot.missReason);
      if (timing === "early") earlyHits += 1;
      else if (timing === "on-time") onTimeHits += 1;
      else if (timing === "late") lateHits += 1;
      else noContact += 1;
      if (!shot.hit) {
        const reason = shot.missReason?.toUpperCase() ?? "";
        if (reason.includes("NET")) netMisses += 1;
        else if (reason.includes("WIDE")) wideMisses += 1;
        else if (reason.includes("LONG")) longMisses += 1;
        else if (reason.includes("SHORT")) shortMisses += 1;
      }
      if (shot.technique) {
        techniqueShots += 1;
        spinLevelTotal += shot.technique.spinLevel;
        if (shot.technique.shotStyle === "TOPSPIN" || shot.technique.shotStyle === "HEAVY_TOPSPIN") {
          topspinLevelTotal += shot.technique.topspinLevel;
          topspinTechniqueShots += 1;
        }
        if (shot.technique.shotStyle === "SLICE" || shot.technique.shotStyle === "DROP_SHOT") {
          sliceLevelTotal += shot.technique.sliceLevel;
          sliceTechniqueShots += 1;
        }
        if (shot.technique.shotStyle === "REGULAR") regularShots += 1;
        else if (shot.technique.shotStyle === "TOPSPIN") topspinShots += 1;
        else if (shot.technique.shotStyle === "SLICE") sliceShots += 1;
        else if (shot.technique.shotStyle === "DROP_SHOT") dropShots += 1;
        else if (shot.technique.shotStyle === "HEAVY_TOPSPIN") heavyTopspinShots += 1;
        else sideSpinShots += 1;
        faceOpennessTotal += shot.technique.racketFaceOpennessLevel;
        arcLevelTotal += shot.technique.arcLevel;
        if (shot.technique.followThrough.finishedAcrossFarShoulder) completeFinishes += 1;
      }
    }

    const attempts = this.shots.length;
    return {
      attempts,
      hits,
      misses: attempts - hits,
      hitRatio: percentage(hits, attempts),
      forehands,
      backhands,
      unknownStrokes,
      averageSwingSpeedKmh: attempts === 0 ? 0 : round(speedTotal / attempts, 1),
      peakSwingSpeedKmh: round(peakSwingSpeedKmh, 1),
      targetAccuracy: attempts === 0 ? 0 : Math.round(accuracyTotal / attempts),
      earlyHits,
      onTimeHits,
      lateHits,
      noContact,
      bestStreak,
      netMisses,
      wideMisses,
      longMisses,
      shortMisses,
      regularShots,
      topspinShots,
      sliceShots,
      dropShots,
      heavyTopspinShots,
      sideSpinShots,
      averageSpinLevel: average(spinLevelTotal, techniqueShots),
      averageTopspinLevel: average(topspinLevelTotal, topspinTechniqueShots),
      averageSliceLevel: average(sliceLevelTotal, sliceTechniqueShots),
      averageFaceOpennessLevel: roundAverage(faceOpennessTotal, techniqueShots, 1),
      averageArcLevel: roundAverage(arcLevelTotal, techniqueShots, 1),
      followThroughCompletion: percentage(completeFinishes, techniqueShots)
    };
  }

  finish(previous: TrainingSessionReport | null = null, endedAt = Date.now()): TrainingSessionReport {
    const summary = this.summary();
    const improvement = previous ? {
      hitRatioPoints: summary.hitRatio - previous.hitRatio,
      targetAccuracyPoints: summary.targetAccuracy - previous.targetAccuracy,
      averageSpeedKmh: round(summary.averageSwingSpeedKmh - previous.averageSwingSpeedKmh, 1),
      spinLevelPoints: summary.averageSpinLevel - previous.averageSpinLevel,
      faceOpennessPoints: round(summary.averageFaceOpennessLevel - previous.averageFaceOpennessLevel, 1),
      followThroughPoints: summary.followThroughCompletion - previous.followThroughCompletion
    } : null;
    return {
      ...summary,
      startedAt: this.startedAt,
      endedAt,
      durationSeconds: Math.max(0, Math.round((endedAt - this.startedAt) / 1000)),
      improvement,
      feedback: buildTrainingFeedback(summary, improvement),
      shots: this.shots.map(shot => ({ ...shot, technique: shot.technique ? {
        ...shot.technique, followThrough: { ...shot.technique.followThrough }
      } : shot.technique }))
    };
  }
}

/** Training uses a fixed deep-center aim zone; visible point targets belong to Game mode. */
export function calculateTrainingTargetAccuracy(
  bounce: { x: number; z: number } | null,
  netDepth = -5.5
): number {
  if (!bounce || !Number.isFinite(bounce.x) || !Number.isFinite(bounce.z)) return 0;
  const targetX = 0;
  const targetZ = netDepth - 7.7;
  const lateralError = Math.abs(bounce.x - targetX) / 4.115;
  const depthError = Math.abs(bounce.z - targetZ) / 4.25;
  const normalizedDistance = Math.hypot(lateralError, depthError);
  return clamp(Math.round(100 * (1 - normalizedDistance / 1.45)), 0, 100);
}

export function classifyTrainingTiming(offsetMs: number | null, reason = ""): TrainingTiming {
  const normalizedReason = reason.toLowerCase();
  if (normalizedReason.includes("early")) return "early";
  if (normalizedReason.includes("late")) return "late";
  if (offsetMs === null || !Number.isFinite(offsetMs)) return "no-contact";
  if (offsetMs < -70) return "early";
  if (offsetMs > 70) return "late";
  return "on-time";
}

function buildTrainingFeedback(summary: TrainingSessionSummary, improvement: TrainingImprovement | null): string[] {
  if (summary.attempts === 0) return ["Complete a few forehands and backhands to receive coaching feedback."];
  const feedback: string[] = [];
  const classifiedShots = summary.regularShots + summary.topspinShots + summary.sliceShots +
    summary.dropShots + summary.heavyTopspinShots + summary.sideSpinShots;
  if (improvement && improvement.hitRatioPoints > 0) {
    feedback.push(`Hit ratio improved by ${improvement.hitRatioPoints} percentage points from your previous session.`);
  } else if (improvement && improvement.targetAccuracyPoints > 0) {
    feedback.push(`Target accuracy improved by ${improvement.targetAccuracyPoints} percentage points.`);
  }
  if (summary.earlyHits > summary.lateHits && summary.earlyHits >= 2) {
    feedback.push("You are contacting early. Let the ball travel slightly closer before accelerating.");
  } else if (summary.lateHits >= 2) {
    feedback.push("You are contacting late. Start the unit turn earlier and prepare before the bounce.");
  } else if (summary.onTimeHits >= Math.max(2, Math.ceil(summary.attempts * 0.55))) {
    feedback.push("Your contact timing is consistent. Keep the same preparation rhythm.");
  }
  if (summary.netMisses + summary.shortMisses >= 2) {
    feedback.push("Several shots finished in the net or on your side. Add upward racket path and net clearance.");
  } else if (summary.longMisses >= 2) {
    feedback.push("Several shots landed long. Add topspin or reduce the racket-face opening at contact.");
  } else if (summary.wideMisses >= 2) {
    feedback.push("Several shots landed wide. Keep the swing finish moving toward the deep-center zone.");
  }
  if (summary.targetAccuracy < 45) {
    feedback.push("Reduce pace slightly and finish toward the deep-center training zone.");
  } else if (summary.targetAccuracy >= 70) {
    feedback.push("Your depth and direction are controlled. Maintain that finish as speed increases.");
  }
  if (summary.unknownStrokes > Math.ceil(summary.attempts * 0.25)) {
    feedback.push("Make the preparation path clearer so the phone can distinguish forehand from backhand.");
  }
  if (summary.averageFaceOpennessLevel >= 7.5) {
    feedback.push("Your racket face is very open at contact. Bring it closer to square to control launch and depth.");
  } else if (summary.averageFaceOpennessLevel > 0 && summary.averageFaceOpennessLevel <= 3.5) {
    feedback.push("Your racket face is closed at contact. Open it slightly to create safer net clearance.");
  } else if (summary.averageTopspinLevel > 0 && summary.averageFaceOpennessLevel >= 4 && summary.averageFaceOpennessLevel <= 6.5) {
    feedback.push("Your contact face is controlled. Keep it near square while the racket brushes low to high for topspin.");
  }
  if (summary.averageSliceLevel > 0 && summary.averageSliceLevel < 40) {
    feedback.push("For a more controlled slice, keep a clear high-to-low path while driving through the ball.");
  }
  if (classifiedShots > 0 && summary.followThroughCompletion < 55) {
    feedback.push("Complete the finish across the body and over the far shoulder instead of stopping after contact.");
  }
  if (summary.hitRatio < 55) {
    feedback.push("Prioritize clean contact over power for the next session.");
  } else if (summary.hitRatio >= 80) {
    feedback.push("Strong consistency. You are ready for more feed variation.");
  }
  return feedback.slice(0, 3);
}

function percentage(part: number, total: number): number {
  return total === 0 ? 0 : Math.round(part / total * 100);
}

function average(total: number, count: number): number {
  return count === 0 ? 0 : Math.round(total / count);
}

function roundAverage(total: number, count: number, decimals: number): number {
  return count === 0 ? 0 : round(total / count, decimals);
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
