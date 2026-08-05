import * as THREE from "three";
import { EstimatedRacketContact, StrokeDetectorSnapshot } from "../strokeDetection/strokeTypes.js";
import { BALL_CONFIG } from "./ballConfig.js";
import { getLaunchParameters } from "./ballLauncher.js";
import { isBallOutOfBounds, stepBallPhysics } from "./ballPhysics.js";
import { calculateOutgoingVelocity } from "./ballResponse.js";
import { solveVelocity } from "./ballDelivery.js";
import { sweepBallAgainstRacket } from "./racketCollider.js";
import { AssistMode, BallHitEvent, BallMissEvent, BallSnapshot, BallSpeedPreset, LaunchPreset, RacketCollisionResult } from "./ballTypes.js";

export function shouldEnterContactZone(ball: BallSnapshot, now: number): boolean {
  const timeToContact = ball.contactDeadline - now;
  return !ball.hit && ball.bounceCount === 1 && ball.velocity.z > 0 &&
    timeToContact >= 0 && timeToContact <= BALL_CONFIG.contactZone.maximumTimeToContactMs &&
    ball.position.distanceTo(ball.contactTarget) <= BALL_CONFIG.contactZone.maximumTargetDistance;
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
    contactDeadline: 0
  };
  lastCollision: RacketCollisionResult | null = null;
  lastHit: BallHitEvent | null = null;
  lastMiss: BallMissEvent | null = null;
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
    this.lastCollision = null;
  }

  update(
    deltaSeconds: number,
    now: number,
    colliderWorldMatrix: THREE.Matrix4,
    stroke: StrokeDetectorSnapshot,
    contact: EstimatedRacketContact | null,
    assistMode: AssistMode
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
      } else {
        this.ball.state = "BOUNCED";
        this.ball.velocity.copy(solveVelocity(
          this.ball.position,
          this.ball.contactTarget,
          this.ball.contactTimeAfterBounce
        ));
        this.ball.contactDeadline = now + this.ball.contactTimeAfterBounce * 1000;
      }
    }
    if (shouldEnterContactZone(this.ball, now)) {
      this.ball.state = "CONTACT_ZONE";
    }
    if (!this.ball.hit && this.ball.velocity.z > 0) {
      this.lastCollision = sweepBallAgainstRacket(
        this.ball.previousPosition, this.ball.position, this.ball.physicsRadius, colliderWorldMatrix, assistMode
      );
      this.closestDistance = Math.min(this.closestDistance, this.lastCollision.closestDistance);
      if (this.lastCollision.candidate) this.tryHit(now, stroke, contact);
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

  private tryHit(now: number, stroke: StrokeDetectorSnapshot, contact: EstimatedRacketContact | null): void {
    if (this.ball.hit || !contact || !this.lastCollision) return;
    const contactAge = Math.abs(now - contact.timestamp);
    const validWindow = stroke.currentState === "CONTACT_WINDOW" ||
      contactAge <= BALL_CONFIG.collision.contactEventToleranceMs;
    if (!validWindow || contact.estimatedSpeed < BALL_CONFIG.collision.minimumStrokeSpeed ||
      contact.racketFaceAngle > BALL_CONFIG.collision.maximumFaceAngleRadians) return;
    const response = calculateOutgoingVelocity(contact, this.lastCollision.contactPointLocal);
    const incoming = this.ball.velocity.clone();
    this.ball.velocity.copy(response.velocity);
    this.ball.spinVector.copy(response.spinVector);
    this.ball.angularVelocity.copy(response.spinVector);
    this.ball.spinType = contact.spinType;
    this.ball.spinStrength = response.spinVector.length();
    this.ball.hit = true;
    this.ball.state = "RETURNED";
    const event: BallHitEvent = {
      id: `hit-${this.ball.id}`, ballId: this.ball.id, timestamp: now,
      strokeContactEventId: contact.id, strokeType: contact.strokeType, handedness: contact.handedness,
      backhandStyle: contact.backhandStyle, confidence: contact.confidence, assisted: this.lastCollision.assisted,
      contactPointWorld: this.lastCollision.contactPointWorld.clone(),
      contactPointRacketLocal: this.lastCollision.contactPointLocal.clone(),
      racketQuaternion: contact.racketQuaternion.clone(), racketFaceNormal: contact.racketFaceNormal.clone(),
      incomingVelocity: incoming, outgoingVelocity: response.velocity.clone(), outgoingSpeed: response.speed,
      spinType: contact.spinType, spinVector: response.spinVector.clone(), topspinScore: contact.topspinScore,
      sliceScore: contact.sliceScore, racketFaceAngle: contact.racketFaceAngle
    };
    this.lastHit = event;
    this.finalResultEmitted = true;
    this.onHit?.(event);
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
