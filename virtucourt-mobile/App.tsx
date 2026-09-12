import { Accelerometer, DeviceMotion } from "expo-sensors";
import React, { useEffect, useRef, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { io, Socket } from "socket.io-client";
import { SensorUiThrottle } from "./sensorUiThrottle";

type StrokeType = "forehand" | "backhand";

type Vector3 = {
  x: number;
  y: number;
  z: number;
};

type Quaternion = {
  x: number;
  y: number;
  z: number;
  w: number;
};

type SocketState = "offline" | "connecting" | "connected" | "error";

const SENSOR_INTERVAL_MS = 16;
const STROKE_THRESHOLD_G = 1.5;
const STROKE_COOLDOWN_MS = 1000;
const USE_LEGACY_STROKE_DETECTOR = false;
const DEFAULT_SERVER_URL =
  process.env.EXPO_PUBLIC_SERVER_URL ?? "http://10.0.0.25:3000";

export default function App() {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [connected, setConnected] = useState(false);
  const [socketState, setSocketState] = useState<SocketState>("offline");
  const [loadingSensors, setLoadingSensors] = useState(true);
  const [sensorReady, setSensorReady] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [calibrated, setCalibrated] = useState(false);
  const [readyPose, setReadyPose] = useState(false);
  const [status, setStatus] = useState("Loading sensors...");
  const [packetCount, setPacketCount] = useState(0);
  const [lastStroke, setLastStroke] = useState("none");
  const [rotation, setRotation] = useState<Vector3>({ x: 0, y: 0, z: 0 });
  const [accel, setAccel] = useState<Vector3>({ x: 0, y: 0, z: 0 });

  const socketRef = useRef<Socket | null>(null);
  const subscriptionsRef = useRef<Array<{ remove: () => void }>>([]);
  const orientationRef = useRef<Vector3>({ x: 0, y: 0, z: 0 });
  const accelerationRef = useRef<Vector3>({ x: 0, y: 0, z: 0 });
  const lastStrokeAtRef = useRef(0);
  const peakAccelerationRef = useRef(0);
  const packetCountRef = useRef(0);
  const sensorUiThrottleRef = useRef(new SensorUiThrottle());

  useEffect(() => {
    let active = true;

    async function checkSensors() {
      try {
        const [motionAvailable, accelAvailable] = await Promise.all([
          DeviceMotion.isAvailableAsync(),
          Accelerometer.isAvailableAsync()
        ]);

        if (!active) {
          return;
        }

        setSensorReady(motionAvailable && accelAvailable);
        setStatus(
          motionAvailable && accelAvailable
            ? "Sensors ready"
            : "Sensors unavailable in this runtime"
        );
      } catch (error) {
        if (!active) {
          return;
        }

        setSensorReady(false);
        setStatus(`Sensor check failed: ${getErrorMessage(error)}`);
      } finally {
        if (active) {
          setLoadingSensors(false);
        }
      }
    }

    checkSensors();

    return () => {
      active = false;
      stopStreaming();
      socketRef.current?.disconnect();
    };
  }, []);

  function connectSocket() {
    const normalizedUrl = normalizeServerUrl(serverUrl);
    const isSecure = normalizedUrl.startsWith("https://");

    console.log(`[socket] connecting to ${normalizedUrl}`);
    setSocketState("connecting");
    setConnected(false);
    setStatus(`Socket connecting to ${normalizedUrl}`);

    socketRef.current?.disconnect();

    const socket = io(normalizedUrl, {
      transports: ["websocket"],
      secure: isSecure,
      reconnection: true,
      reconnectionDelay: 500,
      timeout: 8000,
      forceNew: true
    });

    socketRef.current = socket;
    socket.on("connect", () => {
      console.log(`[socket] connected ${socket.id}`);
      setSocketState("connected");
      setConnected(true);
      socket.emit("client:hello", { role: "mobile" });
      setStatus(`Socket connected to ${normalizedUrl}`);
    });
    socket.on("disconnect", () => {
      console.log("[socket] disconnected");
      setSocketState("offline");
      setConnected(false);
      setCalibrated(false);
      setStatus("Socket disconnected");
    });
    socket.on("connect_error", (error) => {
      const message = getErrorMessage(error);
      console.log(`[socket] connect_error ${message}`);
      setSocketState("error");
      setConnected(false);
      setStatus(`Socket error: ${message}. Check protocol/port.`);
    });
    socket.on("calibration:complete", () => {
      setCalibrated(true);
      setStatus("Calibration complete. The racket is ready.");
    });
  }

  function startStreaming() {
    if (loadingSensors) {
      setStatus("Loading sensors...");
      return;
    }

    if (!sensorReady) {
      setStatus("Sensors are not ready in this Expo runtime");
      return;
    }

    try {
      if (!socketRef.current?.connected) {
        connectSocket();
      }

      DeviceMotion.setUpdateInterval(SENSOR_INTERVAL_MS);
      Accelerometer.setUpdateInterval(SENSOR_INTERVAL_MS);

      orientationRef.current = { x: 0, y: 0, z: 0 };
      peakAccelerationRef.current = 0;
      sensorUiThrottleRef.current.reset();
      setCalibrated(false);

      const motionSubscription = DeviceMotion.addListener((sample) => {
        const now = Date.now();
        orientationRef.current = {
          x: sample.rotation.beta,
          y: sample.rotation.gamma,
          z: sample.rotation.alpha
        };

        const quaternion = deviceRotationToQuaternion(sample.rotation);

        if (socketRef.current?.connected) {
          socketRef.current.emit("continuous_orientation", {
            t: now,
            sensorTimestamp: sample.rotation.timestamp,
            source: "expo-mobile",
            rotation: orientationRef.current,
            quaternion,
            rotationRate: {
              alpha: sample.rotationRate?.alpha ?? 0,
              beta: sample.rotationRate?.beta ?? 0,
              gamma: sample.rotationRate?.gamma ?? 0
            },
            gyro: {
              x: sample.rotationRate?.alpha ?? 0,
              y: sample.rotationRate?.beta ?? 0,
              z: sample.rotationRate?.gamma ?? 0
            },
            acceleration: sample.acceleration
              ? {
                  x: sample.acceleration.x,
                  y: sample.acceleration.y,
                  z: sample.acceleration.z
                }
              : null,
            accelerationIncludingGravity: {
              x: sample.accelerationIncludingGravity.x,
              y: sample.accelerationIncludingGravity.y,
              z: sample.accelerationIncludingGravity.z
            },
            screenOrientation: sample.orientation,
            intervalMs: sample.interval
          });
          packetCountRef.current += 1;
        }

        // Sensor emission remains at the native callback cadence. React rendering is
        // intentionally throttled because it shares this JS thread with Socket.IO.
        if (sensorUiThrottleRef.current.shouldUpdate(now)) {
          setRotation(orientationRef.current);
          setAccel(accelerationRef.current);
          setReadyPose(isTennisReadyPhonePose(accelerationRef.current));
          setPacketCount(packetCountRef.current);
        }
      });

      const accelSubscription = Accelerometer.addListener((sample) => {
        accelerationRef.current = sample;
        if (USE_LEGACY_STROKE_DETECTOR) {
          detectStroke(sample.x);
        }
      });

      subscriptionsRef.current = [motionSubscription, accelSubscription];
      setStreaming(true);
      setStatus("Streaming motion");
    } catch (error) {
      stopStreaming();
      setStatus(`Sensor startup failed: ${getErrorMessage(error)}`);
    }
  }

  function stopStreaming() {
    for (const subscription of subscriptionsRef.current) {
      subscription.remove();
    }

    subscriptionsRef.current = [];
    setStreaming(false);
    setCalibrated(false);
    setReadyPose(false);
  }

  function calibrateStartPosition() {
    if (!socketRef.current?.connected || !streaming) {
      setStatus("Connect and start sensors before calibrating");
      return;
    }

    if (!isTennisReadyPhonePose(accelerationRef.current)) {
      setStatus("Hold the phone steady in the tennis-ready position before calibrating.");
      return;
    }

    setCalibrated(false);
    setStatus("Calibration requested. Hold the phone steady while the racket aligns.");
    socketRef.current.emit("controller:calibrate", {
      t: Date.now(),
      source: "expo-mobile",
      rotation: orientationRef.current,
      quaternion: deviceRotationToQuaternion({
        alpha: orientationRef.current.z,
        beta: orientationRef.current.x,
        gamma: orientationRef.current.y
      })
    });
  }

  function detectStroke(accelerationX: number) {
    const absAcceleration = Math.abs(accelerationX);
    peakAccelerationRef.current = Math.max(peakAccelerationRef.current, absAcceleration);

    if (absAcceleration < STROKE_THRESHOLD_G) {
      return;
    }

    const now = Date.now();
    if (now - lastStrokeAtRef.current < STROKE_COOLDOWN_MS) {
      return;
    }

    lastStrokeAtRef.current = now;
    const strokeType: StrokeType = accelerationX > 0 ? "forehand" : "backhand";
    const peakAcceleration = peakAccelerationRef.current;
    peakAccelerationRef.current = 0;

    socketRef.current?.emit("stroke_detected", {
      t: now,
      source: "expo-mobile",
      type: strokeType,
      strokeType,
      peakAcceleration
    });

    setLastStroke(`${strokeType} ${peakAcceleration.toFixed(2)}g`);
  }

  if (loadingSensors) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.title}>Loading...</Text>
        <Text style={styles.status}>{status}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.panel}>
        <Text style={styles.eyebrow}>VirtuCourt AI</Text>
        <Text style={styles.title}>Native Controller</Text>
        <Text style={styles.status}>{status}</Text>

        <Text style={styles.label}>PC server URL</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setServerUrl}
          style={styles.input}
          value={serverUrl}
        />

        <View style={styles.actions}>
          <Pressable onPress={connectSocket} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>
              {getConnectButtonLabel(socketState)}
            </Text>
          </Pressable>
          <Pressable
            onPress={streaming ? stopStreaming : startStreaming}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              {streaming ? "Stop" : "Start"}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.calibrationHint}>
          {readyPose
            ? "Phone is steady. Hold the neutral tennis-ready pose."
            : "Hold the phone steady in the neutral tennis-ready pose."}
        </Text>
        <Pressable
          disabled={!connected || !streaming}
          onPress={calibrateStartPosition}
          style={[
            styles.calibrationButton,
            (!connected || !streaming) && styles.disabledButton
          ]}
        >
          <Text style={styles.calibrationButtonText}>
            {calibrated
              ? "Calibrated - Set Again"
              : readyPose
                ? "Lock Tennis Ready Position"
                : "Adjust Phone Position"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        <Stat label="Socket" value={socketState} />
        <Stat label="Sensors" value={sensorReady ? "ready" : "blocked"} />
        <Stat label="Ready pose" value={readyPose ? "aligned" : "adjust"} />
        <Stat label="Packets" value={String(packetCount)} />
        <Stat label="Last stroke" value={lastStroke} />
        <Stat label="Rotation X" value={rotation.x.toFixed(3)} />
        <Stat label="Rotation Y" value={rotation.y.toFixed(3)} />
        <Stat label="Rotation Z" value={rotation.z.toFixed(3)} />
        <Stat label="Accel X" value={`${accel.x.toFixed(2)}g`} />
        <Stat label="Accel Y" value={`${accel.y.toFixed(2)}g`} />
      </View>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeServerUrl(value: string): string {
  const trimmed = value.trim();

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return `http://${trimmed}`;
}

function isTennisReadyPhonePose(acceleration: Vector3): boolean {
  const magnitude = Math.hypot(acceleration.x, acceleration.y, acceleration.z);
  return magnitude >= 0.72 && magnitude <= 1.28;
}

function deviceRotationToQuaternion(rotation: {
  alpha: number;
  beta: number;
  gamma: number;
}): Quaternion {
  const zRotation = axisAngleQuaternion(0, 0, 1, rotation.alpha);
  const xRotation = axisAngleQuaternion(1, 0, 0, rotation.beta);
  const yRotation = axisAngleQuaternion(0, 1, 0, rotation.gamma);

  return normalizeQuaternion(
    multiplyQuaternions(multiplyQuaternions(zRotation, xRotation), yRotation)
  );
}

function axisAngleQuaternion(x: number, y: number, z: number, angle: number): Quaternion {
  const halfAngle = angle * 0.5;
  const sine = Math.sin(halfAngle);

  return {
    x: x * sine,
    y: y * sine,
    z: z * sine,
    w: Math.cos(halfAngle)
  };
}

function multiplyQuaternions(a: Quaternion, b: Quaternion): Quaternion {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
  };
}

