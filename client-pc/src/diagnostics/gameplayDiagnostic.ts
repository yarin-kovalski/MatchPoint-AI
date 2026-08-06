export type AttemptType = "forehand" | "backhand";
export type DiagnosticResult = "HIT" | "MISS" | "TIMEOUT" | "RECORDING";
export type RootCause =
  | "BALL_TOO_FAR" | "BALL_TOO_HIGH" | "BALL_TOO_LOW" | "BALL_LEFT_OF_STRINGS"
  | "BALL_RIGHT_OF_STRINGS" | "NO_PLANE_CROSSING" | "STROKE_STAYED_READY"
  | "NO_FORWARD_SWING" | "NO_CONTACT_WINDOW" | "SWING_TOO_SLOW"
  | "CONTACT_TOO_EARLY" | "CONTACT_TOO_LATE" | "INVALID_RACKET_FACE"
  | "WRONG_APPROACH_SIDE" | "PACKET_GAP" | "MULTIPLE_FAILURES"
  | "EXPECTED_FOREHAND_DETECTED_BACKHAND" | "EXPECTED_BACKHAND_DETECTED_FOREHAND"
  | "STROKE_TYPE_UNRESOLVED" | "NONE";

export type GameplayDiagnosticFrame = {
  timestamp: number; deltaTime: number;
  phoneQuaternion: number[]; relativePhoneQuaternion: number[]; racketQuaternion: number[];
  angularVelocity: number[]; angularSpeed: number; acceleration: number[];
  accelerationMagnitude: number; jerk: number;
  strokeState: string; strokeType: string; preparationScore: number; forwardScore: number;
  upwardScore: number; sidewaysScore: number; contactScore: number; strokeConfidence: number;
  estimatedSwingSpeed: number;
  ballState: string; ballPosition: number[]; previousBallPosition: number[]; ballVelocity: number[];
  bounceCount: number; stringBedCenterWorld: number[]; stringBedQuaternion: number[];
  racketFaceNormal: number[]; ballPositionRacketLocal: number[];
  planeDistance: number; segmentPlaneCrossed: boolean; insideEllipse: boolean;
  insideWidth: boolean; insideHeight: boolean; approachingCorrectFace: boolean;
  contactWindowActive: boolean; recentContactEvent: boolean; contactEventAgeMs: number | null;
  minimumStrokeSpeed: number; swingSpeedPassed: boolean; racketFaceAngle: number;
  racketFaceAnglePassed: boolean; ballNearTarget: boolean; ballNearStringBed: boolean;
  easySwingIntentActive?: boolean; easySwingIntentConfidence?: number;
  minimumSweptDistance?: number; sweptPlaneCrossed?: boolean; sweptInsideEllipse?: boolean;
  expectedStrokeType?: string; detectedStrokeType?: string; resolvedHitStrokeType?: string;
  strokeTypeMismatch?: string;
  calibrationProfile?: unknown;
  expectedContactPoint?: number[]; actualClosestPoint?: number[]; contactPointMissVector?: number[];
  expectedApexPoint?: number[]; actualApexPoint?: number[];
  expectedBouncePoint?: number[]; actualBouncePoint?: number[];
  expectedSide?: string; actualSide?: string; trajectoryDeviation?: number;
  calibrationProfileVersion?: number;
  finalHitAccepted: boolean; rejectionReason: string; sensorValid: boolean;
};

export type GameplayDiagnosticRecording = {
  version: 1; attemptType: AttemptType; createdAt: number; result: DiagnosticResult;
  frames: GameplayDiagnosticFrame[]; finalReason: string;
};

export type DiagnosticAnalysis = {
  result: DiagnosticResult; firstBounceTime: number | null; closestApproachDistance: number;
  closestApproachTime: number | null; ballLocalAtClosestApproach: number[];
  planeCrossed: boolean; planeCrossingTime: number | null; insideEllipse: boolean;
  strokeReachedForwardSwing: boolean; strokeReachedContactWindow: boolean;
  contactWindowInterval: [number, number] | null; peakSwingSpeed: number;
  peakSwingSpeedTime: number | null; minimumRequiredSwingSpeed: number;
  contactEventAgeAtClosestApproach: number | null; racketFaceAngleAtClosestApproach: number;
  failedConditions: string[]; primaryRootCause: RootCause;
};

