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
  inputMode: "sensor" | "simulator";
};

type StrokeType = "Forehand" | "Backhand";

type StrokeDetectedPacket = {
  t: number;
  strokeType: StrokeType;
  source: "mobile";
  accelerationX: number;
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

type GenericSensorVector = {
  x: number | null;
  y: number | null;
  z: number | null;
  start(): void;
  stop(): void;
  addEventListener(eventName: "reading" | "error", handler: (event: Event) => void): void;
};

type GenericSensorConstructor = new (options?: { frequency?: number }) => GenericSensorVector;

type WindowWithGenericSensors = Window & {
  Accelerometer?: GenericSensorConstructor;
  LinearAccelerationSensor?: GenericSensorConstructor;
  Gyroscope?: GenericSensorConstructor;
};

const SEND_INTERVAL_MS = 1000 / 60;
const STROKE_ACCELERATION_THRESHOLD_X = 15;
const STROKE_COOLDOWN_MS = 1000;
const genericSensorWindow = window as WindowWithGenericSensors;

const socket = io();
let sequence = 0;
let packetsSent = 0;
let streaming = false;
let lastSentAt = 0;
let inputMode: "sensor" | "simulator" = "sensor";
let isSwinging = false;
let lastSimulatorSample = {
  x: 0,
  y: 0,
  t: performance.now()
};

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
  source: "mobile",
  inputMode
};

const elements = {
  startButton: getElement<HTMLButtonElement>("startButton"),
  simulatorButton: getElement<HTMLButtonElement>("simulatorButton"),
  simulatorPanel: getElement<HTMLElement>("simulatorPanel"),
  touchPad: getElement<HTMLElement>("touchPad"),
  connectionStatus: getElement("connectionStatus"),
  packetStatus: getElement("packetStatus"),
  permissionStatus: getElement("permissionStatus"),
  sensorStatus: getElement("sensorStatus"),
  sourceStatus: getElement("sourceStatus"),
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

elements.simulatorButton.addEventListener("click", startSimulatorStreaming);
elements.touchPad.addEventListener("pointerdown", handleSimulatorPointer);
elements.touchPad.addEventListener("pointermove", handleSimulatorPointer);
elements.touchPad.addEventListener("pointerup", resetSimulatorPointer);
elements.touchPad.addEventListener("pointercancel", resetSimulatorPointer);

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
  elements.sourceStatus.textContent = "Source: real sensors";

  try {
    const hasClassicMotion = typeof DeviceMotionEvent !== "undefined";
    const hasGenericMotion =
      typeof genericSensorWindow.Accelerometer === "function" ||
      typeof genericSensorWindow.LinearAccelerationSensor === "function";

    if (!hasClassicMotion && !hasGenericMotion) {
      throw new Error("No supported motion sensor API in this browser");
    }

    const motionPermission = hasClassicMotion
      ? await requestMotionPermission()
      : "not-required";
    const orientationPermission = await requestOrientationPermission();

    if (motionPermission === "denied" || orientationPermission === "denied") {
      elements.permissionStatus.textContent = "Permission: denied";
      elements.sensorStatus.textContent = "Sensors: permission denied";
      elements.startButton.disabled = false;
      elements.simulatorPanel.hidden = false;
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    elements.permissionStatus.textContent = `Permission error: ${message}`;
    elements.sensorStatus.textContent = "Sensors: blocked by browser";
    elements.startButton.disabled = false;
    elements.simulatorPanel.hidden = false;
    return;
  }

  if (typeof DeviceMotionEvent !== "undefined") {
    window.addEventListener("devicemotion", handleDeviceMotion);
  } else {
    startGenericAndroidSensors();
  }

  window.addEventListener("deviceorientation", handleDeviceOrientation);

  streaming = true;
  inputMode = "sensor";
  elements.permissionStatus.textContent = "Permission: granted or not required";
  elements.sensorStatus.textContent =
    window.isSecureContext || location.hostname === "localhost"
      ? "Sensors: listening"
      : "Sensors: listening. If values stay blank on iPhone, use HTTPS.";
  elements.startButton.textContent = "Streaming sensor data";
}

function startSimulatorStreaming(): void {
  inputMode = "simulator";
  streaming = true;
  elements.simulatorPanel.hidden = false;
  elements.permissionStatus.textContent = "Permission: simulator mode";
  elements.sensorStatus.textContent = "Sensors: simulated touch input";
  elements.sourceStatus.textContent = "Source: touch simulator fallback";
  elements.startButton.disabled = false;
  elements.simulatorButton.textContent = "Touch simulator active";
}

function startGenericAndroidSensors(): void {
  const accelerationSensor = createAccelerationSensor();
  const gyroscope = createGyroscope();

  if (!accelerationSensor && !gyroscope) {
    throw new Error("Generic Sensor API is unavailable");
  }

  accelerationSensor?.addEventListener("reading", () => {
    latestPacket.acceleration = {
      x: sanitizeNumber(accelerationSensor.x),
      y: sanitizeNumber(accelerationSensor.y),
      z: sanitizeNumber(accelerationSensor.z)
    };
    latestPacket.accelerationIncludingGravity = {
      x: sanitizeNumber(accelerationSensor.x),
      y: sanitizeNumber(accelerationSensor.y),
      z: sanitizeNumber(accelerationSensor.z)
    };
    detectStrokeFromAcceleration(latestPacket.acceleration.x);
    elements.sensorStatus.textContent = "Sensors: receiving generic acceleration";
  });

  accelerationSensor?.addEventListener("error", () => {
    elements.sensorStatus.textContent = "Sensors: generic acceleration blocked";
  });

  gyroscope?.addEventListener("reading", () => {
    latestPacket.rotationRate = {
      alpha: sanitizeNumber(gyroscope.z),
      beta: sanitizeNumber(gyroscope.x),
      gamma: sanitizeNumber(gyroscope.y)
    };
    elements.sensorStatus.textContent = "Sensors: receiving generic gyroscope";
  });

  gyroscope?.addEventListener("error", () => {
    elements.sensorStatus.textContent = "Sensors: generic gyroscope blocked";
  });

  accelerationSensor?.start();
  gyroscope?.start();
}

function createAccelerationSensor(): GenericSensorVector | null {
  const SensorConstructor =
    genericSensorWindow.LinearAccelerationSensor ?? genericSensorWindow.Accelerometer ?? null;

  if (!SensorConstructor) {
    return null;
  }

  return new SensorConstructor({ frequency: 60 });
}

function createGyroscope(): GenericSensorVector | null {
  if (!genericSensorWindow.Gyroscope) {
    return null;
  }

  return new genericSensorWindow.Gyroscope({ frequency: 60 });
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
  detectStrokeFromAcceleration(latestPacket.acceleration.x);
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
    sequence,
    inputMode
  };

  socket.emit("controller:motion", packet);
  elements.packetStatus.textContent = `Packets sent: ${packetsSent}`;
}

