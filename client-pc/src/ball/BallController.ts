import * as THREE from "three";
import { EstimatedRacketContact, StrokeDetectorSnapshot } from "../strokeDetection/strokeTypes.js";
import { BALL_CONFIG } from "./ballConfig.js";
import { getLaunchParameters } from "./ballLauncher.js";
import { isBallOutOfBounds } from "./ballPhysics.js";
import { advanceBallFixedStep, createFixedStepPhysicsState } from "./fixedStepBallPhysics.js";
import { calculateOutgoingVelocity } from "./ballResponse.js";
import { estimateSecondBounceDelay, solveVelocity } from "./ballDelivery.js";
import { interpolateRacketMatrix, sweepBallAgainstMovingRacket } from "./racketCollider.js";
import { applyEasyTrajectoryAssist, EasyTrajectoryAssistResult } from "./easyTrajectoryAssist.js";
import { AssistMode, BallHitEvent, BallMissEvent, BallSnapshot, BallSpeedPreset, EasyHitMotion, HitDebugSnapshot, LaunchPreset, RacketCollisionResult } from "./ballTypes.js";
import { TrajectoryCalibrationProfile } from "./trajectoryCalibration.js";
import { evaluatePlayableCalibratedHit, PlayableHitDecision } from "./playableCalibratedHit.js";
import { ContactLifecycle, isSuccessfulTennisOutcome, PhysicalImpactResolution, resolvePhysicalImpact } from "./contactRealism.js";
import { solveSpinFlight } from "./spinFlight.js";

export function shouldEnterContactZone(ball: BallSnapshot, now: number, assistMode: AssistMode = "prototype"): boolean {
  const timeToContact = ball.contactDeadline - now;
  const targetRadius = assistMode === "easy" ? BALL_CONFIG.easyAssist.targetRadius : BALL_CONFIG.contactZone.maximumTargetDistance;
  return !ball.hit && ball.bounceCount === 1 && ball.velocity.z > 0 &&
    timeToContact >= 0 && timeToContact <= BALL_CONFIG.contactZone.maximumTimeToContactMs &&
    ball.position.distanceTo(ball.contactTarget) <= targetRadius &&
    ball.position.y >= BALL_CONFIG.easyAssist.minimumTargetHeight &&
    ball.position.y <= BALL_CONFIG.easyAssist.maximumTargetHeight;
}

export class BallController {
  readonly ball: BallSnapshot = {
    id: "ball-0", state: "IDLE", position: new THREE.Vector3(), previousPosition: new THREE.Vector3(),
    velocity: new THREE.Vector3(), spinVector: new THREE.Vector3(), angularVelocity: new THREE.Vector3(),
    spinType: "flat", spinStrength: 0, magnusAcceleration: new THREE.Vector3(),
    physicsRadius: BALL_CONFIG.scale.physicalRadiusMeters,
    visualRadius: BALL_CONFIG.scale.physicalRadiusMeters * BALL_CONFIG.scale.visualScaleMultiplier,
    bounceCount: 0, hit: false, active: false, launchTimestamp: 0, launchPreset: null,
    contactTarget: new THREE.Vector3(), lockedContactTarget: new THREE.Vector3(),
    lockedContactQuaternion: new THREE.Quaternion(), lockedStrokeType: "forehand", expectedStrokeType: "forehand",
    bouncePoint: new THREE.Vector3(), contactTimeAfterBounce: 0,
    contactDeadline: 0, secondBounceDeadline: 0
  };
  lastCollision: RacketCollisionResult | null = null;
  lastHit: BallHitEvent | null = null;
  lastMiss: BallMissEvent | null = null;
  lastTrajectoryAssist: EasyTrajectoryAssistResult | null = null;
  lastResponse: ReturnType<typeof calculateOutgoingVelocity> | null = null;
  lastPlayableDecision: PlayableHitDecision | null = null;
  lastPhysicalImpact: PhysicalImpactResolution | null = null;
  contactLifecycle: ContactLifecycle = "APPROACHING";
  readonly hitDebug: HitDebugSnapshot = {
    ballNearTarget: false, ballNearStringBed: false, oneBounceOnly: false, beforeSecondBounce: false,
    planeCrossed: false, insideEllipse: false, strokeStateIsContactReady: false,
    recentContactEvent: false, swingSpeedAboveThreshold: false, racketPoseValid: false, swingDirectionValid: false,
    hitAccepted: false, rejectionReason: "ball idle", ballToTargetDistance: Number.POSITIVE_INFINITY,
    ballToStringBedDistance: Number.POSITIVE_INFINITY, currentSwingSpeed: 0,
    minimumSwingSpeed: BALL_CONFIG.easyAssist.minimumAngularSpeed, stringBedCenter: new THREE.Vector3()
  };
  private sequence = 0;
  private finalResultEmitted = false;
  private closestDistance = Number.POSITIVE_INFINITY;
  private resetAt = 0;
  private readonly previousColliderWorldMatrix = new THREE.Matrix4();
  private hasPreviousColliderMatrix = false;
  private sweptContact: { collision: RacketCollisionResult; timestamp: number } | null = null;
  private readonly sweptHistory: Array<{ collision: RacketCollisionResult; timestamp: number }> = [];
  private impactResolvedAt = 0;
  readonly sweptDebug = {
    minimumSweptDistance: Number.POSITIVE_INFINITY,
    sweptPlaneCrossed: false,
    sweptInsideEllipse: false,
    sweptContactPoint: new THREE.Vector3(),
    sweptContactTimestamp: 0
  };
  readonly physicsState = createFixedStepPhysicsState();
  readonly lifecycleDebug = {
    lastStateTransition: "created -> IDLE",
    lastResetReason: "initial state",
    lastHideReason: "initially idle"
  };

