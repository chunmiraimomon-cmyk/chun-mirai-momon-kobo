import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const tests = readdirSync(new URL('.', import.meta.url))
  .filter(name => name.endsWith('.test.mjs') && !['rendered-html.test.mjs', 'github-pages-build.test.mjs'].includes(name))
  .sort().map(name => `tests/${name}`);
const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