function normalizeQuaternion(value: Quaternion): Quaternion {
  const length = Math.hypot(value.x, value.y, value.z, value.w) || 1;

  return {
    x: value.x / length,
    y: value.y / length,
    z: value.z / length,
    w: value.w / length
  };
}

function getConnectButtonLabel(state: SocketState): string {
  switch (state) {
    case "connecting":
      return "Connecting";
    case "connected":
      return "Connected";
    case "error":
      return "Retry";
    case "offline":
    default:
      return "Connect";
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#03070f",
    padding: 18
  },
  panel: {
    backgroundColor: "#08111f",
    borderColor: "rgba(184, 255, 44, 0.35)",
    borderRadius: 16,
    borderWidth: 1,
    padding: 18
  },
  eyebrow: {
    color: "#b8ff2c",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase"
  },
  title: {
    color: "#f6fff0",
    fontSize: 30,
    fontWeight: "900",
    marginTop: 8
  },
  status: {
    color: "#b9c7d8",
    fontSize: 16,
    marginTop: 10,
    marginBottom: 18
  },
  label: {
    color: "#91a5bd",
    fontSize: 13,
    marginBottom: 8
  },
  input: {
    backgroundColor: "#020813",
    borderColor: "rgba(184, 255, 44, 0.3)",
    borderRadius: 10,
    borderWidth: 1,
    color: "#ffffff",
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14
  },
  primaryButton: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#b8ff2c",
    borderRadius: 10,
    paddingVertical: 14
  },
  primaryButtonText: {
    color: "#07100c",
    fontSize: 15,
    fontWeight: "900"
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "rgba(184, 255, 44, 0.45)",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 14
  },
  secondaryButtonText: {
    color: "#dfffb2",
    fontSize: 15,
    fontWeight: "800"
  },
  calibrationHint: {
    color: "#b9c7d8",
    fontSize: 13,
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center"
  },
  calibrationButton: {
    alignItems: "center",
    borderColor: "#ff4d58",
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 13
  },
  calibrationButtonText: {
    color: "#ff8b92",
    fontSize: 15,
    fontWeight: "900"
  },
  disabledButton: {
    opacity: 0.38
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 18
  },
  stat: {
    width: "30.5%",
    minHeight: 82,
    borderRadius: 12,
    backgroundColor: "#0b1624",
    padding: 12
  },
  statLabel: {
    color: "#8ca1b8",
    fontSize: 12,
    marginBottom: 8
  },
  statValue: {
    color: "#f7ffee",
    fontSize: 17,
    fontWeight: "900"
  }
});
