// Run a single login POST against the running backend on :5000 and write
// the full response body (status + JSON) to a fixed output file. We use
// Node's built-in fetch so no extra deps are required.
import { writeFileSync } from 'node:fs';

const url = 'http://127.0.0.1:5000/api/v1/auth/login';
const body = JSON.stringify({
  email: 'heptex.project4@gmail.com',
  password: 'Test12345!',
});

const out = { url, status: null, body: null, error: null };

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  out.status = res.status;
  const text = await res.text();
  try { out.body = JSON.parse(text); }
  catch { out.body = text; }
} catch (e) {
  out.error = String(e?.stack || e?.message || e);
}

writeFileSync(
  'D:/Project/ProfileAI/profileai_backend/_login_probe.json',
  JSON.stringify(out, null, 2),
);
console.log('wrote _login_probe.json');
