import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCompanyCareer } from './company-career';

test('discovers a matching public Greenhouse board by company name', async () => {
  const calls: string[] = [];
  const result = await resolveCompanyCareer('Stripe', [], async url => {
    calls.push(url);
    return { ok: true, json: async () => ({ name: 'Stripe' }) };
  });
  assert.equal(result?.url, 'https://boards.greenhouse.io/stripe');
  assert.deepEqual(calls, ['https://boards-api.greenhouse.io/v1/boards/stripe', 'https://boards.greenhouse.io/stripe']);
});

test('follows only a company-matching public career redirect from the verified board', async () => {
  const resolve = (location: string) => resolveCompanyCareer('Stripe', [], async url => url.includes('boards-api.')
    ? { ok: true, json: async () => ({ name: 'Stripe' }) }
    : { ok: false, json: async () => ({}), headers: { get: () => location } });
  assert.equal((await resolve('https://stripe.com/careers/search'))?.url, 'https://stripe.com/careers/search');
  assert.equal((await resolve('https://stripe.evil.example/careers'))?.url, 'https://boards.greenhouse.io/stripe');
  assert.equal((await resolve('http://127.0.0.1/careers'))?.url, 'https://boards.greenhouse.io/stripe');
});

test('resolves the standard Greenhouse redirect before the employer site', async () => {
  const result = await resolveCompanyCareer('Stripe', [], async url => url.includes('boards-api.')
    ? { ok: true, json: async () => ({ name: 'Stripe' }) }
    : { ok: false, json: async () => ({}), headers: { get: () => url.includes('job-boards.') ? 'https://stripe.com/careers/search' : 'https://job-boards.greenhouse.io/stripe' } });
  assert.equal(result?.url, 'https://stripe.com/careers/search');
});

test('does not accept a similarly named or unrelated company', async () => {
  const result = await resolveCompanyCareer('Acme', [], async () => ({ ok: true, json: async () => ({ name: 'Acme Recruitment' }) }));
  assert.equal(result, null);
});

test('prefers an exactly named reviewed board and never trusts its company as a URL', async () => {
  const result = await resolveCompanyCareer('Example Inc', [{ company: 'Example Inc', provider: 'LEVER', board: 'example' }], async () => { throw new Error('unexpected network'); });
  assert.equal(result?.url, 'https://jobs.lever.co/example');
  assert.equal(await resolveCompanyCareer('http://127.0.0.1', [], async () => { throw new Error('unexpected network'); }), null);
});
