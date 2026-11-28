/* Shape, material and motion can be tuned without changing the controller. */
window.CATALOG_AVATAR_CONFIG = {
  shape: {
    height: 154, depth: 150, rounding: 0.40, minWidthRatio: 0.8, maxWidthRatio: 1.2,
    restYaw: 0.18, restPitch: 0.28
  },
  motion: { floatCycle: 3.6, floatDistance: 7, breathScale: 0.025, headRotation: 3 },
  rig: {
    centerX: 160, centerY: 145, shoulderY: 23, faceScale: 0.76, faceOffset: 30,
    eyeSpacing: 52, eyeY: -8, mouthY: 12
  },
  depth: {
    turnCycle: 6.8, idleYaw: 0.32, idlePitch: 0.18,
    gazeYaw: 0.36, gazePitch: 0.26, maxYaw: 0.62, maxPitch: 0.40,
    bodyYawFollow: 0.80, bodyPitchFollow: 0.75, perspective: 220
  },
  headTurn: {
    yaw: 15 * Math.PI / 180,
    pitch: 0.18,
    ease: 'sine.inOut',
    steps: [
      { start: 0.60, duration: 0.55, direction: -1 },
      { start: 1.40, duration: 0.65, direction: 1 },
      { start: 2.20, duration: 0.55, direction: 0 }
    ],
    release: { start: 2.85, duration: 0.45 }
  },
  material: {
    face: '#000000', softness: 0.50, rim: 0.56, rimDepth: 32,
    faceShadow: { radiusX: 60, radiusY: 50, opacity: 0.16 }
  },
  behavior: { minInterval: 3.5, maxInterval: 6.5, expressions: ['idle', 'happy', 'curious', 'wink', 'surprised', 'sleepy'] },
  states: {
    idle: { energy: 1, tilt: 0, smile: 9, eyes: 1, leftEye: 1, rightEye: 1, mouthWidth: 15, mouthOpen: 0, lookX: 0, lookY: 0 },
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
