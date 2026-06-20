import * as THREE from "three";

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
let displayedSwingSpeedKmh = 0;
let targetSwingSpeedKmh = 0;
let peakSwingSpeedKmh = 0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020714);
scene.fog = new THREE.Fog(0x020714, 10, 32);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 5.2, 8.8);
camera.lookAt(0, 0.7, 0);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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

const court = createCourt();
scene.add(court);

const racketGroup = createTennisRacket();
racketGroup.position.set(0, 1.45, 0);
racketGroup.rotation.z = -0.1;
scene.add(racketGroup);

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
  const planeMaterial = new THREE.MeshStandardMaterial({
    color: 0x061223,
    emissive: 0x010919,
    roughness: 0.86,
    metalness: 0.05
  });
  const plane = new THREE.Mesh(planeGeometry, planeMaterial);
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  group.add(plane);

  const grid = new THREE.GridHelper(24, 24, 0xb8ff2c, 0x123862);
  grid.position.y = 0.012;
  group.add(grid);

  const lineMaterial = new THREE.MeshBasicMaterial({
    color: 0xb8ff2c,
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
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width, 0.026, spec.depth),
      lineMaterial
    );
    line.position.set(spec.x, 0.034, spec.z);
    group.add(line);
  }

  return group;
}

function createTennisRacket(): THREE.Group {
  const group = new THREE.Group();

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0xb8ff2c,
    emissive: 0x6eff00,
    emissiveIntensity: 0.95,
    roughness: 0.28,
    metalness: 0.34
  });
  const stringMaterial = new THREE.MeshBasicMaterial({
    color: 0xcffff0,
    transparent: true,
    opacity: 0.86
  });
  const gripMaterial = new THREE.MeshStandardMaterial({
    color: 0x111820,
    emissive: 0x0b5cff,
    emissiveIntensity: 0.3,
    roughness: 0.52,
    metalness: 0.18
  });

  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.055, 18, 72), frameMaterial);
  frame.scale.y = 1.28;
  frame.position.y = 0.52;
  frame.castShadow = true;
  group.add(frame);

  const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.7, 16), frameMaterial);
  throat.rotation.z = Math.PI / 2;
  throat.position.y = -0.46;
  throat.scale.x = 1.25;
  throat.castShadow = true;
  group.add(throat);

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.135, 1.55, 18), gripMaterial);
  handle.position.y = -1.3;
  handle.castShadow = true;
  group.add(handle);

  const handleBands = [-1.72, -1.44, -1.16, -0.88];
  for (const y of handleBands) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.111, 0.012, 8, 24), frameMaterial);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    group.add(band);
  }

  for (let i = -4; i <= 4; i += 1) {
    const x = i * 0.16;
    const string = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1.75, 0.012), stringMaterial);
    string.position.set(x, 0.52, 0.005);
    group.add(string);
  }

  for (let i = -5; i <= 5; i += 1) {
    const y = 0.52 + i * 0.15;
    const width = 1.28 * Math.sqrt(Math.max(0.18, 1 - Math.abs(i) / 6.2));
    const string = new THREE.Mesh(new THREE.BoxGeometry(width, 0.012, 0.012), stringMaterial);
    string.position.set(0, y, 0.008);
    group.add(string);
  }

  const glowPlate = new THREE.Mesh(
    new THREE.CircleGeometry(0.78, 48),
    new THREE.MeshBasicMaterial({
      color: 0xb8ff2c,
      transparent: true,
      opacity: 0.065,
      side: THREE.DoubleSide
    })
  );
  glowPlate.scale.y = 1.28;
  glowPlate.position.y = 0.52;
  glowPlate.position.z = -0.015;
  group.add(glowPlate);

  group.rotation.x = -0.12;
  return group;
}

function mapPacketToRotation(packet: BrokeredMotionPacket): { x: number; y: number } {
  const beta = packet.orientation.beta ?? clamp(packet.acceleration.y ?? 0, -90, 90);
  const gamma = packet.orientation.gamma ?? clamp(packet.acceleration.x ?? 0, -90, 90);

  return {
    x: clamp(degreesToRadians(beta), -Math.PI / 2, Math.PI / 2),
    y: clamp(degreesToRadians(gamma), -Math.PI / 2, Math.PI / 2)
  };
}

function animate(): void {
  requestAnimationFrame(animate);

  racketGroup.rotation.x = damp(racketGroup.rotation.x, targetRotationX, 0.32);
  racketGroup.rotation.y = damp(racketGroup.rotation.y, targetRotationY, 0.32);
  targetSwingSpeedKmh *= 0.94;
  displayedSwingSpeedKmh = damp(displayedSwingSpeedKmh, targetSwingSpeedKmh, 0.45);

  elements.rotationX.textContent = racketGroup.rotation.x.toFixed(3);
  elements.rotationY.textContent = racketGroup.rotation.y.toFixed(3);
  elements.swingSpeed.textContent = `${Math.round(displayedSwingSpeedKmh)} km/h`;
  elements.peakSwingSpeed.textContent = `${Math.round(peakSwingSpeedKmh)} km/h`;
  updateConnectionStatus();
  updatePacketAge();

  renderer.render(scene, camera);
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
