/**
 * Rules for the "Firebase Admin isn't configured" demo-user fallback.
 *
 * Kept in their own module rather than in middleware/auth.ts because the
 * socket layer needs the same rules, and tests that mock the auth middleware
 * (to control token verification) would otherwise lose them.
 */

/**
 * Whether the demo fallback may run at all.
 *
 * Deliberately an explicit opt-in. Keying this off `NODE_ENV !== 'production'`
 * means any deployment that forgets to set NODE_ENV — a container, a second
 * host, a bare `npm start` — treats every garbage token as a valid session.
 * Demo auth is a local convenience, so it needs both the flag and a
 * non-production environment.
 */
export const isDemoAuthEnabled = (): boolean =>
  process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEMO_AUTH === 'true';

/**
 * Firebase Admin throws these when it has no usable credentials — i.e. this is
 * a developer machine without Firebase configured, rather than a caller
 * presenting a bad token. Only these errors are eligible for the fallback, so
 * a genuinely invalid token still gets rejected even when demo auth is on.
 */
export const isFirebaseConfigError = (message: string): boolean =>
  message.includes('auth/invalid-project-id') ||
  message.includes('no-app') ||
  message.includes('app/invalid-credential') ||
  message.includes('Firebase Admin SDK');
