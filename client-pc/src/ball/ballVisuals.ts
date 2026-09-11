import * as THREE from "three";

let cachedTexture: THREE.CanvasTexture | null = null;
const spinAxis = new THREE.Vector3();
const spinDelta = new THREE.Quaternion();

export function createProceduralTennisBallTexture(
  renderer?: THREE.WebGLRenderer,
  canvasFactory: () => HTMLCanvasElement = () => document.createElement("canvas")
): THREE.CanvasTexture {
  if (cachedTexture) return cachedTexture;
  const canvas = canvasFactory();
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create tennis ball texture context");
  context.fillStyle = "#b9db32";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < image.data.length; index += 4) {
    const noise = ((index * 17 + Math.floor(index / 97) * 13) % 17) - 8;
    image.data[index] = Math.max(0, image.data[index] + noise);
    image.data[index + 1] = Math.max(0, image.data[index + 1] + noise);
    image.data[index + 2] = Math.max(0, image.data[index + 2] + Math.floor(noise * 0.5));
  }
  context.putImageData(image, 0, 0);
  context.strokeStyle = "rgba(248, 246, 224, 0.98)";
  context.lineWidth = 12;
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const offset of [-256, 0, 256]) {
    context.beginPath();
    context.moveTo(offset + 20, 22);
    context.bezierCurveTo(offset + 155, 38, offset + 100, 218, offset + 256, 234);
    context.bezierCurveTo(offset + 412, 218, offset + 357, 38, offset + 492, 22);
    context.stroke();
  }
  cachedTexture = new THREE.CanvasTexture(canvas);
  cachedTexture.colorSpace = THREE.SRGBColorSpace;
  cachedTexture.wrapS = THREE.RepeatWrapping;
  cachedTexture.wrapT = THREE.ClampToEdgeWrapping;
  cachedTexture.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
  cachedTexture.needsUpdate = true;
  return cachedTexture;
}

export function integrateBallRotation(
  quaternion: THREE.Quaternion,
  angularVelocityRadiansPerSecond: THREE.Vector3,
  deltaSeconds: number
): THREE.Quaternion {
  const angularSpeed = angularVelocityRadiansPerSecond.length();
  if (angularSpeed <= 1e-8 || deltaSeconds <= 0) return quaternion;
  spinDelta.setFromAxisAngle(
    spinAxis.copy(angularVelocityRadiansPerSecond).multiplyScalar(1 / angularSpeed),
    angularSpeed * deltaSeconds
  );
  // Physical angular velocity is world-space. Post-multiplication would rotate
  // around the already-spinning ball's local axes and change the visible spin.
  return quaternion.premultiply(spinDelta).normalize();
}

export function resetTennisBallTextureCache(): void {
  cachedTexture?.dispose();
  cachedTexture = null;
}
