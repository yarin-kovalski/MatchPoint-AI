import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MOTION_CONFIG } from "./motion/motionConfig.js";
import {
  NormalizedSensorFrame,
  SensorNormalizer
} from "./motion/sensorNormalization.js";

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
  debugSensorValidity: getElement("debugSensorValidity")
};

let packetCount = 0;
let latestPacket: BrokeredMotionPacket | null = null;
let previousPacket: BrokeredMotionPacket | null = null;
let latestOrientationPacket: BrokeredContinuousOrientationPacket | null = null;
let latestSensorFrame: NormalizedSensorFrame | null = null;
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

const clock = new THREE.Clock();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010511);
scene.fog = new THREE.FogExp2(0x010511, 0.045);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 4.9, 8.2);
camera.lookAt(0, 0.82, -0.35);

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
racketRoot.add(orientationPivot);

const modelCorrectionPivot = new THREE.Group();
modelCorrectionPivot.name = "modelCorrectionPivot";
modelCorrectionPivot.quaternion.copy(racketModelCorrectionQuaternion);
orientationPivot.add(modelCorrectionPivot);

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
  latestSensorFrame = sensorNormalizer.process({
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
  if (!isCalibrated) {
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
  racketRoot.position.copy(neutralRacketPosition).add(getStrokePositionOffset());
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
  neutralPhoneQuaternion.copy(currentPhoneQuaternion).normalize();
  calibrationBaselineInverse.copy(neutralPhoneQuaternion).invert();
  sensorNormalizer.reset();
  latestSensorFrame = null;
  hasCalibrationBaseline = true;
  isCalibrated = false;
  calibrationRequested = true;
  alignmentStableSince = null;
  activeStroke = null;
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

function completeCalibration(): void {
  isCalibrated = true;
  calibrationRequested = false;
  calibrationGuide.visible = false;
  elements.calibrationTitle.textContent = "Calibration complete";
  elements.calibrationInstructions.textContent = "Start position locked. The racket is ready.";
  elements.calibrationOverlay.classList.add("is-calibrated");
  socket.emit("calibration:complete", { t: Date.now() });
}

function resetCalibration(): void {
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
