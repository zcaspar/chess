import { getAllowedOrigins, isOriginAllowed, createOriginValidator } from '../config/cors';

describe('getAllowedOrigins', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('always includes the localhost dev origins', () => {
    delete process.env.CORS_ORIGIN;

    expect(getAllowedOrigins()).toEqual(
      expect.arrayContaining([
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
      ]),
    );
  });

  it('splits and trims a comma-separated CORS_ORIGIN', () => {
    process.env.CORS_ORIGIN = 'https://a.example.com , https://b.example.com';

    expect(getAllowedOrigins()).toEqual(
      expect.arrayContaining(['https://a.example.com', 'https://b.example.com']),
    );
  });

  it('de-duplicates repeated origins', () => {
    process.env.CORS_ORIGIN = 'http://localhost:3000,http://localhost:3000';

    const origins = getAllowedOrigins();

    expect(origins.filter((o) => o === 'http://localhost:3000')).toHaveLength(1);
  });
});

describe('isOriginAllowed', () => {
  const allowed = [
    'https://chess-pu71.vercel.app',
    'https://chess-pu71-*.vercel.app',
    'http://localhost:3000',
  ];

  it('allows an exact match', () => {
    expect(isOriginAllowed('https://chess-pu71.vercel.app', allowed)).toBe(true);
  });

  it('allows a Vercel preview origin matching the wildcard', () => {
    expect(
      isOriginAllowed('https://chess-pu71-git-master-someone.vercel.app', allowed),
    ).toBe(true);
  });

  it('blocks an unrelated origin', () => {
    expect(isOriginAllowed('https://evil.example.com', allowed)).toBe(false);
  });

  it('blocks a lookalike that only matches because the dots are unescaped', () => {
    // `*` is replaced with `.*` but the literal dots in the pattern are never
    // escaped, so every `.` in the allow-list entry matches ANY character.
    // "vercelXapp" is not "vercel.app", and must not be accepted.
    expect(isOriginAllowed('https://chess-pu71-x.vercelXapp', allowed)).toBe(false);
  });

  it('blocks a lookalike host that merely ends with the allowed suffix', () => {
    expect(
      isOriginAllowed('https://chess-pu71-x.vercel.app.evil.com', allowed),
    ).toBe(false);
  });

  it('blocks an origin that only differs by scheme', () => {
    expect(isOriginAllowed('http://chess-pu71.vercel.app', allowed)).toBe(false);
  });

  it('blocks an origin with a different port', () => {
    expect(isOriginAllowed('http://localhost:3999', allowed)).toBe(false);
  });
});

describe('createOriginValidator', () => {
  const allowed = ['https://chess-pu71.vercel.app', 'https://chess-pu71-*.vercel.app'];

  const check = (origin: string | undefined) =>
    new Promise<{ err: Error | null; allow?: boolean }>((resolve) => {
      createOriginValidator(allowed, 'test')(origin, (err, allow) =>
        resolve({ err, allow }),
      );
    });

  it('allows requests with no origin (curl, mobile apps, server-to-server)', async () => {
    const { err, allow } = await check(undefined);

    expect(err).toBeNull();
    expect(allow).toBe(true);
  });

  it('allows an allow-listed origin', async () => {
    const { err, allow } = await check('https://chess-pu71.vercel.app');

    expect(err).toBeNull();
    expect(allow).toBe(true);
  });

  it('rejects an origin that is not allow-listed', async () => {
    const { err } = await check('https://evil.example.com');

    expect(err).toBeInstanceOf(Error);
  });

  it('rejects the unescaped-dot lookalike', async () => {
    const { err } = await check('https://chess-pu71-x.vercelXapp');

    expect(err).toBeInstanceOf(Error);
  });
});
