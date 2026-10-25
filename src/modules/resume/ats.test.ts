import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containsTerm, validateAssessment, fallbackAssessment, mergeAssessments, scoreResume, sourceHash, safePatches, applyVerifiedPatches, carryEvidence, conservativeRewrite, type Assessment, type Content } from './ats.logic';
import { checkExtractedText, extractDocxText, verifyExport } from './ats.export';
import { buildResumeDocx, buildResumePdf, buildTemplateSnapshotDocx } from './resumeDocument';

const template = { id: 'ats', name: 'Plain', category: 'ATS', htmlLayout: '<main>{{summary}}</main>', cssStyles: '' };
const jd = 'Required: JavaScript. Preferred: Python.';
const assessment: Assessment = { usedAi: true, semanticMatches: [], requirements: [
  { label: 'JavaScript', priority: 'required', category: 'skill', aliases: ['JS'], sourceQuote: 'Required: JavaScript' },
  { label: 'Python', priority: 'preferred', category: 'skill', aliases: [], sourceQuote: 'Preferred: Python' },
] };
const content: Content = {
  personalInfo: { firstName: 'Alex', lastName: 'Example', email: 'alex@example.test', phone: '555123456' },
  summary: 'Developer building useful web applications with JavaScript.',
  skills: ['JavaScript'], experience: [{ company: 'Example Ltd', role: 'Developer', from: '2021', to: '2024', bullets: ['Responsible for maintaining JavaScript dashboards for internal reporting across the team.'] }],
  education: [{ school: 'Example University', degree: 'BSc', field: 'Computing' }],
  projects: [{ title: 'Portal', description: 'Built a JavaScript portal for customer account management.', techStack: ['JavaScript'] }],
  languages: ['English'],
};

