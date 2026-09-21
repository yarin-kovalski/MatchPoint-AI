import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, normalize, resolve } from "node:path";
import { networkInterfaces } from "node:os";
import { createRequire } from "node:module";
import { Server } from "socket.io";

type SelfsignedAltName = {
  type: 2 | 7;
  value: string;
};

type SelfsignedCertificate = {
  cert: string;
  private: string;
};

type SelfsignedModule = {
  generate(
    attrs: Array<{ name: string; value: string }>,
    options: {
      days: number;
      keySize: number;
      extensions: Array<{
        name: string;
        altNames: SelfsignedAltName[];
      }>;
    }
  ): SelfsignedCertificate;
};

const selfsigned = require("selfsigned") as SelfsignedModule;

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
  rotationRate: {
    alpha: NullableNumber;
    beta: NullableNumber;
    gamma: NullableNumber;
  };
  interval: NullableNumber;
  source: "mobile";
  inputMode?: "sensor" | "simulator";
};

type BrokeredMotionPacket = ControllerMotionPacket & {
  serverReceivedAt: number;
};

type StrokeType = "Forehand" | "Backhand";

type ContinuousOrientationPacket = {
  angularVelocityRadPerSecond?: SensorVector | null;
  t: number;
  sensorTimestamp: number;
  source: "expo-mobile";
  rotation: {
    x: NullableNumber;
    y: NullableNumber;
    z: NullableNumber;
  };
  quaternion: {
    x: number;
    y: number;
    z: number;
    w: number;
  };
  rotationRate: {
    alpha: NullableNumber;
    beta: NullableNumber;
    gamma: NullableNumber;
  };
  gyro: {
    x: NullableNumber;
    y: NullableNumber;
    z: NullableNumber;
  };
  acceleration: SensorVector | null;
  accelerationIncludingGravity: SensorVector;
  screenOrientation: 0 | 90 | 180 | -90;
  intervalMs: number;
};

type BrokeredContinuousOrientationPacket = ContinuousOrientationPacket & {
  serverReceivedAt: number;
};

type StrokeDetectedPacket = {
  t: number;
  strokeType?: StrokeType | Lowercase<StrokeType>;
  type?: StrokeType | Lowercase<StrokeType>;
  source: "mobile" | "expo-mobile";
  accelerationX?: number;
  peakAcceleration?: number;
};

type BrokeredStrokeDetectedPacket = StrokeDetectedPacket & {
  serverReceivedAt: number;
};

