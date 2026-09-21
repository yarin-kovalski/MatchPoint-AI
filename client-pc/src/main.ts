import * as THREE from "three";
import { TennisSoundEngine } from "./audio/tennisSounds.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BallController } from "./ball/BallController.js";
import { BALL_CONFIG } from "./ball/ballConfig.js";
import { getBallDeliveryTarget, getExpectedRacketContactTransform, projectPixelDiameter } from "./ball/ballDelivery.js";
import { AssistMode, BallHitEvent, BallMissEvent, BallSpeedPreset, EasyHitMotion, isBackhandPreset, LaunchPreset, PlayerAssistLevel } from "./ball/ballTypes.js";
import {
  CalibrationStrokeType, createDefaultTrajectoryProfile, loadTrajectoryProfile,
  resetTrajectoryProfile, saveTrajectoryProfile, setProfileArcHeight, solveTrajectoryProfile,
  synchronizeProfileApexFromTiming, TrajectoryCalibrationProfile, worldToPlayerLocal
} from "./ball/trajectoryCalibration.js";
import { createProceduralTennisBallTexture, integrateBallRotation } from "./ball/ballVisuals.js";
import { createPlayableStrokePlan } from "./ball/playableCalibratedHit.js";
import type { PlayableFailureReason } from "./ball/playableCalibratedHit.js";
import {
  loadTrajectoryProfileWithPriority, markTrajectoryProfileAsUser,
  restoreValidatedTrajectoryPreset, TrajectoryProfileSource, VALIDATED_TRAJECTORY_PRESET
} from "./ball/validatedTrajectoryPreset.js";
import { canLaunchPracticeFeed, FeedVariationLevel, FeedVariationResult, generateSafeFeedVariation } from "./ball/feedVariation.js";
import { createArchetypeFeed, FeedArchetype, FeedStyle, resolveFeedStyle } from "./ball/feedArchetypes.js";
import { solveSpinFlight } from "./ball/spinFlight.js";
import type { ReturnResult } from "./ball/courtRules.js";
import type { PhysicalImpactResolution } from "./ball/contactRealism.js";
import {
  configureAuthenticRenderer, createAuthenticCourt, createAuthenticTennisNet, createCourtBackdrop,
  updateCourtBackdrop,
  createFeedOriginMarker
} from "./scene/tennisEnvironment.js";
import {
  createTrainingComfortProfile, isInsideTrainingStrikeZone, PLAYER_BASELINE_OFFSET_Z,
  positionValidatedProfileAtBaseline, TRAINING_BACKHAND_STRIKE_ZONE_RADII, TRAINING_STRIKE_ZONE_RADII
} from "./ball/courtPositioning.js";
import {
  applyContactPositionCalibration, ContactPositionCalibration, loadContactPositionCalibration
} from "./ball/contactPositionCalibration.js";
import {
  classifyCalibratedSlice, loadSliceCalibration, SliceCalibrationData
} from "./ball/sliceShotCalibration.js";
import { BALL_CAMERA_BASE_TARGET, BallFlightCameraState, updateBallFlightCamera } from "./scene/ballFlightCamera.js";
import { assertBallVisualState } from "./ball/ballVisualState.js";
import { sampleBallVisualPosition } from "./ball/fixedStepBallPhysics.js";
import { addPremiumEnvironment, courtPixelRatio, createMicroTexture, createSoftContactShadowTexture, finishPremiumRacket, updatePremiumEnvironment } from "./scene/premiumVisuals.js";
import { analyzeGameplayDiagnostic, AttemptType, diagnosticMarkdown, GameplayDiagnosticFrame, GameplayDiagnosticRecorder } from "./diagnostics/gameplayDiagnostic.js";
import { MOTION_CONFIG } from "./motion/motionConfig.js";
import { FrameTelemetry } from "./diagnostics/frameTelemetry.js";
import { RacketStallTelemetry } from "./diagnostics/racketStallTelemetry.js";
import {
  classifyTrainingMiss, emptyTrainingMissBreakdown, TrainingMissReason
} from "./diagnostics/trainingMissDiagnostics.js";
import { TrainingSessionCalibration } from "./diagnostics/trainingSessionCalibration.js";
import {
  calculateTrainingTargetAccuracy, classifyTrainingTiming, DetectedTrainingStroke,
  GameSessionResult, isSuccessfulTrainingReturn, SmartTrainingSession, TrainingSessionReport,
  TrainingStrokeDetection, TrainingStrokeEvidence
} from "./diagnostics/smartTrainingSession.js";
import { createShotTechnique, emptyFollowThrough, FollowThroughAnalyzer } from "./diagnostics/strokeTechniqueAnalysis.js";
import type { ShotTechnique } from "./diagnostics/strokeTechniqueAnalysis.js";
import { createTrainingReportHtml } from "./diagnostics/trainingReportExport.js";
import { createCourtMapSvg } from "./diagnostics/courtVision.js";
import {
  createGameTargetLayouts, GameTarget, scoreGameBounce
} from "./game/targetGame.js";
import { adaptiveVisualSmoothingFactor, SensorResampler, updateVisualRacketQuaternion } from "./motion/sensorResampler.js";
import { ForwardSwingFusion } from "./motion/forwardSwingFusion.js";
import { stabilizeTrainingRacketOrigin } from "./motion/racketOriginStability.js";
import { isFiniteQuaternion } from "./motion/motionFiltering.js";
import {
  NormalizedSensorFrame,
  SensorNormalizer, phoneVectorToThreeVector
} from "./motion/sensorNormalization.js";
import { STROKE_CONFIG } from "./strokeDetection/strokeConfig.js";
import {
  deserializeFrame,
  MotionRecorder,
  RecordingLabel
} from "./strokeDetection/motionRecorder.js";
import { StrokeStateMachine } from "./strokeDetection/strokeStateMachine.js";
import { detectedEasySwingSide, EasySwingIntentDetector, EasySwingIntentSnapshot } from "./strokeDetection/easySwingIntent.js";
import { ContactFeatureSnapshot, featureSnapshotFromImpact } from "./strokeDetection/strokeFidelity.js";
import {
  BackhandStyle,
  EstimatedRacketContact,
  Handedness,
  StrokeDetectorSnapshot
} from "./strokeDetection/strokeTypes.js";

type BrokerStatus = {
  mobileClients: number;
  pcClients: number;
  hasMotionPacket: boolean;
  t: number;
};

type BrokeredMotionPacket = {
  t: number;
  sequence: number;
  serverReceivedAt: number;
  source: "mobile";
  inputMode?: "sensor" | "simulator";
  orientation: {
    alpha: number | null;
    beta: number | null;
    gamma: number | null;
  };
  acceleration: {
    x: number | null;
    y: number | null;
    z: number | null;
  };
  accelerationIncludingGravity: {
    x: number | null;
    y: number | null;
    z: number | null;
  };
  rotationRate: {
    alpha: number | null;
    beta: number | null;
    gamma: number | null;
  };
  interval: number | null;
};

type StrokeType = "forehand" | "backhand" | "Forehand" | "Backhand" | "unknown";

type BrokeredContinuousOrientationPacket = {
  angularVelocityRadPerSecond?: { x: number; y: number; z: number } | null;
  t: number;
  sensorTimestamp: number;
  source: "expo-mobile";
  serverReceivedAt: number;
  rotation: {
    x: number | null;
    y: number | null;
    z: number | null;
  };
  quaternion: {
    x: number;
    y: number;
    z: number;
    w: number;
  };
  rotationRate: {
    alpha: number | null;
    beta: number | null;
    gamma: number | null;
  };
  gyro: {
    x: number | null;
    y: number | null;
    z: number | null;
  };
  acceleration: {
    x: number | null;
    y: number | null;
    z: number | null;
  } | null;
  accelerationIncludingGravity: {
    x: number | null;
    y: number | null;
    z: number | null;
  };
  screenOrientation: 0 | 90 | 180 | -90;
  intervalMs: number;
};

type BrokeredStrokeDetectedPacket = {
  t: number;
  strokeType?: StrokeType;
  type?: StrokeType;
  source: "mobile" | "expo-mobile";
  accelerationX?: number;
  peakAcceleration?: number;
  serverReceivedAt: number;
};

type BrokeredCalibrationPacket = {
  t: number;
  source: "expo-mobile";
  serverReceivedAt: number;
  rotation: {
    x: number;
    y: number;
    z: number;
  };
  quaternion: {
    x: number;
    y: number;
    z: number;
    w: number;
  };
};

type SocketLike = {
  connected: boolean;
  emit(eventName: string, payload: unknown): void;
  on(eventName: string, handler: (...args: unknown[]) => void): void;
};

type SocketFactory = () => SocketLike;

declare const io: SocketFactory;

const socket = io();
const canvas = getElement<HTMLCanvasElement>("sceneCanvas");
const visualizationPanel = getElement<HTMLElement>("visualizationPanel");

const DIAGNOSTIC_ELEMENT_IDS = [
  "recordForehandAttempt",
  "recordBackhandAttempt",
  "analyzeLastAttempt",
  "replayLastDiagnostic",
  "downloadLastDiagnostic",
  "diagnosticStatus",
  "diagnosticResult",
  "diagnosticTimeline"
] as const;

assertDiagnosticElements();

const elements = {
  developerPanel: document.querySelector<HTMLDetailsElement>(".developer-panel")!,
  connectionStatus: getElement("connectionStatus"),
  packetCount: getElement("packetCount"),
  packetAge: getElement("packetAge"),
  inputMode: getElement("inputMode"),
  mobileClients: getElement("mobileClients"),
  swingSpeed: getElement("swingSpeed"),
  peakSwingSpeed: getElement("peakSwingSpeed"),
  rotationX: getElement("rotationX"),
  rotationY: getElement("rotationY"),
  calibrationOverlay: getElement("calibrationOverlay"),
  calibrationTitle: getElement("calibrationTitle"),
  calibrationInstructions: getElement("calibrationInstructions"),
  calibrationSummary: getElement("calibrationSummary"),
  calibrateButton: getElement<HTMLButtonElement>("calibrateButton"),
  orientationDebug: getElement<HTMLDetailsElement>("orientationDebug"),
  debugSource: getElement("debugSource"),
  debugCalibration: getElement("debugCalibration"),
  debugRawQuaternion: getElement("debugRawQuaternion"),
  debugConvertedQuaternion: getElement("debugConvertedQuaternion"),
  debugNeutralQuaternion: getElement("debugNeutralQuaternion"),
  debugRelativeQuaternion: getElement("debugRelativeQuaternion"),
  debugFinalQuaternion: getElement("debugFinalQuaternion"),
  debugAngularSpeed: getElement("debugAngularSpeed"),
  debugAcceleration: getElement("debugAcceleration"),
  debugJerk: getElement("debugJerk"),
  debugMotionScores: getElement("debugMotionScores"),
  debugRacketBasis: getElement("debugRacketBasis"),
  debugFaceAngle: getElement("debugFaceAngle"),
  debugSensorValidity: getElement("debugSensorValidity"),
  strokeState: getElement("strokeState"),
  strokeType: getElement("strokeType"),
  strokeConfidence: getElement("strokeConfidence"),
  spinStatus: getElement("spinStatus"),
  lastContact: getElement("lastContact"),
  handednessSelect: getElement<HTMLSelectElement>("handednessSelect"),
  backhandStyleSelect: getElement<HTMLSelectElement>("backhandStyleSelect"),
  recordingLabelSelect: getElement<HTMLSelectElement>("recordingLabelSelect"),
  startRecordingButton: getElement<HTMLButtonElement>("startRecordingButton"),
  stopRecordingButton: getElement<HTMLButtonElement>("stopRecordingButton"),
  downloadRecordingButton: getElement<HTMLButtonElement>("downloadRecordingButton"),
  replayRecordingButton: getElement<HTMLButtonElement>("replayRecordingButton"),
  stopReplayButton: getElement<HTMLButtonElement>("stopReplayButton"),
  debugStrokeState: getElement("debugStrokeState"),
  debugPlayerSetup: getElement("debugPlayerSetup"),
  debugCandidates: getElement("debugCandidates"),
  debugStrokeScores: getElement("debugStrokeScores"),
  debugStateDuration: getElement("debugStateDuration"),
  debugPreparationDuration: getElement("debugPreparationDuration"),
  debugSpinScores: getElement("debugSpinScores"),
  debugStrokeRejection: getElement("debugStrokeRejection"),
  debugLastStroke: getElement("debugLastStroke"),
  debugLastContactTimestamp: getElement("debugLastContactTimestamp"),
  launchForehandBall: getElement<HTMLButtonElement>("launchForehandBall"),
  playCalibratedForehand: getElement<HTMLButtonElement>("playCalibratedForehand"),
  playCalibratedBackhand: getElement<HTMLButtonElement>("playCalibratedBackhand"),
  playableCalibratedHitToggle: getElement<HTMLInputElement>("playableCalibratedHitToggle"),
  calibratedPracticeLoopToggle: getElement<HTMLInputElement>("calibratedPracticeLoopToggle"),
  playSingleShot: getElement<HTMLButtonElement>("playSingleShot"),
  playableCountdown: getElement("playableCountdown"),
  playableWindowStatus: getElement("playableWindowStatus"),
  playableExpectedStroke: getElement("playableExpectedStroke"),
  playableDetectedStroke: getElement("playableDetectedStroke"),
  playableResolvedStroke: getElement("playableResolvedStroke"),
  playableCorrection: getElement("playableCorrection"),
  practiceAttempts: getElement("practiceAttempts"),
  practiceHits: getElement("practiceHits"),
  practiceMisses: getElement("practiceMisses"),
  practicePercentage: getElement("practicePercentage"),
  practiceStatus: getElement("practiceStatus"),
  stopPractice: getElement<HTMLButtonElement>("stopPractice"),
  practiceLoopMode: getElement<HTMLSelectElement>("practiceLoopMode"),
  feedVariationLevel: getElement<HTMLSelectElement>("feedVariationLevel"),
  playerAssistLevel: getElement<HTMLSelectElement>("playerAssistLevel"),
  windControl: getElement<HTMLDetailsElement>("windControl"),
  windButtonState: getElement("windButtonState"),
  windStrength: getElement<HTMLSelectElement>("windStrength"),
  windDirection: getElement<HTMLSelectElement>("windDirection"),
  windSoundMuted: getElement<HTMLInputElement>("windSoundMuted"),
  windReadout: getElement("windReadout"),
  conePracticePicker: getElement<HTMLFieldSetElement>("conePracticePicker"),
  modeDescription: getElement("modeDescription"),
  feedSeed: getElement<HTMLInputElement>("feedSeed"),
  feedVariationDebug: getElement("feedVariationDebug"),
  playerShotSpeed: getElement("playerShotSpeed"),
  playerSpinType: getElement("playerSpinType"),
  playerSpinAmount: getElement("playerSpinAmount"),
  playerPowerLevel: getElement("playerPowerLevel"),
  playerLaunchTendency: getElement("playerLaunchTendency"),
  playerContactQuality: getElement("playerContactQuality"),
  trainerSessionState: getElement("trainerSessionState"),
  trainerShotStyle: getElement("trainerShotStyle"),
  trainerShotStyleReason: getElement("trainerShotStyleReason"),
  trainerDetectedStroke: getElement("trainerDetectedStroke"),
  trainerSwingSpeed: getElement("trainerSwingSpeed"),
  trainerTiming: getElement("trainerTiming"),
  trainerAccuracy: getElement("trainerAccuracy"),
  trainerSpinLevel: getElement("trainerSpinLevel"),
  trainerSpinDetail: getElement("trainerSpinDetail"),
  trainerSpinMeter: getElement("trainerSpinMeter"),
  trainerBrushPath: getElement("trainerBrushPath"),
  trainerFaceDetail: getElement("trainerFaceDetail"),
  trainerFaceMeter: getElement("trainerFaceMeter"),
  trainerShotArc: getElement("trainerShotArc"),
  trainerArcDetail: getElement("trainerArcDetail"),
  trainerArcMeter: getElement("trainerArcMeter"),
  trainerFollowThrough: getElement("trainerFollowThrough"),
  trainerFinishDetail: getElement("trainerFinishDetail"),
  trainerFinishMeter: getElement("trainerFinishMeter"),
  trainerHitRatio: getElement("trainerHitRatio"),
  trainerStrokeCounts: getElement("trainerStrokeCounts"),
  trainerAverageSpeed: getElement("trainerAverageSpeed"),
  trainerBestStreak: getElement("trainerBestStreak"),
  trainerTechniqueSummary: getElement("trainerTechniqueSummary"),
  smartTrainer: getElement<HTMLElement>("smartTrainer"),
  finishTrainingSession: getElement<HTMLButtonElement>("finishTrainingSession"),
  newTrainingSession: getElement<HTMLButtonElement>("newTrainingSession"),
  downloadTrainingReport: getElement<HTMLButtonElement>("downloadTrainingReport"),
  closeSessionReport: getElement<HTMLButtonElement>("closeSessionReport"),
  trainingReportPlayerName: getElement<HTMLInputElement>("trainingReportPlayerName"),
  trainingReportPlayerFeedback: getElement<HTMLTextAreaElement>("trainingReportPlayerFeedback"),
  courtVision: getElement<HTMLElement>("courtVision"),
  courtVisionMap: getElement("courtVisionMap"),
  courtVisionResult: getElement("courtVisionResult"),
  trainingSessionReport: getElement("trainingSessionReport"),
  trainerImprovement: getElement("trainerImprovement"),
  trainerReportSummary: getElement("trainerReportSummary"),
  trainerReportBreakdown: getElement("trainerReportBreakdown"),
  trainerFeedbackList: getElement("trainerFeedbackList"),
  contactPhysicsDebug: getElement("contactPhysicsDebug"),
  ballVisualInvariant: getElement("ballVisualInvariant"),
  performanceTelemetry: getElement("performanceTelemetry"),
  racketStallTelemetry: getElement("racketStallTelemetry"),
  strokeExampleLabel: getElement<HTMLSelectElement>("strokeExampleLabel"),
  recordStrokeExample: getElement<HTMLButtonElement>("recordStrokeExample"),
  analyzeStrokeExamples: getElement<HTMLButtonElement>("analyzeStrokeExamples"),
  strokeExampleAnalysis: getElement("strokeExampleAnalysis"),
  playableProfileDetails: getElement("playableProfileDetails"),
  launchBackhandBall: getElement<HTMLButtonElement>("launchBackhandBall"),
  guaranteedForehandFeed: getElement<HTMLButtonElement>("guaranteedForehandFeed"),
  guaranteedBackhandFeed: getElement<HTMLButtonElement>("guaranteedBackhandFeed"),
  resetBall: getElement<HTMLButtonElement>("resetBall"),
  assistModeSelect: getElement<HTMLSelectElement>("assistModeSelect"),
  ballSpeedSelect: getElement<HTMLSelectElement>("ballSpeedSelect"),
  autoRelaunchToggle: getElement<HTMLInputElement>("autoRelaunchToggle"),
  ballDebugToggle: getElement<HTMLInputElement>("ballDebugToggle"),
  ballState: getElement("ballState"),
  ballResult: getElement("ballResult"),
  incomingBallSpeed: getElement("incomingBallSpeed"),
  outgoingBallSpeed: getElement("outgoingBallSpeed"),
  ballSpin: getElement("ballSpin"),
  ballBounces: getElement("ballBounces"),
  debugBallMotion: getElement("debugBallMotion"),
  debugBallCollision: getElement("debugBallCollision"),
  debugBallValidity: getElement("debugBallValidity"),
  hitDebugPanel: getElement("hitDebugPanel"),
  recordForehandAttempt: getElement<HTMLButtonElement>("recordForehandAttempt"),
  recordBackhandAttempt: getElement<HTMLButtonElement>("recordBackhandAttempt"),
  downloadLastDiagnostic: getElement<HTMLButtonElement>("downloadLastDiagnostic"),
  replayLastDiagnostic: getElement<HTMLButtonElement>("replayLastDiagnostic"),
  analyzeLastAttempt: getElement<HTMLButtonElement>("analyzeLastAttempt"),
  diagnosticStatus: getElement("diagnosticStatus"),
  diagnosticResult: getElement("diagnosticResult"),
  diagnosticTimeline: getElement("diagnosticTimeline"),
  debugBallResult: getElement("debugBallResult"),
  ballVisualSizeSelect: getElement<HTMLSelectElement>("ballVisualSizeSelect"),
  ballVisualScaleInput: getElement<HTMLInputElement>("ballVisualScaleInput"),
  forehandSidePreset: getElement<HTMLSelectElement>("forehandSidePreset"),
  backhandSidePreset: getElement<HTMLSelectElement>("backhandSidePreset"),
  contactHeightPreset: getElement<HTMLSelectElement>("contactHeightPreset"),
  contactDepthInput: getElement<HTMLInputElement>("contactDepthInput"),
  showContactTargetToggle: getElement<HTMLInputElement>("showContactTargetToggle"),
  showTrajectoryToggle: getElement<HTMLInputElement>("showTrajectoryToggle"),
  showStringCenterToggle: getElement<HTMLInputElement>("showStringCenterToggle"),
  showBallAtContact: getElement<HTMLButtonElement>("showBallAtContact"),
  launchGuaranteedEasyHit: getElement<HTMLButtonElement>("launchGuaranteedEasyHit"),
  resetBallVisualSettings: getElement<HTMLButtonElement>("resetBallVisualSettings"),
  calibrateForehandTrajectory: getElement<HTMLButtonElement>("calibrateForehandTrajectory"),
  calibrateBackhandTrajectory: getElement<HTMLButtonElement>("calibrateBackhandTrajectory"),
  captureForehandContact: getElement<HTMLButtonElement>("captureForehandContact"),
  captureBackhandContact: getElement<HTMLButtonElement>("captureBackhandContact"),
  saveForehandTrajectory: getElement<HTMLButtonElement>("saveForehandTrajectory"),
  saveBackhandTrajectory: getElement<HTMLButtonElement>("saveBackhandTrajectory"),
  resetForehandTrajectory: getElement<HTMLButtonElement>("resetForehandTrajectory"),
  resetBackhandTrajectory: getElement<HTMLButtonElement>("resetBackhandTrajectory"),
  previewCalibratedFeed: getElement<HTMLButtonElement>("previewCalibratedFeed"),
  useCalibratedFeeds: getElement<HTMLInputElement>("useCalibratedFeeds"),
  forehandCalibrationStatus: getElement("forehandCalibrationStatus"),
  backhandCalibrationStatus: getElement("backhandCalibrationStatus"),
  forehandProfileSource: getElement("forehandProfileSource"),
  backhandProfileSource: getElement("backhandProfileSource"),
  exportValidatedCalibration: getElement<HTMLButtonElement>("exportValidatedCalibration"),
  restoreValidatedPreset: getElement<HTMLButtonElement>("restoreValidatedPreset"),
  trajectoryCalibrationMessage: getElement("trajectoryCalibrationMessage"),
  trajectoryTimingStatus: getElement("trajectoryTimingStatus"),
  trajectoryViewValidation: getElement("trajectoryViewValidation"),
  trajectorySideView: getElement<HTMLButtonElement>("trajectorySideView"),
  trajectoryTopView: getElement<HTMLButtonElement>("trajectoryTopView"),
  trajectoryPlayerView: getElement<HTMLButtonElement>("trajectoryPlayerView"),
  trajectoryBounceX: getElement<HTMLInputElement>("trajectoryBounceX"),
  trajectoryBounceZ: getElement<HTMLInputElement>("trajectoryBounceZ"),
  trajectoryBounceHeight: getElement<HTMLInputElement>("trajectoryBounceHeight"),
  trajectoryApexHeight: getElement<HTMLInputElement>("trajectoryApexHeight"),
  trajectoryContactHeight: getElement<HTMLInputElement>("trajectoryContactHeight"),
  trajectoryBounceToApex: getElement<HTMLInputElement>("trajectoryBounceToApex"),
  trajectoryBounceToContact: getElement<HTMLInputElement>("trajectoryBounceToContact"),
  trajectoryOverallSpeed: getElement<HTMLInputElement>("trajectoryOverallSpeed"),
  trajectoryBounceXValue: getElement<HTMLOutputElement>("trajectoryBounceXValue"),
  trajectoryBounceZValue: getElement<HTMLOutputElement>("trajectoryBounceZValue"),
  trajectoryBounceHeightValue: getElement<HTMLOutputElement>("trajectoryBounceHeightValue"),
  trajectoryApexHeightValue: getElement<HTMLOutputElement>("trajectoryApexHeightValue"),
  trajectoryContactHeightValue: getElement<HTMLOutputElement>("trajectoryContactHeightValue"),
  trajectoryBounceToApexValue: getElement<HTMLOutputElement>("trajectoryBounceToApexValue"),
  trajectoryBounceToContactValue: getElement<HTMLOutputElement>("trajectoryBounceToContactValue"),
  trajectoryOverallSpeedValue: getElement<HTMLOutputElement>("trajectoryOverallSpeedValue"),
  debugBallScale: getElement("debugBallScale"),
  debugDeliveryTarget: getElement("debugDeliveryTarget"),
  debugStrokeTimeline: getElement("debugStrokeTimeline")
};

// Keep Motion Analysis in the court overlay layer so modal and HUD ordering is predictable.
visualizationPanel.append(elements.smartTrainer);
elements.courtVisionMap.innerHTML = createCourtMapSvg([], "Court vision awaiting the first bounce");

