import rateLimit, { Options } from 'express-rate-limit';

/**
 * Per-IP rate limiting for the LC0 proxy endpoints.
 *
 * These endpoints are deliberately open: a visitor can play the computer
 * opponent without signing in, which is how the app has always worked. That
 * makes a rate limit — not authentication — the right protection for the GPU
 * service sitting behind them.
 *
 * Sized for real play rather than for a scraper. A game against the AI asks for
 * one move per turn, so even a fast blitz game is a few moves a minute; the
 * ceiling below leaves a wide margin for that while making it impractical to
 * drive the engine service in bulk from one address.
 */
const DEFAULTS: Partial<Options> = {
  windowMs: 60_000,
  standardHeaders: true, // RateLimit-* headers, so a client can back off
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too Many Requests',
    message: 'Too many engine requests. Please wait a moment and try again.',
  },
};

const limitFrom = (envVar: string, fallback: number): number => {
  const parsed = Number(process.env[envVar]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Move and hint requests — one per turn during normal play.
 * Override with LC0_RATE_LIMIT_PER_MINUTE.
 */
export const lc0RateLimit = rateLimit({
  ...DEFAULTS,
  limit: () => limitFrom('LC0_RATE_LIMIT_PER_MINUTE', 60),
});

/**
 * Position analysis is heavier per call (deeper search) and is only reached
 * from the replay screen, where a human clicks one position at a time.
 * Override with LC0_ANALYSIS_RATE_LIMIT_PER_MINUTE.
 */
export const lc0AnalysisRateLimit = rateLimit({
  ...DEFAULTS,
  limit: () => limitFrom('LC0_ANALYSIS_RATE_LIMIT_PER_MINUTE', 20),
});
