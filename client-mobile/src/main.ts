type NullableNumber = number | null;

type SensorVector = {
  x: NullableNumber;
  y: NullableNumber;
  z: NullableNumber;
};

type OrientationVector = {
  alpha: NullableNumber;
  beta: NullableNumber;
  gamma: NullableNumber;
};

type ControllerMotionPacket = {
  t: number;
  sequence: number;
  orientation: OrientationVector;
  acceleration: SensorVector;
  accelerationIncludingGravity: SensorVector;
  rotationRate: OrientationVector;
  interval: NullableNumber;
  source: "mobile";
};

type SocketLike = {
  connected: boolean;
  emit(eventName: string, payload: unknown): void;
  on(eventName: string, handler: (...args: unknown[]) => void): void;
};

type SocketFactory = () => SocketLike;

declare const io: SocketFactory;

type DeviceMotionEventWithPermission = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

type DeviceOrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

const SEND_INTERVAL_MS = 1000 / 60;

const socket = io();
let sequence = 0;
let packetsSent = 0;
let streaming = false;
let lastSentAt = 0;

const latestPacket: ControllerMotionPacket = {
  t: Date.now(),
  sequence,
  orientation: {
    alpha: null,
    beta: null,
    gamma: null
  },
  acceleration: {
    x: null,
    y: null,
    z: null
  },
  accelerationIncludingGravity: {
    x: null,
    y: null,
    z: null
  },
  rotationRate: {
    alpha: null,
    beta: null,
    gamma: null
  },
  interval: null,
  source: "mobile"
};

const elements = {
  startButton: getElement<HTMLButtonElement>("startButton"),
  connectionStatus: getElement("connectionStatus"),
  packetStatus: getElement("packetStatus"),
  permissionStatus: getElement("permissionStatus"),
  sensorStatus: getElement("sensorStatus"),
  alpha: getElement("alpha"),
  beta: getElement("beta"),
  gamma: getElement("gamma"),
  accelX: getElement("accelX"),
  accelY: getElement("accelY"),
  accelZ: getElement("accelZ"),
  gravityX: getElement("gravityX"),
  gravityY: getElement("gravityY"),
  gravityZ: getElement("gravityZ"),
  rotAlpha: getElement("rotAlpha"),
  rotBeta: getElement("rotBeta"),
  rotGamma: getElement("rotGamma")
};

socket.on("connect", () => {
  socket.emit("client:hello", { role: "mobile" });
  updateConnectionStatus();
});

socket.on("disconnect", updateConnectionStatus);

elements.startButton.addEventListener("click", () => {
  void startSensorStreaming();
});

setInterval(() => {
  updateConnectionStatus();
  renderPacket(latestPacket);

  if (streaming) {
    sendLatestPacket();
  }
}, SEND_INTERVAL_MS);

