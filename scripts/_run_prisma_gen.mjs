// One-shot: run `prisma generate` synchronously and capture its full output
// to a file we can read after the fact. Bypasses terminal output suppression.
import { spawnSync } from 'node:child_process';
import { writeFileSync, appendFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const cwd = resolve('D:/Project/ProfileAI/profileai_backend');
const log = 'D:/Project/ProfileAI/profileai_backend/_prisma_gen.log';

writeFileSync(log, `cwd: ${cwd}\nstarted: ${new Date().toISOString()}\n`);

const r = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['prisma', 'generate', '--schema', 'prisma/schema'],
  { cwd, encoding: 'utf8', shell: false, timeout: 180_000 },
);

appendFileSync(log, `exit: ${r.status}\nsignal: ${r.signal}\nerror: ${r.error?.message ?? ''}\n`);
appendFileSync(log, `--- stdout ---\n${r.stdout ?? ''}\n--- stderr ---\n${r.stderr ?? ''}\n`);
appendFileSync(log, `done: ${new Date().toISOString()}\nbytes: ${statSync(log).size}\n`);
