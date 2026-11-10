/**
 * Glicko-2 ratings (Mark Glickman, "Example of the Glicko-2 system", 2013).
 *
 * Each player has a rating, a deviation (how unsure the system is about that
 * rating) and a volatility (how erratic their results are). A new player
 * starts at 1500 with a large deviation, so their first few games move them
 * a long way and later games move them less — which is what lets a strong
 * newcomer reach their level in a handful of games instead of dozens.
 *
 * Every finished game is treated as its own rating period, as Lichess does.
 */

export interface Rating {
  rating: number;
  /** Rating deviation (RD). */
  deviation: number;
  volatility: number;
}

export const DEFAULT_RATING: Rating = { rating: 1500, deviation: 350, volatility: 0.06 };

/** A rating is shown as provisional ("1500?") while the deviation is above this. */
export const PROVISIONAL_DEVIATION = 110;

/** Constrains how fast volatility can change. Glickman suggests 0.3–1.2. */
const TAU = 0.5;
const SCALE = 173.7178;
const CONVERGENCE = 0.000001;

// Bounds that keep one odd result (or a corrupt row) from producing nonsense.
const MIN_RATING = 100;
const MAX_RATING = 4000;
const MIN_DEVIATION = 45;
const MAX_DEVIATION = 350;
const MAX_VOLATILITY = 0.1;

export interface GameResult {
  opponent: Rating;
  /** 1 for a win, 0.5 for a draw, 0 for a loss. */
  score: 0 | 0.5 | 1;
}

const g = (phi: number): number => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));

const expected = (mu: number, opponentMu: number, opponentPhi: number): number =>
  1 / (1 + Math.exp(-g(opponentPhi) * (mu - opponentMu)));

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Coerce stored values into a usable rating; anything missing gets the default. */
export const sanitizeRating = (input: Partial<Rating> | null | undefined): Rating => {
  const number = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return {
    rating: clamp(number(input?.rating, DEFAULT_RATING.rating), MIN_RATING, MAX_RATING),
    deviation: clamp(number(input?.deviation, DEFAULT_RATING.deviation), MIN_DEVIATION, MAX_DEVIATION),
    volatility: clamp(number(input?.volatility, DEFAULT_RATING.volatility), 0.01, MAX_VOLATILITY),
  };
};

/** A player's rating after the given results (one rating period). */
export const updateRating = (player: Rating, results: GameResult[]): Rating => {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.deviation / SCALE;
  const sigma = player.volatility;

  // No games: only the uncertainty grows.
  if (results.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { ...player, deviation: clamp(phiStar * SCALE, MIN_DEVIATION, MAX_DEVIATION) };
  }

  let vInverse = 0;
  let improvement = 0;
  for (const { opponent, score } of results) {
    const opponentMu = (opponent.rating - 1500) / SCALE;
    const opponentPhi = opponent.deviation / SCALE;
    const weight = g(opponentPhi);
    const e = expected(mu, opponentMu, opponentPhi);
    vInverse += weight * weight * e * (1 - e);
    improvement += weight * (score - e);
  }
  const v = 1 / vInverse;
  const delta = v * improvement;

  // New volatility: solve f(x) = 0 by the Illinois variant of regula falsi.
  const a = Math.log(sigma * sigma);
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const top = ex * (delta * delta - phi * phi - v - ex);
    const bottom = 2 * (phi * phi + v + ex) ** 2;
    return top / bottom - (x - a) / (TAU * TAU);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k += 1;
    B = a - k * TAU;
  }
  let fA = f(A);
  let fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > CONVERGENCE; i += 1) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }
  const newSigma = Math.exp(A / 2);

  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * improvement;

  return {
    rating: clamp(newMu * SCALE + 1500, MIN_RATING, MAX_RATING),
    deviation: clamp(newPhi * SCALE, MIN_DEVIATION, MAX_DEVIATION),
    volatility: clamp(newSigma, 0.01, MAX_VOLATILITY),
  };
};

/** Both players' ratings after one game between them. */
export const rateGame = (
  white: Rating,
  black: Rating,
  result: 'white' | 'black' | 'draw',
): { white: Rating; black: Rating } => {
  const whiteScore = result === 'white' ? 1 : result === 'draw' ? 0.5 : 0;
  const blackScore = (1 - whiteScore) as 0 | 0.5 | 1;
  return {
    // Each side is rated against the other's rating from BEFORE the game.
    white: updateRating(white, [{ opponent: black, score: whiteScore }]),
    black: updateRating(black, [{ opponent: white, score: blackScore }]),
  };
};

export const isProvisional = (rating: Rating): boolean => rating.deviation > PROVISIONAL_DEVIATION;
