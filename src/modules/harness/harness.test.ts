import assert from 'node:assert/strict';
import test from 'node:test';
import { canAutoSubmit, evaluateCandidate } from './harness.policy';
import { DEFAULT_HARNESS_PREFERENCES, harnessPreferenceSchema } from './harness.schema';
import { browserSearchUrls } from './harness.search';
import { normalizeArbeitnowJob, normalizeJobicyJob, normalizeJobSearchQuery, normalizeRemotiveJob, normalizeRoleLabel, jobSearchProviders } from './harness.jobs';

test('harness safety switches cannot be disabled by preference input', () => {
  const result = harnessPreferenceSchema.safeParse({ roles: ['Frontend Engineer'], stopOnCaptcha: false });
  assert.equal(result.success, false);
});

test('candidate policy explains role, skill and workplace matches', () => {
  const preferences = harnessPreferenceSchema.parse({
    ...DEFAULT_HARNESS_PREFERENCES,
    roles: ['Frontend Engineer'],
    requiredSkills: ['React', 'TypeScript'],
    workplace: 'REMOTE',
    minimumMatchScore: 70,
  });
  const result = evaluateCandidate({
    id: 'job-1',
    title: 'Frontend Engineer',
    company: 'Example',
    description: 'Build remote React products with TypeScript.',
    location: 'Worldwide',
    workplaceType: 'REMOTE',
    employmentType: 'FULL_TIME',
    salaryMin: null,
    salaryCurrency: null,
    publishedAt: new Date(),
    lastVerifiedAt: new Date(),
    lifecycle: 'ACTIVE',
  }, preferences);
  assert.equal(result.decision, 'ELIGIBLE');
  assert.ok(result.score >= 70);
  assert.ok(result.reasons.some(row => row.rule === 'required-skills'));
});

test('an otherwise matching job with an unknown employer requires review', () => {
  const preferences = harnessPreferenceSchema.parse({ roles: ['Frontend Developer'], workplace: 'REMOTE', minimumMatchScore: 60 });
  const result = evaluateCandidate({ id: 'job', title: 'Frontend Developer', company: 'Unknown company', description: 'Remote frontend role.', location: null, workplaceType: 'REMOTE', employmentType: null, salaryMin: null, salaryCurrency: null, publishedAt: new Date(), lastVerifiedAt: new Date(), lifecycle: 'ACTIVE' }, preferences);
  assert.equal(result.decision, 'REVIEW_REQUIRED');
  assert.ok(result.missing.includes('Company name needs verification'));
});

test('auto submit needs mode, threshold, allowlist and explicit no-review preference', () => {
  const preferences = harnessPreferenceSchema.parse({
    ...DEFAULT_HARNESS_PREFERENCES,
    roles: ['Engineer'],
    requireApprovalBeforeSubmit: false,
    allowedAutoApplyDomains: ['jobs.example.com'],
  });
  assert.equal(canAutoSubmit({ mode: 'AUTO_APPLY', score: 99, hostname: 'jobs.example.com', unknownFields: [], hasSensitiveQuestion: false, preferences }), true);
  assert.equal(canAutoSubmit({ mode: 'AUTO_APPLY', score: 99, hostname: 'jobs.example.com', unknownFields: ['Question'], hasSensitiveQuestion: false, preferences }), false);
  assert.equal(canAutoSubmit({ mode: 'AUTO_APPLY', score: 99, hostname: 'evil.example', unknownFields: [], hasSensitiveQuestion: false, preferences }), false);
});

test('browser search plans use saved roles, workplace and countries', () => {
  const preferences = harnessPreferenceSchema.parse({ roles: ['Frontend Engineer', 'React Developer'], workplace: 'REMOTE', allowedCountries: ['Bangladesh', 'Worldwide'] });
  const searches = browserSearchUrls(preferences);
  assert.equal(searches.length, 2);
  const query = new URL(searches[0]!.url).searchParams.get('q') ?? '';
  assert.match(query, /Frontend Engineer/);
  assert.match(query, /remote/);
  assert.match(query, /Bangladesh OR Worldwide/);
  assert.match(query, /jobs\.lever\.co/);
});

test('Remotive jobs normalize into private remote partner listings', () => {
  const job = normalizeRemotiveJob({
    id: 42,
    url: 'https://remotive.com/remote-jobs/software-development/example-42',
    title: 'Frontend Engineer',
    company_name: 'Example',
    candidate_required_location: 'Worldwide',
    job_type: 'full_time',
    publication_date: '2026-10-20T10:00:00',
    salary: '',
    description: '<p>Build <strong>React</strong> products.</p>',
  });
  assert.equal(job.sourceType, 'PARTNER_API');
  assert.equal(job.workplaceType, 'REMOTE');
  assert.equal(job.employmentType, 'FULL_TIME');
  assert.equal(job.description, 'Build React products.');
  assert.match(job.attribution, /Remotive/);
});