  constructor(
    private readonly onHit?: (event: BallHitEvent) => void,
    private readonly onMiss?: (event: BallMissEvent) => void
  ) {}

  launch(
    preset: LaunchPreset,
    handedness: "right" | "left",
    speed: BallSpeedPreset,
    now: number,
    backhandStyle: "one-handed" | "two-handed" = "one-handed",
    targetOffsets?: { heightOffset?: number; sideOffset?: number; depthOffset?: number },
    calibrationProfile?: TrajectoryCalibrationProfile
  ): void {
    const launch = getLaunchParameters(preset, handedness, speed, backhandStyle, targetOffsets, calibrationProfile);
    this.sequence += 1;
    this.ball.id = `ball-${this.sequence}`;
    this.ball.state = "IN_FLIGHT_TO_PLAYER";
    this.lifecycleDebug.lastStateTransition = "IDLE -> IN_FLIGHT_TO_PLAYER (launch)";
    this.lifecycleDebug.lastHideReason = "none";
    this.ball.position.copy(launch.position);
    this.ball.previousPosition.copy(launch.position);
    this.ball.velocity.copy(launch.velocity);
    this.ball.angularVelocity.set(0, 0, 0);
    this.ball.spinVector.set(0, 0, 0);
    this.ball.spinType = "flat";
    this.ball.spinStrength = 0;
    this.ball.bounceCount = 0;
    this.ball.hit = false;
    this.ball.active = true;
    this.ball.launchTimestamp = now;
    this.ball.launchPreset = preset;
    this.ball.contactTarget.copy(launch.contactTarget);
    this.ball.lockedContactTarget.copy(launch.contactTarget);
    this.ball.lockedContactQuaternion.copy(launch.contactQuaternion);
    this.ball.lockedStrokeType = launch.strokeType;
    this.ball.expectedStrokeType = launch.strokeType;
    this.ball.bouncePoint.copy(launch.bouncePoint);
    this.ball.contactTimeAfterBounce = launch.contactTimeAfterBounce;
    this.ball.contactDeadline = 0;
    this.ball.secondBounceDeadline = 0;
    this.finalResultEmitted = false;
    this.closestDistance = Number.POSITIVE_INFINITY;
    this.lastCollision = null;
    this.lastHit = null;
    this.lastMiss = null;
    this.lastResponse = null;
    this.lastPlayableDecision = null;
    this.lastPhysicalImpact = null;
    this.contactLifecycle = "APPROACHING";
    this.impactResolvedAt = 0;
    this.hasPreviousColliderMatrix = false;
    this.sweptContact = null;
    this.sweptHistory.length = 0;
    this.sweptDebug.minimumSweptDistance = Number.POSITIVE_INFINITY;
    this.sweptDebug.sweptPlaneCrossed = false;
    this.sweptDebug.sweptInsideEllipse = false;
    this.sweptDebug.sweptContactTimestamp = 0;
    this.physicsState.accumulatorSeconds = 0;
    this.physicsState.previousStepPosition.copy(this.ball.position);
  }

  reset(reason = "scheduled lifecycle reset"): void {
    this.lifecycleDebug.lastStateTransition = `${this.ball.state} -> IDLE (${reason})`;
    this.lifecycleDebug.lastResetReason = reason;
    this.lifecycleDebug.lastHideReason = reason;
    this.ball.state = "IDLE";
    this.ball.active = false;
    this.ball.velocity.set(0, 0, 0);
    this.ball.spinVector.set(0, 0, 0);
    this.ball.angularVelocity.set(0, 0, 0);
    this.ball.contactDeadline = 0;
    this.ball.secondBounceDeadline = 0;
    this.lastCollision = null;
  }

