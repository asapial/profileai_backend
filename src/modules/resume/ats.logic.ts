import { createHash } from 'node:crypto';
import { z } from 'zod';

export type Content = Record<string, unknown>;
export const object = (v: unknown): Content => v && typeof v === 'object' && !Array.isArray(v) ? v as Content : {};
export const rows = (v: unknown): Content[] => Array.isArray(v) ? v.map(object) : [];
export const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && !!s.trim()) : [];
export const text = (v: unknown): string => typeof v === 'string' ? v : '';
export const normalize = (v: unknown): string => text(v).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}+#.]+/gu, ' ').replace(/\.(?=\s|$)/g, '').replace(/\s+/g, ' ').trim();
export const containsTerm = (value: unknown, term: unknown): boolean => {
  const needle = normalize(term);
  return !!needle && ` ${normalize(value)} `.includes(` ${needle} `);
};
export const METHODOLOGY = 'evidence-v3.1';
export const requirementSchema = z.object({
  label: z.string().min(2).max(240),
  priority: z.enum(['required', 'responsibility', 'preferred']),
  category: z.enum(['skill', 'experience', 'qualification', 'responsibility', 'tool', 'domain']),
  aliases: z.array(z.string().min(1).max(120)).max(8).default([]),
  sourceQuote: z.string().min(2).max(1000),
});
export type Requirement = z.infer<typeof requirementSchema>;
export const semanticSchema = z.object({
  requirement: z.string(), sourceId: z.string(), evidence: z.string().min(12), confidence: z.number().min(0.6).max(0.85),
});
export type SemanticMatch = z.infer<typeof semanticSchema>;
export const assessmentSchema = z.object({
  requirements: z.array(requirementSchema).min(1).max(24),
  semanticMatches: z.array(semanticSchema).max(100).default([]),
});
export type Assessment = { requirements: Requirement[]; semanticMatches: SemanticMatch[]; usedAi: boolean };

const aliases: string[][] = [
  ['JavaScript', 'JS'], ['TypeScript', 'TS'], ['Node.js', 'NodeJS'], ['React', 'React.js', 'ReactJS'],
  ['PostgreSQL', 'Postgres'], ['Amazon Web Services', 'AWS'], ['Google Cloud Platform', 'GCP'],
  ['Continuous integration', 'CI'], ['Continuous delivery', 'CD'], ['Search engine optimization', 'SEO'],
  ['C++'], ['C#'], ['.NET'], ['Python'], ['Java'], ['SQL'], ['Docker'], ['Kubernetes', 'K8s'],
  ['Git'], ['GraphQL'], ['Excel'], ['Power BI'], ['Tableau'], ['Figma'], ['Salesforce'],
  ['Project management'], ['Customer service'], ['Data analysis'], ['Communication'], ['Leadership'],
  ['Next.js', 'NextJS'], ['HTML5', 'HTML'], ['CSS3', 'CSS'], ['Tailwind CSS', 'Tailwind'],
  ['REST APIs', 'REST API', 'RESTful APIs', 'RESTful API', 'REST'],
  ['Redux', 'Redux Toolkit'], ['Zustand'], ['React Hooks'], ['State management'],
  ['Responsive web design', 'Responsive design'], ['Core Web Vitals'],
  ['Performance optimization'], ['Accessibility', 'Accessible'], ['WCAG'],
  ['Jest'], ['Cypress'], ['Playwright'], ['React Testing Library'], ['Vercel'], ['CI/CD'],
  ['Cross-browser compatibility', 'Cross-browser-compatible'], ['Problem-solving', 'Problem solving'],
  ['Debugging', 'Debug', 'Debugged'], ['Code review', 'Review code', 'Reviewing code'],
  ['Frontend architecture'], ['Mentoring', 'Mentor'],
];
function genuineAliases(label: string, _proposed: string[], _quote: string): string[] {
  const known = aliases.find((group) => group.some((term) => normalize(term) === normalize(label))) ?? [];
  // Co-occurrence in a job description does not make two skills equivalent.
  return [...new Set(known)].filter((term) => normalize(term) !== normalize(label));
}
const requirementKey = (label: string) => normalize(aliases.find((group) => group.some((term) => normalize(term) === normalize(label)))?.[0] ?? label);
export function validateAssessment(value: unknown, jd: string): Assessment | null {
  const parsed = assessmentSchema.safeParse(value);
  if (!parsed.success) return null;
  const seen = new Set<string>();
  const requirements = parsed.data.requirements.filter((r) => {
    const key = requirementKey(r.label);
    if (seen.has(key) || !normalize(jd).includes(normalize(r.sourceQuote)) || !containsTerm(r.sourceQuote, r.label)) return false;
    seen.add(key);
    return true;
  }).map((r) => ({ ...r, aliases: genuineAliases(r.label, r.aliases, r.sourceQuote) }));
  return requirements.length ? { requirements, semanticMatches: parsed.data.semanticMatches, usedAi: true } : null;
}

