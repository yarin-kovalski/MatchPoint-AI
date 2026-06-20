import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

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
  rotationY: getElement("rotationY")
};

let packetCount = 0;
let latestPacket: BrokeredMotionPacket | null = null;
let previousPacket: BrokeredMotionPacket | null = null;
let targetRotationX = 0;
let targetRotationY = 0;
let targetRotationZ = 0;
let displayedSwingSpeedKmh = 0;
let targetSwingSpeedKmh = 0;
let peakSwingSpeedKmh = 0;
const targetRacketQuaternion = new THREE.Quaternion();
const targetRacketEuler = new THREE.Euler(0, 0, 0, "YXZ");

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

const racketContainer = new THREE.Group();
racketContainer.position.set(0, 1.45, 0);
racketContainer.quaternion.identity();
scene.add(racketContainer);
loadRacketModel();

const farCourtHaze = createFarCourtHaze();
scene.add(farCourtHaze);

const dustParticles = createDustParticles();
scene.add(dustParticles);

socket.on("connect", () => {
  socket.emit("client:hello", { role: "pc" });
  updateConnectionStatus();
});

socket.on("disconnect", updateConnectionStatus);

socket.on("broker:status", (payload: unknown) => {
  const status = payload as BrokerStatus;
  elements.mobileClients.textContent = String(status.mobileClients);
});

socket.on("controller:state", (payload: unknown) => {
  previousPacket = latestPacket;
  latestPacket = payload as BrokeredMotionPacket;
  packetCount += 1;

  const mappedRotation = mapPacketToRotation(latestPacket);
  targetRotationX = mappedRotation.x;
  targetRotationY = mappedRotation.y;
  targetRotationZ = mappedRotation.z;
  targetRacketEuler.set(targetRotationX, targetRotationY, targetRotationZ);
  targetRacketQuaternion.setFromEuler(targetRacketEuler);
  targetSwingSpeedKmh = estimateSwingSpeedKmh(latestPacket, previousPacket);
  peakSwingSpeedKmh = Math.max(peakSwingSpeedKmh, targetSwingSpeedKmh);

  elements.packetCount.textContent = String(packetCount);
  elements.inputMode.textContent = latestPacket.inputMode ?? "sensor";
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
    "/pc/racket.glb",
    (gltf) => {
      const model = gltf.scene;
      normalizeLoadedRacket(model);
      model.rotation.set(Math.PI, 0, 0);
      alignRacketHandleToPivot(model);
      console.log("racket model position", model.position);
      console.log("racket container position", racketContainer.position);
      racketContainer.add(model);
    },
    undefined,
    (error) => {
      console.error("Failed to load racket.glb", error);
    }
  );
}

function normalizeLoadedRacket(model: THREE.Group): void {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);

  const maxDimension = Math.max(size.x, size.y, size.z);
  const targetHeight = 2.85;
  const scale = maxDimension > 0 ? targetHeight / maxDimension : 1;

  model.scale.setScalar(scale);
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      boostRacketMaterial(child);
    }
  });
}

function alignRacketHandleToPivot(model: THREE.Group): void {
  model.updateMatrixWorld(true);

  const orientedBox = new THREE.Box3().setFromObject(model);
  const orientedCenter = new THREE.Vector3();
  orientedBox.getCenter(orientedCenter);

  const handlePivot = new THREE.Vector3(
    orientedCenter.x,
    orientedBox.max.y,
    orientedCenter.z
  );

  model.position.sub(handlePivot);
  model.updateMatrixWorld(true);

  const finalBox = new THREE.Box3().setFromObject(model);
  const finalSize = new THREE.Vector3();
  finalBox.getSize(finalSize);

  console.log("racket aligned pivot", {
    handlePivot,
    finalBox,
    finalSize
  });
}

function boostRacketMaterial(mesh: THREE.Mesh): void {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

  for (const material of materials) {
    if (material instanceof THREE.MeshStandardMaterial) {
      material.roughness = Math.min(material.roughness, 0.42);
      material.metalness = Math.max(material.metalness, 0.18);
      material.needsUpdate = true;
    }
  }
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
  const alpha = packet.orientation.alpha ?? packet.rotationRate.alpha ?? 0;

  return {
    x: degreesToRadians(beta),
    y: degreesToRadians(gamma),
    z: degreesToRadians(alpha)
  };
}

function animate(): void {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  racketContainer.quaternion.slerp(targetRacketQuaternion, 0.32);
  targetSwingSpeedKmh *= 0.94;
  displayedSwingSpeedKmh = damp(displayedSwingSpeedKmh, targetSwingSpeedKmh, 0.45);

  const displayedEuler = new THREE.Euler().setFromQuaternion(racketContainer.quaternion, "YXZ");
  elements.rotationX.textContent = displayedEuler.x.toFixed(3);
  elements.rotationY.textContent = displayedEuler.y.toFixed(3);
  elements.swingSpeed.textContent = `${Math.round(displayedSwingSpeedKmh)} km/h`;
  elements.peakSwingSpeed.textContent = `${Math.round(peakSwingSpeedKmh)} km/h`;
  animateDust(elapsed);
  updateConnectionStatus();
  updatePacketAge();

  renderer.render(scene, camera);
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

function updateConnectionStatus(): void {
  elements.connectionStatus.textContent = socket.connected
    ? "Socket: connected"
    : "Socket: disconnected";
}

function updatePacketAge(): void {
  if (!latestPacket) {
    elements.packetAge.textContent = "--";
    return;
  }

  const ageMs = Date.now() - latestPacket.serverReceivedAt;
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
