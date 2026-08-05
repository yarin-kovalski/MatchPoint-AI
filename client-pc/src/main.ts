import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BallController } from "./ball/BallController.js";
import { BALL_CONFIG } from "./ball/ballConfig.js";
import { getBallDeliveryTarget, getExpectedRacketContactTransform, projectPixelDiameter } from "./ball/ballDelivery.js";
import { AssistMode, BallHitEvent, BallMissEvent, BallSpeedPreset, LaunchPreset } from "./ball/ballTypes.js";
import { createProceduralTennisBallTexture, integrateBallRotation } from "./ball/ballVisuals.js";
import { MOTION_CONFIG } from "./motion/motionConfig.js";
import {
  NormalizedSensorFrame,
  SensorNormalizer
} from "./motion/sensorNormalization.js";
import { STROKE_CONFIG } from "./strokeDetection/strokeConfig.js";
import {
  deserializeFrame,
  MotionRecorder,
  RecordingLabel
} from "./strokeDetection/motionRecorder.js";
import { StrokeStateMachine } from "./strokeDetection/strokeStateMachine.js";
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

type StrokeType = "forehand" | "backhand" | "Forehand" | "Backhand";

type BrokeredContinuousOrientationPacket = {
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

const elements = {
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
  launchBackhandBall: getElement<HTMLButtonElement>("launchBackhandBall"),
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
  debugBallResult: getElement("debugBallResult"),
  ballVisualSizeSelect: getElement<HTMLSelectElement>("ballVisualSizeSelect"),
  ballVisualScaleInput: getElement<HTMLInputElement>("ballVisualScaleInput"),
  contactHeightInput: getElement<HTMLInputElement>("contactHeightInput"),
  contactSideInput: getElement<HTMLInputElement>("contactSideInput"),
  contactDepthInput: getElement<HTMLInputElement>("contactDepthInput"),
  showContactTargetToggle: getElement<HTMLInputElement>("showContactTargetToggle"),
  showTrajectoryToggle: getElement<HTMLInputElement>("showTrajectoryToggle"),
  showStringCenterToggle: getElement<HTMLInputElement>("showStringCenterToggle"),
  resetBallVisualSettings: getElement<HTMLButtonElement>("resetBallVisualSettings"),
  debugBallScale: getElement("debugBallScale"),
  debugDeliveryTarget: getElement("debugDeliveryTarget"),
  debugStrokeTimeline: getElement("debugStrokeTimeline")
};

let packetCount = 0;
let latestPacket: BrokeredMotionPacket | null = null;
let previousPacket: BrokeredMotionPacket | null = null;
let latestOrientationPacket: BrokeredContinuousOrientationPacket | null = null;
let latestSensorFrame: NormalizedSensorFrame | null = null;
let latestStrokeSnapshot: StrokeDetectorSnapshot | null = null;
let lastContactEvent: EstimatedRacketContact | null = null;
let targetRotationX = 0;
let targetRotationY = 0;
let targetRotationZ = 0;
let displayedSwingSpeedKmh = 0;
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
let assistMode: AssistMode = "prototype";
let ballSpeedPreset: BallSpeedPreset = "normal";
let activeLaunchPreset: LaunchPreset = "easyForehand";
let lastBallFrameAt = performance.now();
let lastBallBounceCount = 0;
let ballRelaunchAt = 0;
let ballVisualScaleMultiplier: number = BALL_CONFIG.scale.visualScaleMultiplier;
let contactHeightOffset = -0.18;
let contactSideOffsetMagnitude = 0.14;
let contactDepthOffset = 0;
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
const identityQuaternion = new THREE.Quaternion();
const neutralRacketPosition = new THREE.Vector3(0, 1.45, 0);
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
const motionRecorder = new MotionRecorder();
const USE_LEGACY_STROKE_DETECTOR = false;

const clock = new THREE.Clock();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010511);
scene.fog = new THREE.FogExp2(0x010511, 0.045);

