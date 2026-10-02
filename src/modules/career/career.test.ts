import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAlignment, composeDraft, ENTITLEMENTS, trustedEvidence } from './career.logic';
import { draftBody, evidenceBody, editDraftBody, styleBody } from './career.schema';
import { normalizePosting, sourceBody } from './career.sources';
import { decryptToken, encryptToken } from './career.crypto';
import { imageExtension } from '../../utils/uploadSafety';
import { contextualFallback } from './career.draft-ai';
import { mergeSemanticAssessment } from './career.alignment-ai';

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
test('hybrid alignment understands common skill aliases and weights required items', () => {
  const result = analyzeAlignment(
    'JavaScript and Node.js skills are required. GraphQL is a preferred skill.',
    { skills: 'JS, Node, REST APIs' },
    [],
    'recent',
  );
  assert.notEqual(result.requirements[0]?.status, 'missing');
  assert.equal(result.requirements[0]?.importance, 'required');
  assert.equal(result.requirements[1]?.importance, 'preferred');
  assert.equal(result.method.includes('Hybrid'), true);
});
test('semantic assessment is accepted only when it cites an allowed source', () => {
  const baseline = analyzeAlignment('Required ability to build accessible interfaces.', { summary: 'Created inclusive web experiences.' }, [], 'recent');
  const rejected = mergeSemanticAssessment(baseline, [{ requirementIndex: 0, sourceId: 'invented:1', semanticScore: 95, confidence: 'high' }], new Map());
  assert.equal(rejected.score, baseline.score);
  const source = new Map([['resume:1', 'Created inclusive web experiences.']]);
  const accepted = mergeSemanticAssessment(baseline, [{ requirementIndex: 0, sourceId: 'resume:1', semanticScore: 80, confidence: 'high' }], source);
  assert.ok((accepted.score ?? 0) > (baseline.score ?? 0));
  assert.equal(accepted.requirements[0]?.citation?.source, 'resume:1');
});
test('draft fallback is a complete professional email and preserves confirmed claims exactly', () => {
  const claims = [{ id: '1', statement: 'Built a React dashboard.', source: 'Portfolio' }, { id: '2', statement: 'Maintained API documentation.', source: 'Notes' }];
  const result = composeDraft({ title: 'Engineer', company: 'Example', tone: 'warm', kind: 'APPLICATION', length: 'short' }, claims);
  assert.ok(result.body.includes(claims[0]!.statement));
  assert.equal(result.claims.length, 2);
  assert.equal(/\d+%/.test(result.body), false);
  assert.equal(result.subjects.length, 3);
  assert.ok(result.body.split(/\s+/).length >= 100);
  assert.match(result.body, /Hello hiring team,/);
  assert.match(result.body, /Best regards,/);
  assert.equal(composeDraft({ title: 'Engineer', company: 'Example', tone: 'neutral', kind: 'FOLLOW_UP', length: 'short' }, []).missingQuestions.length, 1);
});
test('standard drafts support bounded character targets and use additional relevant evidence', () => {
  const claims = Array.from({ length: 6 }, (_, index) => ({ id: String(index + 1), statement: `Confirmed engineering achievement number ${index + 1}.`, source: 'Profile' }));
  const short = composeDraft({ title: 'Engineer', company: 'Example', tone: 'neutral', kind: 'APPLICATION', length: 'short', targetCharacters: 800 }, claims);
  const standard = composeDraft({ title: 'Engineer', company: 'Example', tone: 'neutral', kind: 'APPLICATION', length: 'standard', targetCharacters: 1800 }, claims);
  assert.equal(short.claims.length, 2);
  assert.equal(standard.claims.length, 4);
  assert.ok(standard.body.length > short.body.length);
  assert.equal(draftBody.safeParse({ jobId: 'job-1', targetCharacters: 600 }).success, true);
  assert.equal(draftBody.safeParse({ jobId: 'job-1', targetCharacters: 599 }).success, false);
  assert.equal(styleBody.safeParse({ tone: 'warm', length: 'standard', targetCharacters: 3600 }).success, true);
  assert.equal(styleBody.safeParse({ tone: 'warm', length: 'standard', targetCharacters: 3601 }).success, false);
});
test('contextual fallback scales toward a long target without inventing evidence', () => {
  const claim = { id: 'e1', statement: 'Led delivery of an accessible customer dashboard.', source: 'Profile' };
  const result = contextualFallback(
    { title: 'Senior Product Engineer', company: 'Example Labs', tone: 'neutral', kind: 'APPLICATION', length: 'standard', targetCharacters: 3600 },
    [claim],
    {
      jobDescription: 'Build reliable customer-facing applications with React and TypeScript. Collaborate with product and design, improve accessibility, test APIs, review code, and communicate decisions clearly.',
      resume: {
        summary: 'Product-focused engineer experienced in React, TypeScript, API integration, automated testing, accessible interfaces, and technical documentation.',
        experience: [
          'Built and maintained customer-facing web products from planning through release.',
          'Collaborated with product and design partners to refine requirements and review implementation details.',
          'Integrated APIs and added automated tests for critical user journeys.',
          'Reviewed interface accessibility and documented technical decisions for future maintainers.',
          'Supported iterative releases by investigating defects and communicating tradeoffs to stakeholders.',
        ],
      },
    },
    3600,
  );
  assert.ok(result.body.length >= 3240, `expected at least 3240 characters, received ${result.body.length}`);
  assert.ok(result.body.length <= 3960, `expected at most 3960 characters, received ${result.body.length}`);
  assert.ok(result.body.includes(claim.statement));
  assert.equal(result.claims.length, 1);
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