test('job search corrects common role typos and matching tolerates one edit', () => {
  assert.equal(normalizeJobSearchQuery('FrontendDevloper'), 'Frontend developer');
  assert.equal(normalizeJobSearchQuery('Frontend Devloper'), 'Frontend developer');
  const preferences = harnessPreferenceSchema.parse({ roles: ['Frontend Devloper'], workplace: 'REMOTE', autoSaveThreshold: 40, minimumMatchScore: 60 });
  const result = evaluateCandidate({ id: 'job-2', title: 'Frontend Developer', company: 'Example', description: 'React work.', location: 'Worldwide', workplaceType: 'REMOTE', employmentType: 'FULL_TIME', salaryMin: null, salaryCurrency: null, publishedAt: new Date(), lastVerifiedAt: new Date(), lifecycle: 'ACTIVE' }, preferences);
  assert.equal(result.decision, 'ELIGIBLE');
});

test('worldwide preference accepts a skill-matched adjacent developer title', () => {
  const preferences = harnessPreferenceSchema.parse({ roles: ['FrontendDevloper'], requiredSkills: ['React'], workplace: 'REMOTE', allowedCountries: ['WorldWide'], minimumMatchScore: 73 });
  const result = evaluateCandidate({ id: 'job-3', title: 'Senior React Full-stack Developer', company: 'Example', description: 'Build React interfaces.', location: 'Europe, USA, Canada, APAC', workplaceType: 'REMOTE', employmentType: 'FULL_TIME', salaryMin: null, salaryCurrency: null, publishedAt: new Date(), lastVerifiedAt: new Date(), lifecycle: 'ACTIVE' }, preferences);
  assert.equal(result.decision, 'ELIGIBLE');
  assert.ok(result.score >= 73);
});

test('role labels are corrected before a preference version is stored', () => {
  assert.equal(normalizeRoleLabel('FrontendDevloper'), 'Frontend Developer');
  assert.equal(normalizeRoleLabel('frontend devloper'), 'Frontend Developer');
  assert.equal(normalizeRoleLabel('React Developer'), 'React Developer');
});

test('Jobicy jobs normalize into private remote partner listings', () => {
  const job = normalizeJobicyJob({
    id: 146760,
    url: 'https://jobicy.com/jobs/146760-example',
    jobTitle: 'Senior Frontend Engineer',
    companyName: 'Example',
    jobGeo: 'Anywhere',
    jobType: ['Full-Time'],
    jobLevel: 'Senior',
    jobExcerpt: 'Short summary.',
    jobDescription: '<div>Build <strong>React</strong> interfaces.</div>',
    pubDate: '2026-10-20T10:00:00+00:00',
  });
  assert.equal(job.sourceName, 'Jobicy');
  assert.equal(job.sourceType, 'PARTNER_API');
  assert.equal(job.workplaceType, 'REMOTE');
  assert.equal(job.employmentType, 'FULL_TIME');
  assert.equal(job.description, 'Build React interfaces.');
  assert.match(job.attribution, /Jobicy/);
});

test('Arbeitnow jobs normalize into private partner listings', () => {
  const job = normalizeArbeitnowJob({
    slug: 'senior-frontend-engineer-123',
    company_name: 'Example',
    title: 'Senior Frontend Engineer',
    description: '<p>Build React interfaces.</p>',
    remote: true,
    url: 'https://www.arbeitnow.com/jobs/companies/example/senior-frontend-engineer-123',
    tags: ['Engineering'],
    job_types: ['Full-time'],
    location: 'Berlin',
    created_at: 1792594852,
  });
  assert.equal(job.sourceName, 'Arbeitnow');
  assert.equal(job.sourceType, 'PARTNER_API');
  assert.equal(job.workplaceType, 'REMOTE');
  assert.equal(job.externalId, 'senior-frontend-engineer-123');
  assert.equal(job.description, 'Build React interfaces.');
  assert.match(job.attribution, /Arbeitnow/);
});

test('the search plan runs providers one after another for each role', () => {
  assert.deepEqual(jobSearchProviders.map(provider => provider.id), ['Remotive', 'Jobicy', 'Arbeitnow']);
});
