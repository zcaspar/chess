import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const BACKEND_ROOT = path.join(__dirname, '..');
const DIST = path.join(BACKEND_ROOT, 'dist');

/**
 * GameHistoryModel.initializeTables reads its SQL with
 * `path.join(__dirname, '../db/schema.sql')`. At runtime __dirname is
 * `dist/models`, so the file has to exist at `dist/db/schema.sql`.
 *
 * `tsc` only emits .ts files. If the build does not copy the .sql files, the
 * read throws, the model silently falls back to an inline schema that predates
 * every index added since, and any change to schema.sql never reaches a real
 * database. That failure is invisible at runtime — hence a build assertion.
 */
describe('backend build output', () => {
  beforeAll(() => {
    execSync('npm run build', { cwd: BACKEND_ROOT, stdio: 'pipe' });
  }, 120000);

  const SCHEMA_FILES = ['schema.sql', 'head-to-head-schema.sql', 'analytics-schema.sql'];

  it('compiles the server entry point', () => {
    expect(fs.existsSync(path.join(DIST, 'server.js'))).toBe(true);
  });

  it.each(SCHEMA_FILES)('ships db/%s alongside the compiled code', (file) => {
    expect(fs.existsSync(path.join(DIST, 'db', file))).toBe(true);
  });

  it.each(SCHEMA_FILES)('ships a db/%s identical to the source', (file) => {
    const source = fs.readFileSync(path.join(BACKEND_ROOT, 'db', file), 'utf8');
    const shipped = fs.readFileSync(path.join(DIST, 'db', file), 'utf8');

    expect(shipped).toBe(source);
  });

  it('resolves the schema from the path the model actually reads at runtime', () => {
    // Mirrors models/GameHistory.ts: path.join(__dirname, '../db/schema.sql')
    // with __dirname === dist/models.
    const runtimePath = path.join(DIST, 'models', '..', 'db', 'schema.sql');

    expect(fs.existsSync(runtimePath)).toBe(true);
  });

  it('does not compile the test suite into dist', () => {
    expect(fs.existsSync(path.join(DIST, '__tests__'))).toBe(false);
  });
});
