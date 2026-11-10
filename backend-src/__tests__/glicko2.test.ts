import {
  DEFAULT_RATING,
  Rating,
  isProvisional,
  rateGame,
  sanitizeRating,
  updateRating,
} from '../utils/glicko2';

describe('Glicko-2', () => {
  it('reproduces the worked example from Glickman\'s paper', () => {
    // "Example of the Glicko-2 system": a 1500 / RD 200 / σ 0.06 player beats
    // a 1400 and loses to a 1550 and a 1700, with τ = 0.5.
    const player: Rating = { rating: 1500, deviation: 200, volatility: 0.06 };

    const after = updateRating(player, [
      { opponent: { rating: 1400, deviation: 30, volatility: 0.06 }, score: 1 },
      { opponent: { rating: 1550, deviation: 100, volatility: 0.06 }, score: 0 },
      { opponent: { rating: 1700, deviation: 300, volatility: 0.06 }, score: 0 },
    ]);

    expect(after.rating).toBeCloseTo(1464.06, 1);
    expect(after.deviation).toBeCloseTo(151.52, 1);
    expect(after.volatility).toBeCloseTo(0.05999, 4);
  });

  it('moves the winner up and the loser down', () => {
    const { white, black } = rateGame(DEFAULT_RATING, DEFAULT_RATING, 'white');

    expect(white.rating).toBeGreaterThan(1500);
    expect(black.rating).toBeLessThan(1500);
    // Equal players, opposite results: the changes mirror each other.
    expect(white.rating - 1500).toBeCloseTo(1500 - black.rating, 6);
  });

  it('leaves two equal players where they were after a draw', () => {
    const settled: Rating = { rating: 1600, deviation: 60, volatility: 0.06 };

    const { white, black } = rateGame(settled, settled, 'draw');

    expect(white.rating).toBeCloseTo(1600, 6);
    expect(black.rating).toBeCloseTo(1600, 6);
  });

  it('rewards an upset far more than an expected win', () => {
    const strong: Rating = { rating: 1900, deviation: 60, volatility: 0.06 };
    const weak: Rating = { rating: 1500, deviation: 60, volatility: 0.06 };

    const expectedWin = rateGame(strong, weak, 'white').white.rating - strong.rating;
    const upset = rateGame(strong, weak, 'black').black.rating - weak.rating;

    expect(expectedWin).toBeGreaterThan(0);
    expect(expectedWin).toBeLessThan(3);
    expect(upset).toBeGreaterThan(10);
  });

  it('moves a new player much further than an established one', () => {
    const established: Rating = { rating: 1500, deviation: 60, volatility: 0.06 };

    const newcomerGain = rateGame(DEFAULT_RATING, established, 'white').white.rating - 1500;
    const establishedGain = rateGame(established, established, 'white').white.rating - 1500;

    expect(newcomerGain).toBeGreaterThan(100);
    expect(establishedGain).toBeLessThan(15);
  });

  it('becomes more certain with every game played', () => {
    let rating = DEFAULT_RATING;
    const opponent: Rating = { rating: 1500, deviation: 80, volatility: 0.06 };
    expect(isProvisional(rating)).toBe(true);

    const deviations: number[] = [];
    for (let game = 0; game < 12; game += 1) {
      rating = updateRating(rating, [{ opponent, score: game % 2 === 0 ? 1 : 0 }]);
      deviations.push(rating.deviation);
    }

    expect([...deviations].sort((a, b) => b - a)).toEqual(deviations); // strictly settling
    expect(isProvisional(rating)).toBe(false);
  });

  it('only grows the uncertainty when no games were played', () => {
    const settled: Rating = { rating: 1700, deviation: 60, volatility: 0.06 };

    const after = updateRating(settled, []);

    expect(after.rating).toBe(1700);
    expect(after.deviation).toBeGreaterThan(60);
  });

  it('keeps results inside sane bounds whatever happens', () => {
    let low: Rating = { rating: 120, deviation: 350, volatility: 0.06 };
    const high: Rating = { rating: 3900, deviation: 350, volatility: 0.06 };
    for (let i = 0; i < 30; i += 1) low = rateGame(low, high, 'black').white;

    expect(low.rating).toBeGreaterThanOrEqual(100);
    expect(low.deviation).toBeGreaterThanOrEqual(45);
    expect(low.volatility).toBeLessThanOrEqual(0.1);
    expect(Number.isFinite(low.rating)).toBe(true);
  });

  it('falls back to the default for missing or corrupt stored values', () => {
    expect(sanitizeRating(null)).toEqual(DEFAULT_RATING);
    expect(sanitizeRating({ rating: NaN, deviation: -5, volatility: 9 })).toEqual({
      rating: 1500,
      deviation: 45,
      volatility: 0.1,
    });
  });
});