let packetCount = 0;
const frameTelemetry = new FrameTelemetry();
const racketStallTelemetry = new RacketStallTelemetry();
let latestPacket: BrokeredMotionPacket | null = null;
let previousPacket: BrokeredMotionPacket | null = null;
let latestOrientationPacket: BrokeredContinuousOrientationPacket | null = null;
let latestSensorFrame: NormalizedSensorFrame | null = null;
let latestValidSensorFrame: NormalizedSensorFrame | null = null;
let latestVisualPoseValid = false;
let latestStrokeSnapshot: StrokeDetectorSnapshot | null = null;
let lastContactEvent: EstimatedRacketContact | null = null;
let targetRotationX = 0;
let targetRotationY = 0;
let targetRotationZ = 0;
let displayedSwingSpeedKmh = 0;
const initialForehandProfile = loadTrajectoryProfileWithPriority(localStorage, "forehand");
const initialBackhandProfile = loadTrajectoryProfileWithPriority(localStorage, "backhand");
let trajectoryProfiles: Record<CalibrationStrokeType, TrajectoryCalibrationProfile | null> = {
  forehand: initialForehandProfile.profile, backhand: initialBackhandProfile.profile
};
let trajectoryProfileSources: Record<CalibrationStrokeType, TrajectoryProfileSource> = {
  forehand: initialForehandProfile.source, backhand: initialBackhandProfile.source
};
let editingTrajectory: TrajectoryCalibrationProfile | null = null;
let editingTrajectoryType: CalibrationStrokeType = "forehand";
let previewTrajectoryActive = false;
const observedIncomingApex = new THREE.Vector3();
const observedBouncePoint = new THREE.Vector3();
let targetSwingSpeedKmh = 0;
let peakSwingSpeedKmh = 0;
let isCalibrated = false;
let calibrationRequested = false;
let hasCalibrationBaseline = false;
let alignmentStableSince: number | null = null;
let activeStroke: { type: StrokeType; startedAt: number; durationMs: number } | null = null;
let replayActive = false;
let replayTimer: number | null = null;
let contactFlashUntil = 0;
let assistMode: AssistMode = "easy";
let playerAssistLevel: PlayerAssistLevel = "training";
let playerMode: "training" | "game" = "training";
type WindStrength = "off" | "light" | "medium" | "strong";
type WindDirection = "left" | "right" | "headwind" | "tailwind" | "leftHead" | "rightHead" | "leftTail" | "rightTail";
let windStrength: WindStrength = "off";
let windDirection: WindDirection = "left";
const windAcceleration = new THREE.Vector3();
const sessionWindConditions = new Set<string>();
type ConePracticeFocus = "deep" | "regular" | "short";
let conePracticeFocus: ConePracticeFocus = "regular";
let conePracticeChosen = false;
const sessionConePracticeFocuses = new Set<ConePracticeFocus>();
const gameTargetLayouts = createGameTargetLayouts(BALL_CONFIG.launch.netDepth);
let activeGameTargets: GameTarget[] = [];
let gameLayoutIndex = -1;
const knockedGameTargetIds = new Set<string>();
let gameScore = 0;
let gameShots = 0;
let gameTargetsHit = 0;
let gameStreak = 0;
let gameBestStreak = 0;
let sessionIncludedGameMode = false;
const trainingSessionCalibration = new TrainingSessionCalibration();
const TRAINING_HISTORY_KEY = "matchpoint.smart-training-history.v5";
const TRAINING_PLAYER_NAME_KEY = "matchpoint.training-player-name";
const smartTrainingSession = new SmartTrainingSession();
const trainingStrokeEvidence = new TrainingStrokeEvidence();
const followThroughAnalyzer = new FollowThroughAnalyzer();
let trainingSessionHistory = loadTrainingSessionHistory();
let smartTrainingSessionFinalized = false;
let lastCompletedTrainingReport: TrainingSessionReport | null = trainingSessionHistory.at(-1) ?? null;
let pendingReturnedTrainingShot: {
  ballId: string;
  expectedStroke: CalibrationStrokeType;
  detection: TrainingStrokeDetection;
  swingSpeedKmh: number;
  timingOffsetMs: number | null;
  impact: PhysicalImpactResolution | null;
  contactHeightMeters: number;
} | null = null;
let ballSpeedPreset: BallSpeedPreset = "normal";
let activeLaunchPreset: LaunchPreset = "easyForehand";
let lastBallFrameAt = performance.now();
let lastBallBounceCount = 0;
let ballRelaunchAt = 0;
let ballVisualScaleMultiplier: number = BALL_CONFIG.scale.visualScaleMultiplier;
let contactHeightOffset = 0;
let forehandSideOffset = 1.15;
let backhandSideOffset = -1.15;
let contactDepthOffset = 0;
const contactPositionCalibrations: Record<CalibrationStrokeType, ContactPositionCalibration> = {
  forehand: loadContactPositionCalibration(localStorage, "forehand"),
  backhand: loadContactPositionCalibration(localStorage, "backhand")
};
const sliceCalibrationData: SliceCalibrationData = loadSliceCalibration(localStorage);
let showBallAtContactPreview = false;
let selectedPracticeStroke: CalibrationStrokeType | null = null;
let singleShotArmed = false;
let practicePaused = false;
let practiceRelaunchAt = 0;
let practiceAttempts = 0;
let practiceHits = 0;
let practiceMisses = 0;
let finishSessionRequested = false;
let appliedContactCorrection = 0;
let contactDistanceBeforeCorrection = 0;
let contactDistanceAfterCorrection = 0;
let trainingClosestStringBedDistance = Number.POSITIVE_INFINITY;
let trainingStrikeZoneEntryAt: number | null = null;
const trainingStringBedCenter = new THREE.Vector3();
let trainingClosestStrikeZoneMetric = Number.POSITIVE_INFINITY;
const trainingClosestStrikeZoneOffset = new THREE.Vector3();
const trainingStrikeZoneOffsetScratch = new THREE.Vector3();
let trainingMaximumNeutralOriginDriftMeters = 0;
let trainingSawActiveIntentBeforeWindow = false;
let trainingSawActiveIntentInWindow = false;
let trainingSawActiveIntentAfterWindow = false;
let trainingSawForwardIntentInWindow = false;
let trainingRejectedInWindow: PlayableFailureReason | null = null;
const trainingMissBreakdown = emptyTrainingMissBreakdown();
let lastTrainingMissReasons: TrainingMissReason[] = [];
let currentFeedVariation: FeedVariationResult | null = null;
let lastRandomFeedArchetype: FeedArchetype | null = null;
let activeCalibrationProfile: TrajectoryCalibrationProfile | null = null;
let geometryMissStreak = 0;
let forceValidatedBaseNext = false;
let lastDisplayedPhysicalImpact: object | null = null;
const gyroQuaternion = new THREE.Quaternion();
const relativeOrientationQuaternion = new THREE.Quaternion();
const calibrationBaselineInverse = new THREE.Quaternion();
const gyroEuler = new THREE.Euler(0, 0, 0, "YXZ");
const targetRacketQuaternion = new THREE.Quaternion();
const rawPhoneQuaternion = new THREE.Quaternion();
const convertedPhoneQuaternion = new THREE.Quaternion();
const neutralPhoneQuaternion = new THREE.Quaternion();
const displayedRelativeQuaternion = new THREE.Quaternion();
const finalRacketQuaternion = new THREE.Quaternion();
const displayedRacketEuler = new THREE.Euler(0, 0, 0, "YXZ");
const identityQuaternion = new THREE.Quaternion();
const neutralRacketPosition = new THREE.Vector3(0, 1.45, PLAYER_BASELINE_OFFSET_Z);
const SHOW_ORIENTATION_DEBUG = true;
const SHOW_AXIS_HELPERS = false;
const PHONE_TO_THREE_BASIS = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  -Math.PI / 2
);
const PHONE_TO_THREE_BASIS_INVERSE = PHONE_TO_THREE_BASIS.clone().invert();
const baseReadyPoseQuaternion = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  THREE.MathUtils.degToRad(12)
);
const racketModelCorrectionQuaternion = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  -Math.PI / 2
);
const strokePositionOffset = new THREE.Vector3();
const ghostMaterials: THREE.MeshBasicMaterial[] = [];
const ghostFarColor = new THREE.Color(0xff3048);
const ghostAlignedColor = new THREE.Color(0x8dff75);
const ghostCurrentColor = new THREE.Color();
const sensorNormalizer = new SensorNormalizer();
const forwardSwingFusion = new ForwardSwingFusion();
const sensorResampler = new SensorResampler();
const motionRecorder = new MotionRecorder();
const gameplayDiagnosticRecorder = new GameplayDiagnosticRecorder();
const easySwingIntentDetector = new EasySwingIntentDetector();
let latestEasySwingIntent: EasySwingIntentSnapshot | null = null;
let diagnosticTimeout: number | null = null;
let diagnosticReplayTimer: number | null = null;
let mobileClientCount = 0;
let diagnosticState: "idle" | "recording" | "analyzing" | "ready" | "error" = "idle";
const DIAGNOSTIC_PACKET_FRESHNESS_MS = 500;
const USE_LEGACY_STROKE_DETECTOR = false;
const PLAYER_UI_INTERVAL_MS = 100;
const DEVELOPER_UI_INTERVAL_MS = 200;
let lastPlayerUiUpdateAt = 0;
let lastDeveloperUiUpdateAt = 0;
let telemetryWindowStartedAt = performance.now();
let telemetryFrames = 0;
let telemetryRenderMs = 0;
let telemetryPhysicsMs = 0;
let telemetryLongFrames = 0;
let telemetryPreviousPhysicsSteps = 0;
let lastOrientationPcReceivedAt = 0;
let lastOrientationServerTransportMs: number | null = null;
let lastOrientationPhoneToServerMs: number | null = null;
let lastOrientationPhoneTimestamp: number | null = null;
let orientationTimestampDuplicates = 0;
let orientationTimestampStale = 0;
let normalizerRejectedPackets = 0;
let lastValidQuaternionAt = 0;
let lastPhysicsRacketUpdateAt = performance.now();
let lastVisualRacketUpdateAt = performance.now();
let lastVisualRacketChangeAt = performance.now();
let latestStallReasons: string[] = [];
const lastValidSensorQuaternion = new THREE.Quaternion();
const previousVisualTelemetryQuaternion = new THREE.Quaternion();
const incomingTelemetryQuaternion = new THREE.Quaternion();
let hasIncomingTelemetryQuaternion = false;
let runtimeErrorCount = 0;
let unhandledRejectionCount = 0;
let lastRuntimeErrorAt = 0;
let lastRuntimeError = "none";

window.addEventListener("error", event => {
  runtimeErrorCount += 1;
  lastRuntimeErrorAt = performance.now();
  lastRuntimeError = event.message || "uncaught window error";
});
window.addEventListener("unhandledrejection", event => {
  unhandledRejectionCount += 1;
  lastRuntimeErrorAt = performance.now();
  lastRuntimeError = event.reason instanceof Error ? event.reason.message : String(event.reason);
});
const STROKE_EXAMPLE_STORAGE_KEY = "matchpoint.stroke-examples.v1";
let armedStrokeExampleLabel: string | null = null;

const clock = new THREE.Clock();
const tennisSounds = new TennisSoundEngine();
window.addEventListener("pointerdown", () => tennisSounds.unlock(), { once: true });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd5b6a4);
scene.fog = new THREE.Fog(0xe6c4a3, 34, 82);

const camera = new THREE.PerspectiveCamera(
  BALL_CONFIG.camera.fovDegrees,
  1,
  BALL_CONFIG.camera.near,
  BALL_CONFIG.camera.far
);
camera.position.set(...BALL_CONFIG.camera.position);
camera.lookAt(...BALL_CONFIG.camera.target);
let ballFlightCameraState: BallFlightCameraState = { targetY: BALL_CONFIG.camera.target[1], fov: BALL_CONFIG.camera.fovDegrees };
let ballFlightCameraActive = false;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
resizeRendererToVisualizationPanel();
configureAuthenticRenderer(renderer);
const outdoorEnvironment = addPremiumEnvironment(scene, renderer);

const ambientLight = new THREE.HemisphereLight(0xd9e3f1, 0x30493a, 1.22);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffc47f, 2.05);
keyLight.position.set(-12, 9.5, -8.5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.left = -10;
keyLight.shadow.camera.right = 10;
keyLight.shadow.camera.top = 14;
keyLight.shadow.camera.bottom = -14;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 36;
keyLight.shadow.bias = -0.00012;
keyLight.shadow.normalBias = 0.025;
keyLight.shadow.radius = 2;
scene.add(keyLight);

const softFillLight = new THREE.DirectionalLight(0xaecbe4, 0.58);
softFillLight.position.set(8, 6, 3);
scene.add(softFillLight);

const courtBounceLight = new THREE.DirectionalLight(0xaed9c5, 0.34);
courtBounceLight.position.set(0, 2, -12);
scene.add(courtBounceLight);

const impactLight = new THREE.PointLight(0xd8ff87, 0, 8, 2);
impactLight.position.set(0, 2.2, 2.8);
scene.add(impactLight);

const court = createAuthenticCourt(BALL_CONFIG.launch.netDepth);
const tennisNet = createAuthenticTennisNet(BALL_CONFIG.launch.netDepth);
const courtBackdrop = createCourtBackdrop(BALL_CONFIG.launch.netDepth);
scene.add(court, tennisNet, courtBackdrop);

const gameTargetGroup = new THREE.Group();
gameTargetGroup.name = "gameTargets";
gameTargetGroup.visible = false;
scene.add(gameTargetGroup);

const windVisualization = createWindVisualization();
scene.add(windVisualization);

const feedOriginMarker = createFeedOriginMarker();
feedOriginMarker.visible = false;
scene.add(feedOriginMarker);
let feedOriginVisibleUntil = 0;
let previousBallVisualState = "IDLE";
let lastBallVisualWarningAt = 0;

const racketRoot = new THREE.Group();
racketRoot.name = "racketRoot";
racketRoot.position.copy(neutralRacketPosition);
racketRoot.quaternion.copy(baseReadyPoseQuaternion);
racketRoot.scale.setScalar(0.01);
scene.add(racketRoot);

const orientationPivot = new THREE.Group();
orientationPivot.name = "orientationPivot";

const proceduralPositionPivot = new THREE.Group();
proceduralPositionPivot.name = "proceduralPositionPivot";
racketRoot.add(proceduralPositionPivot);
proceduralPositionPivot.add(orientationPivot);

const visualOrientationPivot = new THREE.Group();
visualOrientationPivot.name = "visualOrientationPivot";
proceduralPositionPivot.add(visualOrientationPivot);

const modelCorrectionPivot = new THREE.Group();
modelCorrectionPivot.name = "modelCorrectionPivot";
modelCorrectionPivot.quaternion.copy(racketModelCorrectionQuaternion);
visualOrientationPivot.add(modelCorrectionPivot);

const physicsCorrectionPivot = new THREE.Group();
physicsCorrectionPivot.name = "physicsCorrectionPivot";
physicsCorrectionPivot.quaternion.copy(racketModelCorrectionQuaternion);
orientationPivot.add(physicsCorrectionPivot);

const racketStringCollider = new THREE.Group();
racketStringCollider.name = "racketStringCollider";
racketStringCollider.position.set(...BALL_CONFIG.collision.headCenterLocal);
physicsCorrectionPivot.add(racketStringCollider);

const colliderPoints: THREE.Vector3[] = [];
for (let index = 0; index < 48; index += 1) {
  const angle = index / 48 * Math.PI * 2;
  colliderPoints.push(new THREE.Vector3(
    Math.cos(angle) * BALL_CONFIG.collision.halfWidthLocal,
    Math.sin(angle) * BALL_CONFIG.collision.halfHeightLocal,
    0
  ));
}
const colliderDebug = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(colliderPoints),
  new THREE.LineBasicMaterial({ color: 0x39d9ff, transparent: true, opacity: 0.85, depthTest: false })
);
colliderDebug.visible = false;
colliderDebug.renderOrder = 30;
racketStringCollider.add(colliderDebug);

const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(
    BALL_CONFIG.scale.physicalRadiusMeters * BALL_CONFIG.scale.visualScaleMultiplier,
    32,
    20
  ),
  new THREE.MeshPhysicalMaterial({
    map: createProceduralTennisBallTexture(renderer),
    color: 0xffffff,
    roughness: 0.96,
    bumpMap: createMicroTexture(),
    bumpScale: 0.0006,
    metalness: 0,
    clearcoat: 0,
    emissive: 0x263000,
    emissiveIntensity: 0.08
  })
);
ballMesh.castShadow = true;
ballMesh.receiveShadow = true;
ballMesh.visible = false;
scene.add(ballMesh);

const ballShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.MeshBasicMaterial({ map: createSoftContactShadowTexture(), color: 0x14221d, transparent: true, opacity: 0.38, depthWrite: false })
);
ballShadow.rotation.x = -Math.PI / 2;
ballShadow.visible = false;
scene.add(ballShadow);

const ballTrailPositions: THREE.Vector3[] = [];
const ballTrailGeometry = new THREE.BufferGeometry();
const ballTrailBuffer = new Float32Array(18 * 3);
const ballTrailAttribute = new THREE.BufferAttribute(ballTrailBuffer, 3);
ballTrailAttribute.setUsage(THREE.DynamicDrawUsage);
ballTrailGeometry.setAttribute("position", ballTrailAttribute);
ballTrailGeometry.setDrawRange(0, 0);
const ballTrailMaterial = new THREE.LineBasicMaterial({ color: 0xdfff72, transparent: true, opacity: 0.38 });
const ballTrail = new THREE.Line(
  ballTrailGeometry,
  ballTrailMaterial
);
ballTrail.visible = false;
ballTrail.frustumCulled = false;
scene.add(ballTrail);

let landingAnnouncementTimer: ReturnType<typeof setTimeout> | undefined;
const ballController = new BallController(onBallHit, onBallMiss, (result, firstBouncePoint) => {
  elements.ballResult.textContent = ({ IN: "IN! Nice shot!", NET: "NET - not enough clearance",
    OUT_WIDE: "OUT - wide", OUT_LONG: "OUT - long", SHORT: "SHORT - bounced on your side", OUT: "OUT" } as const)[result];
  finalizeReturnedTrainingShot(result, firstBouncePoint);
  updateCourtVision(result, firstBouncePoint);
  const gameAward = playerMode === "game" ? scoreGameReturn(result, firstBouncePoint) : null;
  const announcement = getElement("landingAnnouncement");
  announcement.textContent = gameAward ?? elements.ballResult.textContent;
  announcement.hidden = false;
  clearTimeout(landingAnnouncementTimer);
  landingAnnouncementTimer = setTimeout(() => { announcement.hidden = true; }, 2600);
  elements.ballResult.setAttribute("role", "status");
  elements.ballResult.setAttribute("aria-live", "polite");
});
const ballDebugGroup = new THREE.Group();
ballDebugGroup.visible = false;
scene.add(ballDebugGroup);
const ballVelocityArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1, 0x39d9ff);
const racketNormalArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 0.8, 0xff5b89);
const outgoingRawArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 1.1, 0xffa31a);
const outgoingConstrainedArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 1.4, 0x42ff88);
ballDebugGroup.add(ballVelocityArrow, racketNormalArrow, outgoingRawArrow, outgoingConstrainedArrow);
const predictedPathGeometry = new THREE.BufferGeometry();
const predictedPathLine = new THREE.Line(
  predictedPathGeometry,
  new THREE.LineBasicMaterial({ color: 0x8dff75, transparent: true, opacity: 0.5 })
);
ballDebugGroup.add(predictedPathLine);
const contactMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.055, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0xff476f, transparent: true, opacity: 0.85 })
);
contactMarker.visible = false;
ballDebugGroup.add(contactMarker);
const bounceMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.08, 0.16, 28),
  new THREE.MeshBasicMaterial({ color: 0xc8ff32, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
);
bounceMarker.rotation.x = -Math.PI / 2;
bounceMarker.visible = false;
scene.add(bounceMarker);
const outgoingNetMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.055, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0x42ff88 })
);
const outgoingBounceMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.09, 0.14, 24),
  new THREE.MeshBasicMaterial({ color: 0xffa31a, side: THREE.DoubleSide })
);
outgoingBounceMarker.rotation.x = -Math.PI / 2;
outgoingNetMarker.visible = false;
outgoingBounceMarker.visible = false;
ballDebugGroup.add(outgoingNetMarker, outgoingBounceMarker);

const trajectoryCalibrationGroup = new THREE.Group();
trajectoryCalibrationGroup.visible = false;
scene.add(trajectoryCalibrationGroup);
const trajectoryHandleMaterial = [0x54e9ff, 0xc8ff32, 0xffa31a, 0xff5b89].map(color =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false })
);
const trajectoryHandles = ["launch", "bounce", "apex", "contact"].map((name, index) => {
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 12), trajectoryHandleMaterial[index]);
  handle.name = `trajectory-${name}`;
  handle.renderOrder = 20;
  trajectoryCalibrationGroup.add(handle);
  return handle;
});
const trajectoryHandleLabels = ["Launch Point", "Bounce Point", "Arc Height / Physical Apex", "Contact Point"].map((label, index) => {
  const sprite = createTrajectoryLabel(label, trajectoryHandleMaterial[index].color.getHex());
  trajectoryCalibrationGroup.add(sprite);
  return sprite;
});
const playerLeftLabel = createTrajectoryLabel("Player Left / Backhand Side", 0x75dcff);
const playerRightLabel = createTrajectoryLabel("Player Right / Forehand Side", 0x75dcff);
playerLeftLabel.position.set(-2.2, 0.35, -1.2);
playerRightLabel.position.set(2.2, 0.35, -1.2);
trajectoryCalibrationGroup.add(playerLeftLabel, playerRightLabel);
const requestedTrajectoryGeometry = new THREE.BufferGeometry();
const physicalTrajectoryGeometry = new THREE.BufferGeometry();
const requestedTrajectoryLine = new THREE.Line(requestedTrajectoryGeometry, new THREE.LineDashedMaterial({ color: 0xffa31a, dashSize: 0.12, gapSize: 0.08 }));
const physicalTrajectoryLine = new THREE.Line(physicalTrajectoryGeometry, new THREE.LineBasicMaterial({ color: 0x42ff88 }));
trajectoryCalibrationGroup.add(requestedTrajectoryLine, physicalTrajectoryLine);
const trajectoryRaycaster = new THREE.Raycaster();
const trajectoryPointer = new THREE.Vector2();
let draggedTrajectoryHandle: (typeof trajectoryHandles)[number] | null = null;

const contactTargetGroup = new THREE.Group();
contactTargetGroup.visible = false;
scene.add(contactTargetGroup);
const contactTargetVolume = new THREE.Mesh(
  new THREE.SphereGeometry(0.22, 18, 12),
  new THREE.MeshBasicMaterial({ color: 0x54e9ff, wireframe: true, transparent: true, opacity: 0.38, depthTest: false })
);
contactTargetVolume.scale.set(
  TRAINING_STRIKE_ZONE_RADII.lateral / 0.22,
  TRAINING_STRIKE_ZONE_RADII.vertical / 0.22,
  TRAINING_STRIKE_ZONE_RADII.depth / 0.22
);
contactTargetGroup.add(contactTargetVolume);
const contactHeightGuide = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineDashedMaterial({ color: 0x54e9ff, transparent: true, opacity: 0.55, dashSize: 0.08, gapSize: 0.05 })
);
contactTargetGroup.add(contactHeightGuide);
const expectedRacketMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.055, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0xff5b89, depthTest: false })
);
contactTargetGroup.add(expectedRacketMarker);

const calibrationGuide = new THREE.Group();
calibrationGuide.position.copy(neutralRacketPosition);
calibrationGuide.quaternion.copy(baseReadyPoseQuaternion);
calibrationGuide.scale.setScalar(0.0108);
scene.add(calibrationGuide);

const calibrationGuideCorrection = new THREE.Group();
calibrationGuideCorrection.quaternion.copy(racketModelCorrectionQuaternion);
calibrationGuide.add(calibrationGuideCorrection);

if (SHOW_AXIS_HELPERS) {
  scene.add(new THREE.AxesHelper(2.2));
  orientationPivot.add(new THREE.AxesHelper(90));
  modelCorrectionPivot.add(new THREE.AxesHelper(70));
}

elements.orientationDebug.hidden = !SHOW_ORIENTATION_DEBUG;
elements.calibrateButton.disabled = true;
elements.calibrateButton.addEventListener("click", calibrateFromLatestPhonePose);
const strokeStateMachine = new StrokeStateMachine(
  "right",
  "one-handed",
  onEstimatedRacketContact
);
wireStrokeControls();
wireBallControls();
wireDiagnosticControls();
if (new URLSearchParams(window.location.search).get("mode") === "game") {
  elements.playerAssistLevel.value = "game";
  elements.playerAssistLevel.dispatchEvent(new Event("change"));
}
wireTrajectoryCalibration();
loadRacketModel();

const dustParticles = createDustParticles();
// No floating particles or translucent court layers in the training view.

socket.on("connect", () => {
  socket.emit("client:hello", { role: "pc" });
  updateConnectionStatus();
});

socket.on("disconnect", () => {
  updateConnectionStatus();
  mobileClientCount = 0;
  updateDiagnosticReadiness();
});

socket.on("broker:status", (payload: unknown) => {
  const status = payload as BrokerStatus;
  mobileClientCount = status.mobileClients;
  elements.mobileClients.textContent = String(status.mobileClients);
  updateDiagnosticReadiness();
});

socket.on("controller:state", (payload: unknown) => {
  latestOrientationPacket = null;
  latestVisualPoseValid = false;
  previousPacket = latestPacket;
  latestPacket = payload as BrokeredMotionPacket;
  packetCount += 1;

  const mappedRotation = mapPacketToRotation(latestPacket);
  targetRotationX = mappedRotation.x;
  targetRotationY = mappedRotation.y;
  targetRotationZ = mappedRotation.z;
  targetSwingSpeedKmh = estimateSwingSpeedKmh(latestPacket, previousPacket);
  peakSwingSpeedKmh = Math.max(peakSwingSpeedKmh, targetSwingSpeedKmh);

  elements.packetCount.textContent = String(packetCount);
  elements.inputMode.textContent = latestPacket.inputMode ?? "sensor";
});

socket.on("continuous_orientation", (payload: unknown) => {
  const pcReceivedAt = performance.now();
  const pcReceivedEpoch = Date.now();
  const orientationPacket = payload as BrokeredContinuousOrientationPacket;
  lastOrientationPcReceivedAt = pcReceivedAt;
  lastOrientationServerTransportMs = Math.max(0, pcReceivedEpoch - orientationPacket.serverReceivedAt);
  lastOrientationPhoneToServerMs = Math.max(0, orientationPacket.serverReceivedAt - orientationPacket.t);
  if (elements.developerPanel.open && pcReceivedAt - lastPhysicsRacketUpdateAt > 250) {
    latestStallReasons = ["packets_arriving_physics_not_updated"];
    elements.racketStallTelemetry.textContent =
      `STALL_DETECTED packets_arriving_physics_not_updated\nphysics update age ${Math.round(pcReceivedAt - lastPhysicsRacketUpdateAt)} ms`;
  }
  if (Number.isFinite(orientationPacket.t)) {
    if (lastOrientationPhoneTimestamp !== null) {
      if (orientationPacket.t === lastOrientationPhoneTimestamp) orientationTimestampDuplicates += 1;
      else if (orientationPacket.t < lastOrientationPhoneTimestamp) orientationTimestampStale += 1;
    }
    if (lastOrientationPhoneTimestamp === null || orientationPacket.t > lastOrientationPhoneTimestamp) {
      lastOrientationPhoneTimestamp = orientationPacket.t;
    }
  }
  latestPacket = null;
  latestOrientationPacket = orientationPacket;
  packetCount += 1;
  targetRotationX = orientationPacket.rotation.x ?? 0;
  targetRotationY = orientationPacket.rotation.y ?? 0;
  targetRotationZ = orientationPacket.rotation.z ?? 0;
  rawPhoneQuaternion.set(
    orientationPacket.quaternion.x,
    orientationPacket.quaternion.y,
    orientationPacket.quaternion.z,
    orientationPacket.quaternion.w
  );
  const incomingPoseLength = rawPhoneQuaternion.length();
  const incomingPoseValid = isFiniteQuaternion(rawPhoneQuaternion) &&
    incomingPoseLength >= MOTION_CONFIG.validation.minimumQuaternionLength &&
    incomingPoseLength <= MOTION_CONFIG.validation.maximumQuaternionLength;
  rawPhoneQuaternion.normalize();
  phoneQuaternionToThreeQuaternion(rawPhoneQuaternion, convertedPhoneQuaternion);
  const packetRelativeQuaternion = hasCalibrationBaseline
    ? calibrationBaselineInverse.clone().multiply(convertedPhoneQuaternion)
    : convertedPhoneQuaternion.clone();
  const packetRacketQuaternion = baseReadyPoseQuaternion
    .clone()
    .multiply(packetRelativeQuaternion)
    .multiply(racketModelCorrectionQuaternion);
  const processedFrame = sensorNormalizer.process({
    timestamp: orientationPacket.t,
    sensorTimestamp: orientationPacket.sensorTimestamp,
    currentPhoneQuaternion: rawPhoneQuaternion,
    relativePhoneQuaternion: packetRelativeQuaternion,
    mappedRacketQuaternion: packetRacketQuaternion,
    // New Expo packets have explicit, platform-normalized phone axes in rad/s.
    // Older controllers fall back to quaternion differences.
    angularVelocityPhoneRadPerSecond: orientationPacket.angularVelocityRadPerSecond
      ? nullableVectorToThree(orientationPacket.angularVelocityRadPerSecond) : undefined,
    sensorToWorldQuaternion: baseReadyPoseQuaternion.clone().multiply(packetRelativeQuaternion),
    accelerationMps2: nullableVectorToThree(orientationPacket.acceleration),
    accelerationIncludingGravityMps2: nullableVectorToThree(
      orientationPacket.accelerationIncludingGravity
    )
  });
  forwardSwingFusion.add(processedFrame);
  latestVisualPoseValid = incomingPoseValid && isFiniteQuaternion(processedFrame.relativePhoneQuaternion) &&
    processedFrame.relativePhoneQuaternion.lengthSq() > 1e-8;
  if (latestVisualPoseValid) {
    // A pose can remain safe to render while its acceleration/timing data is
    // excluded from coaching and contact. Dropping the pose caused the racket
    // to freeze repeatedly during fast swings.
    sensorResampler.add({
      timestamp: pcReceivedAt,
      quaternion: processedFrame.relativePhoneQuaternion,
      angularVelocity: phoneVectorToThreeVector(processedFrame.angularVelocityLocal),
      angularSpeed: processedFrame.angularSpeed,
      accelerationMagnitude: processedFrame.accelerationMagnitude,
      jerk: processedFrame.jerk
    });
  }
  if (processedFrame.valid) {
    latestValidSensorFrame = processedFrame;
    if (!hasIncomingTelemetryQuaternion || incomingTelemetryQuaternion.angleTo(processedFrame.relativePhoneQuaternion) > 1e-5) {
      incomingTelemetryQuaternion.copy(processedFrame.relativePhoneQuaternion);
      hasIncomingTelemetryQuaternion = true;
    }
    lastValidSensorQuaternion.copy(processedFrame.relativePhoneQuaternion);
    lastValidQuaternionAt = pcReceivedAt;
  } else {
    normalizerRejectedPackets += 1;
  }

  if (!replayActive) {
    latestSensorFrame = processedFrame;
    const estimatedRacketSpeedKmh = processedFrame.angularSpeed * 3.2;
    targetSwingSpeedKmh = Math.max(targetSwingSpeedKmh, estimatedRacketSpeedKmh);
    peakSwingSpeedKmh = Math.max(peakSwingSpeedKmh, estimatedRacketSpeedKmh);
    if (isCalibrated) {
      processStrokeFrame(processedFrame);
      if (latestStrokeSnapshot) trainingStrokeEvidence.observe({
        lockedStrokeType: latestStrokeSnapshot.lockedStrokeType,
        confidence: latestStrokeSnapshot.confidence,
        forehandCandidateScore: latestStrokeSnapshot.scores.forehandCandidateScore,
        backhandCandidateScore: latestStrokeSnapshot.scores.backhandCandidateScore,
        angularSpeed: processedFrame.angularSpeed
      });
      if (pendingReturnedTrainingShot) followThroughAnalyzer.observe({
        relativeQuaternion: processedFrame.relativePhoneQuaternion,
        sidewaysScore: processedFrame.motionSidewaysScore,
        upwardScore: processedFrame.motionUpwardScore,
        angularSpeed: processedFrame.angularSpeed
      });
      const measuredStroke = detectedEasySwingSide(latestStrokeSnapshot);
      latestEasySwingIntent = measuredStroke ? easySwingIntentDetector.update({
        // The hit window uses PC epoch time. Keep intent age in the same clock
        // domain instead of comparing the phone sensor clock with Date.now().
        timestamp: pcReceivedEpoch,
        sourceTimestamp: processedFrame.timestamp,
        valid: processedFrame.valid,
        angularSpeed: processedFrame.angularSpeed,
        accelerationMagnitude: processedFrame.accelerationMagnitude,
        forwardScore: processedFrame.motionForwardScore,
        preparationScore: latestStrokeSnapshot?.scores.preparationScore ?? 0,
        racketFaceAngle: processedFrame.racketFaceAngleToCourtRadians
      }, measuredStroke) : null;
      motionRecorder.capture(processedFrame);
    }
  }

  elements.packetCount.textContent = String(packetCount);
  elements.inputMode.textContent = "expo";
  elements.calibrateButton.disabled = false;

});

