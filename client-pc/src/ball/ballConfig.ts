export const BALL_CONFIG = {
  scale: {
    metersPerWorldUnit: 1,
    physicalRadiusMeters: 0.0335,
    visualScaleMultiplier: 3.5,
    maximumVisualScaleMultiplier: 3.5,
    minimumReadablePixelDiameter: 16,
    measuredRacketHeadWorldWidth: 1.2281404495239258,
    measuredRacketHeadWorldHeight: 1.6398126983642578
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
    easyForehand: { contactSideOffset: 1.15, contactHeight: 0.02, depthOffset: 0.12, bounceTime: 1.4, contactTimeAfterBounce: 0.9 },
    easyBackhand: { contactSideOffset: -1.15, contactHeight: 0.02, depthOffset: 0.12, bounceTime: 1.4, contactTimeAfterBounce: 0.9 },
    centerPractice: { contactSideOffset: 0, contactHeight: 0.02, depthOffset: 0.12, bounceTime: 1.4, contactTimeAfterBounce: 0.9 },
    bounceDepth: -4.35,
    netDepth: -5.5,
    netHeight: 0.914,
    netClearance: 0.28,
    expectedContactSampleFraction: 0.5,
    expectedContactPositionSmoothing: 0.85,
    easyContactPoseLift: 0.296,
    referenceFramesPerSecond: 60,
    speedMultipliers: { slow: 0.86, normal: 1, fast: 1.14 }
  },
  contactZone: { maximumTargetDistance: 0.45, maximumTimeToContactMs: 150 },
  easyAssist: {
    contactEllipseMultiplier: 2.15,
    contactTimingToleranceMs: 360,
    targetRadius: 0.3,
    minimumTargetHeight: 2.1,
    maximumTargetHeight: 2.7,
    secondBounceSafetyMarginMs: 350,
    minimumAngularSpeed: 0.65,
    maximumFaceAngleRadians: 1.55,
    assistedStringBedRadius: 0.5,
    naturalReachDepthOffset: 0.6,
    stationaryReach: { depthTolerance: 0.18, lateralTolerance: 0.2, verticalTolerance: 0.24 }
  },
  collision: {
    headCenterLocal: [0, 245, 0],
    halfWidthLocal: 51,
    halfHeightLocal: 68,
    thicknessLocal: 5,
    contactEventToleranceMs: 130,
    minimumStrokeSpeed: 4.8,
    maximumFaceAngleRadians: 1.45,
    assistScale: { off: 1, prototype: 1.08, easy: 2.15 },
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
