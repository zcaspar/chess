/**
 * Game Features Configuration
 * 
 * Toggle special features on/off for easy removal or testing.
 * Set any feature to `false` to completely remove it from the UI and functionality.
 */

export const GAME_FEATURES = {
  // Ainara mode features (special powers)
  AINARA_MODE: true,     // Enable Ainara mode (includes all special powers)
  HINTS: true,           // LC0-powered best move suggestions
  NUCLEAR_CHESS: true,   // Nuke opponent pieces (not King/Queen)
  TELEPORTATION: true,   // Teleport your pieces randomly

  // Future features (placeholders)
  TOURNAMENTS: false,    // Tournament system

  // Professional features
  SOUND_EFFECTS: true,      // Move/capture/check sounds
  CAPTURED_PIECES: true,    // Visual captured pieces display
  GAME_END_MODAL: true,     // Game over overlay modal
  OPENING_EXPLORER: true,   // Opening name detection banner
  PREMOVES: true,           // Pre-move system for online play
  PUZZLE_TRAINING: true,    // Tactical puzzle solving
} as const;

export type GameFeature = keyof typeof GAME_FEATURES;

/**
 * Check if a feature is enabled
 */
export const isFeatureEnabled = (feature: GameFeature): boolean => {
  return GAME_FEATURES[feature];
};

/**
 * Check if Ainara mode is enabled (convenience function)
 */
export const isAinaraModeEnabled = (): boolean => {
  return GAME_FEATURES.AINARA_MODE;
};

/**
 * Get all enabled features
 */
export const getEnabledFeatures = (): GameFeature[] => {
  return (Object.keys(GAME_FEATURES) as GameFeature[]).filter(
    feature => GAME_FEATURES[feature]
  );
};

/**
 * Feature display configuration
 */
export const FEATURE_CONFIG = {
  AINARA_MODE: {
    name: 'Ainara Mode',
    icon: '✨',
    color: 'indigo',
    description: 'Special powers: Best Move, Nuke, and Teleport',
  },
  HINTS: {
    name: 'Best Move (Ainara)',
    icon: '💡',
    color: 'green',
    description: 'Get LC0-powered move suggestions',
  },
  NUCLEAR_CHESS: {
    name: 'Nuke (Ainara)',
    icon: '💣',
    color: 'orange',
    description: 'Remove opponent pieces (not King/Queen)',
  },
  TELEPORTATION: {
    name: 'Teleport (Ainara)',
    icon: '♦',
    color: 'purple',
    description: 'Teleport your pieces to random locations',
  },
  TOURNAMENTS: {
    name: 'Tournaments',
    icon: '🏆',
    color: 'gold',
    description: 'Organized competitive play',
  },
  PUZZLE_TRAINING: {
    name: 'Puzzle Training',
    icon: '🧩',
    color: 'blue',
    description: 'Tactical puzzle solving',
  },
  OPENING_EXPLORER: {
    name: 'Opening Explorer',
    icon: '📚',
    color: 'teal',
    description: 'Chess opening database',
  },
  SOUND_EFFECTS: {
    name: 'Sound Effects',
    icon: '🔊',
    color: 'cyan',
    description: 'Move and capture sound effects',
  },
  CAPTURED_PIECES: {
    name: 'Captured Pieces',
    icon: '♟',
    color: 'gray',
    description: 'Visual captured pieces display with material advantage',
  },
  GAME_END_MODAL: {
    name: 'Game End Modal',
    icon: '🏁',
    color: 'green',
    description: 'Professional game-over overlay with stats',
  },
  PREMOVES: {
    name: 'Pre-moves',
    icon: '⚡',
    color: 'red',
    description: 'Queue moves during opponent turn in online play',
  },
} as const;