/**
 * Parsing for the parts of the UCI protocol the app uses. Pure functions, so
 * the protocol handling can be tested without an engine.
 */

/** A score as the engine reports it: from the point of view of the side to move. */
export type EngineScore =
  | { type: 'cp'; value: number }
  | { type: 'mate'; value: number };

export interface InfoLine {
  depth: number;
  /** 1-based rank of this line when MultiPV > 1. */
  multipv: number;
  score: EngineScore;
  /** Principal variation in UCI move notation (e2e4, e7e8q). */
  pv: string[];
  /** Present when the score is only a bound, not an exact value. */
  bound?: 'upper' | 'lower';
}

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/**
 * Parse an `info` line that carries a score and a principal variation.
 * Returns null for everything else (`info string ...`, currmove updates, ...).
 */
export const parseInfoLine = (line: string): InfoLine | null => {
  if (!line.startsWith('info ')) return null;

  const tokens = line.trim().split(/\s+/);
  let depth: number | null = null;
  let multipv = 1;
  let score: EngineScore | null = null;
  let bound: InfoLine['bound'];
  let pv: string[] = [];

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === 'depth') {
      depth = Number(tokens[i + 1]);
      i += 1;
    } else if (token === 'multipv') {
      multipv = Number(tokens[i + 1]);
      i += 1;
    } else if (token === 'score') {
      const kind = tokens[i + 1];
      const value = Number(tokens[i + 2]);
      if ((kind === 'cp' || kind === 'mate') && Number.isFinite(value)) {
        score = { type: kind, value };
      }
      i += 2;
    } else if (token === 'upperbound') {
      bound = 'upper';
    } else if (token === 'lowerbound') {
      bound = 'lower';
    } else if (token === 'pv') {
      pv = tokens.slice(i + 1).filter((move) => UCI_MOVE.test(move));
      break; // the variation runs to the end of the line
    } else if (token === 'string') {
      return null; // free text, not analysis
    }
  }

  if (depth === null || !Number.isFinite(depth) || !score || pv.length === 0) return null;
  if (!Number.isFinite(multipv) || multipv < 1) multipv = 1;

  return bound ? { depth, multipv, score, pv, bound } : { depth, multipv, score, pv };
};

/**
 * Parse a `bestmove` line. Returns null if the line is something else; a
 * position with no legal moves reports `bestmove (none)`, given as a null move.
 */
export const parseBestMove = (line: string): { bestMove: string | null } | null => {
  if (!line.startsWith('bestmove')) return null;
  const move = line.trim().split(/\s+/)[1];
  return { bestMove: move && UCI_MOVE.test(move) ? move : null };
};

/** Split a UCI move into the parts chess.js takes. */
export const splitUciMove = (
  uci: string,
): { from: string; to: string; promotion?: string } | null => {
  if (!UCI_MOVE.test(uci)) return null;
  const promotion = uci.length === 5 ? uci[4] : undefined;
  return promotion
    ? { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion }
    : { from: uci.slice(0, 2), to: uci.slice(2, 4) };
};
