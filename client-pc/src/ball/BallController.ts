import * as THREE from "three";
import { EstimatedRacketContact, StrokeDetectorSnapshot } from "../strokeDetection/strokeTypes.js";
import { BALL_CONFIG } from "./ballConfig.js";
import { getLaunchParameters } from "./ballLauncher.js";
import { isBallOutOfBounds, stepBallPhysics } from "./ballPhysics.js";
import { calculateOutgoingVelocity } from "./ballResponse.js";
import { estimateSecondBounceDelay, solveVelocity } from "./ballDelivery.js";
import { sweepBallAgainstRacket } from "./racketCollider.js";
import { AssistMode, BallHitEvent, BallMissEvent, BallSnapshot, BallSpeedPreset, EasyHitMotion, HitDebugSnapshot, LaunchPreset, RacketCollisionResult } from "./ballTypes.js";

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
    contactTarget: new THREE.Vector3(), bouncePoint: new THREE.Vector3(), contactTimeAfterBounce: 0,
    contactDeadline: 0, secondBounceDeadline: 0
  };
  lastCollision: RacketCollisionResult | null = null;
  lastHit: BallHitEvent | null = null;
  lastMiss: BallMissEvent | null = null;
  readonly hitDebug: HitDebugSnapshot = {
    ballNearTarget: false, ballNearStringBed: false, oneBounceOnly: false, beforeSecondBounce: false,
    planeCrossed: false, insideEllipse: false, strokeStateIsContactReady: false,
    recentContactEvent: false, swingSpeedAboveThreshold: false, racketPoseValid: false,
    hitAccepted: false, rejectionReason: "ball idle", ballToTargetDistance: Number.POSITIVE_INFINITY,
    ballToStringBedDistance: Number.POSITIVE_INFINITY, currentSwingSpeed: 0,
    minimumSwingSpeed: BALL_CONFIG.easyAssist.minimumAngularSpeed, stringBedCenter: new THREE.Vector3()
  };
  private sequence = 0;
  private finalResultEmitted = false;
  private closestDistance = Number.POSITIVE_INFINITY;
  private resetAt = 0;

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
    targetOffsets?: { heightOffset?: number; sideOffset?: number; depthOffset?: number }
  ): void {
    const launch = getLaunchParameters(preset, handedness, speed, backhandStyle, targetOffsets);
    this.sequence += 1;
    this.ball.id = `ball-${this.sequence}`;
    this.ball.state = "IN_FLIGHT_TO_PLAYER";
    this.ball.position.copy(launch.position);
    this.ball.previousPosition.copy(launch.position);
    this.ball.velocity.copy(launch.velocity);
    this.ball.angularVelocity.set(launch.velocity.z, 0, -launch.velocity.x).normalize().multiplyScalar(18);
    this.ball.spinVector.set(0, 0, 0);
    this.ball.spinType = "flat";
    this.ball.spinStrength = 0;
    this.ball.bounceCount = 0;
    this.ball.hit = false;
    this.ball.active = true;
    this.ball.launchTimestamp = now;
    this.ball.launchPreset = preset;
    this.ball.contactTarget.copy(launch.contactTarget);
    this.ball.bouncePoint.copy(launch.bouncePoint);
    this.ball.contactTimeAfterBounce = launch.contactTimeAfterBounce;
    this.ball.contactDeadline = 0;
    this.ball.secondBounceDeadline = 0;
    this.finalResultEmitted = false;
    this.closestDistance = Number.POSITIVE_INFINITY;
    this.lastCollision = null;
    this.lastHit = null;
    this.lastMiss = null;
  }

  reset(): void {
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
    easyMotion?: EasyHitMotion | null
  ): void {
    if (!this.ball.active) {
      if (this.ball.state === "MISSED" && now >= this.resetAt) this.reset();
      return;
    }
    const bounced = stepBallPhysics(this.ball, deltaSeconds);
    if (bounced) {
      if (this.ball.hit) {
        this.ball.state = "OUT";
        this.resetAt = now + BALL_CONFIG.resetDelayMs;
      } else if (this.ball.bounceCount >= 2) {
        this.emitMiss(now, "second bounce before contact", stroke, contact, colliderWorldMatrix);
        return;
      } else {
        this.ball.state = "BOUNCED";
        this.ball.velocity.copy(solveVelocity(
          this.ball.position,
          this.ball.contactTarget,
          this.ball.contactTimeAfterBounce
        ));
        this.ball.contactDeadline = now + this.ball.contactTimeAfterBounce * 1000;
        this.ball.secondBounceDeadline = now + estimateSecondBounceDelay(this.ball.velocity.y) * 1000;
      }
    }
    if (shouldEnterContactZone(this.ball, now, assistMode)) {
      this.ball.state = "CONTACT_ZONE";
    }
    if (!this.ball.hit && this.ball.velocity.z > 0) {
      this.lastCollision = sweepBallAgainstRacket(
        this.ball.previousPosition, this.ball.position, this.ball.physicsRadius, colliderWorldMatrix, assistMode
      );
      this.updateHitDebug(now, stroke, contact, assistMode, easyMotion ?? null, colliderWorldMatrix);
      this.closestDistance = Math.min(this.closestDistance, this.lastCollision.closestDistance);
      if (this.lastCollision.candidate || (assistMode === "easy" && this.hitDebug.ballNearTarget)) {
        this.tryHit(now, stroke, contact, assistMode, easyMotion ?? null);
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
  }

  private tryHit(now: number, stroke: StrokeDetectorSnapshot, contact: EstimatedRacketContact | null, assistMode: AssistMode = "prototype", easyMotion: EasyHitMotion | null = null): void {
    if (this.ball.hit || !this.lastCollision) return;
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
    const response = calculateOutgoingVelocity(effectiveContact, this.lastCollision.contactPointLocal);
    const incoming = this.ball.velocity.clone();
    this.ball.velocity.copy(response.velocity);
    this.ball.spinVector.copy(response.spinVector);
    this.ball.angularVelocity.copy(response.spinVector);
    this.ball.spinType = effectiveContact.spinType;
    this.ball.spinStrength = response.spinVector.length();
    this.ball.hit = true;
    this.ball.state = "RETURNED";
    const event: BallHitEvent = {
      id: `hit-${this.ball.id}`, ballId: this.ball.id, timestamp: now,
      strokeContactEventId: effectiveContact.id, strokeType: effectiveContact.strokeType, handedness: effectiveContact.handedness,
      backhandStyle: effectiveContact.backhandStyle, confidence: effectiveContact.confidence, assisted: this.lastCollision.assisted || !contact,
      contactPointWorld: this.lastCollision.contactPointWorld.clone(),
      contactPointRacketLocal: this.lastCollision.contactPointLocal.clone(),
      racketQuaternion: effectiveContact.racketQuaternion.clone(), racketFaceNormal: effectiveContact.racketFaceNormal.clone(),
      incomingVelocity: incoming, outgoingVelocity: response.velocity.clone(), outgoingSpeed: response.speed,
      spinType: effectiveContact.spinType, spinVector: response.spinVector.clone(), topspinScore: effectiveContact.topspinScore,
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
    return debug.ballNearTarget && debug.ballNearStringBed && debug.oneBounceOnly &&
      debug.beforeSecondBounce && debug.strokeStateIsContactReady &&
      debug.swingSpeedAboveThreshold && debug.racketPoseValid;
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
      strokeStateIsContactReady: stroke.currentState === "CONTACT_WINDOW" || (assistMode === "easy" && !!motion && motion.valid && motion.angularSpeed >= minimum),
      recentContactEvent: contactAge <= (assistMode === "easy" ? BALL_CONFIG.easyAssist.contactTimingToleranceMs : BALL_CONFIG.collision.contactEventToleranceMs),
      swingSpeedAboveThreshold: (contact ? contact.estimatedSpeed / 3.2 : motion?.angularSpeed ?? 0) >= minimum,
      racketPoseValid: (contact?.racketFaceAngle ?? motion?.racketFaceAngle ?? Number.POSITIVE_INFINITY) <= (assistMode === "easy" ? BALL_CONFIG.easyAssist.maximumFaceAngleRadians : BALL_CONFIG.collision.maximumFaceAngleRadians),
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
    const strokeType = this.ball.launchPreset === "easyBackhand" ? "backhand" : "forehand";
    return {
      id: `easy-${this.ball.id}-${Math.round(now)}`, swingId: `easy-${this.ball.id}`, timestamp: now,
      strokeType, handedness: motion.handedness, backhandStyle: motion.backhandStyle, confidence: 0.72,
      estimatedSpeed: Math.max(2.2, motion.angularSpeed * 3.2), forwardScore: 0.65,
      upwardScore: 0.25, sidewaysScore: strokeType === "forehand" ? 0.5 : -0.5,
      racketFaceAngle: motion.racketFaceAngle, racketQuaternion: motion.racketQuaternion.clone(),
      racketPosition: this.hitDebug.stringBedCenter.clone(), racketForwardVector: motion.racketForwardVector.clone(),
      racketUpVector: motion.racketUpVector.clone(), racketSideVector: motion.racketSideVector.clone(),
      racketFaceNormal: motion.racketFaceNormal.clone(), peakAngularVelocity: motion.angularSpeed,
      peakAcceleration: motion.accelerationMagnitude, peakJerk: 0, preparationDuration: 0,
      forwardSwingDuration: 0, lowToHighScore: 0.25, highToLowScore: 0,
      topspinScore: 0.2, sliceScore: 0.1, spinType: "flat"
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
