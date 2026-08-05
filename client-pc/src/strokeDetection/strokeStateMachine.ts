import * as THREE from "three";
import { NormalizedSensorFrame } from "../motion/sensorNormalization.js";
import { STROKE_CONFIG } from "./strokeConfig.js";
import { createStrokeProfiles } from "./strokeProfiles.js";
import {
  calculateStrokeScores,
  getRacketFaceSuitability
} from "./strokeScoring.js";
import {
  BackhandStyle,
  EstimatedRacketContact,
  Handedness,
  StrokeDetectorSnapshot,
  StrokeProfile,
  StrokeScores,
  StrokeState,
  StrokeType
} from "./strokeTypes.js";

const EMPTY_SCORES: StrokeScores = {
  forehandCandidateScore: 0,
  backhandCandidateScore: 0,
  classificationMargin: 0,
  preparationScore: 0,
  reversalScore: 0,
  forwardSwingScore: 0,
  followThroughScore: 0,
  contactScore: 0,
  lowToHighScore: 0,
  highToLowScore: 0,
  topspinScore: 0,
  sliceScore: 0,
  spinType: "flat"
};

export class StrokeStateMachine {
  private currentState: StrokeState = "READY";
  private previousState: StrokeState = "READY";
  private stateEnteredAt = 0;
  private swingStartedAt = 0;
  private contactDetectedAt = 0;
  private lastCompletedSwingAt = Number.NEGATIVE_INFINITY;
  private readyStableSince: number | null = null;
  private recoveryStableSince: number | null = null;
  private classificationEvidenceSince: number | null = null;
  private lockedStrokeType: StrokeType = "unknown";
  private lockedProfile: StrokeProfile | null = null;
  private swingId: string | null = null;
  private swingSequence = 0;
  private contactSequence = 0;
  private contactEmitted = false;
  private confidence = 0;
  private rejectionReason = "";
  private preparationPeak = 0;
  private peakAngularVelocity = 0;
  private peakAcceleration = 0;
  private peakJerk = 0;
  private preparationDuration = 0;
  private scores: StrokeScores = { ...EMPTY_SCORES };
  private lastCompletedStroke = "none";
  private lastContactTimestamp: number | null = null;
  private readonly transitions: string[] = ["READY"];

  constructor(
    private handedness: Handedness = "right",
    private backhandStyle: BackhandStyle = "one-handed",
    private readonly onContact?: (event: EstimatedRacketContact) => void
  ) {}

  process(
    frame: NormalizedSensorFrame,
    racketPosition = new THREE.Vector3()
  ): EstimatedRacketContact | null {
    if (this.stateEnteredAt === 0) {
      this.stateEnteredAt = frame.timestamp;
    }

    const profiles = createStrokeProfiles(this.handedness, this.backhandStyle);
    this.scores = calculateStrokeScores(
      frame,
      profiles.forehand,
      profiles.backhand,
      this.preparationPeak
    );

    if (!frame.valid) {
      this.rejectionReason = frame.rejectionReason || "invalid sensor frame";
      if (this.currentState !== "READY") {
        this.rejectAndReset(frame.timestamp, this.rejectionReason);
      }
      return null;
    }

    this.trackPeaks(frame);

    switch (this.currentState) {
      case "READY":
        this.processReady(frame);
        break;
      case "PREPARATION":
        this.processPreparation(frame, profiles.forehand, profiles.backhand);
        break;
      case "BACKSWING":
        this.processBackswing(frame);
        break;
      case "RACKET_DROP":
        this.processRacketDrop(frame);
        break;
      case "FORWARD_SWING":
        return this.processForwardSwing(frame, racketPosition);
      case "CONTACT_WINDOW":
        if (this.stateDuration(frame.timestamp) >= STROKE_CONFIG.timing.contactWindowMs) {
          this.transition("FOLLOW_THROUGH", frame.timestamp);
        }
        break;
      case "FOLLOW_THROUGH":
        this.processFollowThrough(frame);
        break;
      case "RECOVERY":
        this.processRecovery(frame);
        break;
    }

    return null;
  }

  setHandedness(value: Handedness): void {
    if (value !== this.handedness) {
      this.handedness = value;
      this.rejectAndReset(Date.now(), "handedness changed");
    }
  }

