type RotationRate = { alpha: number; beta: number; gamma: number };

/** Normalize Expo SDK 57 native rotationRate to phone X/Y/Z in rad/s.
 * Native iOS emits Z/Y/X, Android X/Y/Z; web uses the DeviceMotion Z/X/Y names.
 * Source: expo-sensors DeviceMotionModule.swift / DeviceMotionModule.kt.
 */
export function normalizeMotionRotationRate(rate: RotationRate | null, platform: string) {
  if (!rate || ![rate.alpha, rate.beta, rate.gamma].every(Number.isFinite)) return null;
  const scale = Math.PI / 180;
  const axes = platform === "ios" ? [rate.gamma, rate.beta, rate.alpha]
    : platform === "android" ? [rate.alpha, rate.beta, rate.gamma]
      : platform === "web" ? [rate.beta, rate.gamma, rate.alpha] : null;
  return axes ? { x: axes[0] * scale, y: axes[1] * scale, z: axes[2] * scale } : null;
}
