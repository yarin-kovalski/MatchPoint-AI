export const STROKE_CONFIG = {
  timing: {
    readyStableMs: 140,
    classificationEvidenceMs: 90,
    preparationMaximumMs: 850,
    backswingMaximumMs: 1000,
    forwardSwingMaximumMs: 480,
    contactWindowMs: 70,
    followThroughMaximumMs: 650,
    recoveryStableMs: 180,
    recoveryMaximumMs: 1100,
    strokeCooldownMs: 350
  },
  noise: {
    readyAngularSpeed: 0.45,
    readyAcceleration: 1.6,
    preparationAngularSpeed: 0.8,
    maximumStartAcceleration: 24,
    minimumOrientationAngle: 0.12
  },
  classification: {
    lockThreshold: 0.56,
    lockMargin: 0.14
  },
  contact: {
    minimumAngularSpeed: 1.7,
    minimumAcceleration: 4.5,
    minimumScore: 0.58
  },
  spin: {
    topspinThreshold: 0.48,
    sliceThreshold: 0.48,
    flatMaximum: 0.38
  },
  proceduralPath: {
    smoothing: 0.13,
    ready: [0, 0, 0],
    preparation: [0.25, 0.02, 0.2],
    backswing: [0.48, 0, 0.48],
    racketDrop: [0.52, -0.34, 0.52],
    forwardSwing: [0.18, 0.12, -0.38],
    contactWindow: [0.02, 0.28, -0.72],
    followThrough: [-0.38, 0.62, -0.5],
    recovery: [0, 0.12, -0.08]
  }
} as const;