type ControllerCalibratePacket = {
  t: number;
  source: "expo-mobile";
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

const PORT = Number(process.env.PORT ?? 3000);
const HTTPS_PORT = Number(process.env.HTTPS_PORT ?? 3443);
const HOST = "0.0.0.0";
const PROJECT_ROOT = process.cwd();
const localUrls = getLocalUrls(PORT);
const localHttpsUrls = getLocalUrls(HTTPS_PORT, "https");

const staticRoutes = new Map<string, string>([
  ["/mobile", resolve(PROJECT_ROOT, "client-mobile", "public")],
  ["/pc", resolve(PROJECT_ROOT, "client-pc", "public")]
]);

let lastMotionPacket: BrokeredMotionPacket | null = null;
let mobileClientCount = 0;
let pcClientCount = 0;

const httpServer = createHttpServer(async (request, response) => {
  try {
    await handleHttpRequest(request, response);
  } catch (error) {
    console.error("HTTP error:", error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Internal server error");
  }
});

const certificate = createSelfSignedCertificate();
const httpsServer = createHttpsServer({
  key: certificate.private,
  cert: certificate.cert
}, async (request, response) => {
  try {
    await handleHttpRequest(request, response);
  } catch (error) {
    console.error("HTTPS error:", error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Internal server error");
  }
});

const ioServers = [
  new Server(httpServer, {
    cors: {
      origin: "*"
    }
  }),
  new Server(httpsServer, {
    cors: {
      origin: "*"
    }
  })
];

for (const io of ioServers) {
  io.on("connection", (socket) => {
    console.log(`socket connected ${socket.id}`);

    socket.on("client:hello", (payload: { role?: "mobile" | "pc" } = {}) => {
      if (payload.role === "mobile") {
        socket.join("mobile");
        mobileClientCount += 1;
      }

      if (payload.role === "pc") {
        socket.join("pc");
        pcClientCount += 1;

        if (lastMotionPacket) {
          socket.emit("controller:state", lastMotionPacket);
        }
      }

      emitBrokerStatus();
    });

    socket.on("controller:motion", (payload: ControllerMotionPacket) => {
      lastMotionPacket = {
        ...payload,
        serverReceivedAt: Date.now()
      };

      emitToPcClients("controller:state", lastMotionPacket);
    });

    socket.on("continuous_orientation", (payload: ContinuousOrientationPacket) => {
      const brokeredOrientation: BrokeredContinuousOrientationPacket = {
        ...payload,
        serverReceivedAt: Date.now()
      };

      emitToPcClients("continuous_orientation", brokeredOrientation);
    });

    socket.on("controller:calibrate", (payload: ControllerCalibratePacket) => {
      emitToPcClients("controller:calibrated", {
        ...payload,
        serverReceivedAt: Date.now()
      });
    });

    socket.on("calibration:complete", (payload: { t: number }) => {
      emitToMobileClients("calibration:complete", payload);
    });

    socket.on("stroke_detected", (payload: StrokeDetectedPacket) => {
      const brokeredStroke: BrokeredStrokeDetectedPacket = {
        ...payload,
        serverReceivedAt: Date.now()
      };

      emitToPcClients("stroke_detected", brokeredStroke);
    });

    socket.on("diagnostic:report", async (payload: { markdown?: string } = {}) => {
      if (typeof payload.markdown !== "string" || payload.markdown.length > 100_000) return;
      const directory = resolve(process.cwd(), "docs", "diagnostics");
      await mkdir(directory, { recursive: true });
      await writeFile(resolve(directory, "latest-hit-attempt.md"), payload.markdown, "utf8");
      socket.emit("diagnostic:report-saved", { ok: true });
    });

    socket.on("disconnecting", () => {
      if (socket.rooms.has("mobile")) {
        mobileClientCount = Math.max(0, mobileClientCount - 1);
      }

      if (socket.rooms.has("pc")) {
        pcClientCount = Math.max(0, pcClientCount - 1);
      }
    });

    socket.on("disconnect", () => {
      console.log(`socket disconnected ${socket.id}`);
      emitBrokerStatus();
    });
  });
}

httpServer.listen(PORT, HOST, () => {
  console.log("");
  console.log(`MatchPoint AI server ready: http://localhost:${PORT}/pc`);
});

httpsServer.listen(HTTPS_PORT, HOST, () => {
  // HTTPS remains available for browser-sensor fallback, without duplicating startup instructions.
});

async function handleHttpRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);
  const pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname === "/api/setup") {
    const configured = process.env.MATCHPOINT_EXPO_URL;
    let expoUrl: string | null = null;
    let qrSvg: string | null = null;
    let ready = false;
    if (configured) {
      try {
        const url = new URL(configured);
        if (url.protocol !== "exp:") throw new Error("Unexpected controller protocol");
        const metro = await fetch(`http://${url.host}/status`, { signal: AbortSignal.timeout(1800) });
        ready = metro.ok && (await metro.text()).includes("packager-status:running");
        if (ready) {
          const requireProject = createRequire(resolve(PROJECT_ROOT, "package.json"));
          const { toQR } = requireProject(resolve(PROJECT_ROOT, "virtucourt-mobile/node_modules/toqr"));
          const cells = toQR(configured);
          const size = Math.sqrt(cells.length);
          const squares: string[] = [];
          for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            if (cells[y * size + x]) squares.push(`M${x + 4},${y + 4}h1v1h-1z`);
          }
          qrSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size + 8} ${size + 8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${squares.join("")}" fill="black"/></svg>`;
          expoUrl = configured;
        }
      } catch { ready = false; }
    }
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ ready, expoUrl, qrSvg, mobileClients: mobileClientCount }));
    return;
  }

  if (pathname === "/") {
    response.writeHead(302, { Location: "/pc/welcome.html" });
    response.end();
    return;
  }

  for (const [route, root] of staticRoutes) {
    if (pathname === route || pathname.startsWith(`${route}/`)) {
      const relativePath = pathname === route ? "index.html" : pathname.slice(route.length + 1);
      await serveStaticFile(root, relativePath, response, request);
      return;
    }
  }

  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
}

