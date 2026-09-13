// Nothing here should ever reach a real Postgres, Redis or Firebase instance.
// Individual suites mock those modules; this file only quiets the logger so
// test output stays readable.
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';

jest.mock('../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