  setBackhandStyle(value: BackhandStyle): void {
    if (value !== this.backhandStyle) {
      this.backhandStyle = value;
      this.rejectAndReset(Date.now(), "backhand style changed");
    }
  }

  reset(timestamp = 0, reason = "manual reset"): void {
    this.rejectionReason = reason;
    this.resetSwing(timestamp);
  }

  getSnapshot(timestamp: number): StrokeDetectorSnapshot {
    return {
      currentState: this.currentState,
      previousState: this.previousState,
      stateEnteredAt: this.stateEnteredAt,
      stateDuration: this.stateDuration(timestamp),
      swingId: this.swingId,
      lockedStrokeType: this.lockedStrokeType,
      confidence: this.confidence,
      rejectionReason: this.rejectionReason,
      scores: { ...this.scores },
      peakAngularVelocity: this.peakAngularVelocity,
      peakAcceleration: this.peakAcceleration,
      peakJerk: this.peakJerk,
      preparationDuration: this.preparationDuration,
      lastCompletedStroke: this.lastCompletedStroke,
      lastContactTimestamp: this.lastContactTimestamp,
      transitions: [...this.transitions]
    };
  }

  getHandedness(): Handedness {
    return this.handedness;
  }

  getBackhandStyle(): BackhandStyle {
    return this.backhandStyle;
  }

  private processReady(frame: NormalizedSensorFrame): void {
    const wasReadyStable =
      this.readyStableSince !== null &&
      frame.timestamp - this.readyStableSince >= STROKE_CONFIG.timing.readyStableMs;
    const nearNeutral = frame.relativePhoneQuaternion.angleTo(new THREE.Quaternion()) < 0.25;
    const lowMotion =
      frame.angularSpeed <= STROKE_CONFIG.noise.readyAngularSpeed &&
      frame.accelerationMagnitude <= STROKE_CONFIG.noise.readyAcceleration;

    if (nearNeutral && lowMotion) {
      this.readyStableSince ??= frame.timestamp;
    } else {
      this.readyStableSince = null;
    }

    const candidateScore = Math.max(
      this.scores.forehandCandidateScore,
      this.scores.backhandCandidateScore
    );
    const cooldownComplete =
      frame.timestamp - this.lastCompletedSwingAt >= STROKE_CONFIG.timing.strokeCooldownMs;
    const deliberateMotion =
      frame.angularSpeed >= STROKE_CONFIG.noise.preparationAngularSpeed &&
      frame.accelerationMagnitude <= STROKE_CONFIG.noise.maximumStartAcceleration &&
      frame.relativePhoneQuaternion.angleTo(new THREE.Quaternion()) >=
        STROKE_CONFIG.noise.minimumOrientationAngle;

    if (wasReadyStable && cooldownComplete && deliberateMotion && candidateScore >= 0.34) {
      this.startSwing(frame.timestamp);
      this.transition("PREPARATION", frame.timestamp);
    }
  }

  private processPreparation(
    frame: NormalizedSensorFrame,
    forehandProfile: StrokeProfile,
    backhandProfile: StrokeProfile
  ): void {
    this.preparationPeak = Math.max(this.preparationPeak, this.scores.preparationScore);
    const forehandWins =
      this.scores.forehandCandidateScore > this.scores.backhandCandidateScore;
    const winnerScore = forehandWins
      ? this.scores.forehandCandidateScore
      : this.scores.backhandCandidateScore;
    const winningProfile = forehandWins ? forehandProfile : backhandProfile;
    const classificationStrong =
      winnerScore >= Math.max(
        STROKE_CONFIG.classification.lockThreshold,
        winningProfile.minimumPreparationScore
      ) &&
      this.scores.classificationMargin >= STROKE_CONFIG.classification.lockMargin;

    if (classificationStrong) {
      this.classificationEvidenceSince ??= frame.timestamp;
    } else {
      this.classificationEvidenceSince = null;
    }

    if (
      this.classificationEvidenceSince !== null &&
      frame.timestamp - this.classificationEvidenceSince >=
        STROKE_CONFIG.timing.classificationEvidenceMs
    ) {
      this.lockedProfile = winningProfile;
      this.lockedStrokeType = winningProfile.strokeType;
      this.confidence = winnerScore;
      this.preparationDuration = frame.timestamp - this.swingStartedAt;
      this.transition("BACKSWING", frame.timestamp);
      return;
    }

    if (this.stateDuration(frame.timestamp) > STROKE_CONFIG.timing.preparationMaximumMs) {
      this.rejectAndReset(frame.timestamp, "ambiguous preparation side");
    }
  }