export class GameplayDiagnosticRecorder {
  private active: GameplayDiagnosticRecording | null = null;
  private last: GameplayDiagnosticRecording | null = null;
  start(attemptType: AttemptType, createdAt: number): void {
    this.active = { version: 1, attemptType, createdAt, result: "RECORDING", frames: [], finalReason: "" };
  }
  capture(frame: GameplayDiagnosticFrame): void {
    if (!this.active) return;
    const previous = this.active.frames.at(-1);
    if (previous && frame.timestamp <= previous.timestamp) return;
    this.active.frames.push(frame);
  }
  stop(result: Exclude<DiagnosticResult, "RECORDING">, reason: string): GameplayDiagnosticRecording | null {
    if (!this.active) return this.last;
    this.active.result = result; this.active.finalReason = reason; this.last = this.active; this.active = null;
    return this.last;
  }
  isRecording(): boolean { return this.active !== null; }
  getLast(): GameplayDiagnosticRecording | null { return this.last; }
}

export function analyzeGameplayDiagnostic(recording: GameplayDiagnosticRecording): DiagnosticAnalysis {
  const frames = recording.frames;
  const closest = frames.reduce<GameplayDiagnosticFrame | null>((best, frame) => !best || distance(frame.ballPosition, frame.stringBedCenterWorld) < distance(best.ballPosition, best.stringBedCenterWorld) ? frame : best, null);
  const crossing = frames.find(frame => frame.segmentPlaneCrossed) ?? null;
  const peak = frames.reduce<GameplayDiagnosticFrame | null>((best, frame) => !best || frame.estimatedSwingSpeed > best.estimatedSwingSpeed ? frame : best, null);
  const contactFrames = frames.filter(frame => frame.contactWindowActive);
  const failed: RootCause[] = [];
  const accepted = frames.find(frame => frame.finalHitAccepted);
  if (accepted?.strokeTypeMismatch && accepted.strokeTypeMismatch !== "NONE") {
    failed.push(accepted.strokeTypeMismatch as RootCause);
  }
  if (frames.some(frame => !frame.sensorValid)) failed.push("PACKET_GAP");
  if (closest) {
    const local = closest.ballPositionRacketLocal;
    if (distance(closest.ballPosition, closest.stringBedCenterWorld) > 0.35) failed.push("BALL_TOO_FAR");
    if (local[1] > 68) failed.push("BALL_TOO_HIGH"); else if (local[1] < -68) failed.push("BALL_TOO_LOW");
    if (local[0] > 51) failed.push("BALL_RIGHT_OF_STRINGS"); else if (local[0] < -51) failed.push("BALL_LEFT_OF_STRINGS");
    if (!closest.racketFaceAnglePassed) failed.push("INVALID_RACKET_FACE");
    if (!closest.approachingCorrectFace) failed.push("WRONG_APPROACH_SIDE");
    if (closest.contactEventAgeMs !== null && closest.contactEventAgeMs > 250) failed.push("CONTACT_TOO_EARLY");
    if (closest.contactEventAgeMs !== null && closest.contactEventAgeMs < -250) failed.push("CONTACT_TOO_LATE");
  }
  if (!crossing) failed.push("NO_PLANE_CROSSING");
  if (frames.every(frame => frame.strokeState === "READY")) failed.push("STROKE_STAYED_READY");
  if (!frames.some(frame => frame.strokeState === "FORWARD_SWING" || frame.forwardScore >= 0.2)) failed.push("NO_FORWARD_SWING");
  if (contactFrames.length === 0) failed.push("NO_CONTACT_WINDOW");
  if (peak && peak.estimatedSwingSpeed < peak.minimumStrokeSpeed) failed.push("SWING_TOO_SLOW");
  const unique = [...new Set(failed)];
  const priority: RootCause[] = [
    "PACKET_GAP", "EXPECTED_FOREHAND_DETECTED_BACKHAND", "EXPECTED_BACKHAND_DETECTED_FOREHAND",
    "STROKE_TYPE_UNRESOLVED", "STROKE_STAYED_READY", "SWING_TOO_SLOW", "NO_FORWARD_SWING",
    "INVALID_RACKET_FACE", "WRONG_APPROACH_SIDE", "BALL_TOO_FAR", "BALL_TOO_HIGH",
    "BALL_TOO_LOW", "BALL_LEFT_OF_STRINGS", "BALL_RIGHT_OF_STRINGS",
    "NO_PLANE_CROSSING", "NO_CONTACT_WINDOW", "CONTACT_TOO_EARLY", "CONTACT_TOO_LATE"
  ];
  const primary: RootCause = recording.result === "HIT"
    ? "NONE"
    : priority.find(cause => unique.includes(cause)) ?? classifyFinalReason(recording.finalReason);
  return {
    result: recording.result,
    firstBounceTime: frames.find(frame => frame.bounceCount >= 1)?.timestamp ?? null,
    closestApproachDistance: closest ? distance(closest.ballPosition, closest.stringBedCenterWorld) : Number.POSITIVE_INFINITY,
    closestApproachTime: closest?.timestamp ?? null, ballLocalAtClosestApproach: closest?.ballPositionRacketLocal ?? [],
    planeCrossed: !!crossing, planeCrossingTime: crossing?.timestamp ?? null,
    insideEllipse: closest?.insideEllipse ?? false,
    strokeReachedForwardSwing: frames.some(frame => frame.strokeState === "FORWARD_SWING"),
    strokeReachedContactWindow: contactFrames.length > 0,
    contactWindowInterval: contactFrames.length ? [contactFrames[0].timestamp, contactFrames.at(-1)!.timestamp] : null,
    peakSwingSpeed: peak?.estimatedSwingSpeed ?? 0, peakSwingSpeedTime: peak?.timestamp ?? null,
    minimumRequiredSwingSpeed: closest?.minimumStrokeSpeed ?? peak?.minimumStrokeSpeed ?? 0,
    contactEventAgeAtClosestApproach: closest?.contactEventAgeMs ?? null,
    racketFaceAngleAtClosestApproach: closest?.racketFaceAngle ?? 0,
    failedConditions: unique, primaryRootCause: primary
  };
}

