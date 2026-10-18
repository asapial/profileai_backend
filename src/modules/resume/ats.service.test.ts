import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

// Isolated fixtures: never connect to a user's database or AI provider.
for (const key of ['BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'ACCESS_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET', 'ACCESS_TOKEN_EXPIRES_IN', 'REFRESH_TOKEN_EXPIRES_IN', 'BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN', 'BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE', 'FRONTEND_URL', 'TOTP_ENCRYPTION_KEY', 'OpenRouter_API_KEY', 'EMAIL_SENDER_SMTP_USER', 'EMAIL_SENDER_SMTP_PASS', 'EMAIL_SENDER_SMTP_HOST', 'EMAIL_SENDER_SMTP_PORT', 'EMAIL_SENDER_SMTP_FROM', 'REDIS_URL', 'MINIO_ENDPOINT', 'MINIO_PORT', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY', 'MINIO_BUCKET', 'MINIO_USE_SSL', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'PUPPETEER_SERVICE_URL']) process.env[key] = 'test';
process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
process.env.SKIP_MINIO = 'true';
const { prisma } = await import('../../lib/prisma');
const { optimizeForAts, runAtsCheck } = await import('./resume.service');
const restorers: Array<() => void> = [];
function replace(target: any, key: string, implementation: any) {
  const original = target[key];
  target[key] = implementation;
  restorers.push(() => { target[key] = original; });
}
afterEach(() => {
  for (const restore of restorers.splice(0).reverse()) restore();
  mock.restoreAll();
});

const original = 'Worked on JavaScript dashboards for internal reporting across the team.';
const improved = 'Developed JavaScript dashboards for internal reporting across the team.';
const patch = { path: 'experience.0.bullets.0', before: original, after: improved };
const assessment = { requirements: [{ label: 'JavaScript', sourceQuote: 'JavaScript is required', priority: 'required', category: 'skill', aliases: [] }], semanticMatches: [] };
const verification = { verdicts: [{ path: patch.path, supported: true, preservesMeaning: true, unsupportedClaims: [] }] };

function fixture(responses: unknown[], options: { budget?: number; conflict?: boolean } = {}) {
  let saved: any = {
    id: 'r', userId: 'u', templateId: 't', version: 1, updatedAt: new Date('2026-01-01'), type: 'RESUME',
    title: 'Test', jobDescription: 'JavaScript is required', atsScore: 99, aiSuggestions: null,
    template: { id: 't', name: 'Plain', category: 'ATS', htmlLayout: '<main></main>', cssStyles: '' },
    contentData: { summary: 'JavaScript developer', skills: ['JavaScript'], experience: [{ company: 'Example', role: 'Developer', bullets: [original] }] },
  };
  let used = 0;
  const history: any[] = [];
  const queued = [...responses];
  const fetchMock = mock.method(globalThis, 'fetch', async () => {
    assert.ok(queued.length, 'Unexpected AI request');
    const next = queued.shift();
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(next) } }] }), { status: 200 });
  });
  replace(prisma.resume, 'findFirst', async (args: any) => {
    assert.deepEqual(args.where, { id: 'r', userId: 'u' });
    return structuredClone(saved);
  });
  replace(prisma.userLimit, 'findUnique', async () => ({ userId: 'u', apiUsed: used, apiLimit: options.budget ?? 10 }));
  replace(prisma.userLimit, 'updateMany', async () => {
    if (used >= (options.budget ?? 10)) return { count: 0 };
    used++;
    return { count: 1 };
  });
  replace(prisma.userLimit, 'update', async () => { used--; return {}; });
  replace(prisma.aiUsageEvent, 'create', async () => ({}));
  replace(prisma, '$transaction', (async (fn: any) => fn({
    resume: {
      updateMany: async ({ where, data }: any) => {
        assert.equal(where.userId, 'u');
        assert.equal(where.updatedAt.getTime(), saved.updatedAt.getTime());
        if (options.conflict) return { count: 0 };
        saved = { ...saved, ...data, version: data.version ? saved.version + data.version.increment : saved.version };
        return { count: 1 };
      },
      findUniqueOrThrow: async () => saved,
    },
    resumeHistory: { create: async (value: any) => { history.push(value.data); return value.data; } },
  })) as any);
  return { fetchMock, history, get saved() { return saved; }, get used() { return used; } };
}

