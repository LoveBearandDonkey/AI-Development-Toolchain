/* Shape, material and motion can be tuned without changing the controller. */
window.CATALOG_AVATAR_CONFIG = {
  shape: { petals: 8, radius: 91, depth: 10, contourOffset: 3 },
  motion: { floatCycle: 3.6, floatDistance: 7, breathScale: 0.025, headRotation: 3, faceLag: 0.12 },
  rig: {
    centerX: 160, centerY: 145, surfaceRadius: 82, surfaceDepth: 50,
    eyeSpacing: 40, eyeY: -8, mouthY: 12,
    maxEyeDrift: 1.2, maxMouthDrift: 0.8
  },
  depth: {
    turnCycle: 6.8, idleYaw: 0.21, idlePitch: 0.10,
    gazeYaw: 0.28, gazePitch: 0.18, maxYaw: 0.50, maxPitch: 0.30,
    perspective: 220, eyeLag: 0.85, mouthLag: 1.3,
    damping: 0.76, squashFollow: 0.65
  },
  material: { light: '#b5dcff', middle: '#78a7fa', dark: '#4d71e4', face: '#172b58' },
  behavior: { minInterval: 3.5, maxInterval: 6.5, expressions: ['idle', 'happy', 'curious', 'wink', 'surprised', 'sleepy'] },
  states: {
    idle: { energy: 1, tilt: 0, smile: 11, eyes: 1, leftEye: 1, rightEye: 1, mouthWidth: 15, mouthOpen: 0, lookX: 0, lookY: 0 },
    listening: { energy: 0.65, tilt: -5, smile: 13, eyes: 1.12 },
    thinking: { energy: 0.55, tilt: 6, smile: 3, eyes: 0.86, lookX: -0.45, lookY: -0.3 },
    speaking: { energy: 1.35, tilt: 0, smile: 10, eyes: 1, mouthOpen: 5 },
    success: { energy: 1.6, tilt: -7, smile: 16, eyes: 0.65 },
    error: { energy: 0.35, tilt: 5, smile: -5, eyes: 0.9 },
    happy: { energy: 1.25, tilt: -4, smile: 15, eyes: 0.55, mouthOpen: 3 },
    curious: { energy: 0.65, tilt: 8, smile: 6, eyes: 1.16, leftEye: 0.85, mouthWidth: 12, lookX: 0.4, lookY: -0.15 },
    wink: { energy: 1.1, tilt: -6, smile: 13, leftEye: 0.12, rightEye: 0.95 },
    surprised: { energy: 0.8, tilt: 2, smile: 0, eyes: 1.2, mouthWidth: 7, mouthOpen: 13 },
    sleepy: { energy: 0.45, tilt: 5, smile: 7, eyes: 0.25, mouthWidth: 12 }
  }
};
