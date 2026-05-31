import { logger } from '../utils/logger';

type OriginCallback = (err: Error | null, allow?: boolean) => void;

/**
 * Resolve the list of allowed CORS origins from the CORS_ORIGIN env var
 * (comma-separated), always including localhost dev origins, de-duplicated.
 */
export function getAllowedOrigins(): string[] {
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : ['http://localhost:3000'];

  return [
    ...corsOrigins,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
  ].filter((origin, index, self) => self.indexOf(origin) === index);
}

/**
 * Check an origin against the allow-list, supporting `*` wildcard patterns
 * (e.g. https://chess-pu71-*.vercel.app for Vercel preview deploys).
 */
export function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.some((allowed) => {
    if (allowed.includes('*')) {
      const pattern = allowed.replace(/\*/g, '.*');
      return new RegExp(`^${pattern}$`).test(origin);
    }
    return allowed === origin;
  });
}

/**
 * Build a CORS `origin` validator callback shared by Express `cors()` and
 * Socket.IO. Requests with no origin (mobile apps, curl, Postman) are allowed.
 */
export function createOriginValidator(allowedOrigins: string[], context: string) {
  return (origin: string | undefined, callback: OriginCallback): void => {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (isOriginAllowed(origin, allowedOrigins)) {
      callback(null, true);
    } else {
      logger.warn(`${context} CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  };
}