  update(
    deltaSeconds: number,
    now: number,
    colliderWorldMatrix: THREE.Matrix4,
    stroke: StrokeDetectorSnapshot,
    contact: EstimatedRacketContact | null,
    assistMode: AssistMode,
    easyMotion?: EasyHitMotion | null,
    allowHit = true,
    playableProfile: TrajectoryCalibrationProfile | null = null,
    playableEnabled = false
  ): void {
    if (!this.ball.active) {
      if (this.ball.state === "MISSED" && now >= this.resetAt) this.reset();
      return;
    }
    const physics = advanceBallFixedStep(this.ball, deltaSeconds, this.physicsState);
    const bounced = physics.bounced;
    if (bounced) {
      if (this.ball.hit) {
        this.ball.state = "OUT";
        this.resetAt = now + BALL_CONFIG.resetDelayMs;
      } else if (this.ball.bounceCount >= 2) {
        this.emitMiss(now, "second bounce before contact", stroke, contact, colliderWorldMatrix);
        return;
      } else {
        this.ball.state = "BOUNCED";
        this.ball.velocity.copy(this.ball.spinVector.lengthSq() > 0 ? solveSpinFlight(
          this.ball.position, this.ball.contactTarget, this.ball.contactTimeAfterBounce, this.ball.spinVector
        ) : solveVelocity(
          this.ball.position,
          this.ball.contactTarget,
          this.ball.contactTimeAfterBounce
        ));
        this.ball.contactDeadline = now + this.ball.contactTimeAfterBounce * 1000;
        this.ball.secondBounceDeadline = now + estimateSecondBounceDelay(this.ball.velocity.y) * 1000;
      }
    }
    this.lastTrajectoryAssist = assistMode === "easy"
      ? applyEasyTrajectoryAssist(this.ball, deltaSeconds, now)
      : null;
    if (shouldEnterContactZone(this.ball, now, assistMode)) {
      this.ball.state = "CONTACT_ZONE";
    }
    if (allowHit && assistMode === "easy" && playableEnabled && this.ball.contactDeadline > 0) {
      this.lastPlayableDecision = evaluatePlayableCalibratedHit({
        now, contactTime: this.ball.contactDeadline, bounceCount: this.ball.bounceCount,
        alreadyHit: this.ball.hit, expectedStrokeType: this.ball.expectedStrokeType,
        profile: playableProfile, motion: easyMotion ?? null
      });
      const limits = BALL_CONFIG.playableCalibratedHit.maximumCorrection;
      const reachable = Math.abs(this.ball.position.x - this.ball.contactTarget.x) <= limits.lateral + this.ball.physicsRadius &&
        Math.abs(this.ball.position.y - this.ball.contactTarget.y) <= limits.vertical + this.ball.physicsRadius &&
        Math.abs(this.ball.position.z - this.ball.contactTarget.z) <= limits.depth + this.ball.physicsRadius;
      if (this.lastPlayableDecision.accepted && playableProfile && easyMotion &&
          reachable) {
        this.acceptPlayableCalibratedHit(now, playableProfile, easyMotion, contact);
      }
    }
    if (!this.ball.hit && this.ball.velocity.z > 0 && allowHit) {
      this.lastCollision = sweepBallAgainstMovingRacket(
        this.ball.previousPosition,
        this.ball.position,
        this.ball.physicsRadius,
        this.hasPreviousColliderMatrix ? this.previousColliderWorldMatrix : colliderWorldMatrix,
        colliderWorldMatrix,
        assistMode,
        assistMode === "easy" ? BALL_CONFIG.sweptContact.samplesPerFrame : 1
      );
      this.sweptHistory.push({ collision: this.lastCollision, timestamp: now });
      while (this.sweptHistory[0]?.timestamp < now - BALL_CONFIG.sweptContact.historyMs) this.sweptHistory.shift();
      const recentCandidate = this.sweptHistory.find(entry => entry.collision.candidate);
      if (recentCandidate) this.sweptContact = recentCandidate;
      if (this.sweptContact && now - this.sweptContact.timestamp > BALL_CONFIG.sweptContact.overlapLifetimeMs) {
        this.sweptContact = null;
      }
      const minimum = this.sweptHistory.reduce((best, entry) =>
        entry.collision.closestDistance < best.collision.closestDistance ? entry : best,
      this.sweptHistory[0]);
      if (minimum) {
        this.sweptDebug.minimumSweptDistance = minimum.collision.closestDistance;
        this.sweptDebug.sweptPlaneCrossed = this.sweptHistory.some(entry => entry.collision.crossed);
        this.sweptDebug.sweptInsideEllipse = this.sweptHistory.some(entry => entry.collision.candidate);
        this.sweptDebug.sweptContactPoint.copy(minimum.collision.contactPointWorld);
        this.sweptDebug.sweptContactTimestamp = minimum.timestamp;
      }
      this.updateHitDebug(now, stroke, contact, assistMode, easyMotion ?? null, colliderWorldMatrix);
      this.closestDistance = Math.min(this.closestDistance, this.lastCollision.closestDistance);
      if (this.lastCollision.physicalCandidate && this.contactLifecycle === "APPROACHING") {
        this.resolvePhysicalContact(now, deltaSeconds, colliderWorldMatrix, stroke, contact, easyMotion ?? null);
      } else if (this.lastCollision.candidate || (assistMode === "easy" && this.sweptContact !== null)) {
        this.tryHit(now, stroke, contact, assistMode, easyMotion ?? null);
      }
    }
    if (this.contactLifecycle === "IMPACT_RESOLVED") this.contactLifecycle = "SEPARATING";
    if (this.contactLifecycle === "SEPARATING" && now - this.impactResolvedAt >= BALL_CONFIG.contactRealism.contactCooldownMs) {
      this.contactLifecycle = "CONTACT_COOLDOWN";
    }
    if (this.contactLifecycle === "CONTACT_COOLDOWN") {
      const racketCenter = new THREE.Vector3().setFromMatrixPosition(colliderWorldMatrix);
      if (this.ball.position.distanceTo(racketCenter) >= BALL_CONFIG.contactRealism.separationDistance) {
        this.contactLifecycle = "APPROACHING";
      }
    }
    if (!this.ball.hit && this.ball.position.z > BALL_CONFIG.bounds.zBehindPlayer) {
      this.emitMiss(now, this.lastCollision?.candidate ? "contact window mismatch" : "ball passed behind racket", stroke, contact, colliderWorldMatrix);
    }
    if (isBallOutOfBounds(this.ball, now) && this.ball.state !== "OUT") {
      if (!this.ball.hit) this.emitMiss(now, "ball left world bounds", stroke, contact, colliderWorldMatrix);
      else { this.ball.state = "OUT"; this.resetAt = now + BALL_CONFIG.resetDelayMs; }
    }
    if (this.ball.state === "OUT" && now >= this.resetAt) this.reset();
    this.previousColliderWorldMatrix.copy(colliderWorldMatrix);
    this.hasPreviousColliderMatrix = true;
  }

