/**
 * Copy non-TypeScript runtime assets into dist/ after `tsc`.
 *
 * tsc only emits JavaScript, but `GameHistoryModel.initializeTables` reads
 * `db/schema.sql` (and `db/head-to-head-schema.sql`) from disk at runtime via
 * `path.join(__dirname, '../db/...')`. Without this step those files never
 * reach dist/, the read always throws, and the code silently falls back to the
 * reduced inline schema — which is how the production database ended up
 * without the indexes declared in db/schema.sql.
 */
const fs = require('fs');
const path = require('path');

const assets = ['db'];
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

for (const asset of assets) {
  const from = path.join(root, asset);
  const to = path.join(dist, asset);

  if (!fs.existsSync(from)) {
    console.warn(`[copy-assets] skipping missing ${asset}/`);
    continue;
  }

  fs.cpSync(from, to, { recursive: true });
  console.log(`[copy-assets] ${asset}/ -> dist/${asset}/`);
}
