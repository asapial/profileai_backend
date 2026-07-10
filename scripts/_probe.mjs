// Sanity probe — write a file unconditionally so we can confirm execution.
import { writeFileSync } from 'node:fs';
const target = 'D:/Project/ProfileAI/profileai_backend/_probe.log';
try {
  writeFileSync(target, `hello at ${new Date().toISOString()}\n`);
  // eslint-disable-next-line no-console
  console.log('WROTE', target);
} catch (e) {
  // eslint-disable-next-line no-console
  console.log('WRITE_FAIL', e?.message);
}