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
  PUZZLE_TRAINING: false, // Tactical puzzles
  OPENING_EXPLORER: false, // Opening database
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
} as const;