socket.on("controller:calibrated", (payload: unknown) => {
  const calibrationPacket = payload as BrokeredCalibrationPacket;
  rawPhoneQuaternion.set(
    calibrationPacket.quaternion.x,
    calibrationPacket.quaternion.y,
    calibrationPacket.quaternion.z,
    calibrationPacket.quaternion.w
  ).normalize();
  phoneQuaternionToThreeQuaternion(rawPhoneQuaternion, convertedPhoneQuaternion);
  beginCalibration(convertedPhoneQuaternion);
});

socket.on("stroke_detected", (payload: unknown) => {
  if (!USE_LEGACY_STROKE_DETECTOR || !isCalibrated) {
    return;
  }

  const strokePacket = payload as BrokeredStrokeDetectedPacket;
  const strokeType = normalizeStrokeType(strokePacket.strokeType ?? strokePacket.type);

  if (!strokeType) {
    return;
  }

  activeStroke = {
    type: strokeType,
    startedAt: performance.now(),
    durationMs: 620
  };
  targetSwingSpeedKmh = Math.max(targetSwingSpeedKmh, estimateStrokeBurstSpeedKmh(strokePacket));
  peakSwingSpeedKmh = Math.max(peakSwingSpeedKmh, targetSwingSpeedKmh);
});

const visualizationResizeObserver = new ResizeObserver(resizeRendererToVisualizationPanel);
visualizationResizeObserver.observe(visualizationPanel);
window.addEventListener("resize", resizeRendererToVisualizationPanel);
elements.developerPanel.addEventListener("toggle", updateBallHelperVisibility);

animate();

function loadRacketModel(): void {
  const loader = new GLTFLoader();

  loader.load(
    "/pc/racket_new.glb",
    (gltf) => {
      const model = gltf.scene;
      finishPremiumRacket(model);
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = (child.material as THREE.Material).name !== "premiumStrings";
          child.receiveShadow = true;
        }
      });
      modelCorrectionPivot.add(model);

      const ghostModel = model.clone(true);
      ghostModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // Keep the alignment silhouette; duplicate string geometry obscures
          // the live frame and adds thousands of subpixel wire segments.
          if ((child.material as THREE.Material).name === "premiumStrings") child.visible = false;
          const ghostMaterial = new THREE.MeshBasicMaterial({
            color: ghostFarColor,
            transparent: true,
            opacity: 0.34,
            wireframe: false,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            toneMapped: false
          });
          child.material = ghostMaterial;
          child.castShadow = false;
          child.receiveShadow = false;
          child.renderOrder = 20;
          ghostMaterials.push(ghostMaterial);
        }
      });
      calibrationGuideCorrection.add(ghostModel);
    },
    undefined,
    (error) => {
      console.error("Failed to load racket.glb", error);
    }
  );
}

function createDustParticles(): THREE.Points {
  const count = 620;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 18;
    positions[i * 3 + 1] = Math.random() * 6.2 + 0.15;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 24;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xc5ffd7,
      size: 0.022,
      transparent: true,
      opacity: 0.38,
      depthWrite: false
    })
  );
}

function createFarCourtHaze(): THREE.Group {
  const group = new THREE.Group();
  const hazeMaterial = new THREE.MeshBasicMaterial({
    color: 0x2541ff,
    transparent: true,
    opacity: 0.075,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  for (let i = 0; i < 4; i += 1) {
    const material = hazeMaterial.clone();
    material.opacity = 0.055 + i * 0.025;
    const haze = new THREE.Mesh(new THREE.PlaneGeometry(18, 2.2), material);
    haze.rotation.x = -Math.PI / 2;
    haze.position.set(0, 0.06 + i * 0.025, -5.6 - i * 2.4);
    haze.scale.x = 1 + i * 0.18;
    group.add(haze);
  }

  return group;
}

function createCourtTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = getCanvasContext(canvas);

  context.fillStyle = "#07182c";
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 1200; i += 1) {
    const alpha = Math.random() * 0.1;
    context.fillStyle = `rgba(180, 220, 255, ${alpha})`;
    context.fillRect(Math.random() * 512, Math.random() * 512, Math.random() * 2.4, Math.random() * 2.4);
  }

  for (let i = 0; i < 110; i += 1) {
    context.strokeStyle = `rgba(220, 245, 255, ${0.05 + Math.random() * 0.11})`;
    context.lineWidth = 0.6 + Math.random() * 1.8;
    context.beginPath();
    context.moveTo(Math.random() * 512, Math.random() * 512);
    context.lineTo(Math.random() * 512, Math.random() * 512);
    context.stroke();
  }

  for (let i = 0; i < 42; i += 1) {
    context.fillStyle = `rgba(230, 245, 255, ${0.035 + Math.random() * 0.07})`;
    context.beginPath();
    context.ellipse(
      Math.random() * 512,
      Math.random() * 512,
      10 + Math.random() * 55,
      2 + Math.random() * 10,
      Math.random() * Math.PI,
      0,
      Math.PI * 2
    );
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create canvas 2D context");
  }

  return context;
}

function mapPacketToRotation(packet: BrokeredMotionPacket): { x: number; y: number; z: number } {
  const beta = packet.orientation.beta ?? packet.acceleration.y ?? 0;
  const gamma = packet.orientation.gamma ?? packet.acceleration.x ?? 0;

  return {
    x: degreesToRadians(beta),
    y: degreesToRadians(gamma),
    z: 0
  };
}

function animate(): void {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();
  updatePremiumEnvironment(outdoorEnvironment, elapsed);
  updateCourtBackdrop(courtBackdrop, elapsed);
  updateWindVisualization(windVisualization, elapsed);
  const now = performance.now();
  updateTargetGame(now, elapsed);
  const nowEpoch = Date.now();
  const rawFrameDeltaMs = now - lastBallFrameAt;
  const ballDeltaSeconds = Math.min(rawFrameDeltaMs / 1000, 0.1);
  frameTelemetry.record(rawFrameDeltaMs);
  if (ballDeltaSeconds > 1 / 30) telemetryLongFrames += 1;
  lastBallFrameAt = now;

  if (latestOrientationPacket) {
    const resampledOrientation = sensorResampler.sample(now);
    if (resampledOrientation) relativeOrientationQuaternion.copy(resampledOrientation);
  } else {
    gyroEuler.set(targetRotationX, targetRotationY, targetRotationZ);
    gyroQuaternion.setFromEuler(gyroEuler);
    phoneQuaternionToThreeQuaternion(gyroQuaternion, relativeOrientationQuaternion);
  }

  targetRacketQuaternion.copy(relativeOrientationQuaternion);
  orientationPivot.quaternion.copy(targetRacketQuaternion);
  const visualSmoothing = adaptiveVisualSmoothingFactor(
    latestSensorFrame?.angularSpeed ?? 0,
    latestSensorFrame?.accelerationMagnitude ?? 0,
    latestSensorFrame?.jerk ?? 0,
    latestVisualPoseValid,
    ballDeltaSeconds
  );
  updateVisualRacketQuaternion(visualOrientationPivot.quaternion, targetRacketQuaternion, visualSmoothing, ballDeltaSeconds);
  lastVisualRacketUpdateAt = now;
  if (previousVisualTelemetryQuaternion.angleTo(visualOrientationPivot.quaternion) > 1e-5) {
    lastVisualRacketChangeAt = now;
    previousVisualTelemetryQuaternion.copy(visualOrientationPivot.quaternion);
  }
  displayedRelativeQuaternion.copy(visualOrientationPivot.quaternion);
  racketRoot.position.copy(neutralRacketPosition);
  updateProceduralPosition();
  if (USE_LEGACY_STROKE_DETECTOR) {
    racketRoot.position.add(getStrokePositionOffset());
  }
  racketRoot.updateMatrixWorld(true);
  lastPhysicsRacketUpdateAt = now;
  appliedContactCorrection = 0;
  const detectorSnapshot = latestStrokeSnapshot ?? strokeStateMachine.getSnapshot(nowEpoch);
  const physicsStartedAt = performance.now();
  const physicsStepsBeforeFrame = ballController.physicsState.totalSteps;
  const previewAtContact = previewTrajectoryActive && ballController.ball.bounceCount === 1 &&
    ballController.ball.contactDeadline > 0 && nowEpoch >= ballController.ball.contactDeadline - 25;
  if (previewAtContact) {
    ballController.ball.position.copy(ballController.ball.contactTarget);
    ballController.ball.previousPosition.copy(ballController.ball.contactTarget);
    ballController.ball.velocity.set(0, 0, 0);
    ballController.ball.state = "CONTACT_ZONE";
    contactMarker.position.copy(ballController.ball.contactTarget);
    contactMarker.visible = true;
  } else {
    ballController.update(
      ballDeltaSeconds, nowEpoch, racketStringCollider.matrixWorld, detectorSnapshot,
      lastContactEvent, assistMode, createEasyHitMotion(), !previewTrajectoryActive,
      activeCalibrationProfile ?? trajectoryProfiles[ballController.ball.expectedStrokeType],
      isPlayableCalibratedHitEnabled(), playerAssistLevel, currentWindAcceleration(nowEpoch)
    );
  }
  telemetryPhysicsMs += performance.now() - physicsStartedAt;
  updateTrainingFeedMetrics(nowEpoch);
  const physicsStepsThisFrame = ballController.physicsState.totalSteps - physicsStepsBeforeFrame;
  updateBallVisuals(ballDeltaSeconds);
  const outgoingFlight = ballController.ball.active && ballController.ball.state === "RETURNED";
  if (outgoingFlight) ballFlightCameraActive = true;
  if (ballFlightCameraActive) {
    ballFlightCameraState = updateBallFlightCamera(
      ballFlightCameraState, ballController.ball.position, outgoingFlight, ballDeltaSeconds
    );
    camera.fov = ballFlightCameraState.fov;
    camera.lookAt(BALL_CAMERA_BASE_TARGET.x, ballFlightCameraState.targetY, BALL_CAMERA_BASE_TARGET.z);
    camera.updateProjectionMatrix();
    if (!outgoingFlight && Math.abs(ballFlightCameraState.targetY - BALL_CAMERA_BASE_TARGET.y) < 0.01 &&
        Math.abs(ballFlightCameraState.fov - BALL_CONFIG.camera.fovDegrees) < 0.01) ballFlightCameraActive = false;
  }
  impactLight.intensity = 0;
  targetSwingSpeedKmh *= 0.94;
  displayedSwingSpeedKmh = damp(displayedSwingSpeedKmh, targetSwingSpeedKmh, 0.45);

  finalRacketQuaternion
    .copy(baseReadyPoseQuaternion)
    .multiply(displayedRelativeQuaternion)
    .multiply(racketModelCorrectionQuaternion);
  displayedRacketEuler.setFromQuaternion(finalRacketQuaternion, "YXZ");
  animateDust(elapsed);
  updateCalibrationGuide(elapsed);
  if (now - lastPlayerUiUpdateAt >= PLAYER_UI_INTERVAL_MS) {
    elements.rotationX.textContent = displayedRacketEuler.x.toFixed(3);
    elements.rotationY.textContent = displayedRacketEuler.y.toFixed(3);
    elements.swingSpeed.textContent = `${Math.round(displayedSwingSpeedKmh)} km/h`;
    elements.peakSwingSpeed.textContent = `${Math.round(peakSwingSpeedKmh)} km/h`;
    updateStrokeDebug();
    updatePlayableStatus(nowEpoch);
    updateConnectionStatus();
    updatePacketAge();
    lastPlayerUiUpdateAt = now;
  }
  if (elements.developerPanel.open && now - lastDeveloperUiUpdateAt >= DEVELOPER_UI_INTERVAL_MS) {
    updateOrientationDebug();
    updateBallDebug();
    lastDeveloperUiUpdateAt = now;
  }
  updatePracticeLoop(now);
  captureGameplayDiagnostic(now, ballDeltaSeconds);

  const renderStartedAt = performance.now();
  renderer.render(scene, camera);
  telemetryRenderMs += performance.now() - renderStartedAt;
  telemetryFrames += 1;
  const packetAgeMs = lastOrientationPcReceivedAt > 0 ? now - lastOrientationPcReceivedAt : null;
  const posePending = hasIncomingTelemetryQuaternion &&
    incomingTelemetryQuaternion.angleTo(visualOrientationPivot.quaternion) > 1e-3;
  latestStallReasons = racketStallTelemetry.record({
    at: now,
    packetAgeMs,
    packetRateHz: sensorResampler.telemetry.packetRateHz,
    packetJitterMs: sensorResampler.telemetry.packetJitterMs,
    duplicatePackets: orientationTimestampDuplicates + sensorResampler.telemetry.duplicatePackets,
    stalePackets: orientationTimestampStale + sensorResampler.telemetry.outOfOrderPackets,
    rejectedPackets: normalizerRejectedPackets + sensorResampler.telemetry.rejectedPackets,
    physicsUpdateAgeMs: now - lastPhysicsRacketUpdateAt,
    visualUpdateAgeMs: now - lastVisualRacketUpdateAt,
    visualChangeAgeMs: now - lastVisualRacketChangeAt,
    frameDeltaMs: rawFrameDeltaMs,
    physicsSteps: physicsStepsThisFrame,
    extrapolationMs: sensorResampler.telemetry.extrapolationMs,
    resamplerState: sensorResampler.telemetry.state,
    posePending,
    quaternionX: lastValidSensorQuaternion.x,
    quaternionY: lastValidSensorQuaternion.y,
    quaternionZ: lastValidSensorQuaternion.z,
    quaternionW: lastValidSensorQuaternion.w,
    quaternionAgeMs: lastValidQuaternionAt > 0 ? now - lastValidQuaternionAt : null,
    runtimeErrors: runtimeErrorCount + unhandledRejectionCount
  });
  updatePerformanceTelemetry(now, nowEpoch);
}

function updatePerformanceTelemetry(now: number, _nowEpoch: number): void {
  const elapsedMs = now - telemetryWindowStartedAt;
  if (elapsedMs < 1000) return;
  const frameStats = frameTelemetry.snapshot();
  document.getElementById("frameBudget")!.textContent = `${Math.round(frameStats.fps)} FPS`;
  const physicsSteps = ballController.physicsState.totalSteps - telemetryPreviousPhysicsSteps;
  if (elements.developerPanel.open) elements.performanceTelemetry.textContent = JSON.stringify({
    ...frameStats,
    renderFps: Number((telemetryFrames * 1000 / elapsedMs).toFixed(1)),
    physicsStepsPerSecond: Number((physicsSteps * 1000 / elapsedMs).toFixed(1)),
    averageRenderMs: Number((telemetryRenderMs / Math.max(1, telemetryFrames)).toFixed(2)),
    averagePhysicsMs: Number((telemetryPhysicsMs / Math.max(1, telemetryFrames)).toFixed(3)),
    longFrames: telemetryLongFrames,
    sensorPacketRateHz: Number(sensorResampler.telemetry.packetRateHz.toFixed(1)),
    packetAgeMs: lastOrientationPcReceivedAt > 0 ? Math.round(now - lastOrientationPcReceivedAt) : null,
    serverToPcMs: lastOrientationServerTransportMs,
    phoneToServerMs: lastOrientationPhoneToServerMs,
    packetJitterMs: Number(sensorResampler.telemetry.packetJitterMs.toFixed(1)),
    duplicatePackets: sensorResampler.telemetry.duplicatePackets,
    outOfOrderPackets: sensorResampler.telemetry.outOfOrderPackets,
    rejectedPackets: sensorResampler.telemetry.rejectedPackets + normalizerRejectedPackets,
    timestampDuplicates: orientationTimestampDuplicates,
    timestampStale: orientationTimestampStale,
    staleFrames: sensorResampler.telemetry.staleFrames,
    maximumAngularDeltaRadians: Number(sensorResampler.telemetry.maximumAngularDeltaRadians.toFixed(3)),
    interpolationDelayMs: 40,
    currentExtrapolationMs: sensorResampler.telemetry.extrapolationMs,
    resamplerState: sensorResampler.telemetry.state,
    lastValidQuaternion: formatQuaternion(lastValidSensorQuaternion),
    lastValidQuaternionAgeMs: lastValidQuaternionAt > 0 ? Math.round(now - lastValidQuaternionAt) : null,
    lastPhysicsRacketUpdateAgeMs: Math.round(now - lastPhysicsRacketUpdateAt),
    lastVisualRacketUpdateAgeMs: Math.round(now - lastVisualRacketUpdateAt),
    lastVisualRacketChangeAgeMs: Math.round(now - lastVisualRacketChangeAt),
    runtimeErrorCount,
    unhandledRejectionCount,
    lastRuntimeError,
    trainingClosestBallToStringBedMeters: Number.isFinite(trainingClosestStringBedDistance)
      ? Number(trainingClosestStringBedDistance.toFixed(3)) : null,
    trainingStrikeZoneEntryAt,
    trainingClosestStrikeZoneOffset: Number.isFinite(trainingClosestStrikeZoneMetric)
      ? formatVector(trainingClosestStrikeZoneOffset) : null,
    trainingMaximumNeutralOriginDriftMeters: Number(trainingMaximumNeutralOriginDriftMeters.toFixed(4)),
    trainingLastMissReasons: lastTrainingMissReasons,
    trainingMissBreakdown,
    trainingBouncePosition: ballController.ball.bounceCount > 0 ? formatVector(observedBouncePoint) : null,
    trainingBounceToContactMs: activeCalibrationProfile?.bounceToContactMs ?? null,
    trainingContactHeight: activeCalibrationProfile?.contactPointWorld[1] ?? null,
    trainingLateralOffset: activeCalibrationProfile?.contactPointWorld[0] ?? null,
    lastRuntimeErrorAgeMs: lastRuntimeErrorAt > 0 ? Math.round(now - lastRuntimeErrorAt) : null,
    droppedPhysicsMs: Math.round(ballController.physicsState.droppedSeconds * 1000)
  }, null, 2);
  if (elements.developerPanel.open) {
    const lastStall = racketStallTelemetry.getLastStall();
    const trace = lastStall?.trace.filter((_, index, values) =>
      index === values.length - 1 || index % 10 === 0
    ).map(sample => ({
      t: Number((sample.at / 1000).toFixed(2)), packetAge: sample.packetAgeMs === null ? null : Math.round(sample.packetAgeMs),
      rate: Number(sample.packetRateHz.toFixed(1)), jitter: Number(sample.packetJitterMs.toFixed(1)),
      duplicates: sample.duplicatePackets, stale: sample.stalePackets, rejected: sample.rejectedPackets,
      frame: Number(sample.frameDeltaMs.toFixed(1)), physicsAge: Math.round(sample.physicsUpdateAgeMs),
      visualAge: Math.round(sample.visualUpdateAgeMs), visualChangeAge: Math.round(sample.visualChangeAgeMs),
      steps: sample.physicsSteps, extrapolation: Math.round(sample.extrapolationMs), state: sample.resamplerState,
      q: [sample.quaternionX, sample.quaternionY, sample.quaternionZ, sample.quaternionW].map(value => Number(value.toFixed(3))),
      qAge: sample.quaternionAgeMs === null ? null : Math.round(sample.quaternionAgeMs), errors: sample.runtimeErrors
    })) ?? [];
    elements.racketStallTelemetry.textContent = racketStallTelemetry.isStallActive()
      ? `STALL_DETECTED ${latestStallReasons.join(", ")}\n${JSON.stringify({ trace }, null, 2)}`
      : lastStall
        ? `STALL_DETECTED recovered; last=${lastStall.reasons.join(", ")} at ${(lastStall.detectedAt / 1000).toFixed(2)}s\n${JSON.stringify({ trace }, null, 2)}`
        : `STALL_CLEAR\n${JSON.stringify({ rollingSamples: racketStallTelemetry.snapshot().length }, null, 2)}`;
  }
  telemetryWindowStartedAt = now;
  telemetryPreviousPhysicsSteps = ballController.physicsState.totalSteps;
  telemetryFrames = 0;
  telemetryRenderMs = 0;
  telemetryPhysicsMs = 0;
  telemetryLongFrames = 0;
}

function updateCalibrationGuide(elapsed: number): void {
  elements.calibrationSummary.textContent = isCalibrated ? "calibrated" : "not calibrated";
  if (isCalibrated) {
    return;
  }

  const angleError = orientationPivot.quaternion.angleTo(identityQuaternion);
  const positionError = racketRoot.position.distanceTo(neutralRacketPosition);
  const alignment = 1 - clamp(angleError / 0.65, 0, 1);
  const pulse = (Math.sin(elapsed * 5) + 1) * 0.035;

  ghostCurrentColor.copy(ghostFarColor).lerp(ghostAlignedColor, alignment);
  for (const material of ghostMaterials) {
    material.color.copy(ghostCurrentColor);
    material.opacity = 0.2 + alignment * 0.28 + pulse;
  }

  const aligned = angleError <= 0.09 && positionError <= 0.12;

  if (!calibrationRequested) {
    elements.calibrationTitle.textContent = aligned
      ? "Racket aligned - tap Calibrate"
      : "Calibrate start position";
    return;
  }

  if (!aligned) {
    alignmentStableSince = null;
    elements.calibrationTitle.textContent = "Move into the ghost racket";
    return;
  }

  alignmentStableSince ??= performance.now();
  elements.calibrationTitle.textContent = "Hold steady";

  if (performance.now() - alignmentStableSince >= 450) {
    completeCalibration();
  }
}

function calibrateFromLatestPhonePose(): void {
  if (!latestOrientationPacket) {
    elements.calibrationTitle.textContent = "Waiting for phone orientation";
    return;
  }

  beginCalibration(convertedPhoneQuaternion);
}

function beginCalibration(currentPhoneQuaternion: THREE.Quaternion): void {
  stopReplay();
  neutralPhoneQuaternion.copy(currentPhoneQuaternion).normalize();
  calibrationBaselineInverse.copy(neutralPhoneQuaternion).invert();
  sensorNormalizer.reset();
  forwardSwingFusion.reset();
  sensorResampler.reset();
  latestSensorFrame = null;
  latestValidSensorFrame = null;
  latestVisualPoseValid = false;
  hasCalibrationBaseline = true;
  isCalibrated = false;
  calibrationRequested = true;
  alignmentStableSince = null;
  activeStroke = null;
  strokeStateMachine.reset(Date.now(), "calibration started");
  latestStrokeSnapshot = strokeStateMachine.getSnapshot(Date.now());
  proceduralPositionPivot.position.set(0, 0, 0);
  targetRacketQuaternion.identity();
  relativeOrientationQuaternion.identity();
  orientationPivot.quaternion.identity();
  calibrationGuide.visible = true;
  elements.calibrationOverlay.classList.remove("is-calibrated");
  elements.calibrationTitle.textContent = "Hold position";
  elements.calibrationInstructions.textContent =
    "Neutral phone pose captured. Keep the phone steady while the racket locks into ready position.";
}

function phoneQuaternionToThreeQuaternion(
  phoneQuaternion: THREE.Quaternion,
  target: THREE.Quaternion
): THREE.Quaternion {
  // Neutral phone axes: +X right, +Y toward the court, +Z toward the player.
  // Three.js axes: +X right, -Z toward the court, +Y up.
  return target
    .copy(PHONE_TO_THREE_BASIS)
    .multiply(phoneQuaternion)
    .multiply(PHONE_TO_THREE_BASIS_INVERSE)
    .normalize();
}

function updateOrientationDebug(): void {
  if (!SHOW_ORIENTATION_DEBUG) {
    return;
  }

  elements.debugSource.textContent = latestOrientationPacket
    ? "Expo DeviceMotion absolute quaternion"
    : latestPacket
      ? "browser orientation fallback"
      : "waiting";
  elements.debugCalibration.textContent = isCalibrated
    ? "calibrated"
    : calibrationRequested
      ? "locking"
      : "uncalibrated";
  elements.debugRawQuaternion.textContent = formatQuaternion(rawPhoneQuaternion);
  elements.debugConvertedQuaternion.textContent = formatQuaternion(convertedPhoneQuaternion);
  elements.debugNeutralQuaternion.textContent = hasCalibrationBaseline
    ? formatQuaternion(neutralPhoneQuaternion)
    : "not captured";
  elements.debugRelativeQuaternion.textContent = formatQuaternion(displayedRelativeQuaternion);
  elements.debugFinalQuaternion.textContent = formatQuaternion(finalRacketQuaternion);

  if (!latestSensorFrame) {
    elements.debugAngularSpeed.textContent = "--";
    elements.debugAcceleration.textContent = "--";
    elements.debugJerk.textContent = "--";
    elements.debugMotionScores.textContent = "--";
    elements.debugRacketBasis.textContent = "--";
    elements.debugFaceAngle.textContent = "--";
    elements.debugSensorValidity.textContent = "waiting";
    return;
  }

  elements.debugAngularSpeed.textContent =
    `${latestSensorFrame.angularSpeed.toFixed(2)} rad/s`;
  elements.debugAcceleration.textContent =
    `${formatVector(latestSensorFrame.smoothedAcceleration)} ` +
    `${latestSensorFrame.accelerationMagnitude.toFixed(2)} m/s²`;
  elements.debugJerk.textContent = `${latestSensorFrame.jerk.toFixed(2)} m/s³`;
  elements.debugMotionScores.textContent =
    `forward ${latestSensorFrame.motionForwardScore.toFixed(2)}, ` +
    `up ${latestSensorFrame.motionUpwardScore.toFixed(2)}, ` +
    `side ${latestSensorFrame.motionSidewaysScore.toFixed(2)}`;
  elements.debugRacketBasis.textContent =
    `F${formatVector(latestSensorFrame.racketForwardVector)} ` +
    `U${formatVector(latestSensorFrame.racketUpVector)} ` +
    `S${formatVector(latestSensorFrame.racketSideVector)}`;
  elements.debugFaceAngle.textContent =
    `${THREE.MathUtils.radToDeg(latestSensorFrame.racketFaceAngleToCourtRadians).toFixed(1)}°`;
  elements.debugSensorValidity.textContent = latestSensorFrame.valid
    ? "valid"
    : `rejected: ${latestSensorFrame.rejectionReason}`;
}

function formatQuaternion(value: THREE.Quaternion): string {
  return `[${value.x.toFixed(3)}, ${value.y.toFixed(3)}, ${value.z.toFixed(3)}, ${value.w.toFixed(3)}]`;
}

function formatVector(value: THREE.Vector3): string {
  return `[${value.x.toFixed(2)}, ${value.y.toFixed(2)}, ${value.z.toFixed(2)}]`;
}

function nullableVectorToThree(
  value: { x: number | null; y: number | null; z: number | null } | null
): THREE.Vector3 {
  return new THREE.Vector3(value?.x ?? 0, value?.y ?? 0, value?.z ?? 0);
}

function processStrokeFrame(frame: NormalizedSensorFrame): void {
  const racketPosition = new THREE.Vector3();
  racketRoot.getWorldPosition(racketPosition);
  strokeStateMachine.process(frame, racketPosition);
  latestStrokeSnapshot = strokeStateMachine.getSnapshot(frame.timestamp);
}

