import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAlignment, composeDraft, ENTITLEMENTS, trustedEvidence } from './career.logic';
import { evidenceBody, editDraftBody } from './career.schema';
import { normalizePosting, sourceBody } from './career.sources';
import { decryptToken, encryptToken } from './career.crypto';
import { imageExtension } from '../../utils/uploadSafety';

test('inferred evidence cannot support generated claims or alignment citations', () => {
  assert.equal(trustedEvidence('INFERRED'), false);
  assert.equal(trustedEvidence('MISSING'), false);
  const result = analyzeAlignment('Required experience building React dashboards.', {}, [{ id: 'private', statement: 'Built React dashboards', status: 'INFERRED' }], 'unverified');
  assert.equal(result.requirements[0]?.status, 'missing');
  assert.equal(result.requirements[0]?.citation, null);
  assert.ok(result.risks.includes('Unconfirmed evidence excluded.'));
  assert.equal(evidenceBody.safeParse({ title: 'Project', statement: 'Built a dashboard', source: 'My notes', status: 'VERIFIED' }).success, false);
});
test('alignment extracts evidence with citations and refuses to invent a score without requirements', () => {
  const result = analyzeAlignment('Required React dashboard skills.', { summary: 'Built a React dashboard.' }, [], 'recent');
  assert.match(result.requirements[0]!.citation!.quote, /React dashboard/);
  assert.equal(analyzeAlignment('Hello world', {}, [], 'recent').score, null);
  assert.match(result.disclaimer, /not hiring probability/);
});
test('draft claims preserve confirmed text exactly and short mode reduces selected claims', () => {
  const claims = [{ id: '1', statement: 'Built a React dashboard.', source: 'Portfolio' }, { id: '2', statement: 'Maintained API documentation.', source: 'Notes' }];
  const result = composeDraft({ title: 'Engineer', company: 'Example', tone: 'warm', kind: 'APPLICATION', length: 'short' }, claims);
  assert.ok(result.body.includes(claims[0]!.statement));
  assert.equal(result.claims.length, 1);
  assert.equal(/\d+%/.test(result.body), false);
  assert.equal(result.subjects.length, 3);
  assert.equal(composeDraft({ title: 'Engineer', company: 'Example', tone: 'neutral', kind: 'FOLLOW_UP', length: 'short' }, []).missingQuestions.length, 1);
});
test('official parser fixtures normalize both providers and detect contract drift', () => {
  const lever = normalizePosting('LEVER', { id: 'a', text: 'Engineer', hostedUrl: 'https://jobs.lever.co/example/a', descriptionPlain: 'Build customer applications.', lists: [{ text: 'Requirements', content: '<li>React experience required</li>' }], categories: { location: 'Remote' } }, 'Example');
  assert.match(lever.description, /React experience/);
  const greenhouse = normalizePosting('GREENHOUSE', { id: 123, title: 'Engineer', absolute_url: 'https://boards.greenhouse.io/example/jobs/123', content: '<p>Build APIs &amp; dashboards.</p>', location: { name: 'Dhaka' } }, 'Example');
  assert.equal(greenhouse.description, 'Build APIs & dashboards.');
  assert.equal(greenhouse.externalId, '123');
  assert.throws(() => normalizePosting('GREENHOUSE', { changed_title: 'Engineer' }, 'Example'));
  assert.equal(sourceBody.safeParse({ provider: 'LEVER', board: '../private', company: 'Example' }).success, false);
});
test('token encryption is authenticated and randomized', () => {
  const prior = process.env.CAREER_TOKEN_KEY;
  process.env.CAREER_TOKEN_KEY = 'ab'.repeat(32);
  try {
    const one = encryptToken('secret-refresh-token');
    assert.equal(decryptToken(one), 'secret-refresh-token');
    assert.notEqual(one, encryptToken('secret-refresh-token'));
    assert.ok(!one.includes('secret-refresh-token'));
    const fields = one.split('.'); fields[1] = '00'.repeat(16);
    assert.throws(() => decryptToken(fields.join('.')));
  } finally { if (prior === undefined) delete process.env.CAREER_TOKEN_KEY; else process.env.CAREER_TOKEN_KEY = prior; }
});
test('MIME spoofing and mail header injection are rejected', () => {
  assert.throws(() => imageExtension(Buffer.from('<script>alert(1)</script>'), 'image/png'));
  assert.equal(imageExtension(Buffer.from('89504e470d0a1a0a0000', 'hex'), 'image/png'), 'png');
  assert.equal(editDraftBody.safeParse({ subject: 'Subject\r\nBcc: stolen@example.com', body: 'Hello' }).success, false);
  assert.equal(ENTITLEMENTS.free.draft, 5);
});


import { composeStory } from './career.logic';
test('Interview stories preserve confirmed facts and question missing results', () => {
  const evidence = { id: 'test', title: 'Dashboard', status: 'USER_CONFIRMED', source: 'Project notes', statement: 'Built reusable components.', details: { situation: 'Repeated interface patterns', task: 'Build the component library' } };
  const story = composeStory(evidence);
  assert.equal(story.sections[2]?.text, evidence.statement);
  assert.equal(story.sections[3]?.text, null);
  assert.match(story.body, /To confirm/);
  assert.equal(story.claims.length, 3);
  assert.ok(story.claims.every(c => c.source === evidence.source));
  assert.throws(() => composeStory({ ...evidence, status: 'INFERRED' }), /confirmed/);
});
