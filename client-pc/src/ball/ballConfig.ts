export const BALL_CONFIG = {
  scale: {
    metersPerWorldUnit: 1,
    physicalRadiusMeters: 0.0335,
    visualScaleMultiplier: 1.35,
    maximumVisualScaleMultiplier: 1.5,
    minimumReadablePixelDiameter: 9
  },
  camera: {
    fovDegrees: 50,
    position: [0, 4.6, 7.6],
    target: [0, 1.25, -1.2],
    near: 0.1,
    far: 100
  },
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
    launchPosition: [0, 1.85, -7.5],
    easyForehand: { sideOffset: 0.14, heightOffset: -0.18, depthOffset: 0, bounceTime: 1.05, contactTimeAfterBounce: 0.58 },
    easyBackhand: { sideOffset: -0.14, heightOffset: -0.18, depthOffset: 0, bounceTime: 1.05, contactTimeAfterBounce: 0.58 },
    centerPractice: { sideOffset: 0, heightOffset: -0.18, depthOffset: 0, bounceTime: 1.05, contactTimeAfterBounce: 0.58 },
    bounceDepth: -4.35,
    netDepth: -5.5,
    netHeight: 0.914,
    netClearance: 0.28,
    expectedContactSampleFraction: 0.5,
    referenceFramesPerSecond: 60,
    speedMultipliers: { slow: 0.86, normal: 1, fast: 1.14 }
  },
  contactZone: { minimumZ: -3.55, maximumZ: -2.35, maximumX: 2.3 },
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