function onEstimatedRacketContact(event: EstimatedRacketContact): void {
  lastContactEvent = event;
  contactFlashUntil = performance.now() + 120;
  targetSwingSpeedKmh = Math.max(targetSwingSpeedKmh, event.estimatedSpeed);
  peakSwingSpeedKmh = Math.max(peakSwingSpeedKmh, event.estimatedSpeed);
}

function updateProceduralPosition(): void {
  const snapshot = latestStrokeSnapshot;
  const path = STROKE_CONFIG.proceduralPath;
  let target: readonly number[] = path.ready;
  const trainingSwingIntent = latestEasySwingIntent ?? easySwingIntentDetector.getSnapshot(
    Date.now(), ballController.ball.lockedStrokeType
  );
  const latchedTrainingSwing = trainingSwingIntent.active &&
    Date.now() <= trainingSwingIntent.expiresAt;
  const easyMotionContact = assistMode === "easy" && ballController.ball.active &&
    ballController.ball.bounceCount === 1 &&
    (latestSensorFrame?.valid === true || latchedTrainingSwing) &&
    (latchedTrainingSwing || (latestSensorFrame?.angularSpeed ?? 0) >= BALL_CONFIG.easyAssist.minimumAngularSpeed) &&
    ballController.ball.position.distanceTo(ballController.ball.contactTarget) <= 1.15;

  if (!easyMotionContact && stabilizeTrainingRacketOrigin(
    proceduralPositionPivot.position,
    snapshot?.currentState ?? null,
    playerAssistLevel
  )) return;

  if (easyMotionContact) {
    target = [
      Math.abs(BALL_CONFIG.launch.easyForehand.contactSideOffset),
      path.contactWindow[1] + BALL_CONFIG.launch.easyContactPoseLift,
      path.contactWindow[2] + BALL_CONFIG.easyAssist.naturalReachDepthOffset
    ];
  } else if (snapshot) {
    switch (snapshot.currentState) {
      case "PREPARATION":
        target = path.preparation;
        break;
      case "BACKSWING":
        target = path.backswing;
        break;
      case "RACKET_DROP":
        target = path.racketDrop;
        break;
      case "FORWARD_SWING":
        target = path.forwardSwing;
        break;
      case "CONTACT_WINDOW":
        target = [
          Math.abs(BALL_CONFIG.launch.easyForehand.contactSideOffset),
          path.contactWindow[1] + BALL_CONFIG.launch.easyContactPoseLift,
          path.contactWindow[2] + BALL_CONFIG.easyAssist.naturalReachDepthOffset
        ];
        break;
      case "FOLLOW_THROUGH":
        target = path.followThrough;
        break;
      case "RECOVERY":
        target = path.recovery;
        break;
    }
  }

  const handSign = strokeStateMachine.getHandedness() === "right" ? 1 : -1;
  const measuredAssistedStroke = trainingSwingIntent.active
    ? trainingSwingIntent.strokeType
    : detectedEasySwingSide(snapshot);
  const feedStrokeType = ballController.ball.expectedStrokeType;
  const assistedStrokeType = playerAssistLevel === "training" && ballController.ball.active
    ? feedStrokeType
    : measuredAssistedStroke ?? (isBackhandPreset(ballController.ball.launchPreset) ? "backhand" : "forehand");
  const preparationSign = easyMotionContact
    ? assistedStrokeType === "backhand" ? -handSign : handSign
    : snapshot?.lockedStrokeType === "backhand"
    ? -handSign
    : snapshot?.lockedStrokeType === "forehand"
      ? handSign
      : (snapshot?.scores.forehandCandidateScore ?? 0) >=
          (snapshot?.scores.backhandCandidateScore ?? 0)
        ? handSign
        : -handSign;
  strokePositionOffset.set(target[0] * preparationSign, target[1], target[2]);
  // racketRoot is scaled for the GLB's centimeter-sized coordinates.
  strokePositionOffset.multiplyScalar(100);
  const positionSmoothing = easyMotionContact || snapshot?.currentState === "CONTACT_WINDOW"
    ? BALL_CONFIG.launch.expectedContactPositionSmoothing
    : path.smoothing;
  proceduralPositionPivot.position.lerp(strokePositionOffset, positionSmoothing);
}

function createEasyHitMotion(): EasyHitMotion | null {
  if (!latestSensorFrame) return null;
  const expectedStroke = ballController.ball.lockedStrokeType;
  const measuredSwingIntent = latestEasySwingIntent ?? easySwingIntentDetector.getSnapshot(
    Date.now(),
    expectedStroke
  );
  const swingIntent = playerAssistLevel === "training" && measuredSwingIntent.active
    ? { ...measuredSwingIntent, strokeType: expectedStroke }
    : measuredSwingIntent;
  const techniqueFrame = latestSensorFrame.valid
    ? latestSensorFrame
    : swingIntent.active ? latestValidSensorFrame ?? latestSensorFrame : latestSensorFrame;
  const playerBasis = (activeCalibrationProfile ?? trajectoryProfiles[expectedStroke] ??
    createDefaultTrajectoryProfile(expectedStroke, strokeStateMachine.getHandedness())).playerBasisAtCalibration;
  // Keep the technique at the swing peak. The contact assist may resolve a few
  // frames later, after the phone has naturally slowed into follow-through.
  const techniqueTimestamp = swingIntent.active && (swingIntent.peakSourceTimestamp ?? 0) > 0
    ? swingIntent.peakSourceTimestamp!
    : latestSensorFrame.timestamp;
  const forwardSwing = forwardSwingFusion.snapshot(techniqueTimestamp, playerBasis) ?? undefined;
  const motion: EasyHitMotion = {
    valid: techniqueFrame.valid || swingIntent.active,
    sensorTimestamp: techniqueFrame.timestamp,
    angularSpeed: techniqueFrame.angularSpeed,
    angularVelocityWorld: techniqueFrame.angularVelocityWorld,
    accelerationMagnitude: techniqueFrame.accelerationMagnitude,
    racketQuaternion: techniqueFrame.mappedRacketQuaternion,
    racketFaceNormal: techniqueFrame.racketFaceNormal,
    racketForwardVector: techniqueFrame.racketForwardVector,
    racketUpVector: techniqueFrame.racketUpVector,
    racketSideVector: techniqueFrame.racketSideVector,
    racketFaceAngle: techniqueFrame.racketFaceAngleToCourtRadians,
    motionForwardScore: techniqueFrame.motionForwardScore,
    motionUpwardScore: techniqueFrame.motionUpwardScore,
    motionSidewaysScore: techniqueFrame.motionSidewaysScore,
    handedness: strokeStateMachine.getHandedness(),
    backhandStyle: strokeStateMachine.getBackhandStyle(),
    swingIntent,
    forwardSwing,
    playabilityAssistStrength: BALL_CONFIG.playerAssist[playerAssistLevel].directionAnchorStrength
  };
  const calibratedSlice = classifyCalibratedSlice(motion, sliceCalibrationData);
  if (calibratedSlice) {
    motion.calibratedSliceIntent = calibratedSlice.intent;
    motion.calibratedSliceConfidence = calibratedSlice.confidence;
  }
  return motion;
}

function updateTrainingFeedMetrics(now: number): void {
  const ball = ballController.ball;
  if (playerAssistLevel !== "training" || !ball.active || ball.hit || ball.state === "RETURNED") return;
  trainingStringBedCenter.setFromMatrixPosition(racketStringCollider.matrixWorld);
  trainingClosestStringBedDistance = Math.min(
    trainingClosestStringBedDistance,
    ball.position.distanceTo(trainingStringBedCenter)
  );
  if (trainingStrikeZoneEntryAt === null && isInsideTrainingStrikeZone(
    ball.position, ball.contactTarget, ball.expectedStrokeType
  )) {
    trainingStrikeZoneEntryAt = now;
  }
  trainingStrikeZoneOffsetScratch.copy(ball.position).sub(ball.contactTarget);
  const strikeZoneRadii = ball.expectedStrokeType === "backhand"
    ? TRAINING_BACKHAND_STRIKE_ZONE_RADII : TRAINING_STRIKE_ZONE_RADII;
  const normalizedZoneMetric =
    trainingStrikeZoneOffsetScratch.x ** 2 / strikeZoneRadii.lateral ** 2 +
    trainingStrikeZoneOffsetScratch.y ** 2 / strikeZoneRadii.vertical ** 2 +
    trainingStrikeZoneOffsetScratch.z ** 2 / strikeZoneRadii.depth ** 2;
  if (normalizedZoneMetric < trainingClosestStrikeZoneMetric) {
    trainingClosestStrikeZoneMetric = normalizedZoneMetric;
    trainingClosestStrikeZoneOffset.copy(trainingStrikeZoneOffsetScratch);
  }

  const intentActive = latestEasySwingIntent?.active === true;
  if (latestStrokeSnapshot?.currentState === "READY" && !intentActive) {
    trainingMaximumNeutralOriginDriftMeters = Math.max(
      trainingMaximumNeutralOriginDriftMeters,
      proceduralPositionPivot.position.length() * 0.01
    );
  }
  const decision = ballController.lastPlayableDecision;
  if (!intentActive || !decision) return;
  if (decision.timing === "TOO EARLY") trainingSawActiveIntentBeforeWindow = true;
  else if (decision.timing === "TOO LATE") trainingSawActiveIntentAfterWindow = true;
  else {
    trainingSawActiveIntentInWindow = true;
    const measuredForward = latestSensorFrame?.motionForwardScore ?? 0;
    const minimumForward = ball.expectedStrokeType === "backhand"
      ? BALL_CONFIG.playerAssist.training.minimumForwardDriveScore * 0.45
      : BALL_CONFIG.playerAssist.training.minimumForwardDriveScore;
    if (measuredForward >= minimumForward) {
      trainingSawForwardIntentInWindow = true;
    }
    if (decision.reason !== null) trainingRejectedInWindow = decision.reason;
  }
}

function updateStrokeDebug(): void {
  const snapshot = latestStrokeSnapshot;
  if (!snapshot) {
    elements.strokeState.textContent = "READY";
    elements.strokeType.textContent = "--";
    elements.strokeConfidence.textContent = "0%";
    elements.spinStatus.textContent = "--";
    elements.lastContact.textContent = "none";
    return;
  }

  const scores = snapshot.scores;
  elements.strokeState.textContent = replayActive
    ? `${snapshot.currentState} (replay)`
    : snapshot.currentState;
  elements.strokeType.textContent = snapshot.lockedStrokeType;
  elements.strokeConfidence.textContent = `${Math.round(snapshot.confidence * 100)}%`;
  elements.spinStatus.textContent = scores.spinType;
  elements.lastContact.textContent = lastContactEvent
    ? `${lastContactEvent.strokeType}, ${lastContactEvent.spinType}, ${lastContactEvent.estimatedSpeed.toFixed(1)} km/h`
    : "none";
  elements.debugStrokeState.textContent = snapshot.currentState;
  elements.debugPlayerSetup.textContent =
    `${strokeStateMachine.getHandedness()}, ${strokeStateMachine.getBackhandStyle()} backhand`;
  elements.debugCandidates.textContent =
    `forehand ${scores.forehandCandidateScore.toFixed(2)}, ` +
    `backhand ${scores.backhandCandidateScore.toFixed(2)}, ` +
    `margin ${scores.classificationMargin.toFixed(2)}`;
  elements.debugStrokeScores.textContent =
    `prep ${scores.preparationScore.toFixed(2)}, reversal ${scores.reversalScore.toFixed(2)}, ` +
    `forward ${scores.forwardSwingScore.toFixed(2)}, contact ${scores.contactScore.toFixed(2)}, ` +
    `follow ${scores.followThroughScore.toFixed(2)}`;
  elements.debugStateDuration.textContent = `${Math.round(snapshot.stateDuration)} ms`;
  elements.debugPreparationDuration.textContent = `${Math.round(snapshot.preparationDuration)} ms`;
  elements.debugSpinScores.textContent =
    `low-to-high ${scores.lowToHighScore.toFixed(2)}, ` +
    `high-to-low ${scores.highToLowScore.toFixed(2)}, ` +
    `topspin ${scores.topspinScore.toFixed(2)}, slice ${scores.sliceScore.toFixed(2)}`;
  elements.debugStrokeRejection.textContent = snapshot.rejectionReason || "none";
  elements.debugLastStroke.textContent = snapshot.lastCompletedStroke;
  elements.debugLastContactTimestamp.textContent = snapshot.lastContactTimestamp === null
    ? "none"
    : String(Math.round(snapshot.lastContactTimestamp));
  elements.debugStrokeTimeline.textContent = snapshot.transitions.join(" -> ");
}

function wireStrokeControls(): void {
  elements.handednessSelect.addEventListener("change", () => {
    strokeStateMachine.setHandedness(elements.handednessSelect.value as Handedness);
  });
  elements.backhandStyleSelect.addEventListener("change", () => {
    strokeStateMachine.setBackhandStyle(elements.backhandStyleSelect.value as BackhandStyle);
  });
  elements.startRecordingButton.addEventListener("click", () => {
    motionRecorder.start(elements.recordingLabelSelect.value as RecordingLabel);
    elements.startRecordingButton.disabled = true;
    elements.stopRecordingButton.disabled = false;
  });
  elements.stopRecordingButton.addEventListener("click", () => {
    motionRecorder.stop();
    elements.startRecordingButton.disabled = false;
    elements.stopRecordingButton.disabled = true;
    const hasRecording = motionRecorder.getLastRecording() !== null;
    elements.downloadRecordingButton.disabled = !hasRecording;
    elements.replayRecordingButton.disabled = !hasRecording;
  });
  elements.downloadRecordingButton.addEventListener("click", downloadLastRecording);
  elements.replayRecordingButton.addEventListener("click", replayLastRecording);
  elements.stopReplayButton.addEventListener("click", stopReplay);
}

