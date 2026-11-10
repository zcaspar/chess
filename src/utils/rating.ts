/** A rating as the server reports it. */
export interface RatingSummary {
  value: number;
  deviation: number;
  /** True until enough rated games have been played for the number to settle. */
  provisional: boolean;
  games: number;
}

/** What one rated game did to one player's rating. */
export interface RatingChange {
  before: number;
  after: number;
  change: number;
  provisional: boolean;
}

/** "1612", or "1500?" while the rating is still provisional. */
export const formatRating = (value: number | null | undefined, provisional = false): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unrated';
  return `${Math.round(value)}${provisional ? '?' : ''}`;
};

/** "+12", "−8" or "±0". Uses a true minus sign so it lines up with the plus. */
export const formatRatingChange = (change: number): string => {
  const rounded = Math.round(change);
  if (rounded > 0) return `+${rounded}`;
  if (rounded < 0) return `−${Math.abs(rounded)}`;
  return '±0';
};