test('whole-term matching distinguishes Java/JavaScript, C#/C++, and short skills', () => {
  assert.equal(containsTerm('JavaScript developer', 'Java'), false);
  assert.equal(containsTerm('scalable APIs', 'C'), false);
  assert.equal(containsTerm('C++ and C# development', 'C++'), true);
  assert.equal(containsTerm('Node.js experience.', 'Node.js'), true);
});
test('requirements must have a real JD quote and cannot invent aliases', () => {
  assert.equal(validateAssessment({ requirements: [{ ...assessment.requirements[0], label: 'AWS', sourceQuote: 'Required AWS' }], semanticMatches: [] }, jd), null);
  const result = validateAssessment({ requirements: [{ ...assessment.requirements[0], aliases: ['Python'], sourceQuote: jd }], semanticMatches: [] }, jd)!;
  assert.ok(!result.requirements[0]!.aliases.includes('Python'));
  assert.ok(result.requirements[0]!.aliases.includes('JS'));
});
test('fallback preserves required/preferred distinctions and experience constraints', () => {
  const result = fallbackAssessment('Requirements:\nJavaScript\nPreferred:\nPython\nMust have 5 years of Java experience.');
  assert.equal(result.requirements.find((r) => r.label === 'JavaScript')?.priority, 'required');
  assert.equal(result.requirements.find((r) => r.label === 'Python')?.priority, 'preferred');
  assert.ok(result.requirements.some((r) => r.label.includes('5 years')));
  assert.equal(result.requirements.some((r) => r.label === 'Java'), false);
});
test('hybrid assessment preserves deterministic required terms missed by AI', () => {
  const ai: Assessment = { usedAi: true, semanticMatches: [], requirements: [assessment.requirements[1]!] };
  const merged = mergeAssessments(ai, fallbackAssessment(jd));
  assert.ok(merged.requirements.some((requirement) => requirement.label === 'JavaScript' && requirement.priority === 'required'));
  assert.ok(merged.requirements.some((requirement) => requirement.label === 'Python'));
  assert.equal(merged.usedAi, true);
});
test('same inputs always give the same score; required evidence outweighs preferred', () => {
  assert.deepEqual(scoreResume(content, jd, template, assessment), scoreResume(content, jd, template, assessment));
  const requiredOnly = scoreResume({ skills: ['JavaScript'] }, jd, template, assessment);
  const preferredOnly = scoreResume({ skills: ['Python'] }, jd, template, assessment);
  assert.ok(requiredOnly.atsScore > preferredOnly.atsScore);
});
test('repetition cannot improve evidence strength and actual experience outweighs a keyword list', () => {
  const base = scoreResume({ skills: ['JavaScript'] }, jd, template, assessment);
  const stuffed = scoreResume({ skills: ['JavaScript', 'JavaScript', 'JavaScript'] }, jd, template, assessment);
  assert.ok(stuffed.atsScore < base.atsScore);
  assert.ok(stuffed.penalties.keywordStuffing > 0);
  assert.ok(scoreResume(content, jd, template, assessment).breakdown.evidenceStrength > base.breakdown.evidenceStrength);
});
test('experience alignment requires demonstrated evidence, not a skills-list match', () => {
  const keywordOnly = scoreResume({ personalInfo: { email: 'alex@example.test' }, skills: ['JavaScript'] }, jd, template, assessment);
  const demonstrated = scoreResume(content, jd, template, assessment);
  assert.equal(keywordOnly.breakdown.experienceAlignment, 0);
  assert.ok(demonstrated.breakdown.experienceAlignment > keywordOnly.breakdown.experienceAlignment);
});
test('a required keyword in Skills alone does not clear the demonstrated-evidence ceiling', () => {
  const inventoryOnly = scoreResume({ personalInfo: { email: 'alex@example.test' }, skills: ['JavaScript'], experience: [{ company: 'Example', role: 'Analyst', from: '2024', current: true, bullets: ['Analyzed monthly financial reports for leadership.'] }] }, jd, template, assessment);
  assert.equal(inventoryOnly.breakdown.experienceAlignment, 0);
  assert.ok(inventoryOnly.scoreCeiling <= 59);
  assert.ok(inventoryOnly.criticalIssues.some((issue) => issue.code === 'REQUIRED_GAP'));
  assert.ok(scoreResume(content, jd, template, assessment).scoreCeiling > inventoryOnly.scoreCeiling);
});
test('incomplete role chronology lowers completeness and produces an actionable warning', () => {
  const incomplete = structuredClone(content);
  delete (incomplete.experience as Content[])[0]!.to;
  const completeScore = scoreResume(content, jd, template, assessment);
  const incompleteScore = scoreResume(incomplete, jd, template, assessment);
  assert.equal(completeScore.qualitySignals.structuredExperience, 1);
  assert.equal(incompleteScore.qualitySignals.structuredExperience, 0);
  assert.ok(incompleteScore.breakdown.completeness < completeScore.breakdown.completeness);
  assert.ok(incompleteScore.criticalIssues.some((issue) => issue.code === 'EXPERIENCE_STRUCTURE'));
  assert.ok(incompleteScore.topActions.some((action) => /role\(s\) have incomplete/.test(action.issue)));
});
test('critical blockers cap the score and produce ranked actions', () => {
  const missing = scoreResume({ summary: 'Python developer', skills: ['Python'] }, jd, { ...template, htmlLayout: '<table><tr><td>x</td></tr></table>', cssStyles: 'position:absolute; columns: 2; float:left' }, assessment);
  assert.ok(missing.scoreCeiling <= 59);
  assert.ok(missing.atsScore <= missing.scoreCeiling);
  assert.ok(missing.criticalIssues.some((issue) => issue.code === 'CONTACT_EMAIL'));
  assert.ok(missing.criticalIssues.some((issue) => issue.code === 'REQUIRED_GAP'));
  assert.equal(missing.topActions[0]?.impact, 'HIGH');
  assert.ok(missing.topActions.some((action) => /JavaScript/.test(action.issue)));
});
test('negative statements do not count as keyword evidence', () => {
  assert.equal(scoreResume({ summary: 'No experience with JavaScript.' }, jd, template, assessment).requirements[0]!.matched, false);
});
test('semantic matches require the cited source and a quote within that source', () => {
  const semantic: Assessment = { ...assessment, semanticMatches: [{ requirement: 'Python', sourceId: 'summary', evidence: 'This quote does not exist', confidence: 0.85 }] };
  assert.equal(scoreResume(content, jd, template, semantic).requirements[1]!.matched, false);
  const badSource = { ...semantic, semanticMatches: [{ requirement: 'Python', sourceId: 'missing', evidence: String(content.summary), confidence: 0.8 }] };
  assert.equal(scoreResume(content, jd, template, badSource).requirements[1]!.matched, false);
});
test('fallback mode does not impose an artificial score penalty', () => {
  assert.equal(scoreResume(content, jd, template, assessment).atsScore, scoreResume(content, jd, template, { ...assessment, usedAi: false }).atsScore);
});
test('no extracted requirements produces no meaningful alignment credit', () => {
  const result = scoreResume(content, 'Hello world', template, fallbackAssessment('Hello world'));
  assert.equal(result.atsScore, 0);
  assert.match(result.notice, /No reliable/);
});
test('cache includes template source and scoring methodology, not just its ID', () => {
  assert.notEqual(sourceHash(content, jd, template), sourceHash(content, jd, { ...template, cssStyles: 'position:absolute' }));
  assert.notEqual(sourceHash(content, jd, template), sourceHash(content, `${jd} SQL`, template));
});
const before = 'Responsible for maintaining JavaScript dashboards for internal reporting across the team.';
test('conservative rewrites preserve metrics, qualifiers and facts and are idempotent', () => {
  const input = { experience: [{ bullets: ['Participated in remote collaboration with 3 teams using JS to deliver reporting.', 'Assisted with JS reports.', 'Worked on JavaScript reports.'] }] };
  const result = conservativeRewrite(input, assessment.requirements);
  const experience = result.content.experience as typeof input.experience;
  assert.equal(experience[0]!.bullets[0], 'Collaborated remotely with 3 teams using JavaScript to deliver reporting.');
  assert.equal(experience[0]!.bullets[1], 'Assisted with JavaScript reports.');
  assert.equal(experience[0]!.bullets[2], input.experience[0]!.bullets[2]);
  assert.equal(conservativeRewrite(result.content, assessment.requirements).accepted.length, 0);
  assert.match(input.experience[0]!.bullets[0]!, /^Participated/);
});

