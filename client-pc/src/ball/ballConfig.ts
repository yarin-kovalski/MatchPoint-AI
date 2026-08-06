export const BALL_CONFIG = {
  scale: {
    metersPerWorldUnit: 1,
    physicalRadiusMeters: 0.0335,
    visualScaleMultiplier: 4.75,
    maximumVisualScaleMultiplier: 4.8,
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
    easyForehand: { contactSideOffset: 1.15, contactHeight: 0, depthOffset: 0, bounceTime: 1.4, contactTimeAfterBounce: 0.9 },
    easyBackhand: { contactSideOffset: -1.15, contactHeight: 0, depthOffset: 0, bounceTime: 1.4, contactTimeAfterBounce: 0.9 },
    centerPractice: { contactSideOffset: 0, contactHeight: 0, depthOffset: 0, bounceTime: 1.4, contactTimeAfterBounce: 0.9 },
    bounceDepth: -4.35,
    netDepth: -5.5,
    netHeight: 0.914,
    netClearance: 0.28,
    expectedContactSampleFraction: 0.5,
    expectedContactPositionSmoothing: 0.85,
    easyContactPoseLift: 0.382,
    referenceFramesPerSecond: 60,
    speedMultipliers: { slow: 0.86, normal: 1, fast: 1.14 }
  },
  contactZone: { maximumTargetDistance: 0.45, maximumTimeToContactMs: 150 },
  easyAssist: {
    contactEllipseMultiplier: 1.35,
    contactTimingToleranceMs: 250,
    targetRadius: 0.22,
    minimumTargetHeight: 2.1,
    maximumTargetHeight: 2.7,
    secondBounceSafetyMarginMs: 350,
    minimumAngularSpeed: 0.65,
    maximumFaceAngleRadians: 1.55,
    assistedStringBedRadius: 0.35,
    naturalReachDepthOffset: 1,
    contactComfortOffsetLocal: [0, 0, 0],
    stationaryReach: { depthTolerance: 0.18, lateralTolerance: 0.2, verticalTolerance: 0.24 },
    comfortableCore: { depthTolerance: 0.08, lateralTolerance: 0.1, verticalTolerance: 0.12 }
  },
  collision: {
    headCenterLocal: [0, 245, 0],
    halfWidthLocal: 51,
    halfHeightLocal: 68,
    thicknessLocal: 5,
    contactEventToleranceMs: 130,
    minimumStrokeSpeed: 4.8,
    maximumFaceAngleRadians: 1.45,
    assistScale: { off: 1, prototype: 1.08, easy: 1.35 },
    movingRacketToleranceLocal: { off: 0, prototype: 2.5, easy: 5 }
  },
  easyTrajectoryAssist: {
    enabled: true,
    startAfterBounce: true,
    maxAcceleration: 3,
    positionGain: 2.4,
    velocityGain: 1.1,
    maxCorrectionAngle: 0.13962634015954636,
    stopDistance: 0.025,
    stopBeforeContactMs: 120
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
