/**
 * Puzzle Loader - Loads and filters puzzles from static JSON
 */

export interface Puzzle {
  id: string;
  fen: string;
  moves: string; // UCI space-separated: "e2e4 e7e5 g1f3"
  rating: number;
  themes: string; // space-separated: "fork pin middlegame"
}

let puzzlesCache: Puzzle[] | null = null;

export async function loadPuzzles(): Promise<Puzzle[]> {
  if (puzzlesCache) return puzzlesCache;

  try {
    const data = (await import('../data/puzzles.json')).default as Puzzle[];
    puzzlesCache = data;
    return data;
  } catch (e) {
    console.warn('Failed to load puzzles:', e);
    return [];
  }
}

/**
 * Get a random puzzle within the given rating range.
 */
export function getRandomPuzzle(
  puzzles: Puzzle[],
  targetRating: number,
  range: number = 200
): Puzzle | null {
  const min = targetRating - range;
  const max = targetRating + range;
  const candidates = puzzles.filter((p) => p.rating >= min && p.rating <= max);

  if (candidates.length === 0) {
    // Fallback: just pick any puzzle
    if (puzzles.length === 0) return null;
    return puzzles[Math.floor(Math.random() * puzzles.length)];
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Filter puzzles by theme.
 */
export function filterByTheme(puzzles: Puzzle[], theme: string): Puzzle[] {
  return puzzles.filter((p) => p.themes.includes(theme));
}

/**
 * Convert UCI move string to from/to squares.
 * e.g., "e2e4" -> { from: "e2", to: "e4" }
 * e.g., "e7e8q" -> { from: "e7", to: "e8", promotion: "q" }
 */
export function parseUCIMove(uci: string): { from: string; to: string; promotion?: string } {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}