  private processBackswing(frame: NormalizedSensorFrame): void {
    const profile = this.lockedProfile;
    if (!profile) {
      this.rejectAndReset(frame.timestamp, "stroke type was not locked");
      return;
    }

    const duration = this.stateDuration(frame.timestamp);
    const validReversal =
      duration >= profile.backswingMinimumMs &&
      this.scores.reversalScore >= profile.minimumReversalStrength &&
      this.scores.forwardSwingScore >= profile.minimumForwardIntensity;

    if (validReversal) {
      if (profile.allowsRacketDrop && frame.motionUpwardScore < -0.16) {
        this.transition("RACKET_DROP", frame.timestamp);
      } else {
        this.transition("FORWARD_SWING", frame.timestamp);
      }
      return;
    }

    if (duration > STROKE_CONFIG.timing.backswingMaximumMs) {
      this.rejectAndReset(frame.timestamp, "no clear direction reversal");
    }
  }

  private processRacketDrop(frame: NormalizedSensorFrame): void {
    if (this.scores.forwardSwingScore >= (this.lockedProfile?.minimumForwardIntensity ?? 1)) {
      this.transition("FORWARD_SWING", frame.timestamp);
      return;
    }
    if (this.stateDuration(frame.timestamp) > 220) {
      this.rejectAndReset(frame.timestamp, "forward motion too weak after racket drop");
    }
  }

  private processForwardSwing(
    frame: NormalizedSensorFrame,
    racketPosition: THREE.Vector3
  ): EstimatedRacketContact | null {
    const profile = this.lockedProfile;
    if (!profile || this.contactEmitted) {
      return null;
    }

    const elapsedSwing = frame.timestamp - this.swingStartedAt;
    const [earliestContact, latestContact] = profile.contactTimingMs;
    const faceSuitability = getRacketFaceSuitability(frame, profile);
    const contactValid =
      elapsedSwing >= earliestContact &&
      elapsedSwing <= latestContact &&
      frame.angularSpeed >= STROKE_CONFIG.contact.minimumAngularSpeed &&
      frame.accelerationMagnitude >= STROKE_CONFIG.contact.minimumAcceleration &&
      this.scores.contactScore >= STROKE_CONFIG.contact.minimumScore &&
      faceSuitability > 0;

    if (contactValid) {
      const event = this.createContactEvent(frame, racketPosition);
      this.contactEmitted = true;
      this.contactDetectedAt = frame.timestamp;
      this.lastContactTimestamp = frame.timestamp;
      this.confidence = Math.min(1, (this.confidence + this.scores.contactScore) * 0.5);
      this.transition("CONTACT_WINDOW", frame.timestamp);
      this.onContact?.(event);
      return event;
    }

    if (this.stateDuration(frame.timestamp) > STROKE_CONFIG.timing.forwardSwingMaximumMs) {
      this.rejectAndReset(frame.timestamp, "contact criteria not reached");
    }
    return null;
  }

  private processFollowThrough(frame: NormalizedSensorFrame): void {
    const minimum = this.lockedProfile?.followThroughMinimumMs ?? 100;
    const duration = this.stateDuration(frame.timestamp);
    if (duration >= minimum && this.scores.followThroughScore >= 0.28) {
      this.transition("RECOVERY", frame.timestamp);
      return;
    }
    if (duration > STROKE_CONFIG.timing.followThroughMaximumMs) {
      this.transition("RECOVERY", frame.timestamp);
    }
  }

  private processRecovery(frame: NormalizedSensorFrame): void {
    const stable =
      frame.relativePhoneQuaternion.angleTo(new THREE.Quaternion()) < 0.3 &&
      frame.angularSpeed < 0.65 &&
      frame.accelerationMagnitude < 2;
    if (stable) {
      this.recoveryStableSince ??= frame.timestamp;
    } else {
      this.recoveryStableSince = null;
    }

    if (
      this.recoveryStableSince !== null &&
      frame.timestamp - this.recoveryStableSince >= STROKE_CONFIG.timing.recoveryStableMs
    ) {
      this.lastCompletedStroke = this.lockedProfile?.id ?? "unknown";
      this.lastCompletedSwingAt = frame.timestamp;
      this.resetSwing(frame.timestamp);
      return;
    }
    if (this.stateDuration(frame.timestamp) > STROKE_CONFIG.timing.recoveryMaximumMs) {
      this.rejectAndReset(frame.timestamp, "recovery timeout");
    }
  }