function downloadLastRecording(): void {
  const recording = motionRecorder.getLastRecording();
  if (!recording) {
    return;
  }
  const blob = new Blob([JSON.stringify(recording, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${recording.label}-${recording.createdAt}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function replayLastRecording(): void {
  const recording = motionRecorder.getLastRecording();
  if (!recording || recording.frames.length === 0) {
    return;
  }

  stopReplay();
  replayActive = true;
  elements.replayRecordingButton.disabled = true;
  elements.stopReplayButton.disabled = false;
  const frames = recording.frames.map(deserializeFrame);
  const replayOffset = Date.now() - frames[0].timestamp;
  for (const frame of frames) {
    frame.timestamp += replayOffset;
    frame.sensorTimestamp += replayOffset / 1000;
  }
  if (recording.gameplay?.launch) {
    activeLaunchPreset = recording.gameplay.launch.preset;
    ballSpeedPreset = recording.gameplay.launch.speed;
    ballController.launch(
      recording.gameplay.launch.preset,
      recording.gameplay.launch.handedness,
      recording.gameplay.launch.speed,
      Date.now(),
      recording.gameplay.launch.backhandStyle ?? "one-handed",
      recording.gameplay.launch.targetOffsets
    );
    if (recording.gameplay.launch.visualScaleMultiplier) {
      elements.ballVisualSizeSelect.value = "custom";
      elements.ballVisualScaleInput.value = String(recording.gameplay.launch.visualScaleMultiplier);
      updateBallVisualScale();
    }
    ballMesh.visible = true;
  }
  strokeStateMachine.reset(frames[0].timestamp, "replay started");

  const playFrame = (index: number): void => {
    if (!replayActive) {
      return;
    }
    latestSensorFrame = frames[index];
    processStrokeFrame(frames[index]);
    if (index >= frames.length - 1) {
      stopReplay();
      return;
    }
    const delay = clamp(frames[index + 1].timestamp - frames[index].timestamp, 1, 100);
    replayTimer = window.setTimeout(() => playFrame(index + 1), delay);
  };
  playFrame(0);
}

function stopReplay(): void {
  replayActive = false;
  if (replayTimer !== null) {
    window.clearTimeout(replayTimer);
    replayTimer = null;
  }
  elements.stopReplayButton.disabled = true;
  elements.replayRecordingButton.disabled = motionRecorder.getLastRecording() === null;
}

function wireDiagnosticControls(): void {
  elements.recordForehandAttempt.addEventListener("click", () => startRealHitAttempt("forehand"));
  elements.recordBackhandAttempt.addEventListener("click", () => startRealHitAttempt("backhand"));
  elements.downloadLastDiagnostic.addEventListener("click", downloadLastDiagnostic);
  elements.replayLastDiagnostic.addEventListener("click", replayLastDiagnostic);
  elements.analyzeLastAttempt.addEventListener("click", showLastDiagnosticAnalysis);
  updateDiagnosticReadiness();
}

function startRealHitAttempt(type: AttemptType): void {
  if (!isDiagnosticInputReady()) {
    setDiagnosticStatus("error", diagnosticReadinessMessage());
    return;
  }
  if (diagnosticTimeout !== null) window.clearTimeout(diagnosticTimeout);
  ballController.reset();
  assistMode = "easy"; ballSpeedPreset = "normal";
  elements.assistModeSelect.value = "easy"; elements.ballSpeedSelect.value = "normal";
  gameplayDiagnosticRecorder.start(type, performance.now());
  setDiagnosticStatus("recording", `recording ${type} attempt`);
  launchBall(type === "forehand" ? "easyForehand" : "easyBackhand");
  diagnosticTimeout = window.setTimeout(() => finishRealHitAttempt("TIMEOUT", "attempt timeout"), 7000);
}

function captureGameplayDiagnostic(timestamp: number, deltaTime: number): void {
  if (!gameplayDiagnosticRecorder.isRecording() || !latestSensorFrame) return;
  const ball = ballController.ball;
  const collision = ballController.lastCollision;
  const debug = ballController.hitDebug;
  const stringCenter = new THREE.Vector3().setFromMatrixPosition(racketStringCollider.matrixWorld);
  const stringQuaternion = new THREE.Quaternion();
  racketStringCollider.matrixWorld.decompose(stringCenter, stringQuaternion, new THREE.Vector3());
  const localBall = ball.position.clone().applyMatrix4(racketStringCollider.matrixWorld.clone().invert());
  const snapshot = latestStrokeSnapshot ?? strokeStateMachine.getSnapshot(Date.now());
  const intentType = ball.lockedStrokeType === "backhand" ? "backhand" : "forehand";
  const intent = easySwingIntentDetector.getSnapshot(Date.now(), intentType);
  const swept = ballController.sweptDebug;
  const calibrationProfile = trajectoryProfiles[ball.expectedStrokeType];
  const expectedContact = calibrationProfile ? new THREE.Vector3().fromArray(calibrationProfile.contactPointWorld) : ball.contactTarget;
  const actualSide = worldToPlayerLocal(ball.position, calibrationProfile?.playerBasisAtCalibration ?? createDefaultTrajectoryProfile(ball.expectedStrokeType, strokeStateMachine.getHandedness()).playerBasisAtCalibration).x;
  const contactAge = lastContactEvent ? Date.now() - lastContactEvent.timestamp : null;
  const frame: GameplayDiagnosticFrame = {
    timestamp, deltaTime, phoneQuaternion: latestSensorFrame.currentPhoneQuaternion.toArray(),
    relativePhoneQuaternion: latestSensorFrame.relativePhoneQuaternion.toArray(),
    racketQuaternion: latestSensorFrame.mappedRacketQuaternion.toArray(),
    angularVelocity: latestSensorFrame.angularVelocityWorld.toArray(), angularSpeed: latestSensorFrame.angularSpeed,
    acceleration: latestSensorFrame.smoothedAcceleration.toArray(), accelerationMagnitude: latestSensorFrame.accelerationMagnitude,
    jerk: latestSensorFrame.jerk, strokeState: snapshot.currentState, strokeType: snapshot.lockedStrokeType,
    preparationScore: snapshot.scores.preparationScore, forwardScore: latestSensorFrame.motionForwardScore,
    upwardScore: latestSensorFrame.motionUpwardScore, sidewaysScore: latestSensorFrame.motionSidewaysScore,
    contactScore: snapshot.scores.contactScore, strokeConfidence: snapshot.confidence,
    estimatedSwingSpeed: lastContactEvent?.estimatedSpeed ?? latestSensorFrame.angularSpeed * 3.2,
    ballState: ball.state, ballPosition: ball.position.toArray(), previousBallPosition: ball.previousPosition.toArray(),
    ballVelocity: ball.velocity.toArray(), bounceCount: ball.bounceCount, stringBedCenterWorld: stringCenter.toArray(),
    stringBedQuaternion: stringQuaternion.toArray(), racketFaceNormal: latestSensorFrame.racketFaceNormal.toArray(),
    ballPositionRacketLocal: localBall.toArray(), planeDistance: collision?.planeDistance ?? localBall.z,
    segmentPlaneCrossed: collision?.crossed ?? false, insideEllipse: (collision?.ellipseValue ?? Infinity) <= 1,
    insideWidth: collision?.insideWidth ?? false, insideHeight: collision?.insideHeight ?? false,
    // The model's +Z face normal is the valid incoming side for the calibrated
    // forehand recording: local Z moved from negative to positive at crossing.
    approachingCorrectFace: ball.velocity.dot(latestSensorFrame.racketFaceNormal) > 0,
    contactWindowActive: snapshot.currentState === "CONTACT_WINDOW", recentContactEvent: debug.recentContactEvent,
    contactEventAgeMs: contactAge, minimumStrokeSpeed: debug.minimumSwingSpeed * 3.2,
    swingSpeedPassed: debug.swingSpeedAboveThreshold, racketFaceAngle: latestSensorFrame.racketFaceAngleToCourtRadians,
    racketFaceAnglePassed: debug.racketPoseValid, ballNearTarget: debug.ballNearTarget,
    ballNearStringBed: debug.ballNearStringBed,
    easySwingIntentActive: intent.active, easySwingIntentConfidence: intent.confidence,
    minimumSweptDistance: swept.minimumSweptDistance,
    sweptPlaneCrossed: swept.sweptPlaneCrossed, sweptInsideEllipse: swept.sweptInsideEllipse,
    expectedStrokeType: ball.expectedStrokeType,
    detectedStrokeType: ballController.lastHit?.detectedStrokeType ?? snapshot.lockedStrokeType,
    resolvedHitStrokeType: ballController.lastHit?.resolvedHitStrokeType,
    strokeTypeMismatch: ballController.lastHit?.strokeTypeMismatch ?? "NONE",
    calibrationProfile,
    expectedContactPoint: expectedContact.toArray(), actualClosestPoint: ball.position.toArray(),
    contactPointMissVector: ball.position.clone().sub(expectedContact).toArray(),
    expectedApexPoint: calibrationProfile?.apexPointWorld, actualApexPoint: observedIncomingApex.toArray(),
    expectedBouncePoint: calibrationProfile?.bouncePointWorld, actualBouncePoint: observedBouncePoint.toArray(),
    expectedSide: ball.expectedStrokeType === "forehand" ? "player-right" : "player-left",
    actualSide: actualSide >= 0 ? "player-right" : "player-left",
    trajectoryDeviation: calibrationProfile ? ball.position.distanceTo(expectedContact) : undefined,
    calibrationProfileVersion: calibrationProfile?.version,
    finalHitAccepted: ball.hit,
    rejectionReason: debug.rejectionReason, sensorValid: latestSensorFrame.valid
  };
  gameplayDiagnosticRecorder.capture(frame);
}

function finishRealHitAttempt(result: "HIT" | "MISS" | "TIMEOUT", reason: string): void {
  if (!gameplayDiagnosticRecorder.isRecording()) return;
  if (diagnosticTimeout !== null) { window.clearTimeout(diagnosticTimeout); diagnosticTimeout = null; }
  const recording = gameplayDiagnosticRecorder.stop(result, reason);
  if (!recording) return;
  elements.downloadLastDiagnostic.disabled = false;
  elements.replayLastDiagnostic.disabled = recording.frames.length === 0;
  elements.analyzeLastAttempt.disabled = false;
  setDiagnosticStatus("analyzing", "analyzing last attempt");
  showLastDiagnosticAnalysis();
  const analysis = analyzeGameplayDiagnostic(recording);
  socket.emit("diagnostic:report", { markdown: diagnosticMarkdown(recording, analysis) });
}

function showLastDiagnosticAnalysis(): void {
  const recording = gameplayDiagnosticRecorder.getLast();
  if (!recording) return;
  const analysis = analyzeGameplayDiagnostic(recording);
  elements.diagnosticResult.textContent = `${analysis.result}: ${analysis.primaryRootCause}; closest ${analysis.closestApproachDistance.toFixed(3)} m; estimated peak ${analysis.peakSwingSpeed.toFixed(1)} km/h; failed ${analysis.failedConditions.join(", ") || "none"}`;
  setDiagnosticStatus("ready", "ready - last attempt analyzed");
  elements.diagnosticTimeline.textContent = recording.frames.filter((_frame, index) => index % 6 === 0).map(frame =>
    `${(frame.timestamp - recording.createdAt).toFixed(0)}ms  d=${Math.hypot(frame.ballPosition[0]-frame.stringBedCenterWorld[0], frame.ballPosition[1]-frame.stringBedCenterWorld[1], frame.ballPosition[2]-frame.stringBedCenterWorld[2]).toFixed(2)}  speed=${frame.estimatedSwingSpeed.toFixed(1)}  score=${frame.contactScore.toFixed(2)}  ${frame.strokeState}  age=${frame.contactEventAgeMs ?? "--"}  plane=${frame.planeDistance.toFixed(2)}`
  ).join("\n");
}

function downloadLastDiagnostic(): void {
  const recording = gameplayDiagnosticRecorder.getLast();
  if (!recording) return;
  const blob = new Blob([JSON.stringify(recording, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `real-hit-attempt-${recording.createdAt}.json`; link.click(); URL.revokeObjectURL(url);
}

function replayLastDiagnostic(): void {
  const recording = gameplayDiagnosticRecorder.getLast();
  if (!recording?.frames.length) return;
  if (diagnosticReplayTimer !== null) window.clearTimeout(diagnosticReplayTimer);
  const closestTime = analyzeGameplayDiagnostic(recording).closestApproachTime;
  const play = (index: number): void => {
    const frame = recording.frames[index];
    ballMesh.visible = true; ballMesh.position.fromArray(frame.ballPosition);
    racketStringCollider.quaternion.fromArray(frame.stringBedQuaternion);
    if (frame.timestamp === closestTime || frame.segmentPlaneCrossed || frame.contactWindowActive) {
      contactMarker.position.fromArray(frame.ballPosition); contactMarker.visible = true;
    }
    if (index < recording.frames.length - 1) {
      diagnosticReplayTimer = window.setTimeout(() => play(index + 1), clamp(recording.frames[index + 1].timestamp - frame.timestamp, 1, 100));
    }
  };
  play(0);
}

function wireTrajectoryCalibration(): void {
  const begin = (strokeType: CalibrationStrokeType): void => {
    editingTrajectoryType = strokeType;
    editingTrajectory = structuredClone(trajectoryProfiles[strokeType] ?? createDefaultTrajectoryProfile(
      strokeType, strokeStateMachine.getHandedness()
    ));
    trajectoryCalibrationGroup.visible = true;
    syncTrajectoryControls();
    renderTrajectoryCalibration();
  };
  elements.calibrateForehandTrajectory.addEventListener("click", () => begin("forehand"));
  elements.calibrateBackhandTrajectory.addEventListener("click", () => begin("backhand"));
  elements.captureForehandContact.addEventListener("click", () => captureTrajectoryContact("forehand", begin));
  elements.captureBackhandContact.addEventListener("click", () => captureTrajectoryContact("backhand", begin));
  elements.saveForehandTrajectory.addEventListener("click", () => saveEditingTrajectory("forehand"));
  elements.saveBackhandTrajectory.addEventListener("click", () => saveEditingTrajectory("backhand"));
  elements.resetForehandTrajectory.addEventListener("click", () => resetSavedTrajectory("forehand"));
  elements.resetBackhandTrajectory.addEventListener("click", () => resetSavedTrajectory("backhand"));
  elements.exportValidatedCalibration.addEventListener("click", exportValidatedCalibration);
  elements.restoreValidatedPreset.addEventListener("click", restoreValidatedPreset);
  elements.previewCalibratedFeed.addEventListener("click", previewEditingTrajectory);
  elements.trajectorySideView.addEventListener("click", () => setTrajectoryCamera("side"));
  elements.trajectoryTopView.addEventListener("click", () => setTrajectoryCamera("top"));
  elements.trajectoryPlayerView.addEventListener("click", () => setTrajectoryCamera("player"));
  elements.useCalibratedFeeds.checked = localStorage.getItem("matchpoint.useCalibratedFeeds") !== "false";
  elements.useCalibratedFeeds.addEventListener("change", () => localStorage.setItem("matchpoint.useCalibratedFeeds", String(elements.useCalibratedFeeds.checked)));
  const inputs = [
    elements.trajectoryBounceX, elements.trajectoryBounceZ, elements.trajectoryBounceHeight,
    elements.trajectoryContactHeight, elements.trajectoryOverallSpeed
  ];
  inputs.forEach(input => input.addEventListener("input", readTrajectoryControls));
  elements.trajectoryApexHeight.addEventListener("input", changeTrajectoryArcHeight);
  elements.trajectoryBounceToContact.addEventListener("input", changeTrajectoryContactTime);
  renderer.domElement.addEventListener("pointerdown", beginTrajectoryDrag);
  renderer.domElement.addEventListener("pointermove", updateTrajectoryDrag);
  renderer.domElement.addEventListener("pointerup", endTrajectoryDrag);
  renderer.domElement.addEventListener("pointercancel", endTrajectoryDrag);
  updateTrajectoryStatuses();
}

function captureTrajectoryContact(strokeType: CalibrationStrokeType, begin: (type: CalibrationStrokeType) => void): void {
  if (!isDiagnosticInputReady()) {
    elements.trajectoryCalibrationMessage.textContent = `${diagnosticReadinessMessage()} before capturing a contact point.`;
    return;
  }
  if (!editingTrajectory || editingTrajectoryType !== strokeType) begin(strokeType);
  if (!editingTrajectory) return;
  scene.updateMatrixWorld(true);
  const center = new THREE.Vector3().setFromMatrixPosition(racketStringCollider.matrixWorld);
  const quaternion = new THREE.Quaternion();
  racketStringCollider.matrixWorld.decompose(new THREE.Vector3(), quaternion, new THREE.Vector3());
  editingTrajectory.contactPointWorld = center.toArray();
  editingTrajectory.contactPointPlayerLocal = worldToPlayerLocal(center, editingTrajectory.playerBasisAtCalibration).toArray();
  editingTrajectory.contactRacketQuaternion = quaternion.toArray();
  editingTrajectory.contactFaceNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize().toArray();
  editingTrajectory.createdAt = Date.now();
  syncTrajectoryControls();
  renderTrajectoryCalibration();
}

function saveEditingTrajectory(strokeType: CalibrationStrokeType): void {
  if (!editingTrajectory || editingTrajectoryType !== strokeType) {
    elements.trajectoryCalibrationMessage.textContent = `Select and calibrate ${strokeType} first.`;
    return;
  }
  try {
    saveTrajectoryProfile(localStorage, editingTrajectory);
    markTrajectoryProfileAsUser(localStorage, strokeType);
    trajectoryProfiles[strokeType] = structuredClone(editingTrajectory);
    trajectoryProfileSources[strokeType] = "User calibration";
    elements.trajectoryCalibrationMessage.textContent = `${strokeType} trajectory saved.`;
    updateTrajectoryStatuses();
  } catch (error) {
    elements.trajectoryCalibrationMessage.textContent = error instanceof Error ? error.message : "Calibration save failed";
  }
}

function resetSavedTrajectory(strokeType: CalibrationStrokeType): void {
  resetTrajectoryProfile(localStorage, strokeType);
  markTrajectoryProfileAsUser(localStorage, strokeType);
  const loaded = loadTrajectoryProfileWithPriority(localStorage, strokeType, strokeStateMachine.getHandedness());
  trajectoryProfiles[strokeType] = loaded.profile;
  trajectoryProfileSources[strokeType] = loaded.source;
  if (editingTrajectoryType === strokeType) editingTrajectory = structuredClone(loaded.profile);
  updateTrajectoryStatuses();
  syncTrajectoryControls();
  renderTrajectoryCalibration();
}

function exportValidatedCalibration(): void {
  const forehand = loadTrajectoryProfile(localStorage, "forehand");
  const backhand = loadTrajectoryProfile(localStorage, "backhand");
  if (!forehand || !backhand) {
    elements.trajectoryCalibrationMessage.textContent = "Export requires valid user forehand and backhand calibrations.";
    return;
  }
  const blob = new Blob([JSON.stringify({ forehand, backhand }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "validated-trajectory-calibration.json";
  link.click();
  URL.revokeObjectURL(url);
  elements.trajectoryCalibrationMessage.textContent = "Validated calibration exported.";
}

function restoreValidatedPreset(): void {
  restoreValidatedTrajectoryPreset(localStorage);
  for (const strokeType of ["forehand", "backhand"] as const) {
    const loaded = loadTrajectoryProfileWithPriority(localStorage, strokeType);
    trajectoryProfiles[strokeType] = loaded.profile;
    trajectoryProfileSources[strokeType] = loaded.source;
  }
  editingTrajectory = structuredClone(trajectoryProfiles[editingTrajectoryType]!);
  updateTrajectoryStatuses();
  syncTrajectoryControls();
  renderTrajectoryCalibration();
  elements.trajectoryCalibrationMessage.textContent = "Validated project preset restored to localStorage.";
}

function previewEditingTrajectory(): void {
  if (!editingTrajectory) {
    elements.trajectoryCalibrationMessage.textContent = "Select a trajectory before previewing.";
    return;
  }
  const solved = solveTrajectoryProfile(editingTrajectory);
  if (!solved.valid) {
    elements.trajectoryCalibrationMessage.textContent = solved.errors.join("; ");
    return;
  }
  previewTrajectoryActive = true;
  const preset = editingTrajectory.strokeType === "forehand" ? "guaranteedForehand" : "guaranteedBackhand";
  launchBall(preset, editingTrajectory, true);
  elements.trajectoryCalibrationMessage.textContent = "Preview active: collision and HIT registration disabled.";
}

function syncTrajectoryControls(): void {
  if (!editingTrajectory) return;
  elements.trajectoryBounceX.value = String(editingTrajectory.bouncePointWorld[0]);
  elements.trajectoryBounceZ.value = String(editingTrajectory.bouncePointWorld[2]);
  elements.trajectoryBounceHeight.value = String(editingTrajectory.bouncePointWorld[1]);
  elements.trajectoryApexHeight.value = String(editingTrajectory.apexPointWorld[1]);
  elements.trajectoryContactHeight.value = String(editingTrajectory.contactPointWorld[1]);
  elements.trajectoryBounceToApex.value = String(editingTrajectory.bounceToApexMs);
  elements.trajectoryBounceToContact.value = String(editingTrajectory.bounceToContactMs);
  elements.trajectoryOverallSpeed.value = String(editingTrajectory.overallSpeed);
  updateTrajectoryOutputs();
}

function readTrajectoryControls(): void {
  if (!editingTrajectory) return;
  editingTrajectory.bouncePointWorld[0] = Number(elements.trajectoryBounceX.value);
  editingTrajectory.bouncePointWorld[2] = Number(elements.trajectoryBounceZ.value);
  editingTrajectory.bouncePointWorld[1] = Number(elements.trajectoryBounceHeight.value);
  editingTrajectory.contactPointWorld[1] = Number(elements.trajectoryContactHeight.value);
  editingTrajectory.contactPointPlayerLocal = worldToPlayerLocal(
    new THREE.Vector3().fromArray(editingTrajectory.contactPointWorld), editingTrajectory.playerBasisAtCalibration
  ).toArray();
  editingTrajectory.overallSpeed = Number(elements.trajectoryOverallSpeed.value);
  try { setProfileArcHeight(editingTrajectory, Number(elements.trajectoryApexHeight.value)); } catch { /* rendered below */ }
  updateTrajectoryOutputs();
  renderTrajectoryCalibration();
}

function changeTrajectoryArcHeight(): void {
  if (!editingTrajectory) return;
  try {
    setProfileArcHeight(editingTrajectory, Number(elements.trajectoryApexHeight.value));
    syncTrajectoryControls();
  } catch (error) {
    elements.trajectoryCalibrationMessage.textContent = error instanceof Error ? error.message : "Invalid arc height";
  }
  renderTrajectoryCalibration();
}

function changeTrajectoryContactTime(): void {
  if (!editingTrajectory) return;
  editingTrajectory.bounceToContactMs = Number(elements.trajectoryBounceToContact.value);
  synchronizeProfileApexFromTiming(editingTrajectory);
  syncTrajectoryControls();
  renderTrajectoryCalibration();
}

function updateTrajectoryOutputs(): void {
  if (!editingTrajectory) return;
  elements.trajectoryBounceXValue.value = `${editingTrajectory.bouncePointWorld[0].toFixed(2)} m`;
  elements.trajectoryBounceZValue.value = `${editingTrajectory.bouncePointWorld[2].toFixed(2)} m`;
  elements.trajectoryBounceHeightValue.value = `${editingTrajectory.bouncePointWorld[1].toFixed(2)} m`;
  elements.trajectoryApexHeightValue.value = `${editingTrajectory.apexPointWorld[1].toFixed(2)} m`;
  elements.trajectoryContactHeightValue.value = `${editingTrajectory.contactPointWorld[1].toFixed(2)} m`;
  elements.trajectoryBounceToApexValue.value = `${Math.round(editingTrajectory.bounceToApexMs)} ms`;
  elements.trajectoryBounceToContactValue.value = `${Math.round(editingTrajectory.bounceToContactMs)} ms`;
  elements.trajectoryOverallSpeedValue.value = `${editingTrajectory.overallSpeed.toFixed(1)} m/s`;
}

function renderTrajectoryCalibration(): void {
  if (!editingTrajectory) { trajectoryCalibrationGroup.visible = false; return; }
  trajectoryCalibrationGroup.visible = true;
  const solved = solveTrajectoryProfile(editingTrajectory);
  const points = [editingTrajectory.launchPointWorld, editingTrajectory.bouncePointWorld, solved.solvedApexPoint.toArray(), editingTrajectory.contactPointWorld];
  trajectoryHandles.forEach((handle, index) => handle.position.fromArray(points[index]));
  trajectoryHandleLabels.forEach((label, index) => label.position.copy(trajectoryHandles[index].position).add(new THREE.Vector3(0, 0.2, 0)));
  requestedTrajectoryGeometry.setFromPoints(solved.requestedCurve);
  requestedTrajectoryLine.computeLineDistances();
  physicalTrajectoryGeometry.setFromPoints(solved.physicalCurve);
  elements.trajectoryTimingStatus.textContent =
    `Bounce ${Math.round(solved.launchToBounceSeconds * 1000)} ms | Apex ${Math.round(editingTrajectory.bounceToApexMs)} ms | ` +
    `Contact ${Math.round(editingTrajectory.bounceToContactMs)} ms | Second bounce ${Math.round(solved.secondBounceMs)} ms | ` +
    `Safety ${Math.round(solved.safetyMarginMs)} ms | Deviation ${solved.maximumCurveDeviation.toFixed(2)} m`;
  const bounceLocal = worldToPlayerLocal(new THREE.Vector3().fromArray(editingTrajectory.bouncePointWorld), editingTrajectory.playerBasisAtCalibration);
  const contactLocal = worldToPlayerLocal(new THREE.Vector3().fromArray(editingTrajectory.contactPointWorld), editingTrajectory.playerBasisAtCalibration);
  const horizontalBounce = new THREE.Vector3().fromArray(editingTrajectory.bouncePointWorld);
  const horizontalContact = new THREE.Vector3().fromArray(editingTrajectory.contactPointWorld);
  const directHorizontal = solved.physicalCurve.every((point, index) => {
    const amount = index / Math.max(1, solved.physicalCurve.length - 1);
    const expected = horizontalBounce.clone().lerp(horizontalContact, amount);
    return Math.hypot(point.x - expected.x, point.z - expected.z) < 1e-6;
  });
  const sideEnvelope = editingTrajectory.strokeType === "forehand"
    ? Math.min(bounceLocal.x, contactLocal.x) > 0
    : Math.max(bounceLocal.x, contactLocal.x) < 0;
  elements.trajectoryViewValidation.textContent =
    `Top-down direct ${directHorizontal && sideEnvelope ? "PASS" : "FAIL"} | ` +
    `Side arc ${solved.solvedApexPoint.y > Math.max(editingTrajectory.bouncePointWorld[1], editingTrajectory.contactPointWorld[1]) ? "PASS" : "FAIL"}`;
  elements.trajectoryCalibrationMessage.textContent = solved.valid
    ? `${editingTrajectoryType} physical trajectory valid.`
    : `${solved.errors.join("; ")} Suggested physical apex: ${solved.solvedApexPoint.y.toFixed(2)} m.`;
}

function updateTrajectoryStatuses(): void {
  elements.forehandCalibrationStatus.textContent = trajectoryProfiles.forehand ? "calibrated" : "not calibrated";
  elements.backhandCalibrationStatus.textContent = trajectoryProfiles.backhand ? "calibrated" : "not calibrated";
  elements.forehandProfileSource.textContent = trajectoryProfileSources.forehand;
  elements.backhandProfileSource.textContent = trajectoryProfileSources.backhand;
}

function beginTrajectoryDrag(event: PointerEvent): void {
  if (!trajectoryCalibrationGroup.visible) return;
  setTrajectoryPointer(event);
  trajectoryRaycaster.setFromCamera(trajectoryPointer, camera);
  draggedTrajectoryHandle = trajectoryRaycaster.intersectObjects(trajectoryHandles, false)[0]?.object as (typeof trajectoryHandles)[number] | null;
  if (draggedTrajectoryHandle) renderer.domElement.setPointerCapture(event.pointerId);
}

function updateTrajectoryDrag(event: PointerEvent): void {
  if (!draggedTrajectoryHandle || !editingTrajectory) return;
  if (draggedTrajectoryHandle.name === "trajectory-apex") {
    const height = THREE.MathUtils.clamp(editingTrajectory.apexPointWorld[1] - event.movementY * 0.01, 0.8, 2.5);
    try { setProfileArcHeight(editingTrajectory, height); } catch { /* rendered below */ }
  } else {
    setTrajectoryPointer(event);
    trajectoryRaycaster.setFromCamera(trajectoryPointer, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -draggedTrajectoryHandle.position.y);
    const point = trajectoryRaycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (point) {
      const index = trajectoryHandles.indexOf(draggedTrajectoryHandle);
      const target = index === 0 ? editingTrajectory.launchPointWorld : index === 1 ? editingTrajectory.bouncePointWorld : editingTrajectory.contactPointWorld;
      target[0] = THREE.MathUtils.clamp(point.x, -4, 4);
      target[2] = THREE.MathUtils.clamp(point.z, -8, 3);
      if (index === 3) editingTrajectory.contactPointPlayerLocal = worldToPlayerLocal(point, editingTrajectory.playerBasisAtCalibration).toArray();
      try { setProfileArcHeight(editingTrajectory, editingTrajectory.apexPointWorld[1]); } catch { /* rendered below */ }
    }
  }
  syncTrajectoryControls();
  renderTrajectoryCalibration();
}

function endTrajectoryDrag(event: PointerEvent): void {
  if (draggedTrajectoryHandle && renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
  draggedTrajectoryHandle = null;
}

function setTrajectoryPointer(event: PointerEvent): void {
  const bounds = renderer.domElement.getBoundingClientRect();
  trajectoryPointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
}

function createTrajectoryLabel(text: string, color: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "rgba(2, 8, 18, .82)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = "bold 25px system-ui";
  context.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.scale.set(1.8, 0.3, 1);
  sprite.renderOrder = 21;
  return sprite;
}

function setTrajectoryCamera(view: "side" | "top" | "player"): void {
  const focus = editingTrajectory
    ? new THREE.Vector3().fromArray(editingTrajectory.bouncePointWorld).lerp(new THREE.Vector3().fromArray(editingTrajectory.contactPointWorld), 0.5)
    : new THREE.Vector3(0, 1, -3);
  if (view === "side") camera.position.set(7.5, 2.5, focus.z);
  else if (view === "top") camera.position.set(focus.x, 10, focus.z + 0.01);
  else camera.position.set(...BALL_CONFIG.camera.position);
  camera.lookAt(view === "player" ? new THREE.Vector3(...BALL_CONFIG.camera.target) : focus);
}

function isPlayableCalibratedHitEnabled(): boolean {
  const strokeType = ballController.ball.expectedStrokeType;
  return playerAssistLevel === "training" && assistMode === "easy" && elements.playableCalibratedHitToggle.checked &&
    (activeCalibrationProfile ?? trajectoryProfiles[strokeType]) !== null;
}

function playCalibratedStroke(strokeType: CalibrationStrokeType): void {
  if (smartTrainingSessionFinalized) startNewSmartTrainingSession();
  // Each feed starts with an empty instrument so the next contact produces one clear rise animation.
  updateShotTechniqueUi(null);
  const selectedLevel = elements.feedVariationLevel.value as FeedVariationLevel;
  const level = playerAssistLevel === "training" || forceValidatedBaseNext ? "off" : selectedLevel;
  forceValidatedBaseNext = false;
  const enteredSeed = Number(elements.feedSeed.value);
  const seed = elements.feedSeed.value.trim() && Number.isFinite(enteredSeed)
    ? Math.trunc(enteredSeed)
    : crypto.getRandomValues(new Uint32Array(1))[0];
  const baseVariation = generateSafeFeedVariation(strokeType, level, seed);
  const style = (document.getElementById("feedArchetype") as HTMLSelectElement).value as FeedStyle;
  const resolvedStyle = resolveFeedStyle(style, lastRandomFeedArchetype);
  if (style === "random") lastRandomFeedArchetype = resolvedStyle;
  const premium = createArchetypeFeed(baseVariation, resolvedStyle);
  const generatedVariation = premium?.variation ?? baseVariation;
  currentFeedVariation = {
    ...generatedVariation,
    profile: playerAssistLevel === "training"
      ? applyContactPositionCalibration(
          createTrainingComfortProfile(positionValidatedProfileAtBaseline(generatedVariation.profile)),
          contactPositionCalibrations[strokeType]
        )
      : positionValidatedProfileAtBaseline(generatedVariation.profile)
  };
  const launchProfiles = {
    forehand: strokeType === "forehand" ? currentFeedVariation.profile : VALIDATED_TRAJECTORY_PRESET.forehand,
    backhand: strokeType === "backhand" ? currentFeedVariation.profile : VALIDATED_TRAJECTORY_PRESET.backhand
  };
  const plan = createPlayableStrokePlan(strokeType, launchProfiles);
  selectedPracticeStroke = strokeType;
  assistMode = playerAssistLevel === "training" ? "easy" : "prototype";
  ballSpeedPreset = "normal";
  elements.assistModeSelect.value = assistMode;
  elements.ballSpeedSelect.value = "normal";
  elements.useCalibratedFeeds.checked = true;
  elements.playableCalibratedHitToggle.checked = playerAssistLevel === "training";
  elements.playableExpectedStroke.textContent = strokeType;
  elements.playableResolvedStroke.textContent = strokeType;
  lastContactEvent = null;
  activeStroke = null;
  strokeStateMachine.reset(Date.now(), `armed calibrated ${strokeType}`);
  latestStrokeSnapshot = strokeStateMachine.getSnapshot(Date.now());
  if (!plan) {
    elements.ballResult.textContent = "NO_SAVED_PROFILE";
    elements.playableCountdown.textContent = "READY";
    elements.playableProfileDetails.textContent = `Loaded profile ${strokeType}: invalid or wrong player-local side`;
    return;
  }
  const variationSummary = {
    baseProfile: strokeType,
    feedStyle: premium.label,
    level,
    seed,
    offsets: currentFeedVariation.offsets,
    retries: currentFeedVariation.retryCount,
    valid: currentFeedVariation.valid,
    fallback: currentFeedVariation.fallback,
    trajectory: currentFeedVariation.profile
  };
  elements.feedVariationDebug.textContent = JSON.stringify(variationSummary, null, 2);
  elements.practiceStatus.textContent = currentFeedVariation.fallback
    ? "Stability fallback: validated base feed"
    : `${premium?.label ?? "Validated"} · ${strokeType} · ${level} variation`;
  console.info("Feed variation", variationSummary);
  const assist = BALL_CONFIG.playerAssist[playerAssistLevel];
  elements.playableProfileDetails.textContent =
    `Loaded profile ${plan.strokeType} | Expected side ${plan.expectedSide} | ` +
    `Contact local X ${plan.contactLocalX.toFixed(2)} m | Contact world ${formatVector(plan.contactWorld)} | ` +
    `Window -${assist.windowBeforeMs}/+${assist.windowAfterMs} ms | ` +
    (playerAssistLevel === "training" ? "Strike-zone gate; no contact magnet" :
      "Moving-racket physical collision");
  practiceAttempts += 1;
  practiceRelaunchAt = 0;
  launchBall(strokeType === "forehand" ? "guaranteedForehand" : "guaranteedBackhand", plan.profile);
  if (premium && !premium.variation.fallback) {
    const solvedComfortFeed = solveTrajectoryProfile(plan.profile);
    ballController.ball.velocity.copy(solveSpinFlight(
      new THREE.Vector3().fromArray(plan.profile.launchPointWorld),
      new THREE.Vector3().fromArray(plan.profile.bouncePointWorld),
      solvedComfortFeed.launchToBounceSeconds, premium.spin
    ));
    ballController.ball.spinVector.copy(premium.spin);
    ballController.ball.angularVelocity.copy(premium.spin);
    ballController.ball.spinStrength = premium.spin.length();
    ballController.ball.spinType = premium.spin.x > 0 ? "topspin" : "flat";
  }
}

function updatePlayableStatus(now: number): void {
  const ball = ballController.ball;
  const decision = ballController.lastPlayableDecision;
  elements.playableExpectedStroke.textContent = ball.expectedStrokeType;
  elements.playableDetectedStroke.textContent = latestStrokeSnapshot?.lockedStrokeType ?? "unknown";
  elements.playableResolvedStroke.textContent = ballController.lastHit?.resolvedHitStrokeType ?? ball.expectedStrokeType;
  elements.playableCorrection.textContent = `${appliedContactCorrection.toFixed(2)} m`;
  if (ballController.lastHit) elements.playableCountdown.textContent = "HIT";
  else if (ballController.lastMiss) elements.playableCountdown.textContent = "MISS";
  else if (ball.bounceCount === 0) elements.playableCountdown.textContent = "READY";
  else if (!decision || now < decision.opportunityStart) elements.playableCountdown.textContent = "BOUNCE";
  else elements.playableCountdown.textContent = decision.timing === "HIT WINDOW" ? "SWING" : decision.timing;
  elements.playableWindowStatus.textContent = decision?.timing ?? "TOO EARLY";
  if (decision?.reason && decision.timing === "TOO LATE" && !ball.hit) elements.ballResult.textContent = decision.reason;
  const total = practiceHits + practiceMisses;
  const percentage = total > 0 ? Math.round(practiceHits / total * 100) : 0;
  elements.practiceAttempts.textContent = String(practiceAttempts);
  elements.practiceHits.textContent = String(practiceHits);
  elements.practiceMisses.textContent = String(practiceMisses);
  elements.practicePercentage.textContent = `${percentage}%`;
}

function updatePracticeLoop(now: number): void {
  if (!elements.calibratedPracticeLoopToggle.checked || !selectedPracticeStroke ||
      !canLaunchPracticeFeed(now, practiceRelaunchAt, ballController.ball.active)) return;
  const nextStroke = elements.practiceLoopMode.value === "alternate"
    ? selectedPracticeStroke === "forehand" ? "backhand" : "forehand"
    : selectedPracticeStroke;
  playCalibratedStroke(nextStroke);
}

function currentWindAcceleration(now: number): THREE.Vector3 {
  const strength = ({ off: 0, light: 0.5, medium: 1.05, strong: 1.75 } as const)[windStrength];
  if (strength === 0) return windAcceleration.set(0, 0, 0);
  const direction = windDirectionComponents();
  const variation = ({ off: 0, light: 0.025, medium: 0.085, strong: 0.14 } as const)[windStrength];
  const gust = 0.96 + Math.sin(now * 0.0017) * variation + Math.sin(now * 0.0043 + 1.4) * variation * 0.48;
  return windAcceleration.set(direction[0], 0, direction[1]).normalize().multiplyScalar(strength * gust);
}

function windDirectionComponents(): readonly [number, number] {
  return ({
    left: [-1, 0], right: [1, 0], headwind: [0, 1], tailwind: [0, -1],
    leftHead: [-1, 1], rightHead: [1, 1], leftTail: [-1, -1], rightTail: [1, -1]
  } as const)[windDirection];
}

function createWindVisualization(): THREE.Group {
  const volume = new THREE.Group();
  volume.name = "visibleWindDirection";
  const flowGeometry = new THREE.BufferGeometry();
  flowGeometry.setAttribute("position", new THREE.BufferAttribute(
    new Float32Array(16 * 5 * 18 * 2 * 3), 3
  ).setUsage(THREE.DynamicDrawUsage));
  const flowLines = new THREE.LineSegments(flowGeometry, new THREE.LineBasicMaterial({
    color: 0xcafff5, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  flowLines.name = "windFlowBands";
  flowLines.frustumCulled = false;
  flowLines.renderOrder = 3;
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(
    new Float32Array(220 * 3), 3
  ).setUsage(THREE.DynamicDrawUsage));
  const particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({
    color: 0xe5fff9, size: 0.035, sizeAttenuation: true, transparent: true,
    opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  particles.name = "windFlowParticles";
  particles.frustumCulled = false;
  particles.renderOrder = 4;
  volume.add(flowLines, particles);
  return volume;
}

function updateWindVisualization(volume: THREE.Group, elapsed: number): void {
  const level = ({ off: 0, light: 1, medium: 2, strong: 3 } as const)[windStrength];
  volume.visible = level > 0;
  if (!level) return;
  const flowLines = volume.getObjectByName("windFlowBands") as THREE.LineSegments;
  const particles = volume.getObjectByName("windFlowParticles") as THREE.Points;
  const [rawX, rawZ] = windDirectionComponents();
  const magnitude = Math.hypot(rawX, rawZ) || 1;
  const dx = rawX / magnitude;
  const dz = rawZ / magnitude;
  const px = -dz;
  const pz = dx;
  const visibleRibbons = level === 1 ? 7 : level === 2 ? 12 : 16;
  const strandsPerRibbon = 5;
  const segmentsPerStrand = 18;
  const speed = level === 1 ? 1.45 : level === 2 ? 3.35 : 5.65;
  const positions = flowLines.geometry.getAttribute("position") as THREE.BufferAttribute;
  let vertex = 0;
  for (let index = 0; index < visibleRibbons; index += 1) {
    const seed = (index * 0.61803398875) % 1;
    const crossSeed = ((index * 0.38196601125 + 0.17) % 1 - 0.5) * 17;
    const travel = ((elapsed * speed + seed * 42) % 42) - 21;
    const yBase = 0.65 + ((index * 1.73) % 1) * 3.8;
    const ribbonLength = 10.5 + level * 1.3 + (index % 3) * 0.75;
    const amplitude = level === 1 ? 0.24 : level === 2 ? 0.62 : 1.02;
    const turbulence = level === 1 ? 0.04
      : Math.sin(elapsed * (0.75 + level * 0.18) + index * 2.1) * (level === 2 ? 0.17 : 0.3) +
        Math.sin(elapsed * 2.15 + index * 0.73) * (level === 2 ? 0.07 : 0.14);
    for (let strand = 0; strand < strandsPerRibbon; strand += 1) {
      const strandOffset = (strand - 2) * (level === 1 ? 0.055 : 0.085);
      for (let segment = 0; segment < segmentsPerStrand; segment += 1) {
        for (const point of [segment, segment + 1]) {
          const t = point / segmentsPerStrand - 0.5;
          const along = travel + t * ribbonLength;
          const vortexPhase = t * Math.PI * 2.35 + elapsed * (0.72 + level * 0.12) + index * 1.7;
          const broadFlow = Math.sin(vortexPhase) * amplitude;
          const fineFlow = Math.sin(t * Math.PI * 7.2 - elapsed * 1.55 + index) * amplitude * 0.18;
          const ribbon = crossSeed + turbulence + broadFlow + fineFlow + strandOffset;
          const x = dx * along + px * ribbon;
          const z = BALL_CONFIG.launch.netDepth + dz * along + pz * ribbon;
          const y = yBase + Math.cos(vortexPhase) * amplitude * 0.62 +
            Math.sin(t * Math.PI * 4.4 - elapsed + index) * amplitude * 0.12 + strandOffset * 0.45;
          positions.setXYZ(vertex++, x, y, z);
        }
      }
    }
  }
  flowLines.geometry.setDrawRange(0, visibleRibbons * strandsPerRibbon * segmentsPerStrand * 2);
  positions.needsUpdate = true;
  const material = flowLines.material as THREE.LineBasicMaterial;
  const gustGlow = 0.9 + Math.sin(elapsed * 1.8) * 0.1;
  material.opacity = (level === 1 ? 0.055 : level === 2 ? 0.075 : 0.095) * gustGlow;

  const particleCount = level === 1 ? 65 : level === 2 ? 135 : 220;
  const particlePositions = particles.geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < particleCount; index += 1) {
    const seed = (index * 0.754877666) % 1;
    const cross = ((index * 0.56984029 + 0.31) % 1 - 0.5) * 18;
    const travel = ((elapsed * speed * (1.05 + index % 5 * 0.025) + seed * 44) % 44) - 22;
    const phase = travel * 0.28 + elapsed * 0.9 + index * 0.37;
    const curl = Math.sin(phase) * (0.18 + level * 0.13);
    particlePositions.setXYZ(index,
      dx * travel + px * (cross + curl),
      0.45 + ((index * 1.3247) % 1) * 4.6 + Math.cos(phase) * (0.08 + level * 0.055),
      BALL_CONFIG.launch.netDepth + dz * travel + pz * (cross + curl));
  }
  particles.geometry.setDrawRange(0, particleCount);
  particlePositions.needsUpdate = true;
  const particleMaterial = particles.material as THREE.PointsMaterial;
  particleMaterial.opacity = level === 1 ? 0.2 : level === 2 ? 0.3 : 0.4;
  particleMaterial.size = level === 1 ? 0.025 : level === 2 ? 0.035 : 0.045;
}

function windConditionLabel(): string {
  return ({
    left: "left", right: "right", headwind: "toward player", tailwind: "toward opponent",
    leftHead: "left and toward player", rightHead: "right and toward player",
    leftTail: "left and toward opponent", rightTail: "right and toward opponent"
  } as const)[windDirection];
}

function updateWindSettings(): void {
  windStrength = elements.windStrength.value as WindStrength;
  windDirection = elements.windDirection.value as WindDirection;
  const enabled = windStrength !== "off";
  const speed = ({ off: 0, light: 8, medium: 18, strong: 30 } as const)[windStrength];
  const label = windConditionLabel();
  elements.windDirection.disabled = !enabled;
  elements.windControl.classList.toggle("is-active", enabled);
  elements.windButtonState.textContent = enabled ? windStrength[0].toUpperCase() + windStrength.slice(1) : "Off";
  elements.windReadout.textContent = enabled
    ? `${speed} km/h ${label}. Gusts continuously alter the ball flight.`
    : "Wind is off";
  const pan = windDirection.includes("left") || windDirection === "left" ? -1
    : windDirection.includes("right") || windDirection === "right" ? 1 : 0;
  tennisSounds.setWindMuted(elements.windSoundMuted.checked);
  tennisSounds.setWind(({ off: 0, light: 0.34, medium: 0.66, strong: 1 } as const)[windStrength], pan);
}

function wireBallControls(): void {
  elements.windStrength.addEventListener("change", () => {
    tennisSounds.unlock();
    updateWindSettings();
    elements.windControl.open = false;
  });
  elements.windDirection.addEventListener("change", () => {
    tennisSounds.unlock();
    updateWindSettings();
    elements.windControl.open = false;
  });
  elements.windSoundMuted.addEventListener("change", () => {
    tennisSounds.unlock();
    tennisSounds.setWindMuted(elements.windSoundMuted.checked);
  });
  updateWindSettings();
  elements.recordStrokeExample.addEventListener("click", () => {
    armedStrokeExampleLabel = elements.strokeExampleLabel.value;
    elements.strokeExampleAnalysis.textContent = `Armed: ${armedStrokeExampleLabel}. The next resolved contact will be saved.`;
  });
  elements.analyzeStrokeExamples.addEventListener("click", analyzeStrokeExamples);
  const playFromPlayerControls = (stroke: CalibrationStrokeType): void => {
    if (playerMode === "game" && !conePracticeChosen) {
      elements.practiceStatus.textContent = "Choose Deep shot, Regular, or Short shot practice first.";
      return;
    }
    practicePaused = false;
    elements.stopPractice.textContent = "Stop";
    elements.calibratedPracticeLoopToggle.checked = !singleShotArmed;
    singleShotArmed = false;
    playCalibratedStroke(stroke);
  };
  elements.playCalibratedForehand.addEventListener("click", () => playFromPlayerControls("forehand"));
  elements.playCalibratedBackhand.addEventListener("click", () => playFromPlayerControls("backhand"));
  elements.playSingleShot.addEventListener("click", () => {
    practicePaused = false;
    elements.stopPractice.textContent = "Stop";
    elements.calibratedPracticeLoopToggle.checked = false;
    if (selectedPracticeStroke && !ballController.ball.active) {
      singleShotArmed = false;
      playCalibratedStroke(selectedPracticeStroke);
    } else {
      singleShotArmed = true;
      elements.practiceStatus.textContent = "Single shot armed. Choose Forehand or Backhand.";
    }
  });
  elements.finishTrainingSession.addEventListener("click", finishSmartTrainingSession);
  elements.newTrainingSession.addEventListener("click", () => {
    startNewSmartTrainingSession();
    elements.smartTrainer.classList.remove("is-complete");
  });
  elements.closeSessionReport.addEventListener("click", () => elements.smartTrainer.classList.remove("is-complete"));
  elements.downloadTrainingReport.addEventListener("click", downloadLatestTrainingReport);
  elements.downloadTrainingReport.disabled = lastCompletedTrainingReport === null;
  elements.trainingReportPlayerName.value = localStorage.getItem(TRAINING_PLAYER_NAME_KEY) ?? "";
  elements.trainingReportPlayerName.addEventListener("input", () => {
    localStorage.setItem(TRAINING_PLAYER_NAME_KEY, elements.trainingReportPlayerName.value.trim());
  });
  elements.stopPractice.addEventListener("click", () => {
    if (practicePaused) {
      practicePaused = false;
      elements.stopPractice.textContent = "Stop";
      elements.calibratedPracticeLoopToggle.checked = true;
      elements.practiceStatus.textContent = selectedPracticeStroke
        ? `Practice resumed · ${selectedPracticeStroke}`
        : "Practice resumed. Choose Forehand or Backhand.";
      if (selectedPracticeStroke && !ballController.ball.active) playCalibratedStroke(selectedPracticeStroke);
      return;
    }
    practicePaused = true;
    elements.stopPractice.textContent = "Resume";
    elements.calibratedPracticeLoopToggle.checked = false;
    singleShotArmed = false;
    practiceRelaunchAt = 0;
    ballController.reset();
    ballMesh.visible = false;
    elements.playableCountdown.textContent = "READY";
    elements.practiceStatus.textContent = "Practice paused. Your session and analysis are still active.";
  });
  elements.launchForehandBall.addEventListener("click", () => launchBall("easyForehand"));
  elements.launchBackhandBall.addEventListener("click", () => launchBall("easyBackhand"));
  const launchGuaranteedFeed = (preset: LaunchPreset): void => {
    assistMode = "easy";
    ballSpeedPreset = "normal";
    elements.assistModeSelect.value = "easy";
    elements.ballSpeedSelect.value = "normal";
    const strokeType = isBackhandPreset(preset) ? "backhand" : "forehand";
    const profile = elements.useCalibratedFeeds.checked ? trajectoryProfiles[strokeType] : null;
    if (elements.useCalibratedFeeds.checked && !profile) {
      elements.trajectoryCalibrationMessage.textContent = `CALIBRATION_PROFILE_NOT_LOADED: save the ${strokeType} trajectory first.`;
      return;
    }
    launchBall(preset, profile ?? undefined);
  };
  elements.guaranteedForehandFeed.addEventListener("click", () => launchGuaranteedFeed("guaranteedForehand"));
  elements.guaranteedBackhandFeed.addEventListener("click", () => launchGuaranteedFeed("guaranteedBackhand"));
  elements.launchGuaranteedEasyHit.addEventListener("click", () => {
    launchGuaranteedFeed(isBackhandPreset(activeLaunchPreset) ? "guaranteedBackhand" : "guaranteedForehand");
  });
  elements.resetBall.addEventListener("click", () => {
    ballController.reset();
    ballMesh.visible = false;
    elements.ballResult.textContent = "--";
  });
  elements.assistModeSelect.addEventListener("change", () => {
    assistMode = elements.assistModeSelect.value as AssistMode;
    elements.playableCalibratedHitToggle.checked = assistMode === "easy";
  });
  elements.playerAssistLevel.addEventListener("change", () => {
    if (elements.playerAssistLevel.value === "game") {
      playerMode = "game";
      playerAssistLevel = "training";
      elements.calibratedPracticeLoopToggle.checked = false;
      singleShotArmed = false;
      practiceRelaunchAt = 0;
      ballController.reset();
      ballMesh.visible = false;
      resetTargetGameSession();
      conePracticeChosen = false;
      elements.conePracticePicker.hidden = false;
      gameTargetGroup.visible = false;
      elements.modeDescription.textContent =
        "Target Cones Practice: choose a landing-depth focus, then select forehand or backhand to begin.";
      elements.practiceStatus.textContent = "Feed paused. Choose Deep shot, Regular, or Short shot practice.";
      return;
    }
    playerMode = "training";
    playerAssistLevel = "training";
    elements.conePracticePicker.hidden = true;
    gameTargetGroup.visible = false;
    elements.modeDescription.textContent =
      "Training: practice forehand and backhand with sensor-driven speed, spin, direction, and landing feedback.";
    elements.courtVisionMap.innerHTML = createCourtMapSvg([], "Court vision awaiting the first bounce");
    elements.courtVisionResult.textContent = "READY";
    elements.courtVisionResult.style.color = "#f4f6e9";
  });
  elements.conePracticePicker.querySelectorAll<HTMLButtonElement>("[data-cone-practice]").forEach(button => {
    button.addEventListener("click", () => {
      conePracticeFocus = button.dataset.conePractice as ConePracticeFocus;
      conePracticeChosen = true;
      activeGameTargets = [];
      knockedGameTargetIds.clear();
      gameTargetGroup.visible = false;
      elements.conePracticePicker.querySelectorAll("button").forEach(item =>
        item.classList.toggle("is-selected", item === button));
      startTargetGame(performance.now());
      const label = conePracticeLabel(conePracticeFocus);
      elements.modeDescription.textContent = `${label}: ${conePracticeDescription(conePracticeFocus)}`;
      elements.practiceStatus.textContent = `${label} cones ready. Choose Forehand or Backhand to start the feed.`;
    });
  });
  elements.ballSpeedSelect.addEventListener("change", () => {
    ballSpeedPreset = elements.ballSpeedSelect.value as BallSpeedPreset;
  });
  elements.ballDebugToggle.addEventListener("change", () => {
    updateBallHelperVisibility();
  });
  elements.showContactTargetToggle.addEventListener("change", updateBallHelperVisibility);
  elements.showTrajectoryToggle.addEventListener("change", updateBallHelperVisibility);
  elements.showStringCenterToggle.addEventListener("change", updateBallHelperVisibility);
  elements.ballVisualSizeSelect.addEventListener("change", updateBallVisualScale);
  elements.ballVisualScaleInput.addEventListener("input", () => {
    if (elements.ballVisualSizeSelect.value === "custom") updateBallVisualScale();
  });
  elements.forehandSidePreset.addEventListener("change", readDeliveryTuning);
  elements.backhandSidePreset.addEventListener("change", readDeliveryTuning);
  elements.contactHeightPreset.addEventListener("change", readDeliveryTuning);
  elements.contactDepthInput.addEventListener("input", readDeliveryTuning);
  elements.resetBallVisualSettings.addEventListener("click", resetBallVisualSettings);
  elements.showBallAtContact.addEventListener("click", () => {
    showBallAtContactPreview = !showBallAtContactPreview;
    elements.showBallAtContact.textContent = showBallAtContactPreview ? "Hide Ball At Contact" : "Show Ball At Contact";
  });
}

function updateBallHelperVisibility(): void {
  const advanced = elements.developerPanel.open;
  const debug = advanced && elements.ballDebugToggle.checked;
  ballDebugGroup.visible = debug || elements.showTrajectoryToggle.checked || elements.showStringCenterToggle.checked;
  colliderDebug.visible = debug || elements.showStringCenterToggle.checked;
  predictedPathLine.visible = debug || elements.showTrajectoryToggle.checked;
  racketNormalArrow.visible = debug;
  ballVelocityArrow.visible = debug;
  outgoingRawArrow.visible = debug && ballController.lastResponse !== null;
  outgoingConstrainedArrow.visible = debug && ballController.lastResponse !== null;
  outgoingNetMarker.visible = debug && ballController.lastResponse?.prediction.netCrossingPoint !== null;
  outgoingBounceMarker.visible = debug && ballController.lastResponse?.prediction.bouncePoint !== null;
  if (!advanced) {
    ballDebugGroup.visible = colliderDebug.visible = predictedPathLine.visible = false;
    contactTargetGroup.visible = trajectoryCalibrationGroup.visible = false;
    contactMarker.visible = false;
  }
}

function updateBallVisualScale(): void {
  const mode = elements.ballVisualSizeSelect.value;
  ballVisualScaleMultiplier = mode === "realistic"
    ? 1
    : mode === "readable"
      ? BALL_CONFIG.scale.visualScaleMultiplier
      : THREE.MathUtils.clamp(
          Number(elements.ballVisualScaleInput.value),
          1,
          BALL_CONFIG.scale.maximumVisualScaleMultiplier
        );
  ballMesh.scale.setScalar(ballVisualScaleMultiplier / BALL_CONFIG.scale.visualScaleMultiplier);
  ballController.ball.visualRadius = ballController.ball.physicsRadius * ballVisualScaleMultiplier;
  ballTrailMaterial.opacity = 0.18;
}

function readDeliveryTuning(): void {
  contactHeightOffset = Number(elements.contactHeightPreset.value);
  forehandSideOffset = Math.abs(Number(elements.forehandSidePreset.value));
  backhandSideOffset = -Math.abs(Number(elements.backhandSidePreset.value));
  contactDepthOffset = Number(elements.contactDepthInput.value);
}

function resetBallVisualSettings(): void {
  elements.ballVisualSizeSelect.value = "readable";
  elements.ballVisualScaleInput.value = String(BALL_CONFIG.scale.visualScaleMultiplier);
  elements.contactHeightPreset.value = String(BALL_CONFIG.launch.easyForehand.contactHeight);
  elements.forehandSidePreset.value = String(Math.abs(BALL_CONFIG.launch.easyForehand.contactSideOffset));
  elements.backhandSidePreset.value = String(Math.abs(BALL_CONFIG.launch.easyBackhand.contactSideOffset));
  elements.contactDepthInput.value = String(BALL_CONFIG.launch.easyForehand.depthOffset);
  elements.showContactTargetToggle.checked = false;
  elements.showTrajectoryToggle.checked = false;
  elements.showStringCenterToggle.checked = false;
  readDeliveryTuning();
  updateBallVisualScale();
  updateBallHelperVisibility();
}

function launchBall(preset: LaunchPreset, calibrationProfile?: TrajectoryCalibrationProfile, preview = false): void {
  showBallAtContactPreview = false;
  elements.showBallAtContact.textContent = "Show Ball At Contact";
  activeLaunchPreset = preset;
  document.getElementById("shotFeedback")!.hidden = true;
  activeCalibrationProfile = calibrationProfile ?? null;
  previewTrajectoryActive = preview;
  easySwingIntentDetector.reset();
  latestEasySwingIntent = null;
  peakSwingSpeedKmh = 0;
  trainingStrokeEvidence.reset();
  followThroughAnalyzer.reset();
  pendingReturnedTrainingShot = null;
  trainingClosestStringBedDistance = Number.POSITIVE_INFINITY;
  trainingStrikeZoneEntryAt = null;
  trainingClosestStrikeZoneMetric = Number.POSITIVE_INFINITY;
  trainingClosestStrikeZoneOffset.set(0, 0, 0);
  trainingMaximumNeutralOriginDriftMeters = 0;
  trainingSawActiveIntentBeforeWindow = false;
  trainingSawActiveIntentInWindow = false;
  trainingSawActiveIntentAfterWindow = false;
  trainingSawForwardIntentInWindow = false;
  trainingRejectedInWindow = null;
  const guaranteed = preset === "guaranteedForehand" || preset === "guaranteedBackhand";
  const sideOffset = isBackhandPreset(preset)
    ? backhandSideOffset
    : preset === "centerPractice"
      ? 0
      : forehandSideOffset;
  const presetConfig = BALL_CONFIG.launch[preset];
  const targetOffsets = guaranteed
    ? { heightOffset: presetConfig.contactHeight, sideOffset: presetConfig.contactSideOffset, depthOffset: presetConfig.depthOffset }
    : { heightOffset: contactHeightOffset, sideOffset, depthOffset: contactDepthOffset };
  ballController.launch(
    preset,
    strokeStateMachine.getHandedness(),
    ballSpeedPreset,
    Date.now(),
    strokeStateMachine.getBackhandStyle(),
    targetOffsets,
    calibrationProfile
  );
  motionRecorder.recordBallLaunch(
    preset,
    strokeStateMachine.getHandedness(),
    strokeStateMachine.getBackhandStyle(),
    ballSpeedPreset,
    Date.now(),
    targetOffsets,
    ballVisualScaleMultiplier
  );
  ballMesh.visible = true;
  feedOriginMarker.position.set(
    ballController.ball.position.x,
    BALL_CONFIG.courtHeight,
    ballController.ball.position.z
  );
  feedOriginMarker.visible = true;
  feedOriginVisibleUntil = performance.now() + 2200;
  bounceMarker.visible = false;
  contactMarker.visible = false;
  ballTrailPositions.length = 0;
  ballTrailGeometry.setDrawRange(0, 0);
  ballMesh.quaternion.identity();
  lastBallBounceCount = 0;
  observedIncomingApex.copy(ballController.ball.position);
  observedBouncePoint.set(0, 0, 0);
  elements.ballResult.textContent = "--";
}

function onBallHit(event: BallHitEvent): void {
  tennisSounds.playRacketHit(event.outgoingSpeed);
  contactMarker.position.copy(event.contactPointWorld);
  contactMarker.visible = true;
  elements.ballResult.textContent = "CONTACT - tracking landing";
  elements.outgoingBallSpeed.textContent = `${event.outgoingSpeed.toFixed(1)} m/s`;
  elements.diagnosticResult.textContent =
    `HIT | expected ${event.expectedStrokeType} | detected ${event.detectedStrokeType} | ` +
    `resolved ${event.resolvedHitStrokeType} | ${event.strokeTypeMismatch}`;
  const response = ballController.lastResponse;
  if (response) {
    outgoingRawArrow.position.copy(event.contactPointWorld);
    outgoingRawArrow.setDirection(response.direction.rawDirection.clone().normalize());
    outgoingConstrainedArrow.position.copy(event.contactPointWorld);
    outgoingConstrainedArrow.setDirection(response.direction.constrainedDirection.clone().normalize());
    if (response.prediction.netCrossingPoint) outgoingNetMarker.position.copy(response.prediction.netCrossingPoint);
    if (response.prediction.bouncePoint) outgoingBounceMarker.position.copy(response.prediction.bouncePoint);
    updateBallHelperVisibility();
    const landing = response.prediction.bouncePoint ? formatVector(response.prediction.bouncePoint) : "none";
    elements.playableProfileDetails.textContent +=
      ` | Contact gap ${contactDistanceBeforeCorrection.toFixed(2)} -> ${contactDistanceAfterCorrection.toFixed(2)} m | ` +
      `Correction ${appliedContactCorrection.toFixed(2)} m | Out ${formatVector(event.outgoingVelocity)} | Landing ${landing}`;
  }
  contactFlashUntil = performance.now() + 150;
  if (selectedPracticeStroke) {
    const detection: TrainingStrokeDetection = playerAssistLevel === "training"
      ? { strokeType: event.expectedStrokeType, confidence: 1, source: "feed-side" }
      : normalizeStrokeType(event.detectedStrokeType)
        ? { strokeType: normalizeStrokeType(event.detectedStrokeType)!, confidence: event.confidence, source: "strict-state-machine" }
        : trainingStrokeEvidence.resolve();
    pendingReturnedTrainingShot = {
      ballId: event.ballId,
      expectedStroke: event.expectedStrokeType,
      detection,
      swingSpeedKmh: currentTrainingSwingSpeed(),
      timingOffsetMs: ballController.lastPlayableDecision?.timingOffsetMs ?? null,
      impact: ballController.lastPhysicalImpact,
      contactHeightMeters: event.contactPointWorld.y
    };
    followThroughAnalyzer.start(
      latestSensorFrame?.relativePhoneQuaternion ?? event.racketQuaternion,
      event.expectedStrokeType,
      event.handedness,
      event.backhandStyle
    );
    showPendingTrainingContact(
      pendingReturnedTrainingShot,
      createShotTechnique(ballController.lastPhysicalImpact, emptyFollowThrough(), event.contactPointWorld.y)
    );
  }
  if (currentFeedVariation) {
    elements.feedVariationDebug.textContent +=
      `\nOutcome: HIT | contact gap ${contactDistanceBeforeCorrection.toFixed(3)} -> ` +
      `${contactDistanceAfterCorrection.toFixed(3)} m | magnet ${appliedContactCorrection.toFixed(3)} m`;
  }
  motionRecorder.recordBallResult({ type: "hit", event });
  window.setTimeout(() => finishRealHitAttempt("HIT", "accepted"), 0);
  console.info("Ball hit", event);
}

function onBallMiss(event: BallMissEvent): void {
  if (playerAssistLevel === "training") {
    const diagnosticReason = ballController.lastPlayableDecision?.reason ?? event.reason;
    const report = trainingSessionCalibration.record(false, ballController.ball.expectedStrokeType, diagnosticReason);
    if (report) console.info("Training 20-swing calibration", report);
  }
  elements.ballResult.textContent = /too early/i.test(event.reason) ? "Too Early"
    : /too late/i.test(event.reason) ? "Too Late" : "MISS";
  ballRelaunchAt = performance.now() + BALL_CONFIG.resetDelayMs;
  if (selectedPracticeStroke) {
    practiceMisses += 1;
    practiceRelaunchAt = performance.now() + BALL_CONFIG.playableCalibratedHit.practiceResetMs;
    const geometryMiss = /bounce|passed|outside|world bounds|delivery target|spatial/i.test(event.reason);
    geometryMissStreak = geometryMiss ? geometryMissStreak + 1 : 0;
    if (geometryMissStreak >= 2) {
      forceValidatedBaseNext = true;
      geometryMissStreak = 0;
      elements.practiceStatus.textContent = "Stability fallback: validated base feed";
    }
    const detection = trainingStrokeEvidence.resolve();
    recordSmartTrainingShot({
      timestamp: Date.now(),
      expectedStroke: ballController.ball.expectedStrokeType,
      detectedStroke: detection.strokeType,
      hit: false,
      swingSpeedKmh: currentTrainingSwingSpeed(),
      timingOffsetMs: ballController.lastPlayableDecision?.timingOffsetMs ?? null,
      placementAccuracy: 0,
      missReason: ballController.lastPlayableDecision?.reason ?? event.reason
    }, detection.confidence);
    followThroughAnalyzer.reset();
  }
  if (playerAssistLevel === "training") {
    lastTrainingMissReasons = classifyTrainingMiss({
      closestOffset: Number.isFinite(trainingClosestStrikeZoneMetric)
        ? trainingClosestStrikeZoneOffset : null,
      closestBallToStringBedMeters: Number.isFinite(trainingClosestStringBedDistance)
        ? trainingClosestStringBedDistance : null,
      maximumStringBedReachMeters: 0.75,
      strikeZoneRadii: ballController.ball.expectedStrokeType === "backhand"
        ? TRAINING_BACKHAND_STRIKE_ZONE_RADII : TRAINING_STRIKE_ZONE_RADII,
      enteredStrikeZone: trainingStrikeZoneEntryAt !== null,
      maximumNeutralOriginDriftMeters: trainingMaximumNeutralOriginDriftMeters,
      sawActiveIntentBeforeWindow: trainingSawActiveIntentBeforeWindow,
      sawActiveIntentInWindow: trainingSawActiveIntentInWindow,
      sawActiveIntentAfterWindow: trainingSawActiveIntentAfterWindow,
      sawForwardIntentInWindow: trainingSawForwardIntentInWindow,
      rejectedInWindow: trainingRejectedInWindow
    });
    for (const reason of lastTrainingMissReasons) trainingMissBreakdown[reason] += 1;
    elements.diagnosticResult.textContent = `MISS | ${lastTrainingMissReasons.join(" | ")}`;
  }
  if (currentFeedVariation) {
    elements.feedVariationDebug.textContent +=
      `\nOutcome: MISS | ${event.reason} | contact gap ${contactDistanceBeforeCorrection.toFixed(3)} -> ` +
      `${contactDistanceAfterCorrection.toFixed(3)} m | magnet ${appliedContactCorrection.toFixed(3)} m` +
      (playerAssistLevel === "training" ? ` | reasons ${lastTrainingMissReasons.join(",")}` : "");
  }
  motionRecorder.recordBallResult({ type: "miss", event });
  window.setTimeout(() => finishRealHitAttempt("MISS", event.reason), 0);
  window.setTimeout(() => {
    if (finishSessionRequested) finishSmartTrainingSession();
  }, 0);
  console.info("Ball miss", event);
}

function finalizeReturnedTrainingShot(result: ReturnResult, bouncePoint: THREE.Vector3 | null): void {
  const pending = pendingReturnedTrainingShot;
  if (!pending || pending.ballId !== ballController.ball.id) return;
  pendingReturnedTrainingShot = null;
  const success = isSuccessfulTrainingReturn(result);
  const accuracy = success
    ? calculateTrainingTargetAccuracy(bouncePoint, BALL_CONFIG.launch.netDepth)
    : 0;
  const technique = createShotTechnique(
    pending.impact, followThroughAnalyzer.finish(), pending.contactHeightMeters, bouncePoint
  );
  followThroughAnalyzer.reset();
  if (success) {
    practiceHits += 1;
    geometryMissStreak = 0;
  } else {
    practiceMisses += 1;
  }
  practiceRelaunchAt = performance.now() + BALL_CONFIG.playableCalibratedHit.practiceResetMs;
  if (playerAssistLevel === "training") {
    const report = trainingSessionCalibration.record(success, pending.expectedStroke, success ? null : result);
    if (report) console.info("Training 20-swing calibration", report);
  }
  recordSmartTrainingShot({
    timestamp: Date.now(),
    expectedStroke: pending.expectedStroke,
    detectedStroke: pending.detection.strokeType,
    hit: success,
    swingSpeedKmh: pending.swingSpeedKmh,
    timingOffsetMs: pending.timingOffsetMs,
    placementAccuracy: accuracy,
    missReason: success ? undefined : result,
    technique,
    returnOutcome: result,
    bouncePoint: bouncePoint ? { x: bouncePoint.x, z: bouncePoint.z } : null
  }, pending.detection.confidence);
  elements.practiceStatus.textContent = success
    ? `Successful return · ${accuracy}% deep-center accuracy`
    : `${result.replace(/_/g, " ")} counts as a missed shot`;
  if (currentFeedVariation) elements.feedVariationDebug.textContent += `\nLanding: ${result} | accuracy ${accuracy}%`;
  if (finishSessionRequested) finishSmartTrainingSession();
}

function showPendingTrainingContact(
  pending: NonNullable<typeof pendingReturnedTrainingShot>,
  provisionalTechnique: ShotTechnique | null
): void {
  updateShotTechniqueUi(provisionalTechnique);
  const timing = classifyTrainingTiming(pending.timingOffsetMs);
  elements.trainerDetectedStroke.textContent = formatDetectedStroke(
    pending.detection.strokeType, pending.detection.confidence
  );
  elements.trainerSwingSpeed.textContent = `${Math.round(pending.swingSpeedKmh)} km/h`;
  elements.trainerTiming.textContent = ({
    early: "Early", "on-time": "On time", late: "Late", "no-contact": "No contact"
  } as const)[timing];
  elements.trainerAccuracy.textContent = "Waiting for bounce";
  elements.trainerFollowThrough.textContent = "Finish over far shoulder";
  elements.trainerFinishDetail.textContent = "Tracking motion after contact";
  setTechniqueMeter(elements.trainerFinishMeter, 0, false);
  elements.trainerSessionState.textContent = "Contact detected";
}

function recordSmartTrainingShot(
  shot: Parameters<SmartTrainingSession["record"]>[0],
  detectionConfidence = 0
): void {
  smartTrainingSessionFinalized = false;
  if (windStrength !== "off") sessionWindConditions.add(`${windStrength} · ${windConditionLabel()}`);
  const summary = smartTrainingSession.record(shot);
  const timing = classifyTrainingTiming(shot.timingOffsetMs, shot.missReason);
  elements.trainerDetectedStroke.textContent = formatDetectedStroke(shot.detectedStroke, detectionConfidence);
  elements.trainerSwingSpeed.textContent = `${Math.round(shot.swingSpeedKmh)} km/h`;
  elements.trainerTiming.textContent = ({
    early: "Early", "on-time": "On time", late: "Late", "no-contact": "No contact"
  } as const)[timing];
  elements.trainerAccuracy.textContent = `${shot.placementAccuracy}%`;
  // Contact already played the rise animation; landing only refines the final values.
  updateShotTechniqueUi(shot.technique ?? null, false);
  elements.trainerSessionState.textContent = `${summary.attempts} shot${summary.attempts === 1 ? "" : "s"}`;
  elements.trainingSessionReport.hidden = true;
  updateSmartTrainerSummary();
}

function updateSmartTrainerSummary(): void {
  const summary = smartTrainingSession.summary();
  elements.trainerHitRatio.textContent = `${summary.hits} / ${summary.misses} (${summary.hitRatio}%)`;
  elements.trainerStrokeCounts.textContent = `${summary.forehands} / ${summary.backhands}`;
  elements.trainerAverageSpeed.textContent = `${Math.round(summary.averageSwingSpeedKmh)} km/h`;
  elements.trainerBestStreak.textContent = String(summary.bestStreak);
}

function finishSmartTrainingSession(): void {
  elements.calibratedPracticeLoopToggle.checked = false;
  singleShotArmed = false;
  practiceRelaunchAt = 0;
  if (smartTrainingSessionFinalized) {
    elements.trainingSessionReport.hidden = false;
    elements.smartTrainer.classList.add("is-complete");
    return;
  }
  finishSessionRequested = true;
  const ballStillResolving = ballController.ball.active && ballController.lastReturnResult === null;
  if (ballStillResolving || pendingReturnedTrainingShot) {
    const waitingForLanding = Boolean(pendingReturnedTrainingShot);
    elements.trainerSessionState.textContent = waitingForLanding ? "Waiting for landing" : "Waiting for current ball";
    elements.practiceStatus.textContent = waitingForLanding
      ? "The current shot must land before the session can finish."
      : "The current ball must finish before the session can close.";
    return;
  }
  const summary = smartTrainingSession.summary();
  if (summary.attempts === 0) {
    finishSessionRequested = false;
    elements.trainerSessionState.textContent = "No shots yet";
    elements.practiceStatus.textContent = "Play at least one feed before finishing the session.";
    return;
  }
  const previous = trainingSessionHistory.at(-1) ?? null;
  const baseReport = smartTrainingSession.finish(previous);
  const gameResult: GameSessionResult | undefined = sessionIncludedGameMode ? {
    practiceType: sessionConePracticeFocuses.size > 1 ? "Mixed" : conePracticeLabel(conePracticeFocus),
    score: gameScore,
    shots: gameShots,
    targetsHit: gameTargetsHit,
    targetHitRate: gameShots ? Math.round(gameTargetsHit / gameShots * 100) : 0,
    bestTargetStreak: gameBestStreak
  } : undefined;
  const report: TrainingSessionReport = {
    ...baseReport,
    ...(gameResult ? { game: gameResult } : {}),
    ...(sessionWindConditions.size ? { wind: { conditions: [...sessionWindConditions] } } : {})
  };
  trainingSessionHistory = [...trainingSessionHistory, report].slice(-20);
  smartTrainingSessionFinalized = true;
  finishSessionRequested = false;
  lastCompletedTrainingReport = report;
  elements.downloadTrainingReport.disabled = false;
  localStorage.setItem(TRAINING_HISTORY_KEY, JSON.stringify(trainingSessionHistory));
  elements.trainerSessionState.textContent = "Session complete";
  elements.trainerReportSummary.textContent =
    `${report.hits}/${report.attempts} successful in-court shots (${report.hitRatio}%), ${report.targetAccuracy}% target accuracy, ` +
    `${report.averageSwingSpeedKmh} km/h average and ${report.peakSwingSpeedKmh} km/h peak swing speed.` +
    (report.game ? ` ${report.game.practiceType} cones: ${report.game.targetsHit} knocked down from ${report.game.shots} shots, scoring ${report.game.score} points.` : "") +
    (report.wind ? ` Wind training: ${report.wind.conditions.join(", ")}.` : "");
  elements.trainerReportBreakdown.textContent =
    `Detected strokes: ${report.forehands} forehand, ${report.backhands} backhand, ${report.unknownStrokes} uncertain. ` +
    `Timing: ${report.earlyHits} early, ${report.onTimeHits} on time, ${report.lateHits} late, ${report.noContact} without contact. ` +
    `Misses: ${report.netMisses} net, ${report.wideMisses} wide, ${report.longMisses} long, ${report.shortMisses} short. ` +
    `Best in-court streak: ${report.bestStreak}.`;
  elements.trainerTechniqueSummary.textContent =
    report.regularShots + report.topspinShots + report.sliceShots + report.dropShots +
      report.heavyTopspinShots + report.sideSpinShots === 0
      ? "No resolved racket-contact technique was available for this session."
      : `Technique levels: ${report.topspinShots + report.heavyTopspinShots > 0 ? `${toLevel10(report.averageTopspinLevel)}/10 topspin` : "no topspin shots"}, ` +
        `${report.sliceShots + report.dropShots > 0 ? `${toLevel10(report.averageSliceLevel)}/10 slice` : "no slice shots"}, racket face ${report.averageFaceOpennessLevel}/10 ` +
        `(${faceLevelMeaning(report.averageFaceOpennessLevel)}), ${arcLevelMeaning(report.averageArcLevel)} arc ` +
        `${report.averageArcLevel}/10, and ${toLevel10(report.followThroughCompletion)}/10 far-shoulder finish.`;
  elements.trainerImprovement.textContent = formatTrainingImprovement(report);
  elements.trainerFeedbackList.replaceChildren(...report.feedback.map(message => {
    const item = document.createElement("li");
    item.textContent = message;
    return item;
  }));
  elements.trainingSessionReport.hidden = false;
  elements.smartTrainer.classList.add("is-complete");
}

function startNewSmartTrainingSession(): void {
  practicePaused = false;
  finishSessionRequested = false;
  elements.stopPractice.textContent = "Stop";
  smartTrainingSession.reset();
  sessionWindConditions.clear();
  smartTrainingSessionFinalized = false;
  pendingReturnedTrainingShot = null;
  trainingStrokeEvidence.reset();
  followThroughAnalyzer.reset();
  practiceAttempts = practiceHits = practiceMisses = 0;
  resetTargetGameSession();
  if (playerMode === "game") startTargetGame(performance.now());
  elements.trainerSessionState.textContent = "Session ready";
  elements.trainerDetectedStroke.textContent = "--";
  elements.trainerSwingSpeed.textContent = "0 km/h";
  elements.trainerTiming.textContent = "--";
  elements.trainerAccuracy.textContent = "0%";
  elements.trainingReportPlayerFeedback.value = "";
  updateShotTechniqueUi(null);
  elements.trainingSessionReport.hidden = true;
  elements.smartTrainer.classList.remove("is-complete");
  elements.courtVisionMap.innerHTML = createCourtMapSvg([], "Court vision awaiting the first bounce",
    playerMode === "game" ? activeGameTargets : []);
  elements.courtVisionResult.textContent = "READY";
  elements.courtVisionResult.style.color = "#f4f6e9";
  elements.practiceStatus.textContent = "New training session ready.";
  updateSmartTrainerSummary();
}

function updateCourtVision(result: ReturnResult, bouncePoint: THREE.Vector3 | null): void {
  const bounce = bouncePoint ? [{ x: bouncePoint.x, z: bouncePoint.z, outcome: result }] : [];
  elements.courtVisionMap.innerHTML = createCourtMapSvg(bounce,
    bouncePoint ? `Latest shot first bounce: ${result.replace(/_/g, " ")}` : `Latest shot result: ${result}`,
    playerMode === "game" ? activeGameTargets : []);
  elements.courtVisionResult.textContent = result.replace(/_/g, " ");
  elements.courtVisionResult.style.color = result === "IN" ? "#c8f268" : "#ff9b82";
  elements.courtVision.classList.remove("is-new");
  void elements.courtVision.offsetWidth;
  elements.courtVision.classList.add("is-new");
}

function startTargetGame(_now: number): void {
  if (!sessionIncludedGameMode) resetTargetGameSession();
  sessionIncludedGameMode = true;
  sessionConePracticeFocuses.add(conePracticeFocus);
  if (!activeGameTargets.length) activateInitialGameTargets();
  else gameTargetGroup.visible = true;
}

function resetTargetGameSession(): void {
  gameScore = gameShots = gameTargetsHit = gameStreak = gameBestStreak = 0;
  gameLayoutIndex = -1;
  activeGameTargets = [];
  knockedGameTargetIds.clear();
  sessionConePracticeFocuses.clear();
  sessionIncludedGameMode = false;
}

function activateInitialGameTargets(): void {
  gameLayoutIndex = conePracticeFocus === "regular"
    ? Math.floor(Math.random() * gameTargetLayouts.length)
    : 0;
  const candidates = conePracticeCandidates();
  activeGameTargets = conePracticeFocus === "regular"
    ? [...gameTargetLayouts[gameLayoutIndex]]
    : candidates.slice(0, 3);
  renderGameTargets(activeGameTargets);
  updateGameTargetCourtVision();
}

function updateTargetGame(now: number, _elapsed: number): void {
  if (playerMode !== "game") return;
  for (const targetGroup of [...gameTargetGroup.children]) {
    const fallStartedAt = targetGroup.userData.fallStartedAt as number | undefined;
    if (fallStartedAt === undefined) continue;
    const progress = Math.min(1, (now - fallStartedAt) / 900);
    const eased = 1 - Math.pow(1 - progress, 3);
    targetGroup.children.forEach((child, index) => {
      if (child.userData.isCone !== true) return;
      const fallDirection = child.userData.fallDirection as number;
      child.rotation.x = Math.cos(fallDirection) * eased * 1.38;
      child.rotation.z = Math.sin(fallDirection) * eased * 1.38;
      child.position.y = Math.sin(progress * Math.PI) * 0.055;
    });
    if (progress >= 1 && targetGroup.userData.replaced !== true) {
      targetGroup.userData.replaced = true;
      resetFallenGameTarget(String(targetGroup.userData.targetId));
      break;
    }
  }
}

function scoreGameReturn(result: ReturnResult, bouncePoint: THREE.Vector3 | null): string {
  gameShots += 1;
  const availableTargets = activeGameTargets.filter(target => !knockedGameTargetIds.has(target.id));
  const hit = scoreGameBounce(bouncePoint, result, availableTargets);
  if (hit) {
    gameScore += hit.points;
    gameTargetsHit += 1;
    gameStreak += 1;
    gameBestStreak = Math.max(gameBestStreak, gameStreak);
    knockDownGameTarget(hit.target.id);
    elements.practiceStatus.textContent =
      `${hit.target.difficulty} target hit · ${Math.round(hit.accuracy * 100)}% target precision`;
  } else {
    gameStreak = 0;
    elements.practiceStatus.textContent = result === "IN"
      ? "In court, but outside every active target. Keep the same technique and adjust placement."
      : `${result.replace(/_/g, " ")} · no target`;
  }
  return hit ? "TARGET HIT" : result === "IN" ? "IN · NO TARGET" : `${result.replace(/_/g, " ")} · NO TARGET`;
}

function knockDownGameTarget(targetId: string): void {
  if (knockedGameTargetIds.has(targetId)) return;
  knockedGameTargetIds.add(targetId);
  tennisSounds.playConeFall();
  const targetGroup = gameTargetGroup.getObjectByName(`gameTarget-${targetId}`);
  if (targetGroup) targetGroup.userData.fallStartedAt = performance.now();
}

function resetFallenGameTarget(targetId: string): void {
  if (!activeGameTargets.some(target => target.id === targetId)) return;
  knockedGameTargetIds.delete(targetId);
  renderGameTargets(activeGameTargets);
  updateGameTargetCourtVision();
}

function conePracticeCandidates(): GameTarget[] {
  const candidates = gameTargetLayouts.flat();
  if (conePracticeFocus === "deep") return candidates.filter(target => target.id.startsWith("deep"));
  if (conePracticeFocus === "short") {
    return candidates.filter(target => target.id.startsWith("short") || target.id.startsWith("service"));
  }
  return candidates;
}

function conePracticeLabel(focus: ConePracticeFocus): "Deep shot" | "Regular" | "Short shot" {
  return focus === "deep" ? "Deep shot" : focus === "short" ? "Short shot" : "Regular";
}

function conePracticeDescription(focus: ConePracticeFocus): string {
  return focus === "deep" ? "cone groups stay near the opponent baseline."
    : focus === "short" ? "cone groups stay inside the short court near the net."
    : "cone groups stay in varied in-court locations and reset after a hit.";
}

function updateGameTargetCourtVision(): void {
  elements.courtVisionMap.innerHTML = createCourtMapSvg([], "Active cone targets", activeGameTargets);
  elements.courtVisionResult.textContent = "CONES READY";
  elements.courtVisionResult.style.color = "#ff8b2d";
}

function renderGameTargets(targets: readonly GameTarget[]): void {
  while (gameTargetGroup.children.length) {
    const child = gameTargetGroup.children[0];
    gameTargetGroup.remove(child);
    child.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.userData.texture instanceof THREE.Texture) {
        object.userData.texture.dispose();
      }
      object.geometry?.dispose();
      const material = object.material;
      if (Array.isArray(material)) material.forEach(item => item.dispose());
      else material.dispose();
    });
  }
  for (const [index, target] of targets.entries()) {
    const targetGroup = new THREE.Group();
    targetGroup.name = `gameTarget-${target.id}`;
    targetGroup.position.set(target.x, BALL_CONFIG.courtHeight + 0.012, target.z);
    targetGroup.userData.targetId = target.id;
    const spacing = Math.min(0.62, target.radius * 0.5);
    const coneOffsets = [
      new THREE.Vector3(-spacing * 0.58, 0, spacing * 0.38),
      new THREE.Vector3(spacing * 0.58, 0, spacing * 0.38),
      new THREE.Vector3(0, 0, -spacing * 0.5)
    ];
    coneOffsets.forEach((offset, coneIndex) => {
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.3, 32),
        new THREE.MeshBasicMaterial({ color: 0x07110f, transparent: true, opacity: 0.24, depthWrite: false })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.copy(offset).setY(0.004);
      targetGroup.add(shadow);

      const cone = createTrainingCone();
      cone.position.copy(offset);
      cone.rotation.y = (coneIndex - 1) * 0.13;
      cone.userData.isCone = true;
      cone.userData.fallDirection = index * 0.82 + coneIndex * 2.16 + 0.35;
      targetGroup.add(cone);
    });
    targetGroup.userData.targetIndex = index;
    gameTargetGroup.add(targetGroup);
  }
  gameTargetGroup.visible = playerMode === "game";
}

function createTrainingCone(): THREE.Group {
  const cone = new THREE.Group();
  const orange = new THREE.MeshPhysicalMaterial({
    color: 0xff4b12, roughness: 0.24, metalness: 0.02, clearcoat: 0.72, clearcoatRoughness: 0.2
  });
  const stripe = new THREE.MeshPhysicalMaterial({
    color: 0xf5f0df, roughness: 0.3, clearcoat: 0.38
  });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.055, 0.5), orange);
  base.position.y = 0.028;
  base.castShadow = true;
  base.receiveShadow = true;
  cone.add(base);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.205, 0.64, 36, 1), orange.clone());
  body.position.y = 0.365;
  body.castShadow = true;
  body.receiveShadow = true;
  cone.add(body);

  const reflectiveBand = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.143, 0.105, 36, 1, true), stripe);
  reflectiveBand.position.y = 0.43;
  reflectiveBand.castShadow = true;
  cone.add(reflectiveBand);

  const baseLip = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.021, 10, 40), orange.clone());
  baseLip.rotation.x = Math.PI / 2;
  baseLip.position.y = 0.075;
  baseLip.castShadow = true;
  cone.add(baseLip);
  return cone;
}

function currentTrainingSwingSpeed(): number {
  const contactIsFresh = lastContactEvent && Math.abs(Date.now() - lastContactEvent.timestamp) <= 1800;
  if (contactIsFresh && lastContactEvent) return Math.max(0, lastContactEvent.estimatedSpeed);
  return Math.max(0, peakSwingSpeedKmh, targetSwingSpeedKmh);
}

function formatDetectedStroke(stroke: DetectedTrainingStroke, confidence = 0): string {
  if (stroke === "unknown") return "Uncertain";
  const label = stroke[0].toUpperCase() + stroke.slice(1);
  return confidence > 0 ? `${label} ${Math.round(confidence * 100)}%` : label;
}

function formatTrainingImprovement(report: TrainingSessionReport): string {
  if (!report.improvement) return "First recorded session";
  const hitChange = report.improvement.hitRatioPoints;
  const accuracyChange = report.improvement.targetAccuracyPoints;
  if (hitChange === 0 && accuracyChange === 0 && report.improvement.faceOpennessPoints === 0 &&
      report.improvement.followThroughPoints === 0) return "Matched previous session";
  const parts = [
    `${hitChange >= 0 ? "+" : ""}${hitChange} hit-ratio points`,
    `${accuracyChange >= 0 ? "+" : ""}${accuracyChange} accuracy points`,
    `${report.improvement.faceOpennessPoints >= 0 ? "+" : ""}${report.improvement.faceOpennessPoints} face level`,
    `${report.improvement.followThroughPoints >= 0 ? "+" : ""}${report.improvement.followThroughPoints} finish`
  ];
  return parts.join(" · ");
}

function loadTrainingSessionHistory(): TrainingSessionReport[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TRAINING_HISTORY_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is TrainingSessionReport =>
      typeof entry === "object" && entry !== null &&
      Number.isFinite((entry as TrainingSessionReport).attempts) &&
      Array.isArray((entry as TrainingSessionReport).feedback) &&
      Array.isArray((entry as TrainingSessionReport).shots) &&
      Number.isFinite((entry as TrainingSessionReport).followThroughCompletion) &&
      Number.isFinite((entry as TrainingSessionReport).averageFaceOpennessLevel) &&
      Number.isFinite((entry as TrainingSessionReport).averageArcLevel)
    ).slice(-20);
  } catch {
    return [];
  }
}