function handleSimulatorPointer(event: PointerEvent): void {
  if (inputMode !== "simulator") {
    startSimulatorStreaming();
  }

  elements.touchPad.setPointerCapture(event.pointerId);

  const rect = elements.touchPad.getBoundingClientRect();
  const normalizedX = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
  const normalizedY = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
  const now = performance.now();
  const dt = Math.max(16, now - lastSimulatorSample.t);
  const velocityX = ((normalizedX - lastSimulatorSample.x) / dt) * 1000;
  const velocityY = ((normalizedY - lastSimulatorSample.y) / dt) * 1000;

  lastSimulatorSample = {
    x: normalizedX,
    y: normalizedY,
    t: now
  };

  latestPacket.orientation = {
    alpha: 0,
    beta: normalizedY * 90,
    gamma: normalizedX * 90
  };
  latestPacket.acceleration = {
    x: velocityX,
    y: velocityY,
    z: Math.abs(velocityX) + Math.abs(velocityY)
  };
  latestPacket.accelerationIncludingGravity = {
    x: velocityX,
    y: velocityY,
    z: 9.81 + Math.abs(velocityX) + Math.abs(velocityY)
  };
  latestPacket.rotationRate = {
    alpha: 0,
    beta: velocityY,
    gamma: velocityX
  };
  latestPacket.interval = dt;
  detectStrokeFromAcceleration(latestPacket.acceleration.x);
  elements.sensorStatus.textContent = "Sensors: simulated touch input";
}

function detectStrokeFromAcceleration(accelerationX: NullableNumber): void {
  if (isSwinging || accelerationX === null) {
    return;
  }

  let strokeType: StrokeType | null = null;

  if (accelerationX > STROKE_ACCELERATION_THRESHOLD_X) {
    strokeType = "Forehand";
  }

  if (accelerationX < -STROKE_ACCELERATION_THRESHOLD_X) {
    strokeType = "Backhand";
  }

  if (!strokeType) {
    return;
  }

  isSwinging = true;
  const packet: StrokeDetectedPacket = {
    t: Date.now(),
    strokeType,
    source: "mobile",
    accelerationX
  };

  socket.emit("stroke_detected", packet);
  elements.sensorStatus.textContent = `Sensors: ${strokeType} stroke detected`;

  window.setTimeout(() => {
    isSwinging = false;
  }, STROKE_COOLDOWN_MS);
}

function resetSimulatorPointer(): void {
  if (inputMode !== "simulator") {
    return;
  }

  latestPacket.acceleration = {
    x: 0,
    y: 0,
    z: 0
  };
  latestPacket.accelerationIncludingGravity = {
    x: 0,
    y: 0,
    z: 9.81
  };
  latestPacket.rotationRate = {
    alpha: 0,
    beta: 0,
    gamma: 0
  };
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