export function diagnosticMarkdown(recording: GameplayDiagnosticRecording, analysis: DiagnosticAnalysis): string {
  return `# Latest Hit Attempt\n\n- Attempt: ${recording.attemptType}\n- Result: ${analysis.result}\n- First bounce: ${analysis.firstBounceTime ?? "none"}\n- Closest approach: ${analysis.closestApproachDistance.toFixed(3)} m at ${analysis.closestApproachTime ?? "none"}\n- Local ball: [${analysis.ballLocalAtClosestApproach.join(", ")}]\n- Peak swing speed: ${analysis.peakSwingSpeed.toFixed(2)}\n- States: ${[...new Set(recording.frames.map(frame => frame.strokeState))].join(" -> ")}\n- Contact age: ${analysis.contactEventAgeAtClosestApproach ?? "none"} ms\n- Failed conditions: ${analysis.failedConditions.join(", ") || "none"}\n- Primary root cause: ${analysis.primaryRootCause}\n\n## Recommended Correction\n\n${recommendation(analysis.primaryRootCause)}\n`;
}

function distance(a: number[], b: number[]): number { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function classifyFinalReason(reason: string): RootCause {
  if (reason.includes("slow")) return "SWING_TOO_SLOW";
  if (reason.includes("no stroke")) return "STROKE_STAYED_READY";
  if (reason.includes("early")) return "CONTACT_TOO_EARLY";
  if (reason.includes("late")) return "CONTACT_TOO_LATE";
  return "MULTIPLE_FAILURES";
}
function recommendation(cause: RootCause): string {
  const recommendations: Partial<Record<RootCause, string>> = {
    BALL_TOO_FAR: "Adjust trajectory target only.", STROKE_STAYED_READY: "Tune stroke-state thresholds only.",
    NO_CONTACT_WINDOW: "Tune contact-window timing only.", SWING_TOO_SLOW: "Compare the measured peak and lower only the Easy speed threshold.",
    CONTACT_TOO_EARLY: "Shift contact timing later.", CONTACT_TOO_LATE: "Shift contact timing earlier.",
    WRONG_APPROACH_SIDE: "Fix racket face-side logic only."
  };
  return recommendations[cause] ?? "Inspect the ranked failed conditions before changing gameplay values.";
}
