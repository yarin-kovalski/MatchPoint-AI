export const BALL_CONFIG = {
  radius: 0.034,
  courtHeight: 0.07,
  gravity: -9.81,
  bounceRestitution: 0.68,
  returnedBounceRestitution: 0.58,
  groundFriction: 0.94,
  airDrag: 0.018,
  maximumStepSeconds: 1 / 60,
  maximumFlightMs: 6500,
  stationarySpeed: 0.18,
  bounds: { x: 9, y: 12, zBehindPlayer: 4.5, zFar: -13 },
  launch: {
    easyForehand: { position: [0.5, 1.85, -7.5], velocity: [0, 3.2, 5.25] },
    easyBackhand: { position: [-0.5, 1.85, -7.5], velocity: [0, 3.2, 5.25] },
    speedMultipliers: { slow: 0.86, normal: 1, fast: 1.14 }
  },
  contactZone: { minimumZ: -1.6, maximumZ: 1.2, maximumX: 2.3 },
  collision: {
    headCenterLocal: [0, 245, 0],
    halfWidthLocal: 51,
    halfHeightLocal: 68,
    thicknessLocal: 5,
    contactEventToleranceMs: 130,
    minimumStrokeSpeed: 4.8,
    maximumFaceAngleRadians: 1.45,
    assistScale: { off: 1, prototype: 1.08, easy: 1.18 },
    movingRacketToleranceLocal: { off: 0, prototype: 2.5, easy: 5 }
  },
  response: {
    baseReturnSpeed: 7.5,
    minimumReturnSpeed: 6.5,
    maximumReturnSpeed: 13.5,
    faceInfluence: 0.34,
    courtForwardInfluence: 0.58,
    baseLift: 0.2,
    upwardLift: 0.34,
    maximumSide: 0.22
  },
  spin: { magnusCoefficient: 0.018, maximumAcceleration: 4.2, topspinStrength: 14, sliceStrength: 11 },
  resetDelayMs: 1100
} as const;

export const BALL_DEBUG_DEFAULT = false;
