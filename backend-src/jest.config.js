/** Backend test harness. Node environment, TypeScript via ts-jest. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  resetModules: true,
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
  // The app imports pg/redis/firebase-admin transitively; nothing should reach a
  // real service, so fail loudly rather than hang if a test forgets a mock.
  testTimeout: 10000,
};