test('fallback excludes company prose and preserves late required skills with canonical deduplication', () => {
  const description = '# About us\nWe develop Python products.\n# Responsibilities\nReact development\n' + Array.from({ length: 28 }, (_, i) => `Ability to manage workflow ${i}`).join('\n') + '\n# Required skills\nReact.js, Next.js, HTML5, CSS3\n# Preferred\nPython\n# What we offer\nJava development training';
  const result = fallbackAssessment(description);
  for (const label of ['Next.js', 'HTML5', 'CSS3']) assert.ok(result.requirements.some((r) => r.label === label && r.priority === 'required'));
  assert.equal(result.requirements.filter((r) => /react/i.test(r.label)).length, 1);
  assert.equal(result.requirements.find((r) => /react/i.test(r.label))?.priority, 'required');
  assert.equal(result.requirements.find((r) => r.label === 'Python')?.priority, 'preferred');
  assert.ok(!result.requirements.some((r) => r.label === 'Java'));
});

test('matching aliases do not replace grammatical forms or invent technology versions in prose', () => {
  const input = { experience: [{ bullets: ['Debugged cross-browser compatibility issues in accessible HTML interfaces.'] }] };
  const requirements = fallbackAssessment('Required: Debugging, Cross-browser-compatible, Accessibility, HTML5').requirements;
  assert.deepEqual(conservativeRewrite(input, requirements).content, input);
});