async function serveStaticFile(
  root: string,
  relativePath: string,
  response: ServerResponse,
  request?: IncomingMessage
): Promise<void> {
  const normalizedRelativePath = normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = resolve(root, normalizedRelativePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  const fileStat = await stat(filePath).catch(() => null);

  if (!fileStat?.isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  if (/\.(webm|mp4)$/i.test(filePath)) {
    const range = request?.headers.range;
    let start = 0, end = fileStat.size - 1;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) {
        response.writeHead(416, { "Content-Range": `bytes */${fileStat.size}` }); response.end(); return;
      }
      if (!match[1]) start = Math.max(0, fileStat.size - Number(match[2]));
      else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
      if (start > end || start >= fileStat.size) {
        response.writeHead(416, { "Content-Range": `bytes */${fileStat.size}` }); response.end(); return;
      }
    }
    response.writeHead(range ? 206 : 200, {
      "Content-Type": getContentType(filePath), "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1, "Cache-Control": "no-cache",
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${fileStat.size}` } : {})
    });
    if (request?.method === "HEAD") response.end();
    else createReadStream(filePath, { start, end }).pipe(response);
    return;
  }

  response.writeHead(200, {
    "Content-Type": getContentType(filePath),
    "Cache-Control": "no-store"
  });
  createReadStream(filePath).pipe(response);
}

function sendLandingPage(response: ServerResponse): void {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MatchPoint AI POC</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #101214;
        color: #f6f7f8;
        font-family: Arial, sans-serif;
      }
      main {
        width: min(680px, calc(100vw - 32px));
      }
      a {
        color: #b8ff2c;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>MatchPoint AI POC Broker</h1>
      <p><a href="/mobile">Open mobile controller</a></p>
      <p><a href="/pc">Open PC packet monitor</a></p>
    </main>
  </body>
</html>`);
}

function emitBrokerStatus(): void {
  const payload = {
    mobileClients: mobileClientCount,
    pcClients: pcClientCount,
    hasMotionPacket: lastMotionPacket !== null,
    t: Date.now()
  };

  for (const io of ioServers) {
    io.emit("broker:status", payload);
  }
}

function emitToPcClients(eventName: string, payload: unknown): void {
  for (const io of ioServers) {
    io.to("pc").emit(eventName, payload);
  }
}

function emitToMobileClients(eventName: string, payload: unknown): void {
  for (const io of ioServers) {
    io.to("mobile").emit(eventName, payload);
  }
}

function getContentType(filePath: string): string {
  const extension = extname(filePath).toLowerCase();

  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".webm": return "video/webm";
    case ".mp4": return "video/mp4";
    case ".jpg": return "image/jpeg";
    case ".png": return "image/png";
    case ".svg": return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function getLocalUrls(port: number, protocol = "http"): string[] {
  const interfaces = networkInterfaces();
  const urls: string[] = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        urls.push(`${protocol}://${entry.address}:${port}`);
      }
    }
  }

  return urls;
}

function createSelfSignedCertificate(): SelfsignedCertificate {
  const altNames: SelfsignedAltName[] = [
    { type: 2, value: "localhost" },
    { type: 7, value: "127.0.0.1" }
  ];

  for (const url of localHttpsUrls) {
    const { hostname } = new URL(url);
    altNames.push({ type: 7, value: hostname });
  }

  return selfsigned.generate(
    [{ name: "commonName", value: "MatchPoint AI Local HTTPS" }],
    {
      days: 7,
      keySize: 2048,
      extensions: [
        {
          name: "subjectAltName",
          altNames
        }
      ]
    }
  );
}
