export const MOTION_CONFIG = {
  timing: {
    nominalDeltaMs: 16,
    minimumDeltaMs: 8,
    maximumDeltaMs: 50,
    invalidGapMs: 250
  },
  smoothing: {
    visualizationOrientation: 0.16,
    acceleration: 0.25,
    fastAcceleration: 0.65
  },
  validation: {
    minimumQuaternionLength: 0.5,
    maximumQuaternionLength: 1.5,
    // Modern phone gyros commonly measure up to about 2000 deg/s. Keep the
    // ceiling below that range while allowing a genuinely fast tennis swing.
    maximumAngularSpeedRadPerSecond: 35,
    maximumAccelerationMps2: 80
  },
  scoring: {
    referenceAccelerationMps2: 12
  }
} as const;