  private resolvePhysicalContact(
    now: number,
    deltaSeconds: number,
    colliderWorldMatrix: THREE.Matrix4,
    stroke: StrokeDetectorSnapshot,
    contact: EstimatedRacketContact | null,
    motion: EasyHitMotion | null
  ): void {
    if (!this.lastCollision || this.contactLifecycle !== "APPROACHING") return;
    this.contactLifecycle = "CONTACT_CANDIDATE";
    const impactMatrix = interpolateRacketMatrix(
      this.hasPreviousColliderMatrix ? this.previousColliderWorldMatrix : colliderWorldMatrix,
      colliderWorldMatrix,
      this.lastCollision.impactFraction
    );
    const previousPosition = new THREE.Vector3();
    const previousQuaternion = new THREE.Quaternion();
    const currentPosition = new THREE.Vector3();
    const currentQuaternion = new THREE.Quaternion();
    impactMatrix.decompose(currentPosition, currentQuaternion, new THREE.Vector3());
    (this.hasPreviousColliderMatrix ? this.previousColliderWorldMatrix : impactMatrix)
      .decompose(previousPosition, previousQuaternion, new THREE.Vector3());
    const hasIntent = this.lastPlayableDecision?.accepted === true ||
      stroke.currentState === "CONTACT_WINDOW" || !!motion?.swingIntent?.active;
    const resolution = resolvePhysicalImpact({
      incomingVelocity: this.ball.velocity.clone(), incomingSpin: this.ball.spinVector.clone(),
      contactPointWorld: this.lastCollision.contactPointWorld.clone(),
      contactPointLocal: this.lastCollision.contactPointLocal.clone(),
      racketPosition: currentPosition, racketQuaternion: currentQuaternion,
      previousRacketPosition: previousPosition, previousRacketQuaternion: previousQuaternion,
      frameSeconds: Math.max(deltaSeconds, 1 / 240), swingIntent: hasIntent,
      swingConfidence: motion?.swingIntent?.confidence ?? contact?.confidence ?? 0,
      sensorAngularSpeed: motion?.swingIntent?.peakAngularSpeed ?? motion?.angularSpeed ?? contact?.peakAngularVelocity ?? 0,
      angularVelocityWorld: motion?.angularVelocityWorld,
      sensorAcceleration: motion?.accelerationMagnitude ?? contact?.peakAcceleration ?? 0,
      forwardScore: motion?.motionForwardScore ?? contact?.forwardScore ?? 0,
      upwardScore: contact?.upwardScore ?? motion?.motionUpwardScore ?? 0,
      frameContact: this.lastCollision.frameContact
    });
    this.lastPhysicalImpact = resolution;
    const incoming = this.ball.velocity.clone();
    const impactPosition = this.ball.previousPosition.clone().lerp(this.ball.position, this.lastCollision.impactFraction);
    // Resolve at the swept time of impact, then consume the remainder of this
    // frame along the outgoing path. Rewinding and leaving the ball at contact
    // made fast contacts visibly stop for a frame.
    this.ball.position.copy(impactPosition)
      .addScaledVector(resolution.outgoingVelocity, Math.max(0, deltaSeconds) * (1 - this.lastCollision.impactFraction));
    this.ball.previousPosition.copy(this.ball.position);
    this.ball.velocity.copy(resolution.outgoingVelocity);
    this.ball.spinVector.copy(resolution.outgoingAngularVelocity);
    this.ball.angularVelocity.copy(resolution.outgoingAngularVelocity);
    this.ball.spinStrength = resolution.spinRateRadiansPerSecond;
    this.ball.spinType = resolution.spinType === "TOPSPIN" ? "topspin"
      : resolution.spinType === "SLICE" ? "slice" : "flat";
    this.ball.state = "RETURNED";
    this.contactLifecycle = "IMPACT_RESOLVED";
    this.impactResolvedAt = now;
    if (!isSuccessfulTennisOutcome(resolution.outcome)) return;
    const effective = contact ?? (motion ? this.createEasyContact(now, motion) : null);
    if (!effective) return;
    this.ball.hit = true;
    this.finalResultEmitted = true;
    const event: BallHitEvent = {
      id: `hit-${this.ball.id}`, ballId: this.ball.id, timestamp: now,
      strokeContactEventId: effective.id, strokeType: this.ball.expectedStrokeType,
      expectedStrokeType: this.ball.expectedStrokeType, detectedStrokeType: contact?.strokeType ?? "unknown",
      resolvedHitStrokeType: this.ball.expectedStrokeType, strokeTypeMismatch: "NONE",
      handedness: effective.handedness, backhandStyle: effective.backhandStyle,
      confidence: effective.confidence, assisted: this.lastCollision.assisted,
      contactPointWorld: impactPosition, contactPointRacketLocal: this.lastCollision.contactPointLocal.clone(),
      racketQuaternion: currentQuaternion.clone(), racketFaceNormal: resolution.contactNormal.clone(),
      incomingVelocity: incoming, outgoingVelocity: resolution.outgoingVelocity.clone(),
      outgoingSpeed: resolution.outgoingVelocity.length(), spinType: this.ball.spinType,
      spinVector: resolution.outgoingAngularVelocity.clone(), topspinScore: effective.topspinScore,
      sliceScore: effective.sliceScore, racketFaceAngle: resolution.faceAngleRadians
    };
    this.lastHit = event;
    this.hitDebug.hitAccepted = true;
    this.hitDebug.rejectionReason = "none";
    this.onHit?.(event);
  }