function updateShotTechniqueUi(technique: ShotTechnique | null, animate = true): void {
  if (!technique) {
    elements.trainerSpinLevel.textContent = "--";
    elements.trainerShotStyle.textContent = "Waiting for shot";
    elements.trainerShotStyleReason.textContent = "Spin, pace, arc, and landing depth determine the style.";
    elements.trainerSpinDetail.textContent = "Waiting for contact";
    elements.trainerBrushPath.textContent = "--";
    elements.trainerFaceDetail.textContent = "1 closed · 5 square · 10 open";
    elements.trainerShotArc.textContent = "--";
    elements.trainerArcDetail.textContent = "Low 1–3 · Medium 4–7 · High 8–10";
    elements.trainerFollowThrough.textContent = "--";
    elements.trainerFinishDetail.textContent = "Finish across to the far shoulder";
    setTechniqueMeter(elements.trainerSpinMeter, 0, false);
    setTechniqueMeter(elements.trainerFaceMeter, 0, false);
    setTechniqueMeter(elements.trainerArcMeter, 0, false);
    setTechniqueMeter(elements.trainerFinishMeter, 0, false);
    return;
  }
  const spinLabel = technique.spinType.toLowerCase().replace(/_/g, " ");
  const spinLevel = toLevel10(technique.spinLevel);
  const finishLevel = toLevel10(technique.followThrough.score);
  elements.trainerSpinLevel.textContent = `${intensityMeaning(spinLevel)} ${spinLevel}/10`;
  elements.trainerSpinDetail.textContent = `${spinLabel} · ${technique.spinRpm} rpm`;
  elements.trainerBrushPath.textContent = `${technique.racketFaceOpennessLabel} ${technique.racketFaceOpennessLevel}/10`;
  elements.trainerFaceDetail.textContent = `${formatSigned(technique.racketFaceOpenDegrees)}° at ball contact`;
  elements.trainerShotArc.textContent = `${technique.arcLabel} ${technique.arcLevel}/10`;
  elements.trainerArcDetail.textContent = `${technique.brushDirection} swing path`;
  elements.trainerFollowThrough.textContent = `${technique.followThrough.label} ${finishLevel}/10`;
  elements.trainerFinishDetail.textContent = technique.followThrough.finishedAcrossFarShoulder
    ? "Finished across the far shoulder" : "Continue across to the far shoulder";
  elements.trainerShotStyle.textContent = technique.shotStyleLabel;
  elements.trainerShotStyleReason.textContent = shotStyleReason(technique);
  setTechniqueMeter(elements.trainerSpinMeter, spinLevel, animate);
  setTechniqueMeter(elements.trainerFaceMeter, technique.racketFaceOpennessLevel, animate);
  setTechniqueMeter(elements.trainerArcMeter, technique.arcLevel, animate);
  setTechniqueMeter(elements.trainerFinishMeter, finishLevel, animate);
}