async function startSensorStreaming(): Promise<void> {
  elements.startButton.disabled = true;
  elements.permissionStatus.textContent = "Permission: requesting...";
  elements.sensorStatus.textContent = "Sensors: starting...";

  try {
    const motionPermission = await requestMotionPermission();
    const orientationPermission = await requestOrientationPermission();

    if (motionPermission === "denied" || orientationPermission === "denied") {
      elements.permissionStatus.textContent = "Permission: denied";
      elements.sensorStatus.textContent = "Sensors: permission denied";
      elements.startButton.disabled = false;
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    elements.permissionStatus.textContent = `Permission error: ${message}`;
    elements.sensorStatus.textContent = "Sensors: blocked by browser";
    elements.startButton.disabled = false;
    return;
  }

  window.addEventListener("devicemotion", handleDeviceMotion);
  window.addEventListener("deviceorientation", handleDeviceOrientation);

  streaming = true;
  elements.permissionStatus.textContent = "Permission: granted or not required";
  elements.sensorStatus.textContent =
    window.isSecureContext || location.hostname === "localhost"
      ? "Sensors: listening"
      : "Sensors: listening. If values stay blank on iPhone, use HTTPS.";
  elements.startButton.textContent = "Streaming sensor data";
}

async function requestMotionPermission(): Promise<"granted" | "denied" | "not-required"> {
  if (typeof DeviceMotionEvent === "undefined") {
    throw new Error("DeviceMotionEvent is unavailable");
  }

  const motionEvent = DeviceMotionEvent as DeviceMotionEventWithPermission;

  if (typeof motionEvent.requestPermission === "function") {
    return motionEvent.requestPermission();
  }

  return "not-required";
}

async function requestOrientationPermission(): Promise<"granted" | "denied" | "not-required"> {
  if (typeof DeviceOrientationEvent === "undefined") {
    throw new Error("DeviceOrientationEvent is unavailable");
  }

  const orientationEvent = DeviceOrientationEvent as DeviceOrientationEventWithPermission;

  if (typeof orientationEvent.requestPermission === "function") {
    return orientationEvent.requestPermission();
  }

  return "not-required";
}

function handleDeviceMotion(event: DeviceMotionEvent): void {
  elements.sensorStatus.textContent = "Sensors: receiving motion";
  latestPacket.acceleration = vectorFromAcceleration(event.acceleration);
  latestPacket.accelerationIncludingGravity = vectorFromAcceleration(
    event.accelerationIncludingGravity
  );
  latestPacket.rotationRate = {
    alpha: sanitizeNumber(event.rotationRate?.alpha ?? null),
    beta: sanitizeNumber(event.rotationRate?.beta ?? null),
    gamma: sanitizeNumber(event.rotationRate?.gamma ?? null)
  };
  latestPacket.interval = sanitizeNumber(event.interval ?? null);
}

function handleDeviceOrientation(event: DeviceOrientationEvent): void {
  elements.sensorStatus.textContent = "Sensors: receiving orientation";
  latestPacket.orientation = {
    alpha: sanitizeNumber(event.alpha),
    beta: sanitizeNumber(event.beta),
    gamma: sanitizeNumber(event.gamma)
  };
}

function sendLatestPacket(): void {
  const now = performance.now();

  if (now - lastSentAt < SEND_INTERVAL_MS) {
    return;
  }

  lastSentAt = now;
  sequence += 1;
  packetsSent += 1;

  const packet: ControllerMotionPacket = {
    ...latestPacket,
    t: Date.now(),
    sequence
  };

  socket.emit("controller:motion", packet);
  elements.packetStatus.textContent = `Packets sent: ${packetsSent}`;
}

function vectorFromAcceleration(acceleration: DeviceMotionEventAcceleration | null): SensorVector {
  return {
    x: sanitizeNumber(acceleration?.x ?? null),
    y: sanitizeNumber(acceleration?.y ?? null),
    z: sanitizeNumber(acceleration?.z ?? null)
  };
}

function renderPacket(packet: ControllerMotionPacket): void {
  elements.alpha.textContent = formatNumber(packet.orientation.alpha);
  elements.beta.textContent = formatNumber(packet.orientation.beta);
  elements.gamma.textContent = formatNumber(packet.orientation.gamma);
  elements.accelX.textContent = formatNumber(packet.acceleration.x);
  elements.accelY.textContent = formatNumber(packet.acceleration.y);
  elements.accelZ.textContent = formatNumber(packet.acceleration.z);
  elements.gravityX.textContent = formatNumber(packet.accelerationIncludingGravity.x);
  elements.gravityY.textContent = formatNumber(packet.accelerationIncludingGravity.y);
  elements.gravityZ.textContent = formatNumber(packet.accelerationIncludingGravity.z);
  elements.rotAlpha.textContent = formatNumber(packet.rotationRate.alpha);
  elements.rotBeta.textContent = formatNumber(packet.rotationRate.beta);
  elements.rotGamma.textContent = formatNumber(packet.rotationRate.gamma);
}

function updateConnectionStatus(): void {
  elements.connectionStatus.textContent = socket.connected
    ? "Socket: connected"
    : "Socket: disconnected";
}

function sanitizeNumber(value: number | null | undefined): NullableNumber {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function formatNumber(value: NullableNumber): string {
  return value === null ? "--" : value.toFixed(3);
}

function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing element #${id}`);
  }

  return element as T;
}
