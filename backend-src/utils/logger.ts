/**
 * Minimal leveled logger for the backend.
 *
 * Replaces ad-hoc console.* calls so log verbosity can be controlled per
 * environment. Levels: debug < info < warn < error.
 *
 * Threshold resolution:
 *   1. LOG_LEVEL env var ('debug' | 'info' | 'warn' | 'error'), if set
 *   2. otherwise 'info' in production (quiet), 'debug' elsewhere (verbose)
 *
 * The logger delegates to console, so output formatting/transport is unchanged;
 * only which messages are emitted depends on the level.
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveThreshold(): number {
  const explicit = process.env.LOG_LEVEL?.toLowerCase();
  if (explicit && explicit in LEVELS) {
    return LEVELS[explicit as LogLevel];
  }
  return process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug;
}

const threshold = resolveThreshold();

export const logger = {
  debug: (...args: unknown[]): void => {
    if (threshold <= LEVELS.debug) console.log(...args);
  },
  info: (...args: unknown[]): void => {
    if (threshold <= LEVELS.info) console.log(...args);
  },
  warn: (...args: unknown[]): void => {
    if (threshold <= LEVELS.warn) console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    if (threshold <= LEVELS.error) console.error(...args);
  },
};

export type { LogLevel };