test('optimization recomputes its baseline, verifies rewriting, saves analysis and a restorable snapshot atomically', async () => {
  const f = fixture([assessment, { patches: [patch] }, verification]);
  const result = await optimizeForAts('u', 'r');
  assert.notEqual(result.beforeScore, 99, 'must not use the stale persisted score');
  assert.ok(result.afterScore >= result.beforeScore);
  assert.equal(result.resume.contentData && (result.resume.contentData as any).experience[0].bullets[0], improved);
  assert.equal(result.patches.length, 1);
  assert.equal(f.history.length, 1);
  assert.equal(f.history[0].snapshot.experience[0].bullets[0], original);
  assert.equal(f.history[0].snapshot.__atsRestore.templateId, 't');
  assert.equal(f.used, 3);
  assert.equal(result.resume.atsScore, result.atsData.atsScore);
  // A fresh check reuses the exact scored document and does not drift or charge again.
  const check = await runAtsCheck('u', 'r', { jobDescription: 'JavaScript is required' });
  assert.equal(check.atsData.atsScore, result.afterScore);
  assert.equal(f.fetchMock.mock.callCount(), 3);
});
test('out-of-budget optimization reports the limitation and retains original claims', async () => {
  const f = fixture([], { budget: 0 });
  const result = await optimizeForAts('u', 'r');
  assert.equal(f.fetchMock.mock.callCount(), 0);
  assert.equal(result.patches.length, 0);
  assert.equal(f.history.length, 0);
  assert.ok(result.warnings.some((warning) => /allowance/.test(warning)));
  assert.equal((result.resume.contentData as any).experience[0].bullets[0], original);
});
test('a concurrent edit prevents optimization from overwriting data or creating a bogus history version', async () => {
  const f = fixture([assessment, { patches: [patch] }, verification], { conflict: true });
  await assert.rejects(optimizeForAts('u', 'r'), (error: any) => error.statusCode === 409);
  assert.equal(f.history.length, 0);
  assert.equal(f.saved.contentData.experience[0].bullets[0], original);
});
test('verification failure does not apply proposed wording', async () => {
  const f = fixture([assessment, { patches: [patch] }, { verdicts: [] }]);
  const result = await optimizeForAts('u', 'r');
  assert.equal(result.patches.length, 0);
  assert.equal(f.saved.contentData.experience[0].bullets[0], original);
  assert.ok(result.warnings.some((warning) => /skipped/.test(warning)));
});
test('lower-scoring candidates are discarded under the fixed rubric', async () => {
  const weaker = { ...patch, after: 'Worked on JS reports.' };
  const f = fixture([assessment, { patches: [weaker] }, verification]);
  const result = await optimizeForAts('u', 'r');
  assert.equal(result.afterScore, result.beforeScore);
  assert.equal(f.history.length, 0);
  assert.equal(f.saved.contentData.experience[0].bullets[0], original);
  assert.ok(result.warnings.some((warning) => /scored lower/.test(warning)));
});
test('analysis refuses to save a score when the document changed during the request', async () => {
  fixture([assessment], { conflict: true });
  await assert.rejects(runAtsCheck('u', 'r', { jobDescription: 'JavaScript is required' }), (error: any) => error.statusCode === 409);
});

test('valid JSON with the wrong shape retries another model instead of accepting it as analysis', async () => {
  const f = fixture([{ message: 'User Safety: safe' }, assessment]);
  const result = await runAtsCheck('u', 'r', { jobDescription: 'JavaScript is required' });
  assert.equal(f.fetchMock.mock.callCount(), 2);
  assert.equal(f.used, 1);
  assert.notEqual(result.atsData.analysisMode, 'DETERMINISTIC_FALLBACK');
});

test('unusable responses from both models refund the allowance and report fallback', async () => {
  const f = fixture([{ message: 'unrelated' }, { unrelated: true }]);
  const result = await runAtsCheck('u', 'r', { jobDescription: 'JavaScript is required' });
  assert.equal(f.fetchMock.mock.callCount(), 2);
  assert.equal(f.used, 0);
  assert.equal(result.atsData.analysisMode, 'DETERMINISTIC_FALLBACK');
});

test('rechecking unchanged fallback analysis retains the optimization receipt', async () => {
  fixture([], { budget: 0 });
  const optimized = await optimizeForAts('u', 'r');
  const checked = await runAtsCheck('u', 'r', { jobDescription: 'JavaScript is required' });
  assert.deepEqual((checked.atsData as any).optimization, optimized.atsData.optimization);
});

test('a lower-scoring AI candidate cannot discard a valid conservative correction', async () => {
  const before = 'Participated in remote collaboration with JavaScript teams building internal reports across departments.';
  const f = fixture([assessment, { patches: [{ ...patch, before, after: 'Worked on JS reports.' }] }, verification]);
  f.saved.contentData.experience[0].bullets[0] = before;
  const result = await optimizeForAts('u', 'r');
  assert.equal(f.saved.contentData.experience[0].bullets[0], 'Collaborated remotely with JavaScript teams building internal reports across departments.');
  assert.ok(result.afterScore >= result.beforeScore);
  assert.equal(result.diagnostics.conservativeCorrections, 1);
  assert.ok(result.warnings.some((warning) => /only conservative corrections/.test(warning)));
});