const camera = new THREE.PerspectiveCamera(
  BALL_CONFIG.camera.fovDegrees,
  window.innerWidth / window.innerHeight,
  BALL_CONFIG.camera.near,
  BALL_CONFIG.camera.far
);
camera.position.set(...BALL_CONFIG.camera.position);
camera.lookAt(...BALL_CONFIG.camera.target);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

const ambientLight = new THREE.AmbientLight(0x5d7bff, 0.82);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xe8f6ff, 2.15);
keyLight.position.set(4, 9, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);

const rimLight = new THREE.PointLight(0xb8ff2c, 26, 18);
rimLight.position.set(-3, 3, -4);
scene.add(rimLight);

const blueBackLight = new THREE.PointLight(0x0b5cff, 18, 24);
blueBackLight.position.set(4, 4, -8);
scene.add(blueBackLight);

const purpleVolumeLight = new THREE.PointLight(0x7f3cff, 10, 22);
purpleVolumeLight.position.set(-6, 5, -10);
scene.add(purpleVolumeLight);

const court = createCourt();
scene.add(court);

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

const modelCorrectionPivot = new THREE.Group();
modelCorrectionPivot.name = "modelCorrectionPivot";
modelCorrectionPivot.quaternion.copy(racketModelCorrectionQuaternion);
orientationPivot.add(modelCorrectionPivot);

const racketStringCollider = new THREE.Group();
racketStringCollider.name = "racketStringCollider";
racketStringCollider.position.set(...BALL_CONFIG.collision.headCenterLocal);
modelCorrectionPivot.add(racketStringCollider);

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
    roughness: 0.88,
    metalness: 0,
    clearcoat: 0.04,
    emissive: 0x182400,
    emissiveIntensity: 0.08
  })
);
ballMesh.castShadow = true;
ballMesh.receiveShadow = true;
ballMesh.visible = false;
scene.add(ballMesh);

const ballShadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.085, 24),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false })
);
ballShadow.rotation.x = -Math.PI / 2;
ballShadow.visible = false;
scene.add(ballShadow);

const ballTrailPositions: THREE.Vector3[] = [];
const ballTrailGeometry = new THREE.BufferGeometry();
const ballTrail = new THREE.Line(
  ballTrailGeometry,
  new THREE.LineBasicMaterial({ color: 0xdfff72, transparent: true, opacity: 0.38 })
);
ballTrail.visible = false;
scene.add(ballTrail);

const ballController = new BallController(onBallHit, onBallMiss);
const ballDebugGroup = new THREE.Group();
ballDebugGroup.visible = false;
scene.add(ballDebugGroup);
const ballVelocityArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1, 0x39d9ff);
const racketNormalArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 0.8, 0xff5b89);
ballDebugGroup.add(ballVelocityArrow, racketNormalArrow);
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

const contactTargetGroup = new THREE.Group();
contactTargetGroup.visible = false;
scene.add(contactTargetGroup);
const contactTargetVolume = new THREE.Mesh(
  new THREE.SphereGeometry(0.22, 18, 12),
  new THREE.MeshBasicMaterial({ color: 0x54e9ff, wireframe: true, transparent: true, opacity: 0.38, depthTest: false })
);
contactTargetVolume.scale.set(1.25, 1, 0.75);
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
loadRacketModel();

const farCourtHaze = createFarCourtHaze();
scene.add(farCourtHaze);

const dustParticles = createDustParticles();
scene.add(dustParticles);

socket.on("connect", () => {
  socket.emit("client:hello", { role: "pc" });
  updateConnectionStatus();
});

socket.on("disconnect", () => {
  updateConnectionStatus();
});

socket.on("broker:status", (payload: unknown) => {
  const status = payload as BrokerStatus;
  elements.mobileClients.textContent = String(status.mobileClients);
});