function setTechniqueMeter(meter: HTMLElement, level: number, animate = true): void {
  const safe = THREE.MathUtils.clamp(Math.round(level), 0, 10);
  meter.setAttribute("aria-valuenow", String(safe));
  meter.style.setProperty("--meter-level", String(safe));
  meter.classList.toggle("meter-reset", safe === 0 && !animate);
  Array.from(meter.children).forEach((segment, index) => segment.classList.toggle("is-active", index < safe));
  meter.classList.remove("meter-pulse");
  if (animate && safe > 0) {
    void meter.offsetWidth;
    meter.classList.add("meter-pulse");
  }
}

function toLevel10(percent: number): number {
  return THREE.MathUtils.clamp(Math.max(1, Math.round(percent / 10)), 1, 10);
}

function intensityMeaning(level: number): string {
  return level <= 2 ? "Very low" : level <= 4 ? "Low" : level <= 7 ? "Medium" : "High";
}

function arcLevelMeaning(level: number): string {
  return level <= 3 ? "low" : level <= 7 ? "medium" : "high";
}

function faceLevelMeaning(level: number): string {
  return level <= 2 ? "very closed" : level <= 3 ? "closed" : level < 5 ? "slightly closed"
    : level < 6 ? "square" : level < 7 ? "slightly open" : level <= 8 ? "open" : "very open";
}

function formatSigned(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}

function shotStyleReason(technique: ShotTechnique): string {
  const depth = technique.bounceDepthPastNetMeters === null
    ? "landing unavailable" : `${technique.bounceDepthPastNetMeters.toFixed(1)} m past the net`;
  if (technique.shotStyle === "DROP_SHOT") return `Slice, ${technique.ballSpeedKmh} km/h ball speed, ${depth}.`;
  if (technique.shotStyle === "HEAVY_TOPSPIN") return `High ${technique.arcLevel}/10 arc, heavy spin, controlled pace, ${depth}.`;
  if (technique.shotStyle === "TOPSPIN") return `Topspin rotation with a ${technique.brushDirection.toLowerCase()} path.`;
  if (technique.shotStyle === "SLICE") return `Backspin from a ${technique.brushDirection.toLowerCase()} path.`;
  if (technique.shotStyle === "SIDE_SPIN") return "Lateral brushing created side spin.";
  return "Low-spin contact with no drop-shot or heavy-topspin pattern.";
}