  private acceptPlayableCalibratedHit(
    now: number,
    profile: TrajectoryCalibrationProfile,
    motion: EasyHitMotion,
    strictContact: EstimatedRacketContact | null
  ): void {
    if (this.ball.hit) return;
    // The profile gates reach/timing; impact takes place where the ball actually is.
    // Moving it to the profile anchor created a visible jump at accepted contact.
    const calibratedPoint = this.ball.position.clone();
    const incoming = this.ball.velocity.clone();
    const effectiveContact = this.createEasyContact(now, motion);
    const localContactPoint = new THREE.Vector3(0, 0, 0);
    const response = calculateOutgoingVelocity(effectiveContact, localContactPoint, calibratedPoint, incoming);
    const pivot = calibratedPoint.clone().addScaledVector(
      effectiveContact.racketUpVector,
      -BALL_CONFIG.contactRealism.pivotToSweetSpotMeters
    );
    const physical = resolvePhysicalImpact({
      incomingVelocity: incoming, incomingSpin: this.ball.spinVector.clone(),
      contactPointWorld: calibratedPoint, contactPointLocal: localContactPoint,
      racketPosition: pivot, previousRacketPosition: pivot,
      racketQuaternion: effectiveContact.racketQuaternion,
      previousRacketQuaternion: effectiveContact.racketQuaternion,
      frameSeconds: 1 / 60, swingIntent: true, swingConfidence: effectiveContact.confidence,
      sensorAngularSpeed: motion.swingIntent?.peakAngularSpeed ?? motion.angularSpeed,
      angularVelocityWorld: motion.angularVelocityWorld,
      sensorAcceleration: motion.accelerationMagnitude, forwardScore: motion.motionForwardScore,
      upwardScore: effectiveContact.upwardScore, frameContact: false
    });
    this.ball.position.copy(calibratedPoint);
    this.ball.previousPosition.copy(calibratedPoint);
    this.ball.velocity.copy(physical.outgoingVelocity);
    this.ball.spinVector.copy(physical.outgoingAngularVelocity);
    this.ball.angularVelocity.copy(physical.outgoingAngularVelocity);
    this.ball.spinType = physical.spinType === "TOPSPIN" ? "topspin" : physical.spinType === "SLICE" ? "slice" : "flat";
    this.ball.spinStrength = physical.spinRateRadiansPerSecond;
    this.ball.state = "RETURNED";
    this.lastResponse = response;
    this.lastPhysicalImpact = physical;
    if (!isSuccessfulTennisOutcome(physical.outcome)) {
      this.ball.hit = false;
      return;
    }
    this.ball.hit = true;
    const detectedStrokeType = strictContact?.strokeType ?? "unknown";
    const mismatch = detectedStrokeType !== "unknown" && detectedStrokeType !== this.ball.expectedStrokeType
      ? this.ball.expectedStrokeType === "forehand" ? "EXPECTED_FOREHAND_DETECTED_BACKHAND" : "EXPECTED_BACKHAND_DETECTED_FOREHAND"
      : "NONE";
    const event: BallHitEvent = {
      id: `hit-${this.ball.id}`, ballId: this.ball.id, timestamp: now,
      strokeContactEventId: effectiveContact.id, strokeType: this.ball.expectedStrokeType,
      expectedStrokeType: this.ball.expectedStrokeType, detectedStrokeType,
      resolvedHitStrokeType: this.ball.expectedStrokeType, strokeTypeMismatch: mismatch,
      handedness: effectiveContact.handedness, backhandStyle: effectiveContact.backhandStyle,
      confidence: effectiveContact.confidence, assisted: true,
      contactPointWorld: calibratedPoint.clone(), contactPointRacketLocal: localContactPoint,
      racketQuaternion: effectiveContact.racketQuaternion.clone(),
      racketFaceNormal: effectiveContact.racketFaceNormal.clone(), incomingVelocity: incoming,
      outgoingVelocity: physical.outgoingVelocity.clone(), outgoingSpeed: physical.outgoingVelocity.length(),
      spinType: this.ball.spinType, spinVector: physical.outgoingAngularVelocity.clone(),
      topspinScore: effectiveContact.topspinScore, sliceScore: effectiveContact.sliceScore,
      racketFaceAngle: effectiveContact.racketFaceAngle
    };
    this.lastHit = event;
    this.hitDebug.hitAccepted = true;
    this.hitDebug.rejectionReason = "none";
    this.finalResultEmitted = true;
    this.onHit?.(event);
  }