  private createContactEvent(
    frame: NormalizedSensorFrame,
    racketPosition: THREE.Vector3
  ): EstimatedRacketContact {
    const profile = this.lockedProfile;
    if (!profile || !this.swingId) {
      throw new Error("Cannot create contact without a locked stroke");
    }
    this.contactSequence += 1;
    return {
      id: `contact-${this.contactSequence}`,
      swingId: this.swingId,
      timestamp: frame.timestamp,
      strokeType: profile.strokeType,
      handedness: this.handedness,
      backhandStyle: this.backhandStyle,
      confidence: Math.min(1, (this.confidence + this.scores.contactScore) * 0.5),
      estimatedSpeed: frame.angularSpeed * 3.2,
      forwardScore: frame.motionForwardScore,
      upwardScore: frame.motionUpwardScore,
      sidewaysScore: frame.motionSidewaysScore,
      racketFaceAngle: frame.racketFaceAngleToCourtRadians,
      racketQuaternion: frame.mappedRacketQuaternion.clone(),
      racketPosition: racketPosition.clone(),
      racketForwardVector: frame.racketForwardVector.clone(),
      racketUpVector: frame.racketUpVector.clone(),
      racketSideVector: frame.racketSideVector.clone(),
      racketFaceNormal: frame.racketFaceNormal.clone(),
      peakAngularVelocity: this.peakAngularVelocity,
      peakAcceleration: this.peakAcceleration,
      peakJerk: this.peakJerk,
      preparationDuration: this.preparationDuration,
      forwardSwingDuration: frame.timestamp - this.stateEnteredAt,
      lowToHighScore: this.scores.lowToHighScore,
      highToLowScore: this.scores.highToLowScore,
      topspinScore: this.scores.topspinScore,
      sliceScore: this.scores.sliceScore,
      spinType: this.scores.spinType
    };
  }

  private trackPeaks(frame: NormalizedSensorFrame): void {
    if (this.currentState === "READY") {
      return;
    }
    this.peakAngularVelocity = Math.max(this.peakAngularVelocity, frame.angularSpeed);
    this.peakAcceleration = Math.max(this.peakAcceleration, frame.accelerationMagnitude);
    this.peakJerk = Math.max(this.peakJerk, frame.jerk);
  }

  private startSwing(timestamp: number): void {
    this.swingSequence += 1;
    this.swingId = `swing-${this.swingSequence}`;
    this.swingStartedAt = timestamp;
    this.contactEmitted = false;
    this.rejectionReason = "";
    this.preparationPeak = 0;
    this.peakAngularVelocity = 0;
    this.peakAcceleration = 0;
    this.peakJerk = 0;
  }

  private rejectAndReset(timestamp: number, reason: string): void {
    this.rejectionReason = reason;
    this.lastCompletedStroke = "REJECTED";
    this.transitions.push(`REJECTED: ${reason}`);
    this.trimTransitions();
    this.lastCompletedSwingAt = timestamp;
    this.resetSwing(timestamp, true);
  }

  private resetSwing(timestamp: number, preserveReason = false): void {
    this.previousState = this.currentState;
    this.currentState = "READY";
    this.stateEnteredAt = timestamp;
    this.lockedStrokeType = "unknown";
    this.lockedProfile = null;
    this.swingId = null;
    this.contactEmitted = false;
    this.classificationEvidenceSince = null;
    this.recoveryStableSince = null;
    this.readyStableSince = null;
    this.confidence = 0;
    this.preparationPeak = 0;
    if (!preserveReason) {
      this.rejectionReason = "";
    }
    this.transitions.push("READY");
    this.trimTransitions();
  }

  private transition(next: StrokeState, timestamp: number): void {
    this.previousState = this.currentState;
    this.currentState = next;
    this.stateEnteredAt = timestamp;
    this.transitions.push(next);
    this.trimTransitions();
  }

  private stateDuration(timestamp: number): number {
    return Math.max(0, timestamp - this.stateEnteredAt);
  }

  private trimTransitions(): void {
    if (this.transitions.length > 12) {
      this.transitions.splice(0, this.transitions.length - 12);
    }
  }
}