socket.on("controller:state", (payload: unknown) => {
  latestOrientationPacket = null;
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
  const orientationPacket = payload as BrokeredContinuousOrientationPacket;
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
  ).normalize();
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
    accelerationMps2: nullableVectorToThree(orientationPacket.acceleration),
    accelerationIncludingGravityMps2: nullableVectorToThree(
      orientationPacket.accelerationIncludingGravity
    )
  });

  if (!replayActive) {
    latestSensorFrame = processedFrame;
    if (isCalibrated) {
      processStrokeFrame(processedFrame);
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

window.addEventListener("resize", handleResize);

animate();

function createCourt(): THREE.Group {
  const group = new THREE.Group();

  const planeGeometry = new THREE.PlaneGeometry(18, 24);
  const courtTexture = createCourtTexture();
  courtTexture.wrapS = THREE.RepeatWrapping;
  courtTexture.wrapT = THREE.RepeatWrapping;
  courtTexture.repeat.set(2, 3);
  const planeMaterial = new THREE.MeshStandardMaterial({
    color: 0x061223,
    emissive: 0x010919,
    map: courtTexture,
    roughness: 0.46,
    metalness: 0.22
  });
  const plane = new THREE.Mesh(planeGeometry, planeMaterial);
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  group.add(plane);

  const grid = new THREE.GridHelper(24, 24, 0xb8ff2c, 0x123862);
  grid.position.y = 0.012;
  group.add(grid);

  const lineMaterial = new THREE.MeshStandardMaterial({
    color: 0xb8ff2c,
    emissive: 0xb8ff2c,
    emissiveIntensity: 1.85,
    roughness: 0.18,
    transparent: true,
    opacity: 0.92
  });
  const lineSpecs = [
    { width: 0.045, depth: 22, x: 0, z: 0 },
    { width: 11, depth: 0.045, x: 0, z: -8 },
    { width: 11, depth: 0.045, x: 0, z: 8 },
    { width: 0.045, depth: 16, x: -5.5, z: 0 },
    { width: 0.045, depth: 16, x: 5.5, z: 0 }
  ];

  for (const spec of lineSpecs) {
    const groove = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width + 0.22, 0.018, spec.depth + 0.22),
      new THREE.MeshStandardMaterial({
        color: 0x02060d,
        emissive: 0x001525,
        roughness: 0.35,
        metalness: 0.4
      })
    );
    groove.position.set(spec.x, 0.023, spec.z);
    group.add(groove);

    const line = createNeonTubeLine(spec.width, spec.depth, lineMaterial);
    line.position.set(spec.x, 0.052, spec.z);
    group.add(line);

    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width + 0.5, 0.012, spec.depth + 0.5),
      new THREE.MeshBasicMaterial({
        color: 0xb8ff2c,
        transparent: true,
        opacity: 0.105,
        depthWrite: false
      })
    );
    glow.position.set(spec.x, 0.061, spec.z);
    group.add(glow);

    const reflection = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width + 0.18, 0.01, spec.depth + 0.18),
      new THREE.MeshBasicMaterial({
        color: 0x76ff22,
        transparent: true,
        opacity: 0.075,
        depthWrite: false
      })
    );
    reflection.position.set(spec.x, 0.026, spec.z);
    group.add(reflection);

    const tubeLight = new THREE.PointLight(0xb8ff2c, 0.72, 6.2);
    tubeLight.position.set(spec.x, 0.22, spec.z);
    group.add(tubeLight);
  }

  return group;
}

function createNeonTubeLine(
  width: number,
  depth: number,
  material: THREE.MeshStandardMaterial
): THREE.Group {
  const group = new THREE.Group();
  const isHorizontal = width > depth;
  const length = Math.max(width, depth);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, length, 18), material);
  tube.rotation.z = isHorizontal ? Math.PI / 2 : 0;
  tube.rotation.x = isHorizontal ? 0 : Math.PI / 2;
  tube.castShadow = false;
  group.add(tube);
  return group;
}

