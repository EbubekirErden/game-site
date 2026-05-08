// Animation timing constants for Love Letter table
// All durations in milliseconds

export const MOTION = {
  deal: 650,
  playToStage: 520,
  targetPulse: 800,
  revealFlip: 700,
  clash: 850,
  discard: 480,
  betweenStepsPause: 250,
  cardHover: 180,
  cardSelectLift: 220,
  cardMoveShort: 420,
  cardMoveLong: 650,
  cardFlip: 620,
  shieldExpand: 700,
  discardSettle: 420,
  logAnnouncement: 1600,
} as const;

// Cubic bezier for smooth, elegant card motion
export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