  private tryHit(now: number, stroke: StrokeDetectorSnapshot, contact: EstimatedRacketContact | null, assistMode: AssistMode = "prototype", easyMotion: EasyHitMotion | null = null): void {
    if (this.ball.hit || !this.lastCollision) return;
    if (assistMode === "easy") {
      const swept = this.sweptContact;
      const validEasyHit = this.ball.bounceCount === 1 && this.ball.velocity.z > 0 &&
        !!easyMotion?.swingIntent?.active && !!swept &&
        now - swept.timestamp <= BALL_CONFIG.sweptContact.overlapLifetimeMs &&
        easyMotion.racketFaceAngle <= BALL_CONFIG.easySwingIntent.maximumFaceAngleRadians;
      if (!validEasyHit) return;
      this.lastCollision = swept.collision;
    }
    const effectiveContact = contact ?? (assistMode === "easy" && easyMotion && this.canUseEasyAssist()
      ? this.createEasyContact(now, easyMotion)
      : null);
    if (!effectiveContact) return;
    const contactAge = Math.abs(now - effectiveContact.timestamp);
    const timingTolerance = assistMode === "easy"
      ? BALL_CONFIG.easyAssist.contactTimingToleranceMs
      : BALL_CONFIG.collision.contactEventToleranceMs;
    const validWindow = stroke.currentState === "CONTACT_WINDOW" ||
      contactAge <= timingTolerance;
    const minimumSpeed = assistMode === "easy" ? BALL_CONFIG.easyAssist.minimumAngularSpeed * 3.2 : BALL_CONFIG.collision.minimumStrokeSpeed;
    if (!validWindow || effectiveContact.estimatedSpeed < minimumSpeed ||
      effectiveContact.racketFaceAngle > (assistMode === "easy" ? BALL_CONFIG.easyAssist.maximumFaceAngleRadians : BALL_CONFIG.collision.maximumFaceAngleRadians)) return;
    const incoming = this.ball.velocity.clone();
    const response = calculateOutgoingVelocity(
      effectiveContact,
      this.lastCollision.contactPointLocal,
      this.lastCollision.contactPointWorld,
      incoming
    );
    const physicalRacketUp = new THREE.Vector3(0, 1, 0).applyQuaternion(effectiveContact.racketQuaternion).normalize();
    const pivot = this.lastCollision.contactPointWorld.clone().addScaledVector(
      physicalRacketUp,
      -BALL_CONFIG.contactRealism.pivotToSweetSpotMeters
    );
    const physical = resolvePhysicalImpact({
      incomingVelocity: incoming, incomingSpin: this.ball.spinVector.clone(),
      contactPointWorld: this.lastCollision.contactPointWorld.clone(),
      contactPointLocal: this.lastCollision.contactPointLocal.clone(),
      racketPosition: pivot, previousRacketPosition: pivot,
      racketQuaternion: effectiveContact.racketQuaternion,
      previousRacketQuaternion: effectiveContact.racketQuaternion,
      frameSeconds: 1 / 60, swingIntent: true, swingConfidence: effectiveContact.confidence,
      sensorAngularSpeed: easyMotion?.swingIntent?.peakAngularSpeed ?? easyMotion?.angularSpeed ?? effectiveContact.peakAngularVelocity,
      angularVelocityWorld: easyMotion?.angularVelocityWorld ?? effectiveContact.racketSideVector.clone()
        .multiplyScalar(-effectiveContact.peakAngularVelocity),
      sensorAcceleration: easyMotion?.accelerationMagnitude ?? effectiveContact.peakAcceleration,
      forwardScore: easyMotion?.motionForwardScore ?? effectiveContact.forwardScore,
      upwardScore: easyMotion?.motionUpwardScore ?? effectiveContact.upwardScore,
      frameContact: this.lastCollision.frameContact
    });
    this.lastPhysicalImpact = physical;
    if (!isSuccessfulTennisOutcome(physical.outcome)) return;
    this.lastResponse = { ...response, velocity: physical.outgoingVelocity.clone(),
      spinVector: physical.outgoingAngularVelocity.clone(), speed: physical.outgoingVelocity.length(),
      prediction: physical.prediction };
    this.ball.velocity.copy(physical.outgoingVelocity);
    this.ball.spinVector.copy(physical.outgoingAngularVelocity);
    this.ball.angularVelocity.copy(physical.outgoingAngularVelocity);
    this.ball.spinType = physical.spinType === "TOPSPIN" ? "topspin" : physical.spinType === "SLICE" ? "slice" : "flat";
    this.ball.spinStrength = physical.spinRateRadiansPerSecond;
    this.ball.hit = true;
    this.ball.state = "RETURNED";
    const detectedStrokeType = contact?.strokeType ?? "unknown";
    const resolvedHitStrokeType = effectiveContact.strokeType;
    const strokeTypeMismatch = detectedStrokeType === "unknown"
      ? (contact ? "STROKE_TYPE_UNRESOLVED" : "NONE")
      : detectedStrokeType !== this.ball.expectedStrokeType
        ? this.ball.expectedStrokeType === "forehand"
          ? "EXPECTED_FOREHAND_DETECTED_BACKHAND"
          : "EXPECTED_BACKHAND_DETECTED_FOREHAND"
        : "NONE";
    const event: BallHitEvent = {
      id: `hit-${this.ball.id}`, ballId: this.ball.id, timestamp: now,
      strokeContactEventId: effectiveContact.id, strokeType: resolvedHitStrokeType,
      expectedStrokeType: this.ball.expectedStrokeType, detectedStrokeType, resolvedHitStrokeType, strokeTypeMismatch,
      handedness: effectiveContact.handedness,
      backhandStyle: effectiveContact.backhandStyle, confidence: effectiveContact.confidence, assisted: this.lastCollision.assisted || !contact,
      contactPointWorld: this.lastCollision.contactPointWorld.clone(),
      contactPointRacketLocal: this.lastCollision.contactPointLocal.clone(),
      racketQuaternion: effectiveContact.racketQuaternion.clone(), racketFaceNormal: effectiveContact.racketFaceNormal.clone(),
      incomingVelocity: incoming, outgoingVelocity: physical.outgoingVelocity.clone(), outgoingSpeed: physical.outgoingVelocity.length(),
      spinType: this.ball.spinType, spinVector: physical.outgoingAngularVelocity.clone(), topspinScore: effectiveContact.topspinScore,
      sliceScore: effectiveContact.sliceScore, racketFaceAngle: effectiveContact.racketFaceAngle
    };
    this.lastHit = event;
    this.hitDebug.hitAccepted = true;
    this.hitDebug.rejectionReason = "none";
    this.finalResultEmitted = true;
    this.onHit?.(event);
  }