export function fallbackAssessment(jd: string): Assessment {
  const requirements: Requirement[] = [];
  const seen = new Set<string>();
  let heading: Requirement['priority'] = 'required';
  let skipSection = false;
  for (const clause of jd.split(/\n|[;!?]|\.(?=\s|$)/).map((s) => s.trim()).filter(Boolean)) {
    const headingText = clause.replace(/^[#*\s]+|[*:\s]+$/g, '');
    const isHeading = /^#{1,6}\s/.test(clause) || (headingText.length < 65 && /^(requirements?|required skills|qualifications?|key responsibilities|responsibilities|nice to have|preferred|what we offer|benefits|about\b|how to apply)/i.test(headingText));
    if (isHeading) {
      skipSection = /^(about\b|what we offer|benefits|how to apply|company\b|salary\b)/i.test(headingText);
      if (/prefer|nice.to.have|bonus|desirable|optional/i.test(headingText)) heading = 'preferred';
      else if (/responsibilit|duties/i.test(headingText)) heading = 'responsibility';
      else if (/require|qualification|essential/i.test(headingText)) heading = 'required';
      continue;
    }
    if (skipSection) continue;
    if (/^\**(?:company|company type|position|employment type|location|salary)\s*:/i.test(clause)) continue;
    const priority: Requirement['priority'] = /prefer|nice.to.have|bonus|desirable|optional/i.test(clause) ? 'preferred'
      : /responsibilit|you will|duties/i.test(clause) ? 'responsibility'
        : /require|must|essential|minimum/i.test(clause) ? 'required' : heading;
    if (clause.length < 65 && /:$/u.test(clause)) { heading = priority; continue; }
    const matches = aliases.filter((group) => group.some((term) => containsTerm(clause, term)));
    const constrained = /\d+\s*\+?\s*years?|degree|bachelor|master|certifi|diploma/i.test(clause);
    const labels = constrained ? [clause.slice(0, 240)] : matches.length ? matches.map((group) => group.find((term) => containsTerm(clause, term))!)
      : /require|must|experience|degree|responsib|ability|proficien|knowledge|certifi|manage|develop|design/i.test(clause) ? [clause.slice(0, 240)] : [];
    for (const label of labels) {
      const key = requirementKey(label);
      if (seen.has(key)) {
        const existing = requirements.find((r) => requirementKey(r.label) === key);
        const rank = { required: 3, responsibility: 2, preferred: 1 };
        if (existing && rank[priority] > rank[existing.priority]) { existing.priority = priority; existing.sourceQuote = clause; }
        continue;
      }
      seen.add(key);
      requirements.push({ label, priority, category: /degree|certifi|diploma|bachelor|master/i.test(label) ? 'qualification' : constrained ? 'experience' : matches.length ? 'skill' : 'responsibility', aliases: genuineAliases(label, [], clause), sourceQuote: clause });
    }
  }
  // Boilerplate and early responsibilities must not crowd out Required Skills.
  const required = requirements.filter((r) => r.priority === 'required');
  const responsibilities = requirements.filter((r) => r.priority === 'responsibility');
  const preferred = requirements.filter((r) => r.priority === 'preferred');
  return { requirements: [...required, ...responsibilities.slice(0, Math.max(0, 24 - required.length - Math.min(4, preferred.length))), ...preferred].slice(0, 24), semanticMatches: [], usedAi: false };
}

/** Merge AI precision with deterministic recall. Required items win the cap. */
export function mergeAssessments(ai: Assessment, deterministic: Assessment): Assessment {
  const rank = { required: 3, responsibility: 2, preferred: 1 };
  const merged = new Map<string, Requirement>();
  for (const requirement of [...ai.requirements, ...deterministic.requirements]) {
    const key = requirementKey(requirement.label);
    const current = merged.get(key);
    if (!current) merged.set(key, requirement);
    else if (rank[requirement.priority] > rank[current.priority]) merged.set(key, { ...current, priority: requirement.priority, sourceQuote: requirement.sourceQuote });
  }
  const requirements = [...merged.values()].sort((a, b) => rank[b.priority] - rank[a.priority]).slice(0, 24);
  const kept = new Set(requirements.map((requirement) => requirement.label));
  return { requirements, semanticMatches: ai.semanticMatches.filter((match) => kept.has(match.requirement)), usedAi: true };
}

export type Chunk = { id: string; section: string; text: string; strength: number };
export function evidenceChunks(content: Content): Chunk[] {
  const chunks: Chunk[] = [];
  const add = (id: string, section: string, value: unknown, strength: number) => {
    if (text(value).trim()) chunks.push({ id, section, text: text(value).trim(), strength });
  };
  add('summary', 'summary', content.summary ?? content.bio, 0.35);
  strings(content.skills).forEach((s, i) => add(`skills.${i}`, 'skills', s, 0.25));
  rows(content.experience).forEach((r, i) => {
    add(`experience.${i}`, 'experience', [r.role ?? r.title, r.company].filter(Boolean).join(' — '), 0.6);
    strings(r.bullets).forEach((b, j) => add(`experience.${i}.bullets.${j}`, 'experience', b, 0.9));
    add(`experience.${i}.description`, 'experience', r.description ?? r.desc, 0.85);
  });
  rows(content.projects).forEach((r, i) => {
    add(`projects.${i}`, 'projects', r.title ?? r.name, 0.6);
    add(`projects.${i}.description`, 'projects', r.description, 0.9);
    strings(r.techStack).forEach((s, j) => add(`projects.${i}.techStack.${j}`, 'projects', s, 0.65));
  });
  rows(content.education).forEach((r, i) => add(`education.${i}`, 'education', [r.degree, r.field, r.school ?? r.institution].filter(Boolean).join(' '), 0.9));
  rows(content.certifications).forEach((r, i) => add(`certifications.${i}`, 'certifications', [r.name, r.issuer].filter(Boolean).join(' '), 0.9));
  return chunks;
}
export type Template = { id?: string; htmlLayout: string; cssStyles: string; category?: string };
export function sourceHash(content: Content, jd: string, template: Template): string {
  return createHash('sha256').update(JSON.stringify({ content, jd, template, methodology: METHODOLOGY })).digest('hex');
}
const actionVerb = /^(achieved|administered|analysed|analyzed|architected|automated|built|collaborated|configured|coordinated|created|debugged|delivered|deployed|designed|developed|directed|documented|enhanced|established|executed|facilitated|implemented|improved|increased|integrated|launched|led|maintained|managed|mentored|migrated|monitored|operated|optimized|orchestrated|performed|planned|produced|refactored|reduced|resolved|reviewed|scaled|secured|streamlined|supported|tested|trained|troubleshot|updated)\b/i;
const outcomeLanguage = /\b(result(?:ed)?|leading to|which (?:reduced|increased|improved|saved|enabled)|so that|thereby|delivering|achieving)\b/i;
export const scoreWeights = { requirementCoverage: 35, evidenceStrength: 25, experienceAlignment: 15, contentQuality: 10, parsingSafety: 10, completeness: 5 };
function positiveEvidence(value: string, term: string): boolean {
  if (!containsTerm(value, term)) return false;
  const normalized = normalize(value);
  const start = normalized.indexOf(normalize(term));
  return !/\b(no|not|without|lack|lacking|never)\b/.test(normalized.slice(0, start).split(' ').slice(-5).join(' '));
}
function countTerm(value: string, term: string): number {
  const haystack = ` ${normalize(value)} `;
  const needle = ` ${normalize(term)} `;
  if (needle.trim().length < 2) return 0;
  let count = 0;
  let offset = 0;
  while ((offset = haystack.indexOf(needle, offset)) >= 0) { count += 1; offset += needle.length; }
  return count;
}
const requirementWeight = (r: Requirement) => ({ required: 3, responsibility: 2, preferred: 1 })[r.priority];
const demonstratedSections = (r: Requirement) => r.category === 'qualification'
  ? new Set(['education', 'certifications'])
  : new Set(['experience', 'projects']);
export function scoreResume(content: Content, jd: string, template: Template, assessment: Assessment) {
  const chunks = evidenceChunks(content);
  const requirements = assessment.requirements.map((r) => {
    let best: { chunk: Chunk; confidence: number; type: 'exact' | 'alias' | 'semantic' } | undefined;
    for (const chunk of chunks) {
      const index = [r.label, ...r.aliases].findIndex((term) => positiveEvidence(chunk.text, term));
      let confidence = index === 0 ? 1 : index > 0 ? 0.95 : 0;
      let type: 'exact' | 'alias' | 'semantic' = index === 0 ? 'exact' : 'alias';
      if (!confidence) {
        const candidate = assessment.semanticMatches.find((m) => m.requirement === r.label && m.sourceId === chunk.id
          && m.evidence.length >= 12 && normalize(chunk.text).includes(normalize(m.evidence)));
        if (candidate) { confidence = candidate.confidence; type = 'semantic'; }
      }
      // A demonstrated responsibility is stronger than a repeated skill keyword.
      if (confidence && (!best || confidence * chunk.strength > best.confidence * best.chunk.strength)) best = { chunk, confidence, type };
    }
    return { ...r, matched: !!best, matchType: best?.type ?? 'missing', matchConfidence: Math.round((best?.confidence ?? 0) * 100), evidenceStrength: Math.round((best?.chunk.strength ?? 0) * 100), evidenceSection: best?.chunk.section ?? null, evidence: best?.chunk.text ?? null, sourceId: best?.chunk.id ?? null };
  });
  const total = requirements.reduce((sum, r) => sum + requirementWeight(r), 0);
  const average = (fn: (r: typeof requirements[number]) => number) => total ? requirements.reduce((sum, r) => sum + fn(r) * requirementWeight(r), 0) / total : 0;
  const core = requirements.filter((r) => r.priority !== 'preferred');
  const coreTotal = core.reduce((sum, r) => sum + requirementWeight(r), 0);
  const experiences = rows(content.experience);
  const projects = rows(content.projects);
  const structuredExperience = experiences.filter((row) => Boolean(text(row.role ?? row.title) && text(row.company) && text(row.startDate ?? row.from) && (row.current === true || text(row.endDate ?? row.to)))).length;
  const experienceStructure = experiences.length ? structuredExperience / experiences.length : projects.length ? 1 : 0;
  const bullets = experiences.flatMap((r) => strings(r.bullets));
  const bulletSignals = bullets.map((bullet) => {
    const words = bullet.trim().split(/\s+/).filter(Boolean).length;
    return { action: actionVerb.test(bullet.trim()), readable: words >= 8 && words <= 35, quantified: /\d/.test(bullet), outcome: outcomeLanguage.test(bullet) };
  });
  const quality = bulletSignals.length ? bulletSignals.reduce((sum, signal) => sum
    + (signal.action ? 40 : 10) + (signal.readable ? 30 : 10) + (signal.quantified ? 15 : 0) + (signal.outcome ? 15 : 0), 0) / bulletSignals.length : 0;
  const personal = object(content.personalInfo);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(personal.email).trim());
  const validPhone = text(personal.phone).replace(/\D/g, '').length >= 7;
  const complete = ([text(personal.firstName) || text(personal.lastName), validEmail, validPhone, text(personal.location), text(content.summary ?? content.bio), experiences.length || projects.length, rows(content.education).length, strings(content.skills).length].filter(Boolean).length + experienceStructure) / 9 * 100;
  const templateText = `${template.htmlLayout} ${template.cssStyles}`;
  const parsing = Math.max(0, 100 - (/<table\b/i.test(templateText) ? 25 : 0) - (/position\s*:\s*absolute/i.test(templateText) ? 15 : 0)
    - (/\b(?:column-count|columns)\s*:/i.test(templateText) ? 10 : 0) - (/\bfloat\s*:/i.test(templateText) ? 10 : 0) - (!validEmail ? 15 : 0));
  const experienceAlignment = coreTotal ? core.reduce((sum, r) => sum + (r.matched && r.evidenceSection && demonstratedSections(r).has(r.evidenceSection) ? r.matchConfidence : 0) * requirementWeight(r), 0) / coreTotal : 0;
  const breakdown = { requirementCoverage: Math.round(average((r) => r.matchConfidence)), evidenceStrength: Math.round(average((r) => r.matchConfidence * r.evidenceStrength / 100)), experienceAlignment: Math.round(experienceAlignment), contentQuality: Math.round(quality), parsingSafety: parsing, completeness: Math.round(complete) };
  const skills = strings(content.skills);
  const duplicateSkills = skills.length - new Set(skills.map(normalize)).size;
  const resumeText = chunks.map((chunk) => chunk.text).join(' ');
  const wordCount = normalize(resumeText).split(' ').filter(Boolean).length;
  const repetitionLimit = Math.max(8, Math.ceil(wordCount / 150) * 3);
  const repeatedTerms = requirements.map((r) => ({ label: r.label, count: countTerm(resumeText, r.label) })).filter((r) => r.count > repetitionLimit);
  const keywordStuffingPenalty = Math.min(12, duplicateSkills * 2 + repeatedTerms.reduce((sum, row) => sum + Math.min(4, row.count - repetitionLimit), 0));
  const rawScore = total ? Math.round((Object.keys(scoreWeights) as Array<keyof typeof scoreWeights>).reduce((sum, key) => sum + breakdown[key] * scoreWeights[key] / 100, 0)) : 0;
  const criticalIssues: Array<{ code: string; severity: 'HIGH' | 'MEDIUM'; message: string }> = [];
  let scoreCeiling = 100;
  const jdWordCount = normalize(jd).split(' ').filter(Boolean).length;
  const thinJobDescription = jdWordCount < 40 || requirements.length < 3;
  if (!validEmail) { criticalIssues.push({ code: 'CONTACT_EMAIL', severity: 'HIGH', message: 'Add a valid email address in the contact section.' }); scoreCeiling = Math.min(scoreCeiling, 85); }
  if (!experiences.length && !projects.length) { criticalIssues.push({ code: 'NO_EVIDENCE_SECTION', severity: 'HIGH', message: 'Add truthful experience or project evidence.' }); scoreCeiling = Math.min(scoreCeiling, 70); }
  if (experiences.length && structuredExperience < experiences.length) criticalIssues.push({ code: 'EXPERIENCE_STRUCTURE', severity: 'MEDIUM', message: 'Every role needs a title, employer, start date, and end date or Present.' });
  if (thinJobDescription) criticalIssues.push({ code: 'THIN_JOB_DESCRIPTION', severity: 'MEDIUM', message: 'The job description is too short for a high-confidence requirement analysis.' });
  const required = requirements.filter((r) => r.priority === 'required');
  const hasDemonstratedRequired = required.some((r) => r.matched && r.evidenceSection && demonstratedSections(r).has(r.evidenceSection));
  if (required.length && !hasDemonstratedRequired) { criticalIssues.push({ code: 'REQUIRED_GAP', severity: 'HIGH', message: 'No required job requirement has demonstrated experience or qualification evidence.' }); scoreCeiling = Math.min(scoreCeiling, 59); }
  if (parsing < 60) { criticalIssues.push({ code: 'PARSING_RISK', severity: 'HIGH', message: 'Template layout has major ATS parsing risks.' }); scoreCeiling = Math.min(scoreCeiling, 74); }
  if (keywordStuffingPenalty) criticalIssues.push({ code: 'KEYWORD_REPETITION', severity: 'MEDIUM', message: 'Remove duplicate skills or unnatural keyword repetition.' });
  const atsScore = total ? Math.max(0, Math.min(scoreCeiling, rawScore - keywordStuffingPenalty)) : 0;
  const priorityRank = { required: 3, responsibility: 2, preferred: 1 };
  const requirementActions = requirements.filter((r) => !r.matched || r.evidenceStrength < 70 || !r.evidenceSection || !demonstratedSections(r).has(r.evidenceSection)).map((r) => {
    const share = total ? requirementWeight(r) / total : 0;
    const coverageGain = (100 - r.matchConfidence) * share * scoreWeights.requirementCoverage / 100;
    const evidenceGain = (90 - r.matchConfidence * r.evidenceStrength / 100) * share * scoreWeights.evidenceStrength / 100;
    const demonstrated = Boolean(r.evidenceSection && demonstratedSections(r).has(r.evidenceSection));
    const experienceGain = r.priority !== 'preferred' && coreTotal ? (demonstrated ? 0 : requirementWeight(r) / coreTotal * scoreWeights.experienceAlignment) : 0;
    const potentialGain = Math.max(1, Math.min(15, Math.round(coverageGain + Math.max(0, evidenceGain) + experienceGain)));
    const missing = !r.matched;
    return { section: r.category === 'qualification' ? 'Education' : 'Experience or projects', impact: r.priority === 'required' ? 'HIGH' as const : r.priority === 'responsibility' ? 'MEDIUM' as const : 'LOW' as const, issue: missing ? `Missing evidence for “${r.label}”.` : `“${r.label}” appears without strong demonstrated evidence.`, action: missing ? 'Add a truthful example only if you have this experience.' : 'Connect this requirement to a specific action, scope, and result you already achieved.', potentialGain, priority: priorityRank[r.priority] };
  }).sort((a, b) => b.priority - a.priority || b.potentialGain - a.potentialGain).map(({ priority: _priority, ...action }) => action);
  const topActions = [...requirementActions];
  if (!validEmail) topActions.unshift({ section: 'Contact', impact: 'HIGH' as const, issue: 'Email is missing or invalid.', action: 'Add a valid professional email address.', potentialGain: 2 });
  if (experiences.length && structuredExperience < experiences.length) topActions.unshift({ section: 'Experience', impact: 'MEDIUM' as const, issue: `${experiences.length - structuredExperience} role(s) have incomplete title, employer, or dates.`, action: 'Complete role metadata using a consistent month-and-year format.', potentialGain: 1 });
  if (!bullets.length) topActions.push({ section: 'Experience', impact: 'HIGH' as const, issue: 'No achievement bullets were found.', action: 'Add concise, truthful bullets describing actions and outcomes.', potentialGain: 8 });
  else if (quality < 70) topActions.push({ section: 'Experience', impact: 'MEDIUM' as const, issue: 'Several bullets lack clear action, scope, or outcome.', action: 'Use an action verb and add an existing measurable result where available.', potentialGain: Math.max(1, Math.round((100 - quality) * scoreWeights.contentQuality / 100)) });
  if (parsing < 85) topActions.push({ section: 'Template', impact: parsing < 60 ? 'HIGH' as const : 'MEDIUM' as const, issue: 'Layout may reduce text extraction reliability.', action: 'Use a single-column ATS template without tables, floats, or absolute positioning.', potentialGain: Math.max(1, Math.round((100 - parsing) * scoreWeights.parsingSafety / 100)) });
  if (keywordStuffingPenalty) topActions.unshift({ section: 'Skills and wording', impact: 'MEDIUM' as const, issue: `${keywordStuffingPenalty}-point repetition penalty applied.`, action: 'Keep each skill once and use job terms only where supported naturally.', potentialGain: keywordStuffingPenalty });
  return {
    atsScore, confidence: assessment.usedAi && !thinJobDescription ? 'MEDIUM' as const : 'LOW' as const,
    methodologyVersion: METHODOLOGY, analysisMode: assessment.usedAi ? 'FULL_HYBRID' as const : 'DETERMINISTIC_FALLBACK' as const,
    sourceHash: sourceHash(content, jd, template), breakdown, weights: scoreWeights, requirements, scoreCeiling,
    penalties: { keywordStuffing: keywordStuffingPenalty }, criticalIssues, topActions: topActions.slice(0, 8),
    qualitySignals: { bullets: bullets.length, actionLed: bulletSignals.filter((s) => s.action).length, quantified: bulletSignals.filter((s) => s.quantified).length, outcomeLed: bulletSignals.filter((s) => s.outcome).length, duplicateSkills, repeatedTerms, experienceEntries: experiences.length, structuredExperience },
    analysisQuality: { jobDescriptionWords: jdWordCount, requirementCount: requirements.length, thinJobDescription },
    matchedKeywords: requirements.filter((r) => r.matched).map((r) => r.label),
    missingKeywords: requirements.filter((r) => !r.matched).map((r) => r.label),
    suggestions: topActions.slice(0, 8).map((action) => ({ section: action.section, issue: action.issue, suggestion: action.action })),
    assessment,
    notice: total ? `${thinJobDescription ? 'Limited job description; review extracted requirements. ' : ''}Job alignment estimate, not hiring probability. Parsing safety is a layout estimate; actual file checks run during export.` : 'No reliable job requirements could be extracted. Add a more detailed job description and run again.',
  };
}

export const patchSchema = z.object({ path: z.string().regex(/^(summary|experience\.\d+\.bullets\.\d+|projects\.\d+\.description)$/), before: z.string().min(1), after: z.string().min(1).max(2000) });
export type RewritePatch = z.infer<typeof patchSchema>;
export const rewriteSchema = z.object({ patches: z.array(patchSchema).max(24) });
export const verificationSchema = z.object({ verdicts: z.array(z.object({ path: z.string(), preservesMeaning: z.boolean(), unsupportedClaims: z.array(z.string()), supported: z.boolean() })).max(24) });
export function readPatch(content: Content, path: string): string {
  return text(path.split('.').reduce<unknown>((value, key) => object(value)[key] ?? (Array.isArray(value) ? value[Number(key)] : undefined), content));
}
const quantities = (s: string) => s.match(/(?:[$€£৳]\s*)?\d+(?:[,.]\d+)*(?:\s*(?:%|percent|million|billion|thousand|k\b|m\b))?/gi)?.map((v) => v.toLowerCase().replace(/\s+/g, '')) ?? [];
const claimStopWords = new Set(['and', 'the', 'for', 'with', 'from', 'into', 'that', 'this', 'through', 'using', 'used', 'use', 'across', 'within', 'while', 'where', 'which', 'their', 'our', 'your', 'its', 'was', 'were', 'are', 'is', 'been', 'being', 'has', 'have', 'had', 'on', 'in', 'to', 'of', 'by', 'as', 'at', 'an']);
function stripProtectedTerms(value: string, requirements: Requirement[]): string {
  let result = ` ${normalize(value)} `;
  const groups = [...aliases, ...requirements.map((requirement) => [requirement.label, ...requirement.aliases])];
  for (const terms of groups) {
    for (const term of [...terms].sort((a, b) => normalize(b).length - normalize(a).length)) {
      const normalized = normalize(term);
      if (normalized) result = result.split(` ${normalized} `).join(' __term__ ');
    }
  }
  return result;
}
function claimTokens(value: string, requirements: Requirement[]): string[] {
  return stripProtectedTerms(value, requirements).split(' ').filter((token) => token === '__term__' || (token.length >= 3 && !claimStopWords.has(token) && !/^\d/.test(token)));
}
function isSubsequence(candidate: string[], source: string[]): boolean {
  let cursor = 0;
  for (const token of candidate) {
    const found = source.indexOf(token, cursor);
    if (found < 0) return false;
    cursor = found + 1;
  }
  return true;
}
function conservativeTextRewrite(before: string, requirements: Requirement[]): string {
  let after = before
    .replace(/^Participated in remote collaboration with\s+/i, 'Collaborated remotely with ')
    .replace(/^(?:Was )?Responsible for maintaining\s+/i, 'Maintained ')
    .replace(/^(?:Was )?Responsible for testing\s+/i, 'Tested ')
    .replace(/^(?:Was )?Responsible for managing\s+/i, 'Managed ')
    .replace(/^(?:Was )?Responsible for designing\s+/i, 'Designed ')
    .replace(/\bCross-browser-compatible issues\b/g, 'cross-browser compatibility issues');
  for (const requirement of requirements) {
    const group = aliases.find((terms) => terms.some((term) => normalize(term) === normalize(requirement.label)));
    if (!group || containsTerm(after, requirement.label)) continue;
    if (!['JavaScript', 'TypeScript', 'Node.js', 'React', 'PostgreSQL', 'Amazon Web Services', 'Google Cloud Platform', 'Kubernetes', 'Next.js'].includes(group[0]!)) continue;
    for (const alias of group) {
      if (normalize(alias) === normalize(requirement.label)) continue;
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      after = after.replace(new RegExp(`(^|[^\\p{L}\\p{N}+#.])${escaped}(?=$|[^\\p{L}\\p{N}+#.])`, 'giu'), (_match, prefix: string) => prefix + requirement.label);
    }
  }
  return after;
}
export function safePatches(content: Content, proposed: unknown, requirements: Requirement[]): RewritePatch[] {
  const parsed = rewriteSchema.safeParse(proposed);
  if (!parsed.success) return [];
  const seen = new Set<string>();
  return parsed.data.patches.filter((p) => {
    if (seen.has(p.path) || readPatch(content, p.path) !== p.before || p.before === p.after) return false;
    seen.add(p.path);
    if (p.after.length > Math.max(p.before.length * 2, 240)) return false;
    // A metric from another job or bullet is not evidence for this claim.
    if (JSON.stringify(quantities(p.before)) !== JSON.stringify(quantities(p.after))) return false;
    const qualifiers = p.before.toLowerCase().match(/\b(no|not|never|without|assisted|assisting|helped|helping|learning|basic|familiar)\b/g) ?? [];
    if (qualifiers.some((word) => !new RegExp(`\\b${word}\\b`, 'i').test(p.after))) return false;
    const protectedTerms = [...aliases, ...requirements.map((r) => [r.label, ...r.aliases])];
    if (protectedTerms.some((group) => group.some((s) => containsTerm(p.after, s)) && !group.some((s) => containsTerm(p.before, s)))) return false;
    const allowed = claimTokens(conservativeTextRewrite(p.before, requirements), requirements);
    if (!isSubsequence(claimTokens(p.after, requirements), allowed)) return false;
    return true;
  });
}
export function applyVerifiedPatches(content: Content, patches: RewritePatch[], verification: unknown) {
  const parsed = verificationSchema.safeParse(verification);
  const accepted = parsed.success ? patches.filter((p) => {
    const verdicts = parsed.data.verdicts.filter((v) => v.path === p.path);
    return verdicts.length === 1 && verdicts[0]!.supported && verdicts[0]!.preservesMeaning && !verdicts[0]!.unsupportedClaims.length;
  }) : [];
  const result = structuredClone(content);
  for (const p of accepted) {
    const keys = p.path.split('.');
    let current: any = result;
    for (const key of keys.slice(0, -1)) current = current[key];
    current[keys.at(-1)!] = p.after;
  }
  return { content: result, accepted };
}
export function carryEvidence(assessment: Assessment, patches: RewritePatch[]): Assessment {
  return { ...assessment, semanticMatches: assessment.semanticMatches.filter((match) => {
    const patch = patches.find((p) => p.path === match.sourceId && normalize(p.before).includes(normalize(match.evidence)));
    return !patch || normalize(patch.after).includes(normalize(match.evidence));
  }) };
}

/** Closed, meaning-preserving substitutions; no model, new claim or metric. */
export function conservativeRewrite(content: Content, requirements: Requirement[]) {
  const proposed: RewritePatch[] = [];
  for (const chunk of evidenceChunks(content)) {
    if (!/^(experience\.\d+\.bullets\.\d+|projects\.\d+\.description)$/.test(chunk.id)) continue;
    const before = readPatch(content, chunk.id);
    const after = conservativeTextRewrite(before, requirements);
    if (after !== before) proposed.push({ path: chunk.id, before, after });
  }
  const accepted = safePatches(content, { patches: proposed.slice(0, 24) }, requirements);
  const result = structuredClone(content);
  for (const p of accepted) {
    const [section, index, field, bullet] = p.path.split('.');
    const row = rows(result[section!])[Number(index)];
    if (!row) continue;
    if (field === 'bullets') (row.bullets as string[])[Number(bullet)] = p.after;
    else row[field!] = p.after;
  }
  return { content: result, accepted };
}
