/**
 * Minimal leveled logger for the frontend.
 *
 * Replaces ad-hoc console.* calls so the production browser console stays
 * clean while development keeps full verbosity. Levels: debug < info < warn < error.
 *
 * Verbosity:
 *   - development (NODE_ENV=development): everything (debug and up)
 *   - production / test: warnings and errors only
 *
 * CRA inlines process.env.NODE_ENV at build time, so the dead branches are
 * stripped from the production bundle.
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const threshold = process.env.NODE_ENV === 'development' ? LEVELS.debug : LEVELS.warn;

export const logger = {
  debug: (...args: unknown[]): void => {
    if (threshold <= LEVELS.debug) console.log(...args);
  },
  info: (...args: unknown[]): void => {
    if (threshold <= LEVELS.info) console.info(...args);
  },
  warn: (...args: unknown[]): void => {
    if (threshold <= LEVELS.warn) console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    if (threshold <= LEVELS.error) console.error(...args);
  },
};