  private canUseEasyAssist(): boolean {
    const debug = this.hitDebug;
    return debug.oneBounceOnly && debug.beforeSecondBounce &&
      debug.racketPoseValid;
  }

  private updateHitDebug(now: number, stroke: StrokeDetectorSnapshot, contact: EstimatedRacketContact | null, assistMode: AssistMode, motion: EasyHitMotion | null, matrix: THREE.Matrix4): void {
    const center = new THREE.Vector3().setFromMatrixPosition(matrix);
    const collision = this.lastCollision;
    const contactAge = contact ? Math.abs(now - contact.timestamp) : Number.POSITIVE_INFINITY;
    const minimum = assistMode === "easy" ? BALL_CONFIG.easyAssist.minimumAngularSpeed : BALL_CONFIG.collision.minimumStrokeSpeed / 3.2;
    Object.assign(this.hitDebug, {
      ballNearTarget: this.ball.position.distanceTo(this.ball.contactTarget) <= BALL_CONFIG.easyAssist.targetRadius,
      ballNearStringBed: this.ball.position.distanceTo(center) <= BALL_CONFIG.easyAssist.assistedStringBedRadius,
      oneBounceOnly: this.ball.bounceCount === 1,
      beforeSecondBounce: this.ball.secondBounceDeadline === 0 || now < this.ball.secondBounceDeadline,
      planeCrossed: collision?.crossed ?? false,
      insideEllipse: (collision?.ellipseValue ?? Number.POSITIVE_INFINITY) <= 1,
      strokeStateIsContactReady: stroke.currentState === "CONTACT_WINDOW" ||
        (assistMode === "easy" && !!motion?.swingIntent?.active),
      recentContactEvent: contactAge <= (assistMode === "easy" ? BALL_CONFIG.easyAssist.contactTimingToleranceMs : BALL_CONFIG.collision.contactEventToleranceMs),
      swingSpeedAboveThreshold: (contact ? contact.estimatedSpeed / 3.2 : motion?.angularSpeed ?? 0) >= minimum,
      racketPoseValid: (contact?.racketFaceAngle ?? motion?.racketFaceAngle ?? Number.POSITIVE_INFINITY) <= (assistMode === "easy" ? BALL_CONFIG.easyAssist.maximumFaceAngleRadians : BALL_CONFIG.collision.maximumFaceAngleRadians),
      swingDirectionValid: contact ? contact.forwardScore >= 0.2 : (motion?.motionForwardScore ?? 0) >= 0.2,
      hitAccepted: this.ball.hit,
      ballToTargetDistance: this.ball.position.distanceTo(this.ball.contactTarget),
      ballToStringBedDistance: this.ball.position.distanceTo(center),
      currentSwingSpeed: contact ? contact.estimatedSpeed / 3.2 : motion?.angularSpeed ?? 0,
      minimumSwingSpeed: minimum,
      stringBedCenter: center
    });
    const failed = Object.entries(this.hitDebug).find(([key, value]) => typeof value === "boolean" && key !== "recentContactEvent" && key !== "planeCrossed" && key !== "insideEllipse" && key !== "hitAccepted" && !value);
    this.hitDebug.rejectionReason = failed?.[0] ?? (this.ball.hit ? "none" : "waiting for plane crossing");
  }

