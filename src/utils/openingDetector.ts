/**
 * Opening Detector - Trie-based chess opening name matcher
 * Walks a trie of known openings as the game progresses,
 * returning the deepest (most specific) match.
 */

export interface Opening {
  eco: string;
  name: string;
  moves: string; // Space-separated SAN moves: "e4 e5 Nf3 Nc6"
}

interface TrieNode {
  children: Map<string, TrieNode>;
  opening: Opening | null;
}

class OpeningTrie {
  private root: TrieNode = { children: new Map(), opening: null };

  insert(opening: Opening): void {
    const moves = opening.moves.split(/\s+/).filter(Boolean);
    let node = this.root;
    for (const move of moves) {
      if (!node.children.has(move)) {
        node.children.set(move, { children: new Map(), opening: null });
      }
      node = node.children.get(move)!;
    }
    node.opening = opening;
  }

  /**
   * Walk the trie with the given move sequence.
   * Returns the deepest matching opening (most specific variation).
   */
  findDeepest(moves: string[]): Opening | null {
    let node = this.root;
    let deepest: Opening | null = null;

    for (const move of moves) {
      const child = node.children.get(move);
      if (!child) break;
      node = child;
      if (node.opening) {
        deepest = node.opening;
      }
    }
    return deepest;
  }
}

let trieInstance: OpeningTrie | null = null;
let openingsLoaded = false;

/**
 * Initialize the opening trie from the openings data.
 * Lazy-loaded on first call.
 */
export async function initOpenings(): Promise<void> {
  if (openingsLoaded) return;

  try {
    const openingsData: Opening[] = (await import('../data/openings.json')).default;
    trieInstance = new OpeningTrie();
    for (const opening of openingsData) {
      trieInstance.insert(opening);
    }
    openingsLoaded = true;
  } catch (e) {
    console.warn('Failed to load openings data:', e);
  }
}

/**
 * Detect the opening from a sequence of SAN moves.
 * Returns null if no opening matches or openings haven't loaded yet.
 */
export function detectOpening(sanMoves: string[]): Opening | null {
  if (!trieInstance) return null;
  return trieInstance.findDeepest(sanMoves);
}