const after = 'Maintained JavaScript dashboards for internal reporting across the team.';
const patch = { path: 'experience.0.bullets.0', before, after };
test('rewrite rejects invented metrics, cross-job metrics, tools, unsupported paths and stale originals', () => {
  for (const p of [
    { ...patch, after: `${after} Improved revenue by 25%.` },
    { ...patch, after: `${after} Used Python.` },
    { ...patch, before: 'stale' },
    { ...patch, path: 'personalInfo.firstName', before: 'Alex', after: 'Another person' },
  ]) assert.equal(safePatches(content, { patches: [p] }, assessment.requirements).length, 0);
  const metricContent = { experience: [{ bullets: ['Reduced latency by 10%.', 'Raised revenue by 25%.'] }] };
  assert.equal(safePatches(metricContent, { patches: [{ path: 'experience.0.bullets.0', before: 'Reduced latency by 10%.', after: 'Reduced latency by 25%.' }] }, []).length, 0);
  assert.equal(safePatches(metricContent, { patches: [{ path: 'experience.0.bullets.0', before: 'Reduced latency by 10%.', after: 'Reduced latency by 10.' }] }, []).length, 0);
  const swapped = { experience: [{ bullets: ['Reduced latency by 10% and errors by 25%.'] }] };
  assert.equal(safePatches(swapped, { patches: [{ path: 'experience.0.bullets.0', before: 'Reduced latency by 10% and errors by 25%.', after: 'Reduced latency by 25% and errors by 10%.' }] }, []).length, 0);
});
test('rewrite cannot remove uncertainty or upgrade assisted work into leadership', () => {
  const c = { summary: 'Assisted with JavaScript reports.' };
  assert.equal(safePatches(c, { patches: [{ path: 'summary', before: c.summary, after: 'Led JavaScript reporting.' }] }, []).length, 0);
});
test('verification fails closed and only changes whitelisted text, preserving factual fields', () => {
  const patches = safePatches(content, { patches: [patch] }, assessment.requirements);
  assert.equal(patches.length, 1);
  assert.deepEqual(applyVerifiedPatches(content, patches, null).content, content);
  const verified = applyVerifiedPatches(content, patches, { verdicts: [{ path: patch.path, supported: true, preservesMeaning: true, unsupportedClaims: [] }] });
  assert.equal(verified.accepted.length, 1);
  assert.deepEqual(verified.content.personalInfo, content.personalInfo);
  assert.deepEqual(verified.content.education, content.education);
  assert.equal((content.experience as any[])[0].bullets[0], before);
  assert.equal((verified.content.experience as any[])[0].bullets[0], after);
  assert.ok(scoreResume(verified.content, jd, template, assessment).atsScore >= scoreResume(content, jd, template, assessment).atsScore);
});
test('rewrites retain only semantic evidence that remains literally present', () => {
  const original: Assessment = { ...assessment, semanticMatches: [{ requirement: 'JavaScript', sourceId: patch.path, evidence: 'JavaScript dashboards', confidence: 0.8 }] };
  const carried = carryEvidence(original, [patch]);
  assert.deepEqual(carried.requirements, original.requirements);
  assert.equal(carried.semanticMatches[0]!.evidence, 'JavaScript dashboards');
  assert.equal(carried.semanticMatches[0]!.confidence, 0.8);
  const removed = carryEvidence(original, [{ ...patch, after: 'Maintained reporting dashboards across the team.' }]);
  assert.equal(removed.semanticMatches.length, 0);
});
test('actual ATS Word export contains contact, experience, projects, skills, education and languages', async () => {
  const buffer = await buildResumeDocx(content, template, 'Test resume');
  const extracted = await extractDocxText(buffer);
  assert.match(extracted, /Portal/);
  assert.match(extracted, /alex@example.test/);
  const report = await verifyExport(buffer, content, 'DOCX');
  assert.equal(report.status, 'PASS', JSON.stringify(report));
  assert.equal(report.textCoverage, 100);
});
test('image-only Word exports cannot pass extraction validation', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6xsAAAAAASUVORK5CYII=', 'base64');
  const buffer = await buildTemplateSnapshotDocx([png], 'Test', 'Snapshot');
  assert.equal((await verifyExport(buffer, content, 'DOCX')).status, 'WARNING');
});
test('missing sections and malformed export data are reported honestly', async () => {
  assert.equal(checkExtractedText('Alex Example', content, 'PDF').status, 'WARNING');
  assert.equal((await verifyExport(Buffer.from('invalid file'), content, 'DOCX')).status, 'UNAVAILABLE');
});
test('actual PDF bytes are parsed and checked against the expected text', async () => {
  const pdfContent = { personalInfo: { firstName: 'Alex', lastName: 'Example', email: 'alex@example.test' }, summary: 'JavaScript developer', skills: ['JavaScript'] };
  const buffer = await buildResumePdf(pdfContent, template, 'Test resume');
  const report = await verifyExport(buffer, pdfContent, 'PDF');
  assert.equal(report.status, 'PASS', JSON.stringify(report));
});
