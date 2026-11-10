import { Evaluation, toEvaluation } from './evaluation';
import { parseBestMove, parseInfoLine } from './uci';
import { logger } from '../utils/logger';

/**
 * Stockfish, running in a Web Worker in the player's own browser.
 *
 * Analysis used to mean one round trip to the LC0 server per position (signed
 * in users only, tens of seconds each). A local engine answers in
 * milliseconds, works offline and for guests, and never touches the main
 * thread.
 *
 * The engine speaks UCI over postMessage. This class serialises requests (the
 * engine handles one search at a time), turns its output into typed results,
 * and supports cancelling a search that is no longer wanted.
 */

/** The channel to the engine. Injected so tests can script an engine. */
export interface EngineTransport {
  send(command: string): void;
  onMessage(listener: (line: string) => void): void;
  onError(listener: (error: unknown) => void): void;
  terminate(): void;
}

export interface AnalysisLine {
  /** 1 is the engine's first choice. */
  rank: number;
  depth: number;
  /** From White's point of view. */
  evaluation: Evaluation;
  /** Principal variation in UCI notation. */
  pv: string[];
}

export interface AnalysisResult {
  fen: string;
  /** Depth of the first line (0 before any line has arrived). */
  depth: number;
  /** Best first; one per MultiPV rank the engine reported. */
  lines: AnalysisLine[];
  /** The engine's move, or null when the position has no legal moves. */
  bestMove: string | null;
}

export interface AnalyseOptions {
  /** Search depth in plies. */
  depth?: number;
  /** Search time in milliseconds; used instead of depth when given. */
  moveTimeMs?: number;
  /** How many alternative lines to report. */
  multiPv?: number;
  /** Called as the search deepens. */
  onUpdate?: (partial: AnalysisResult) => void;
  signal?: AbortSignal;
}

export interface PlayOptions {
  /** Stockfish "Skill Level", 0 (weakest) to 20 (full strength). */
  skillLevel: number;
  depth?: number;
  moveTimeMs?: number;
  signal?: AbortSignal;
}

export class EngineAbortError extends Error {
  constructor() {
    super('Engine request was cancelled');
    this.name = 'AbortError';
  }
}

const DEFAULT_DEPTH = 14;
/** Longest a single search may take before the engine is declared stuck. */
const SEARCH_TIMEOUT_MS = 60_000;
const HANDSHAKE_TIMEOUT_MS = 30_000;

const turnOf = (fen: string): 'w' | 'b' => (fen.split(' ')[1] === 'b' ? 'b' : 'w');

export class StockfishEngine {
  private transport: EngineTransport;
  private lineListener: ((line: string) => void) | null = null;
  private failure: Error | null = null;
  private failListener: ((error: Error) => void) | null = null;
  private ready: Promise<void> | null = null;
  /** Tail of the request queue: each request starts when the last has finished. */
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;

  constructor(transport: EngineTransport) {
    this.transport = transport;
    transport.onMessage((line) => {
      if (typeof line === 'string' && this.lineListener) this.lineListener(line);
    });
    transport.onError((error) => {
      this.fail(new Error(`Engine failed: ${error instanceof Error ? error.message : String(error)}`));
    });
  }

  /** True once the engine has crashed or been disposed and cannot be used. */
  get isBroken(): boolean {
    return this.disposed || this.failure !== null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.fail(new Error('Engine was shut down'));
    try {
      this.transport.terminate();
    } catch {
      /* already gone */
    }
  }

  /** Analyse a position. Resolves when the search finishes. */
  analyse(fen: string, options: AnalyseOptions = {}): Promise<AnalysisResult> {
    return this.enqueue(options.signal, async () => {
      const multiPv = Math.max(1, Math.min(5, options.multiPv ?? 1));
      await this.configure([
        'setoption name UCI_LimitStrength value false',
        'setoption name Skill Level value 20',
        `setoption name MultiPV value ${multiPv}`,
      ]);
      const go = options.moveTimeMs
        ? `go movetime ${Math.round(options.moveTimeMs)}`
        : `go depth ${Math.round(options.depth ?? DEFAULT_DEPTH)}`;
      return this.search(fen, go, options.signal, options.onUpdate);
    });
  }

  /** Choose a move at a given playing strength. Returns UCI, or null if none. */
  play(fen: string, options: PlayOptions): Promise<string | null> {
    return this.enqueue(options.signal, async () => {
      const skill = Math.max(0, Math.min(20, Math.round(options.skillLevel)));
      await this.configure([
        'setoption name UCI_LimitStrength value false',
        'setoption name MultiPV value 1',
        `setoption name Skill Level value ${skill}`,
      ]);
      const go = options.moveTimeMs
        ? `go movetime ${Math.round(options.moveTimeMs)}`
        : `go depth ${Math.round(options.depth ?? 8)}`;
      const result = await this.search(fen, go, options.signal);
      return result.bestMove;
    });
  }

  // --- internals -----------------------------------------------------------

  private fail(error: Error): void {
    if (!this.failure) this.failure = error;
    this.failListener?.(this.failure);
  }