function downloadLatestTrainingReport(): void {
  if (!lastCompletedTrainingReport) return;
  const html = createTrainingReportHtml(lastCompletedTrainingReport, {
    playerName: elements.trainingReportPlayerName.value.trim(),
    playerFeedback: elements.trainingReportPlayerFeedback.value.trim()
  });
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `matchpoint-session-${new Date(lastCompletedTrainingReport.endedAt).toISOString().slice(0, 10)}.html`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function updatePhysicalContactFeedback(): void {
  const impact = ballController.lastPhysicalImpact;
  if (!impact || impact === lastDisplayedPhysicalImpact) return;
  lastDisplayedPhysicalImpact = impact;
  const labels = {
    VALID_HIT: "Clean Hit", TOPSPIN_HIT: "Topspin Hit", FLAT_HIT: "Flat Hit", SLICE_HIT: "Slice Hit",
    WEAK_CONTACT: "Weak Hit", STRING_BLOCK: "Defensive Block",
    OFF_CENTER_HIT: "Off-Center", FRAME_CONTACT: "Frame", MISHIT: "Mishit",
    INVALID_SHOT_DIRECTION: "Invalid Direction", NO_CONTACT: "No Contact"
  } as const;
  elements.ballResult.textContent = impact.outcome === "MISHIT" && impact.contactNormal.y > 0.25
    ? "Face Too Open"
    : impact.outcome === "MISHIT" && impact.contactNormal.y < -0.25
      ? "Face Too Closed"
      : labels[impact.outcome];
  elements.playerShotSpeed.textContent = `${Math.round(impact.outgoingVelocity.length() * 3.6)} km/h`;
  elements.playerSpinType.textContent = impact.spinType;
  elements.playerSpinAmount.textContent = `${impact.spinRateRadiansPerSecond.toFixed(1)} rad/s`;
  const featureSnapshot = featureSnapshotFromImpact(Date.now(), impact, {
    peakAngularSpeed: latestSensorFrame?.angularSpeed ?? 0,
    peakAcceleration: latestSensorFrame?.accelerationMagnitude ?? 0,
    jerk: latestSensorFrame?.jerk ?? 0,
    forwardScore: latestSensorFrame?.motionForwardScore ?? 0,
    upwardScore: latestSensorFrame?.motionUpwardScore ?? 0,
    sidewaysScore: latestSensorFrame?.motionSidewaysScore ?? 0
  });
  elements.playerPowerLevel.textContent = featureSnapshot.powerLevel;
  elements.playerLaunchTendency.textContent = featureSnapshot.launchTendency;
  elements.playerSpinType.textContent = `${featureSnapshot.shotShape} HIT`;
  captureArmedStrokeExample(featureSnapshot);
  elements.playerContactQuality.textContent = `${Math.round(impact.contactQuality * 100)}%`;
  const shotNames = { FLAT: "Flat Drive", TOPSPIN: "Topspin", SLICE: "Slice", SIDE_SPIN: "Side Spin", MIXED: "Mixed" };
  const contactLabel = impact.outcome === "FRAME_CONTACT" ? "Frame"
    : impact.sweetSpotDistance > 0.85 ? "Edge" : impact.contactQuality < 0.8 ? "Off Center" : "Sweet Spot";
  const timingOffset = ballController.lastPlayableDecision?.timingOffsetMs ?? 0;
  const timingLabel = Math.abs(timingOffset) <= 70 ? "Good Timing"
    : timingOffset < 0 ? "Slightly Early" : "Slightly Late";
  const landingDepth = impact.prediction.bouncePoint
    ? BALL_CONFIG.launch.netDepth - impact.prediction.bouncePoint.z : 0;
  const depthLabel = landingDepth <= 0 ? "Short of net" : landingDepth > 11.885 ? "Predicted long"
    : Math.abs(impact.prediction.bouncePoint?.x ?? 0) > 4.1485 ? "Predicted wide"
      : landingDepth >= 8 ? "Deep" : landingDepth >= 4.5 ? "Mid court" : "Short court";
  document.getElementById("shotFeedback")!.hidden = false;
  document.getElementById("shotFeedbackType")!.textContent = `${featureSnapshot.powerLevel === "Weak" ? "Weak " : featureSnapshot.powerLevel === "Strong" || featureSnapshot.powerLevel === "Very Strong" ? "Fast " : ""}${shotNames[featureSnapshot.shotShape]} ${ballController.ball.expectedStrokeType}`.toUpperCase();
  document.getElementById("shotFeedbackSpeed")!.textContent = elements.playerShotSpeed.textContent;
  document.getElementById("shotFeedbackDetail")!.textContent =
    `${featureSnapshot.powerLevel} · ${timingLabel} · ${depthLabel} · ${contactLabel}`;
  elements.contactPhysicsDebug.textContent = JSON.stringify({
    outcome: impact.outcome,
    units: { position: "m", velocity: "m/s", angularVelocity: "rad/s", impulse: "m/s equivalent" },
    contactPointWorld: ballController.lastCollision?.contactPointWorld,
    contactPointLocal: ballController.lastCollision?.contactPointLocal,
    sweetSpotDistance: impact.sweetSpotDistance,
    peakRacketHeadSpeed: impact.racketHeadSpeed,
    forwardRacketHeadSpeed: impact.forwardRacketHeadSpeed,
    upwardBrushVelocity: impact.upwardBrushVelocity,
    downwardBrushVelocity: impact.downwardBrushVelocity,
    powerScore: impact.powerScore,
    racketContactPointVelocity: impact.racketContactPointVelocity,
    relativeVelocity: impact.relativeVelocity,
    incomingNormalVelocity: impact.incomingNormalVelocity,
    incomingTangentialVelocity: impact.incomingTangentialVelocity,
    normalImpulse: impact.normalImpulse,
    tangentialImpulse: impact.tangentialImpulse,
    rawOutgoingVelocity: impact.rawOutgoingVelocity,
    assistedOutgoingVelocity: impact.assistedOutgoingVelocity,
    rawLaunchAngleRadians: impact.rawLaunchAngleRadians,
    finalLaunchAngleRadians: impact.launchAngleRadians,
    rawSpin: impact.rawSpin,
    finalSpin: impact.outgoingAngularVelocity,
    rawPredictedLanding: impact.rawPrediction.bouncePoint,
    finalPredictedLanding: impact.prediction.bouncePoint,
    rawPredictedApex: impact.rawPrediction.apexPoint,
    finalPredictedApex: impact.prediction.apexPoint,
    finalPredictedHangTimeSeconds: impact.prediction.bounceTimeSeconds,
    outgoingAngularVelocity: impact.outgoingAngularVelocity,
    faceAngleRadians: impact.faceAngleRadians,
    launchAngleRadians: impact.launchAngleRadians,
    swingPathAngleRadians: impact.swingPathAngleRadians,
    contactQuality: impact.contactQuality,
    forwardDirectionQuality: impact.forwardDirectionQuality,
    forwardAcceleration: impact.forwardAcceleration,
    upwardAcceleration: impact.upwardAcceleration,
    lateralAcceleration: impact.lateralAcceleration,
    forwardRacketHeadVelocity: impact.forwardRacketHeadSpeed,
    upwardRacketHeadVelocity: impact.upwardRacketHeadSpeed,
    lateralRacketHeadVelocity: impact.lateralRacketHeadSpeed,
    forwardDriveScore: impact.forwardDriveScore,
    invalidDirectionReason: impact.invalidDirectionReason,
    playerAssistLevel,
    directionalAssistStrength: BALL_CONFIG.playerAssist[playerAssistLevel].directionAnchorStrength,
    alignmentAssistance: appliedContactCorrection,
    safetyCorrection: impact.safetyCorrection,
    safetyCorrectionMagnitude: impact.safetyCorrection.length(),
    velocityAtTelemetry: ballController.ball.velocity,
    magnusAccelerationAtTelemetry: ballController.ball.magnusAcceleration,
    lifecycle: ballController.contactLifecycle,
    predictedNetCrossing: impact.prediction.netCrossingPoint,
    predictedNetClearance: impact.predictedNetClearance,
    predictedLanding: impact.prediction.bouncePoint
  }, null, 2);
}

type StoredStrokeExample = { label: string; recordedAt: number; features: ContactFeatureSnapshot };

function readStrokeExamples(): StoredStrokeExample[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STROKE_EXAMPLE_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function captureArmedStrokeExample(features: ContactFeatureSnapshot): void {
  if (!armedStrokeExampleLabel) return;
  const examples = readStrokeExamples();
  examples.push({ label: armedStrokeExampleLabel, recordedAt: Date.now(), features });
  localStorage.setItem(STROKE_EXAMPLE_STORAGE_KEY, JSON.stringify(examples));
  elements.strokeExampleAnalysis.textContent = `Saved ${armedStrokeExampleLabel}. Total examples: ${examples.length}.`;
  armedStrokeExampleLabel = null;
}

function analyzeStrokeExamples(): void {
  const examples = readStrokeExamples();
  if (examples.length === 0) {
    elements.strokeExampleAnalysis.textContent = "No stroke examples recorded.";
    return;
  }
  const groups = new Map<string, StoredStrokeExample[]>();
  for (const example of examples) groups.set(example.label, [...(groups.get(example.label) ?? []), example]);
  const report = [...groups.entries()].map(([label, values]) => {
    const range = (select: (entry: StoredStrokeExample) => number) => {
      const selected = values.map(select);
      return [Math.min(...selected), Math.max(...selected)].map(value => Number(value.toFixed(3)));
    };
    return {
      label,
      samples: values.length,
      angularSpeed: range(entry => entry.features.peakAngularSpeed),
      acceleration: range(entry => entry.features.peakAcceleration),
      forwardScore: range(entry => entry.features.forwardScore),
      upwardScore: range(entry => entry.features.upwardScore),
      powerScore: range(entry => entry.features.powerScore),
      spinRate: range(entry => entry.features.estimatedContactSpeed),
      note: values.length < 3 ? "Collect at least 3 examples before considering threshold changes." : "Review overlap manually; production thresholds unchanged."
    };
  });
  elements.strokeExampleAnalysis.textContent = JSON.stringify(report, null, 2);
}

function updateBallVisuals(deltaSeconds: number): void {
  updatePhysicalContactFeedback();
  const ball = ballController.ball;
  if (ball.state !== previousBallVisualState) {
    ballController.lifecycleDebug.lastStateTransition = `${previousBallVisualState} -> ${ball.state}`;
    previousBallVisualState = ball.state;
  }
  const previewTarget = showBallAtContactPreview && !ball.active ? getBallDeliveryTarget({
    preset: activeLaunchPreset,
    handedness: strokeStateMachine.getHandedness(),
    backhandStyle: strokeStateMachine.getBackhandStyle(),
    heightOffset: contactHeightOffset,
    sideOffset: isBackhandPreset(activeLaunchPreset) ? backhandSideOffset : forehandSideOffset,
    depthOffset: contactDepthOffset
  }) : null;
  ballMesh.visible = showBallAtContactPreview || ball.active || ball.state === "OUT";
  if (previewTarget) ballMesh.position.copy(previewTarget);
  else if (ball.active && !previewTrajectoryActive) sampleBallVisualPosition(ball, ballController.physicsState, ballMesh.position);
  else ballMesh.position.copy(ball.position);
  integrateBallRotation(ballMesh.quaternion, ball.angularVelocity, deltaSeconds);
  const height = Math.max(0, ballMesh.position.y - BALL_CONFIG.courtHeight);
  const shadowScale = THREE.MathUtils.clamp(1 + height * 0.45, 1, 2.8);
  ballShadow.visible = ballMesh.visible;
  ballShadow.position.set(ballMesh.position.x, BALL_CONFIG.courtHeight + 0.008, ballMesh.position.z);
  ballShadow.scale.set(ball.visualRadius * shadowScale, ball.visualRadius * shadowScale * 0.65, 1);
  (ballShadow.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.clamp(0.42 - height * 0.07, 0.09, 0.38);
  if (ball.active) {
    if (ballTrailPositions.length < 5) {
      ballTrailPositions.push(new THREE.Vector3().copy(ballMesh.position));
    } else {
      for (let index = 1; index < ballTrailPositions.length; index += 1) {
        ballTrailPositions[index - 1].copy(ballTrailPositions[index]);
      }
      ballTrailPositions[ballTrailPositions.length - 1].copy(ballMesh.position);
    }
    for (let index = 0; index < ballTrailPositions.length; index += 1) {
      const point = ballTrailPositions[index];
      ballTrailAttribute.setXYZ(index, point.x, point.y, point.z);
    }
    ballTrailAttribute.needsUpdate = true;
    ballTrailGeometry.setDrawRange(0, ballTrailPositions.length);
    ballTrail.visible = ball.velocity.length() > 12 && ballTrailPositions.length > 2;
  } else {
    ballTrail.visible = false;
  }
  feedOriginMarker.visible = elements.developerPanel.open && ball.active && performance.now() < feedOriginVisibleUntil;
  if (ball.bounceCount === 1 && ball.position.y > observedIncomingApex.y) observedIncomingApex.copy(ball.position);
  if (ball.bounceCount > lastBallBounceCount) {
    tennisSounds.playCourtBounce(ball.velocity.length());
    bounceMarker.position.set(ball.position.x, BALL_CONFIG.courtHeight + 0.006, ball.position.z);
    bounceMarker.visible = true;
    if (ball.bounceCount === 1) {
      observedBouncePoint.copy(ball.position);
      observedIncomingApex.copy(ball.position);
    }
    lastBallBounceCount = ball.bounceCount;
  }
  if (elements.autoRelaunchToggle.checked && !ball.active &&
    (ball.state === "IDLE" || ball.state === "MISSED") && performance.now() >= ballRelaunchAt) {
    ballRelaunchAt = performance.now() + BALL_CONFIG.resetDelayMs;
    launchBall(activeLaunchPreset);
  }
  updateBallDebugGeometry();
  updateContactTargetGuide();
}

function updateContactTargetGuide(): void {
  const show = elements.developerPanel.open && (elements.ballDebugToggle.checked || elements.showContactTargetToggle.checked ||
    elements.showStringCenterToggle.checked);
  contactTargetGroup.visible = show;
  if (!show) return;
  const ball = ballController.ball;
  const target = ball.launchPreset ? ball.contactTarget : getBallDeliveryTarget({
    preset: activeLaunchPreset,
    handedness: strokeStateMachine.getHandedness(),
    backhandStyle: strokeStateMachine.getBackhandStyle()
  });
  const strokeType = isBackhandPreset(activeLaunchPreset) ? "backhand" : "forehand";
  const guideRadii = strokeType === "backhand"
    ? TRAINING_BACKHAND_STRIKE_ZONE_RADII : TRAINING_STRIKE_ZONE_RADII;
  contactTargetVolume.scale.set(
    guideRadii.lateral / 0.22,
    guideRadii.vertical / 0.22,
    guideRadii.depth / 0.22
  );
  const expected = getExpectedRacketContactTransform({
    strokeType,
    handedness: strokeStateMachine.getHandedness(),
    backhandStyle: strokeStateMachine.getBackhandStyle()
  });
  contactTargetGroup.position.copy(target);
  expectedRacketMarker.visible = elements.ballDebugToggle.checked || elements.showStringCenterToggle.checked;
  contactTargetVolume.visible = elements.ballDebugToggle.checked || elements.showContactTargetToggle.checked;
  contactHeightGuide.visible = contactTargetVolume.visible;
  expectedRacketMarker.position.copy(expected.stringBedCenter).sub(target);
  contactHeightGuide.geometry.setFromPoints([new THREE.Vector3(), expected.stringBedCenter.clone().sub(target)]);
  contactHeightGuide.computeLineDistances();
}

function updateBallDebugGeometry(): void {
  if (!ballDebugGroup.visible) return;
  const ball = ballController.ball;
  const speed = ball.velocity.length();
  ballVelocityArrow.position.copy(ball.position);
  if (speed > 0.01) ballVelocityArrow.setDirection(ball.velocity.clone().normalize());
  ballVelocityArrow.setLength(Math.min(2, speed * 0.12), 0.18, 0.1);
  const colliderPosition = new THREE.Vector3();
  const colliderQuaternion = new THREE.Quaternion();
  const colliderScale = new THREE.Vector3();
  racketStringCollider.matrixWorld.decompose(colliderPosition, colliderQuaternion, colliderScale);
  racketNormalArrow.position.copy(colliderPosition);
  racketNormalArrow.setDirection(new THREE.Vector3(0, 0, 1).applyQuaternion(colliderQuaternion).normalize());
  const points: THREE.Vector3[] = [];
  const position = ball.position.clone();
  const velocity = ball.velocity.clone();
  for (let index = 0; index < 32; index += 1) {
    points.push(position.clone());
    velocity.y += BALL_CONFIG.gravity * 0.04;
    position.addScaledVector(velocity, 0.04);
  }
  predictedPathGeometry.setFromPoints(points);
}

function updateBallDebug(): void {
  const ball = ballController.ball;
  ballMesh.updateMatrixWorld(true);
  const visualAudit = assertBallVisualState(
    ball, ballMesh, camera, scene, ballController.lifecycleDebug
  );
  elements.ballVisualInvariant.textContent = JSON.stringify({
    ...visualAudit,
    physicsSteps: ballController.physicsState.totalSteps,
    droppedPhysicsMs: Math.round(ballController.physicsState.droppedSeconds * 1000)
  }, null, 2);
  if (!visualAudit.valid && performance.now() - lastBallVisualWarningAt > 1000) {
    console.warn("Ball visual invariant failed", visualAudit);
    lastBallVisualWarningAt = performance.now();
  }
  const collision = ballController.lastCollision;
  const hitDebug = ballController.hitDebug;
  elements.ballState.textContent = ball.state;
  elements.incomingBallSpeed.textContent = `${ball.velocity.length().toFixed(1)} m/s`;
  elements.ballSpin.textContent = `${ball.spinType} ${ball.spinStrength.toFixed(1)}`;
  elements.ballBounces.textContent = String(ball.bounceCount);
  elements.debugBallMotion.textContent =
    `${ball.state} ${formatVector(ball.position)} v${formatVector(ball.velocity)} ` +
    `${ball.velocity.length().toFixed(2)} m/s, bounce ${ball.bounceCount}, preset ${ball.launchPreset ?? "none"}`;
  elements.debugBallCollision.textContent = collision
    ? `local ${formatVector(collision.currentLocalPosition)}, width ${collision.insideWidth}, ` +
      `height ${collision.insideHeight}, plane ${collision.planeDistance.toFixed(2)}, ` +
      `ellipse ${collision.ellipseValue.toFixed(2)}, candidate ${collision.candidate}`
    : "waiting";
  const contactAge = lastContactEvent ? Math.abs(Date.now() - lastContactEvent.timestamp) : null;
  const timeToZone = ball.contactDeadline > 0 ? Math.max(0, (ball.contactDeadline - Date.now()) / 1000) : Number.POSITIVE_INFINITY;
  const targetDistance = ball.position.distanceTo(ball.contactTarget);
  elements.debugBallValidity.textContent =
    `active ${ball.active}, hit ${ball.hit}, stroke ${latestStrokeSnapshot?.currentState ?? "READY"}, ` +
    `contact age ${contactAge === null ? "none" : `${Math.round(contactAge)} ms`}, assist ${assistMode}, ` +
    `contact ETA ${Number.isFinite(timeToZone) ? `${timeToZone.toFixed(2)} s` : "--"}, target gap ${targetDistance.toFixed(2)} m, ` +
    `racket distance ${collision?.closestDistance.toFixed(2) ?? "--"} m, magnus ${formatVector(ball.magnusAcceleration)}`;
  const flag = (value: boolean) => value ? "PASS" : "FAIL";
  const intentType = ball.lockedStrokeType === "backhand" ? "backhand" : "forehand";
  const intent = easySwingIntentDetector.getSnapshot(Date.now(), intentType);
  const swept = ballController.sweptDebug;
  const hitTypes = ballController.lastHit
    ? `${ballController.lastHit.expectedStrokeType}/${ballController.lastHit.detectedStrokeType}/${ballController.lastHit.resolvedHitStrokeType}`
    : `${ball.expectedStrokeType}/${latestStrokeSnapshot?.lockedStrokeType ?? "unknown"}/--`;
  elements.hitDebugPanel.textContent =
    `Easy hit checks | expected/detected/resolved ${hitTypes} | intent ${flag(intent.active)} ${(intent.confidence * 100).toFixed(0)}% | ` +
    `swept overlap ${flag(swept.sweptInsideEllipse)} ${Number.isFinite(swept.minimumSweptDistance) ? `${swept.minimumSweptDistance.toFixed(2)} m` : "--"} | ` +
    `target ${flag(hitDebug.ballNearTarget)} | strings ${flag(hitDebug.ballNearStringBed)} | ` +
    `one bounce ${flag(hitDebug.oneBounceOnly)} | before second ${flag(hitDebug.beforeSecondBounce)} | ` +
    `plane ${flag(hitDebug.planeCrossed)} | ellipse ${flag(hitDebug.insideEllipse)} | ` +
    `contact-ready ${flag(hitDebug.strokeStateIsContactReady)} | recent event ${flag(hitDebug.recentContactEvent)} | ` +
    `speed ${flag(hitDebug.swingSpeedAboveThreshold)} ${hitDebug.currentSwingSpeed.toFixed(2)}/${hitDebug.minimumSwingSpeed.toFixed(2)} rad/s | ` +
    `direction ${flag(hitDebug.swingDirectionValid)} | pose ${flag(hitDebug.racketPoseValid)} | accepted ${flag(hitDebug.hitAccepted)} | ` +
    `ball ${formatVector(ball.position)} | target ${formatVector(ball.contactTarget)} | strings ${formatVector(hitDebug.stringBedCenter)} | ` +
    `gaps ${hitDebug.ballToTargetDistance.toFixed(2)}/${hitDebug.ballToStringBedDistance.toFixed(2)} m | reject ${hitDebug.rejectionReason}`;
  const returnDebug = ballController.lastResponse;
  elements.debugBallResult.textContent = ballController.lastHit && returnDebug
    ? `HIT ${ballController.lastHit.strokeType}, assisted ${ballController.lastHit.assisted}; ` +
      `raw ${formatVector(returnDebug.direction.rawDirection)}, constrained ${formatVector(returnDebug.direction.constrainedDirection)}, ` +
      `face ${formatVector(returnDebug.direction.faceContribution)}, forward ${formatVector(returnDebug.direction.forwardContribution)}, ` +
      `lift ${formatVector(returnDebug.direction.liftContribution)}, side ${formatVector(returnDebug.direction.sideContribution)}, ` +
      `net ${returnDebug.prediction.netCrossingPoint ? formatVector(returnDebug.prediction.netCrossingPoint) : "none"}, ` +
      `bounce ${returnDebug.prediction.bouncePoint ? formatVector(returnDebug.prediction.bouncePoint) : "none"}`
    : ballController.lastMiss
      ? `MISS ${ballController.lastMiss.reason}`
      : "none";
  const target = ball.launchPreset ? ball.contactTarget : getBallDeliveryTarget({
    preset: activeLaunchPreset,
    handedness: strokeStateMachine.getHandedness(),
    backhandStyle: strokeStateMachine.getBackhandStyle(),
    heightOffset: contactHeightOffset,
    sideOffset: isBackhandPreset(activeLaunchPreset) ? backhandSideOffset : forehandSideOffset,
    depthOffset: contactDepthOffset
  });
  const expected = getExpectedRacketContactTransform({
    strokeType: isBackhandPreset(activeLaunchPreset) ? "backhand" : "forehand",
    handedness: strokeStateMachine.getHandedness(),
    backhandStyle: strokeStateMachine.getBackhandStyle()
  });
  const forehandTarget = getBallDeliveryTarget({
    preset: "easyForehand", handedness: strokeStateMachine.getHandedness(),
    backhandStyle: strokeStateMachine.getBackhandStyle(), heightOffset: contactHeightOffset,
    sideOffset: forehandSideOffset, depthOffset: contactDepthOffset, assistMode
  });
  const backhandTarget = getBallDeliveryTarget({
    preset: "easyBackhand", handedness: strokeStateMachine.getHandedness(),
    backhandStyle: strokeStateMachine.getBackhandStyle(), heightOffset: contactHeightOffset,
    sideOffset: backhandSideOffset, depthOffset: contactDepthOffset, assistMode
  });
  const projectedDiameter = projectPixelDiameter(
    ball.visualRadius,
    target,
    camera.position,
    THREE.MathUtils.degToRad(camera.fov),
    renderer.domElement.clientHeight || window.innerHeight
  );
  elements.debugBallScale.textContent =
    `physical ${(ball.physicsRadius * 2).toFixed(3)} m, visual ${(ball.visualRadius * 2).toFixed(3)} m, ` +
    `scale ${ballVisualScaleMultiplier.toFixed(2)}x, contact ${projectedDiameter.toFixed(1)} px, 1 unit = 1 m; ` +
    `angular ${formatVector(ball.angularVelocity)} ${ball.angularVelocity.length().toFixed(1)} rad/s, ` +
    `q ${formatQuaternion(ballMesh.quaternion)}`;
  elements.debugDeliveryTarget.textContent =
    `FOREHAND TARGET ${formatVector(forehandTarget)}; BACKHAND TARGET ${formatVector(backhandTarget)}; ` +
    `ACTUAL STRING-BED CENTER ${formatVector(expected.stringBedCenter)}; CURRENT BALL ${formatVector(ball.position)}; ` +
    `FIRST BOUNCE POINT ${formatVector(ball.bouncePoint)}; active target height ${target.y.toFixed(2)} m, ` +
    `side ${target.x.toFixed(2)} m, center gap ${target.distanceTo(expected.stringBedCenter).toFixed(3)} m, ` +
    `contact ETA ${ball.contactDeadline > 0 ? Math.max(0, (ball.contactDeadline - Date.now()) / 1000).toFixed(2) : "--"} s, ` +
    `second bounce ETA ${ball.secondBounceDeadline > 0 ? Math.max(0, (ball.secondBounceDeadline - Date.now()) / 1000).toFixed(2) : "--"} s, ` +
    `closest physical ${ballController.lastCollision?.closestDistance.toFixed(3) ?? "--"} m, ` +
    `Training closest ball/string center ${Number.isFinite(trainingClosestStringBedDistance)
      ? trainingClosestStringBedDistance.toFixed(3) : "--"} m, ` +
    `zone entry ${trainingStrikeZoneEntryAt ?? "--"}, ` +
    `neutral drift ${(trainingMaximumNeutralOriginDriftMeters * 100).toFixed(1)} cm, ` +
    `last miss ${lastTrainingMissReasons.join(",") || "--"}`;
}

function completeCalibration(): void {
  isCalibrated = true;
  calibrationRequested = false;
  calibrationGuide.visible = false;
  elements.calibrationTitle.textContent = "Calibration complete";
  elements.calibrationInstructions.textContent = "Start position locked. The racket is ready.";
  elements.calibrationOverlay.classList.add("is-calibrated");
  strokeStateMachine.reset(Date.now(), "calibration complete");
  latestStrokeSnapshot = strokeStateMachine.getSnapshot(Date.now());
  proceduralPositionPivot.position.set(0, 0, 0);
  socket.emit("calibration:complete", { t: Date.now() });
}

function resetCalibration(): void {
  stopReplay();
  isCalibrated = false;
  calibrationRequested = false;
  hasCalibrationBaseline = false;
  calibrationBaselineInverse.identity();
  neutralPhoneQuaternion.identity();
  alignmentStableSince = null;
  calibrationGuide.visible = true;
  elements.calibrationOverlay.classList.remove("is-calibrated");
  elements.calibrationTitle.textContent = "Calibrate start position";
  elements.calibrationInstructions.textContent =
    "Align the tracked racket inside the angled ghost racket, then tap Calibrate on the phone.";
  strokeStateMachine.reset(Date.now(), "calibration reset");
  latestStrokeSnapshot = strokeStateMachine.getSnapshot(Date.now());
  proceduralPositionPivot.position.set(0, 0, 0);
}

function getStrokePositionOffset(): THREE.Vector3 {
  strokePositionOffset.set(0, 0, 0);
  if (!activeStroke) {
    return strokePositionOffset;
  }

  const elapsedMs = performance.now() - activeStroke.startedAt;
  const progress = Math.min(elapsedMs / activeStroke.durationMs, 1);

  if (progress >= 1) {
    activeStroke = null;
    return strokePositionOffset;
  }

  const swingDirection = normalizeStrokeType(activeStroke.type) === "forehand" ? 1 : -1;
  const easedProgress = easeOutThenIn(progress);
  const arc = Math.sin(easedProgress * Math.PI);
  const forwardTravel = arc * -1.35;
  const upwardTravel = arc * 0.52;
  const sideCurve = arc * swingDirection * 0.38;

  strokePositionOffset.set(sideCurve, upwardTravel, forwardTravel);
  return strokePositionOffset;
}

function animateDust(elapsed: number): void {
  dustParticles.rotation.y = elapsed * 0.018;
  dustParticles.rotation.x = Math.sin(elapsed * 0.14) * 0.025;
}

function estimateSwingSpeedKmh(
  packet: BrokeredMotionPacket,
  previous: BrokeredMotionPacket | null
): number {
  const orientationSpeed = estimateOrientationSpeed(packet, previous);
  const accelerationSpeed = estimateAccelerationSpeed(packet);

  return clamp(Math.max(orientationSpeed, accelerationSpeed), 0, 220);
}

function estimateOrientationSpeed(
  packet: BrokeredMotionPacket,
  previous: BrokeredMotionPacket | null
): number {
  if (!previous) {
    return 0;
  }

  const currentBeta = packet.orientation.beta ?? packet.acceleration.y ?? 0;
  const currentGamma = packet.orientation.gamma ?? packet.acceleration.x ?? 0;
  const previousBeta = previous.orientation.beta ?? previous.acceleration.y ?? 0;
  const previousGamma = previous.orientation.gamma ?? previous.acceleration.x ?? 0;
  const deltaMs = Math.max(8, packet.serverReceivedAt - previous.serverReceivedAt);
  const angularDistance = Math.hypot(currentBeta - previousBeta, currentGamma - previousGamma);
  const degreesPerSecond = (angularDistance / deltaMs) * 1000;

  return degreesPerSecond * 0.42;
}

function estimateAccelerationSpeed(packet: BrokeredMotionPacket): number {
  const accelerationMagnitude = Math.hypot(
    packet.acceleration.x ?? 0,
    packet.acceleration.y ?? 0,
    packet.acceleration.z ?? 0
  );

  if (packet.inputMode === "simulator") {
    return accelerationMagnitude * 9.5;
  }

  return accelerationMagnitude * 3.6;
}

function estimateStrokeBurstSpeedKmh(packet: BrokeredStrokeDetectedPacket): number {
  const acceleration = packet.peakAcceleration ?? packet.accelerationX ?? 0;
  return clamp(Math.abs(acceleration) * 7.5, 0, 220);
}

function updateConnectionStatus(): void {
  elements.connectionStatus.textContent = socket.connected
    ? "Socket: connected"
    : "Socket: disconnected";
}

function updatePacketAge(): void {
  const packetTime = latestPacket?.serverReceivedAt ?? latestOrientationPacket?.serverReceivedAt;

  if (!packetTime) {
    elements.packetAge.textContent = "--";
    updateDiagnosticReadiness();
    return;
  }

  const ageMs = Date.now() - packetTime;
  elements.packetAge.textContent = `${ageMs} ms`;
  updateDiagnosticReadiness();
}

function isDiagnosticInputReady(): boolean {
  const packetTime = latestPacket?.serverReceivedAt ?? latestOrientationPacket?.serverReceivedAt;
  const packetIsFresh = packetTime !== undefined && Date.now() - packetTime <= DIAGNOSTIC_PACKET_FRESHNESS_MS;
  return socket.connected && mobileClientCount === 1 && packetIsFresh && latestSensorFrame?.valid === true && isCalibrated;
}

function diagnosticReadinessMessage(): string {
  if (!socket.connected || mobileClientCount !== 1) return "Connect Expo Go before recording";
  const packetTime = latestPacket?.serverReceivedAt ?? latestOrientationPacket?.serverReceivedAt;
  if (!packetTime || Date.now() - packetTime > DIAGNOSTIC_PACKET_FRESHNESS_MS) return "Connect Expo Go before recording - waiting for fresh phone packets";
  if (!latestSensorFrame?.valid) return "Connect Expo Go before recording - sensor data is not valid";
  if (!isCalibrated) return "Calibrate the racket before recording";
  return "ready - phone connected and packets are fresh";
}

function updateDiagnosticReadiness(): void {
  if (diagnosticState === "recording" || diagnosticState === "analyzing") return;
  const ready = isDiagnosticInputReady();
  elements.recordForehandAttempt.disabled = !ready;
  elements.recordBackhandAttempt.disabled = !ready;
  if (diagnosticState !== "ready" || !ready) setDiagnosticStatus(ready ? "idle" : "idle", diagnosticReadinessMessage());
}

function setDiagnosticStatus(state: typeof diagnosticState, message: string): void {
  diagnosticState = state;
  elements.diagnosticStatus.textContent = `Diagnostic: ${state}${message ? ` - ${message}` : ""}`;
  elements.diagnosticStatus.classList.toggle("is-ready", state === "ready" || message.startsWith("ready"));
  elements.diagnosticStatus.classList.toggle("is-error", state === "error");
}

function resizeRendererToVisualizationPanel(): void {
  const bounds = visualizationPanel.getBoundingClientRect();
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));
  const nextPixelRatio = courtPixelRatio(width, height, window.devicePixelRatio);
  if (renderer.getPixelRatio() !== nextPixelRatio) renderer.setPixelRatio(nextPixelRatio);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function damp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

function easeOutThenIn(value: number): number {
  return value < 0.5
    ? 2 * value * value
    : 1 - Math.pow(-2 * value + 2, 2) / 2;
}

function normalizeStrokeType(value: StrokeType | undefined): "forehand" | "backhand" | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();

  if (normalized === "forehand" || normalized === "backhand") {
    return normalized;
  }

  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing element #${id}`);
  }

  return element as T;
}

function assertDiagnosticElements(): void {
  const missing = DIAGNOSTIC_ELEMENT_IDS.filter((id) => document.getElementById(id) === null);
  if (missing.length > 0) {
    const message = `Diagnostic UI startup failure: missing ${missing.map((id) => `#${id}`).join(", ")}`;
    console.error(message);
    throw new Error(message);
  }
}
