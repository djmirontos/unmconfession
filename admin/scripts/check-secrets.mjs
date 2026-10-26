// Fails if the admin app mentions the Supabase service-role key in any form.
// Run: npm run check:secrets (also part of the test suite).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'coverage', 'out']);
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.css', '.example', '.local', '.env', '.yml', '.yaml', '']);
// The role name and the usual env var prefix, built from pieces so this file does not match itself.
const PATTERNS = [new RegExp(['service', 'role'].join('_'), 'i'), new RegExp(['SUPABASE', 'SERVICE'].join('_'), 'i')];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (TEXT_EXT.has(extname(name)) || name.startsWith('.env')) yield path;
  }
}

/** Every file (relative path) that mentions the service-role key. */
export function findServiceRoleMentions(root = ROOT) {
  const hits = [];
  for (const file of walk(root)) {
    if (file.endsWith('package-lock.json')) continue;
    const text = readFileSync(file, 'utf8');
    if (PATTERNS.some((p) => p.test(text))) hits.push(relative(root, file));
  }
  return hits;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const hits = findServiceRoleMentions();
  if (hits.length > 0) {
    process.stderr.write(`Service-role key referenced in:\n${hits.map((h) => `  ${h}`).join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write('No service-role references found.\n');
}