  private createEasyContact(now: number, motion: EasyHitMotion): EstimatedRacketContact {
    const strokeType = this.ball.expectedStrokeType;
    return {
      id: `easy-${this.ball.id}-${Math.round(now)}`, swingId: `easy-${this.ball.id}`, timestamp: now,
      strokeType, handedness: motion.handedness, backhandStyle: motion.backhandStyle, confidence: 0.72,
      estimatedSpeed: Math.max(2.2, (motion.swingIntent?.peakAngularSpeed ?? motion.angularSpeed) * 3.2),
      forwardScore: motion.motionForwardScore,
      upwardScore: motion.motionUpwardScore ?? 0,
      sidewaysScore: motion.motionSidewaysScore ?? (strokeType === "forehand" ? 0.5 : -0.5),
      racketFaceAngle: motion.racketFaceAngle, racketQuaternion: motion.racketQuaternion.clone(),
      racketPosition: this.hitDebug.stringBedCenter.clone(), racketForwardVector: motion.racketForwardVector.clone(),
      racketUpVector: motion.racketUpVector.clone(), racketSideVector: motion.racketSideVector.clone(),
      racketFaceNormal: motion.racketFaceNormal.clone(), peakAngularVelocity: motion.angularSpeed,
      peakAcceleration: motion.accelerationMagnitude, peakJerk: 0, preparationDuration: 0,
      forwardSwingDuration: 0,
      lowToHighScore: Math.max(0, motion.motionUpwardScore ?? 0),
      highToLowScore: Math.max(0, -(motion.motionUpwardScore ?? 0)),
      topspinScore: Math.max(0, motion.motionUpwardScore ?? 0),
      sliceScore: Math.max(0, -(motion.motionUpwardScore ?? 0)),
      spinType: (motion.motionUpwardScore ?? 0) > 0.25 ? "topspin"
        : (motion.motionUpwardScore ?? 0) < -0.25 ? "slice" : "flat"
    };
  }

  private emitMiss(now: number, reason: string, stroke: StrokeDetectorSnapshot, contact: EstimatedRacketContact | null, matrix: THREE.Matrix4): void {
    if (this.finalResultEmitted) return;
    const inverse = matrix.clone().invert();
    const racketPosition = new THREE.Vector3().setFromMatrixPosition(matrix);
    const resolvedReason = this.resolveMissReason(reason, now, contact);
    const event: BallMissEvent = {
      id: `miss-${this.ball.id}`, ballId: this.ball.id, timestamp: now, reason,
      closestDistance: Number.isFinite(this.closestDistance) ? this.closestDistance : this.ball.position.distanceTo(racketPosition),
      ballPosition: this.ball.position.clone(), racketPosition,
      localBallPosition: this.ball.position.clone().applyMatrix4(inverse), strokeState: stroke.currentState,
      nearestContactEventAge: contact ? Math.abs(now - contact.timestamp) : null
    };
    event.reason = resolvedReason;
    this.lastMiss = event;
    this.finalResultEmitted = true;
    this.ball.state = "MISSED";
    this.ball.active = false;
    this.resetAt = now + BALL_CONFIG.resetDelayMs;
    this.onMiss?.(event);
  }

  private resolveMissReason(fallback: string, now: number, contact: EstimatedRacketContact | null): string {
    if (fallback === "second bounce before contact") return fallback;
    const local = this.lastCollision?.currentLocalPosition;
    if (local) {
      if (local.y > BALL_CONFIG.collision.halfHeightLocal) return "delivery target too high";
      if (local.y < -BALL_CONFIG.collision.halfHeightLocal) return "delivery target too low";
      if (local.x > BALL_CONFIG.collision.halfWidthLocal) return "passed right of racket";
      if (local.x < -BALL_CONFIG.collision.halfWidthLocal) return "passed left of racket";
    }
    if (!contact) return "no stroke";
    const age = now - contact.timestamp;
    if (age > BALL_CONFIG.collision.contactEventToleranceMs) return "racket too early";
    if (age < -BALL_CONFIG.collision.contactEventToleranceMs) return "racket too late";
    if (contact.estimatedSpeed < BALL_CONFIG.collision.minimumStrokeSpeed) return "stroke too slow";
    if (this.lastCollision && !this.lastCollision.candidate) return "valid stroke but spatial miss";
    return fallback;
  }
}
