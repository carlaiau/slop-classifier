import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await scan(path);
    else if (path.endsWith('.js')) { const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' }); if (result.status !== 0) process.exitCode = 1; }
  }
}
for (const dir of ['src', 'scripts', 'public', 'tests']) await scan(dir);
if (!process.exitCode) console.log('All JavaScript syntax checks passed.');
