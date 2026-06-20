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
let packetCount = 0;
let latestPacket: BrokeredMotionPacket | null = null;

const elements = {
  connectionStatus: getElement("connectionStatus"),
  packetCount: getElement("packetCount"),
  packetAge: getElement("packetAge"),
  mobileClients: getElement("mobileClients"),
  pcClients: getElement("pcClients"),
  packetOutput: getElement("packetOutput")
};

socket.on("connect", () => {
  socket.emit("client:hello", { role: "pc" });
  updateConnectionStatus();
});

socket.on("disconnect", updateConnectionStatus);

socket.on("broker:status", (payload: unknown) => {
  const status = payload as BrokerStatus;
  elements.mobileClients.textContent = String(status.mobileClients);
  elements.pcClients.textContent = String(status.pcClients);
});

socket.on("controller:state", (payload: unknown) => {
  latestPacket = payload as BrokeredMotionPacket;
  packetCount += 1;
  elements.packetCount.textContent = String(packetCount);
  elements.packetOutput.textContent = JSON.stringify(latestPacket, null, 2);
});

setInterval(() => {
  updateConnectionStatus();
  updatePacketAge();
}, 100);

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

function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing element #${id}`);
  }

  return element as T;
}