function loadRacketModel(): void {
  const loader = new GLTFLoader();

  loader.load(
    "/pc/racket_new.glb",
    (gltf) => {
      const model = gltf.scene;
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      modelCorrectionPivot.add(model);

      const ghostModel = model.clone(true);
      ghostModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const ghostMaterial = new THREE.MeshBasicMaterial({
            color: ghostFarColor,
            transparent: true,
            opacity: 0.34,
            wireframe: true,
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
  const now = performance.now();
  const ballDeltaSeconds = Math.min((now - lastBallFrameAt) / 1000, 0.1);
  lastBallFrameAt = now;

  if (latestOrientationPacket) {
    if (latestSensorFrame?.valid) {
      relativeOrientationQuaternion.copy(latestSensorFrame.relativePhoneQuaternion);
    }
  } else {
    gyroEuler.set(targetRotationX, targetRotationY, targetRotationZ);
    gyroQuaternion.setFromEuler(gyroEuler);
    phoneQuaternionToThreeQuaternion(gyroQuaternion, relativeOrientationQuaternion);
  }

  targetRacketQuaternion.copy(relativeOrientationQuaternion);
  orientationPivot.quaternion.slerp(
    targetRacketQuaternion,
    MOTION_CONFIG.smoothing.visualizationOrientation
  );
  displayedRelativeQuaternion.copy(orientationPivot.quaternion);
  racketRoot.position.copy(neutralRacketPosition);
  updateProceduralPosition();
  if (USE_LEGACY_STROKE_DETECTOR) {
    racketRoot.position.add(getStrokePositionOffset());
  }
  scene.updateMatrixWorld(true);
  const detectorSnapshot = latestStrokeSnapshot ?? strokeStateMachine.getSnapshot(Date.now());
  ballController.update(
    ballDeltaSeconds,
    Date.now(),
    racketStringCollider.matrixWorld,
    detectorSnapshot,
    lastContactEvent,
    assistMode
  );
  updateBallVisuals(ballDeltaSeconds);
  rimLight.intensity = performance.now() < contactFlashUntil ? 42 : 26;
  targetSwingSpeedKmh *= 0.94;
  displayedSwingSpeedKmh = damp(displayedSwingSpeedKmh, targetSwingSpeedKmh, 0.45);

  finalRacketQuaternion
    .copy(baseReadyPoseQuaternion)
    .multiply(displayedRelativeQuaternion)
    .multiply(racketModelCorrectionQuaternion);
  const displayedEuler = new THREE.Euler().setFromQuaternion(finalRacketQuaternion, "YXZ");
  elements.rotationX.textContent = displayedEuler.x.toFixed(3);
  elements.rotationY.textContent = displayedEuler.y.toFixed(3);
  elements.swingSpeed.textContent = `${Math.round(displayedSwingSpeedKmh)} km/h`;
  elements.peakSwingSpeed.textContent = `${Math.round(peakSwingSpeedKmh)} km/h`;
  animateDust(elapsed);
  updateCalibrationGuide(elapsed);
  updateOrientationDebug();
  updateStrokeDebug();
  updateBallDebug();
  updateConnectionStatus();
  updatePacketAge();

  renderer.render(scene, camera);
}

function updateCalibrationGuide(elapsed: number): void {
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
  latestSensorFrame = null;
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

  if (snapshot) {
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
        target = path.contactWindow;
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
  const preparationSign = snapshot?.lockedStrokeType === "backhand"
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
  proceduralPositionPivot.position.lerp(strokePositionOffset, path.smoothing);
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

function wireBallControls(): void {
  elements.launchForehandBall.addEventListener("click", () => launchBall("easyForehand"));
  elements.launchBackhandBall.addEventListener("click", () => launchBall("easyBackhand"));
  elements.resetBall.addEventListener("click", () => {
    ballController.reset();
    ballMesh.visible = false;
    elements.ballResult.textContent = "--";
  });
  elements.assistModeSelect.addEventListener("change", () => {
    assistMode = elements.assistModeSelect.value as AssistMode;
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
  elements.contactHeightInput.addEventListener("input", readDeliveryTuning);
  elements.contactSideInput.addEventListener("input", readDeliveryTuning);
  elements.contactDepthInput.addEventListener("input", readDeliveryTuning);
  elements.resetBallVisualSettings.addEventListener("click", resetBallVisualSettings);
}

function updateBallHelperVisibility(): void {
  const debug = elements.ballDebugToggle.checked;
  ballDebugGroup.visible = debug || elements.showTrajectoryToggle.checked || elements.showStringCenterToggle.checked;
  colliderDebug.visible = debug || elements.showStringCenterToggle.checked;
  predictedPathLine.visible = debug || elements.showTrajectoryToggle.checked;
  racketNormalArrow.visible = debug;
  ballVelocityArrow.visible = debug;
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
}

function readDeliveryTuning(): void {
  contactHeightOffset = Number(elements.contactHeightInput.value);
  contactSideOffsetMagnitude = Math.abs(Number(elements.contactSideInput.value));
  contactDepthOffset = Number(elements.contactDepthInput.value);
}

function resetBallVisualSettings(): void {
  elements.ballVisualSizeSelect.value = "readable";
  elements.ballVisualScaleInput.value = String(BALL_CONFIG.scale.visualScaleMultiplier);
  elements.contactHeightInput.value = "-0.18";
  elements.contactSideInput.value = "0.14";
  elements.contactDepthInput.value = "0";
  elements.showContactTargetToggle.checked = false;
  elements.showTrajectoryToggle.checked = false;
  elements.showStringCenterToggle.checked = false;
  readDeliveryTuning();
  updateBallVisualScale();
  updateBallHelperVisibility();
}

function launchBall(preset: LaunchPreset): void {
  activeLaunchPreset = preset;
  const sideOffset = preset === "easyBackhand"
    ? -contactSideOffsetMagnitude
    : preset === "centerPractice"
      ? 0
      : contactSideOffsetMagnitude;
  ballController.launch(
    preset,
    strokeStateMachine.getHandedness(),
    ballSpeedPreset,
    Date.now(),
    strokeStateMachine.getBackhandStyle(),
    { heightOffset: contactHeightOffset, sideOffset, depthOffset: contactDepthOffset }
  );
  motionRecorder.recordBallLaunch(
    preset,
    strokeStateMachine.getHandedness(),
    strokeStateMachine.getBackhandStyle(),
    ballSpeedPreset,
    Date.now(),
    { heightOffset: contactHeightOffset, sideOffset, depthOffset: contactDepthOffset },
    ballVisualScaleMultiplier
  );
  ballMesh.visible = true;
  bounceMarker.visible = false;
  contactMarker.visible = false;
  ballTrailPositions.length = 0;
  ballMesh.quaternion.identity();
  lastBallBounceCount = 0;
  elements.ballResult.textContent = "--";
}

function onBallHit(event: BallHitEvent): void {
  contactMarker.position.copy(event.contactPointWorld);
  contactMarker.visible = true;
  elements.ballResult.textContent = "HIT";
  elements.outgoingBallSpeed.textContent = `${event.outgoingSpeed.toFixed(1)} m/s`;
  contactFlashUntil = performance.now() + 150;
  motionRecorder.recordBallResult({ type: "hit", event });
  console.info("Ball hit", event);
}

function onBallMiss(event: BallMissEvent): void {
  elements.ballResult.textContent = "MISS";
  ballRelaunchAt = performance.now() + BALL_CONFIG.resetDelayMs;
  motionRecorder.recordBallResult({ type: "miss", event });
  console.info("Ball miss", event);
}

function updateBallVisuals(deltaSeconds: number): void {
  const ball = ballController.ball;
  ballMesh.visible = ball.active || ball.state === "OUT";
  ballMesh.position.copy(ball.position);
  integrateBallRotation(ballMesh.quaternion, ball.angularVelocity, deltaSeconds);
  const height = Math.max(0, ball.position.y - BALL_CONFIG.courtHeight);
  const shadowScale = THREE.MathUtils.clamp(1 + height * 0.45, 1, 2.8);
  ballShadow.visible = ballMesh.visible;
  ballShadow.position.set(ball.position.x, BALL_CONFIG.courtHeight + 0.008, ball.position.z);
  ballShadow.scale.set(shadowScale, shadowScale * 0.65, 1);
  (ballShadow.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.clamp(0.42 - height * 0.07, 0.09, 0.38);
  if (ball.active) {
    ballTrailPositions.push(ball.position.clone());
    if (ballTrailPositions.length > 18) ballTrailPositions.shift();
    ballTrailGeometry.setFromPoints(ballTrailPositions);
    ballTrail.visible = ball.velocity.length() > 4 && ballTrailPositions.length > 2;
  } else {
    ballTrail.visible = false;
  }
  if (ball.bounceCount > lastBallBounceCount) {
    bounceMarker.position.set(ball.position.x, BALL_CONFIG.courtHeight + 0.006, ball.position.z);
    bounceMarker.visible = true;
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
  const show = elements.ballDebugToggle.checked || elements.showContactTargetToggle.checked ||
    elements.showStringCenterToggle.checked;
  contactTargetGroup.visible = show;
  if (!show) return;
  const ball = ballController.ball;
  const target = ball.launchPreset ? ball.contactTarget : getBallDeliveryTarget({
    preset: activeLaunchPreset,
    handedness: strokeStateMachine.getHandedness(),
    backhandStyle: strokeStateMachine.getBackhandStyle()
  });
  const strokeType = activeLaunchPreset === "easyBackhand" ? "backhand" : "forehand";
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
  contactHeightGuide.geometry.setFromPoints([
    new THREE.Vector3(0, BALL_CONFIG.courtHeight - target.y, 0),
    new THREE.Vector3(0, 0, 0)
  ]);
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
  const collision = ballController.lastCollision;
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
  const timeToZone = ball.velocity.z > 0
    ? Math.max(0, (BALL_CONFIG.contactZone.minimumZ - ball.position.z) / ball.velocity.z)
    : Number.POSITIVE_INFINITY;
  elements.debugBallValidity.textContent =
    `active ${ball.active}, hit ${ball.hit}, stroke ${latestStrokeSnapshot?.currentState ?? "READY"}, ` +
    `contact age ${contactAge === null ? "none" : `${Math.round(contactAge)} ms`}, assist ${assistMode}, ` +
    `zone ETA ${Number.isFinite(timeToZone) ? `${timeToZone.toFixed(2)} s` : "--"}, ` +
    `racket distance ${collision?.closestDistance.toFixed(2) ?? "--"} m, magnus ${formatVector(ball.magnusAcceleration)}`;
  elements.debugBallResult.textContent = ballController.lastHit
    ? `HIT ${ballController.lastHit.strokeType}, assisted ${ballController.lastHit.assisted}`
    : ballController.lastMiss
      ? `MISS ${ballController.lastMiss.reason}`
      : "none";
  const target = ball.launchPreset ? ball.contactTarget : getBallDeliveryTarget({
    preset: activeLaunchPreset,
    handedness: strokeStateMachine.getHandedness(),
    backhandStyle: strokeStateMachine.getBackhandStyle(),
    heightOffset: contactHeightOffset,
    sideOffset: activeLaunchPreset === "easyBackhand" ? -contactSideOffsetMagnitude : contactSideOffsetMagnitude,
    depthOffset: contactDepthOffset
  });
  const expected = getExpectedRacketContactTransform({
    strokeType: activeLaunchPreset === "easyBackhand" ? "backhand" : "forehand",
    handedness: strokeStateMachine.getHandedness(),
    backhandStyle: strokeStateMachine.getBackhandStyle()
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
    `target ${formatVector(target)}, expected racket ${formatVector(expected.stringBedCenter)}, ` +
    `gap ${target.distanceTo(expected.stringBedCenter).toFixed(3)} m, ` +
    `closest ${ballController.lastCollision?.closestDistance.toFixed(3) ?? "--"} m`;
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
    return;
  }

  const ageMs = Date.now() - packetTime;
  elements.packetAge.textContent = `${ageMs} ms`;
}

function handleResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
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