  private enqueue<T>(signal: AbortSignal | undefined, task: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      if (this.failure) throw this.failure;
      if (signal?.aborted) throw new EngineAbortError();
      await this.handshake();
      if (signal?.aborted) throw new EngineAbortError();
      return task();
    };
    // Run after whatever is queued, whether or not that succeeded.
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** Send commands and wait for the engine to finish something in reply. */
  private exchange<T>(
    commands: string[],
    onLine: (line: string, finish: (value: T) => void) => void,
    timeoutMs: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.failure) {
        reject(this.failure);
        return;
      }
      const cleanup = () => {
        clearTimeout(timer);
        this.lineListener = null;
        this.failListener = null;
      };
      const timer = setTimeout(() => {
        cleanup();
        const error = new Error('Engine did not respond in time');
        this.fail(error);
        reject(error);
      }, timeoutMs);
      this.failListener = (error) => {
        cleanup();
        reject(error);
      };
      this.lineListener = (line) =>
        onLine(line, (value) => {
          cleanup();
          resolve(value);
        });
      try {
        commands.forEach((command) => this.transport.send(command));
      } catch (error) {
        cleanup();
        const failure = new Error(`Engine failed: ${error instanceof Error ? error.message : String(error)}`);
        this.fail(failure);
        reject(failure);
      }
    });
  }

  private handshake(): Promise<void> {
    if (!this.ready) {
      this.ready = this.exchange<void>(
        ['uci'],
        (line, finish) => {
          if (line.trim() === 'uciok') finish();
        },
        HANDSHAKE_TIMEOUT_MS,
      );
    }
    return this.ready;
  }

  private configure(options: string[]): Promise<void> {
    return this.exchange<void>(
      [...options, 'isready'],
      (line, finish) => {
        if (line.trim() === 'readyok') finish();
      },
      HANDSHAKE_TIMEOUT_MS,
    );
  }

  private async search(
    fen: string,
    go: string,
    signal?: AbortSignal,
    onUpdate?: (partial: AnalysisResult) => void,
  ): Promise<AnalysisResult> {
    if (signal?.aborted) throw new EngineAbortError();
    const turn = turnOf(fen);
    const byRank = new Map<number, AnalysisLine>();
    const snapshot = (bestMove: string | null): AnalysisResult => {
      const lines = Array.from(byRank.values()).sort((a, b) => a.rank - b.rank);
      return { fen, depth: lines[0]?.depth ?? 0, lines, bestMove };
    };

    // A cancelled search is told to stop, and the engine then answers with
    // `bestmove` straight away. Waiting for that keeps the next request from
    // reading this search's leftovers.
    const onAbort = () => {
      try {
        this.transport.send('stop');
      } catch {
        /* the failure handler deals with a dead engine */
      }
    };
    signal?.addEventListener('abort', onAbort);

    try {
      const result = await this.exchange<AnalysisResult>(
        [`position fen ${fen}`, go],
        (line, finish) => {
          const info = parseInfoLine(line);
          if (info) {
            // A bound says "at least" or "at most", not a value; skip those
            // unless nothing better has arrived for this line yet.
            if (info.bound && byRank.has(info.multipv)) return;
            byRank.set(info.multipv, {
              rank: info.multipv,
              depth: info.depth,
              evaluation: toEvaluation(info.score, turn),
              pv: info.pv,
            });
            if (onUpdate && !signal?.aborted) onUpdate(snapshot(null));
            return;
          }
          const best = parseBestMove(line);
          if (best) finish(snapshot(best.bestMove));
        },
        SEARCH_TIMEOUT_MS,
      );
      if (signal?.aborted) throw new EngineAbortError();
      return result;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

// --- the browser engine -----------------------------------------------------

/** Vendored in public/stockfish (see the README there). */
const ENGINE_SCRIPT = 'stockfish/stockfish-19-lite-single.js';

const createWorkerTransport = (url: string): EngineTransport | null => {
  if (typeof Worker === 'undefined') return null; // tests, very old browsers
  try {
    const worker = new Worker(url);
    return {
      send: (command) => worker.postMessage(command),
      onMessage: (listener) => {
        worker.onmessage = (event: MessageEvent) => listener(event.data);
      },
      onError: (listener) => {
        worker.onerror = (event) => listener(event.message || 'worker error');
      },
      terminate: () => worker.terminate(),
    };
  } catch (error) {
    logger.warn('Could not start the chess engine:', error);
    return null;
  }
};

let sharedEngine: StockfishEngine | null = null;

/**
 * The page's engine, started on first use. Returns null where an engine cannot
 * run, so callers can offer the feature only when it will work. A crashed
 * engine is replaced on the next call.
 */
export const getEngine = (): StockfishEngine | null => {
  if (sharedEngine && !sharedEngine.isBroken) return sharedEngine;
  const transport = createWorkerTransport(`${process.env.PUBLIC_URL || ''}/${ENGINE_SCRIPT}`);
  sharedEngine = transport ? new StockfishEngine(transport) : null;
  return sharedEngine;
};

/** Whether this environment can run the engine at all. */
export const isEngineSupported = (): boolean =>
  typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
