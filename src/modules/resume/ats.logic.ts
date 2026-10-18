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
export const METHODOLOGY = 'evidence-v2.2';
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
export const scoreWeights = { requirementCoverage: 40, evidenceStrength: 30, contentQuality: 15, parsingSafety: 10, completeness: 5 };
function positiveEvidence(value: string, term: string): boolean {
  if (!containsTerm(value, term)) return false;
  const normalized = normalize(value);
  const start = normalized.indexOf(normalize(term));
  return !/\b(no|not|without|lack|lacking|never)\b/.test(normalized.slice(0, start).split(' ').slice(-5).join(' '));
}
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
  const weight = (r: Requirement) => ({ required: 3, responsibility: 2, preferred: 1 })[r.priority];
  const total = requirements.reduce((sum, r) => sum + weight(r), 0);
  const average = (fn: (r: typeof requirements[number]) => number) => total ? requirements.reduce((sum, r) => sum + fn(r) * weight(r), 0) / total : 0;
  const bullets = rows(content.experience).flatMap((r) => strings(r.bullets));
  const quality = bullets.length ? bullets.reduce((sum, b) => sum + (actionVerb.test(b.trim()) ? 55 : 20) + (b.split(/\s+/).length >= 8 && b.split(/\s+/).length <= 45 ? 30 : 10) + (/\d/.test(b) ? 15 : 0), 0) / bullets.length : 0;
  const personal = object(content.personalInfo);
  const complete = [text(personal.firstName) || text(personal.lastName), text(personal.email), text(content.summary ?? content.bio), rows(content.experience).length || rows(content.projects).length, rows(content.education).length, strings(content.skills).length].filter(Boolean).length / 6 * 100;
  const templateText = `${template.htmlLayout} ${template.cssStyles}`;
  const parsing = Math.max(0, 100 - (/<table\b/i.test(templateText) ? 20 : 0) - (/position\s*:\s*absolute/i.test(templateText) ? 10 : 0) - (!personal.email ? 15 : 0));
  const breakdown = { requirementCoverage: Math.round(average((r) => r.matchConfidence)), evidenceStrength: Math.round(average((r) => r.matchConfidence * r.evidenceStrength / 100)), contentQuality: Math.round(quality), parsingSafety: parsing, completeness: Math.round(complete) };
  const atsScore = total ? Math.round((Object.keys(scoreWeights) as Array<keyof typeof scoreWeights>).reduce((sum, key) => sum + breakdown[key] * scoreWeights[key] / 100, 0)) : 0;
  return {
    atsScore, confidence: assessment.usedAi ? 'MEDIUM' as const : 'LOW' as const,
    methodologyVersion: METHODOLOGY, analysisMode: assessment.usedAi ? 'FULL_HYBRID' as const : 'DETERMINISTIC_FALLBACK' as const,
    sourceHash: sourceHash(content, jd, template), breakdown, weights: scoreWeights, requirements,
    matchedKeywords: requirements.filter((r) => r.matched).map((r) => r.label),
    missingKeywords: requirements.filter((r) => !r.matched).map((r) => r.label),
    suggestions: requirements.filter((r) => !r.matched || r.evidenceStrength < 60).slice(0, 10).map((r) => ({ section: r.category === 'qualification' ? 'Education' : 'Experience', issue: r.matched ? `“${r.label}” has limited supporting evidence.` : `No evidence found for “${r.label}”.`, suggestion: 'Add a specific, truthful experience or project example. Do not add qualifications you do not have.' })),
    assessment,
    notice: total ? 'Job alignment estimate, not hiring probability. Parsing safety is a layout estimate; actual file checks run during export.' : 'No reliable job requirements could be extracted. Add a more detailed job description and run again.',
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
export function safePatches(content: Content, proposed: unknown, requirements: Requirement[]): RewritePatch[] {
  const parsed = rewriteSchema.safeParse(proposed);
  if (!parsed.success) return [];
  const seen = new Set<string>();
  return parsed.data.patches.filter((p) => {
    if (seen.has(p.path) || readPatch(content, p.path) !== p.before || p.before === p.after) return false;
    seen.add(p.path);
    if (p.after.length > Math.max(p.before.length * 2, 240)) return false;
    // A metric from another job or bullet is not evidence for this claim.
    if (JSON.stringify(quantities(p.before).sort()) !== JSON.stringify(quantities(p.after).sort())) return false;
    const qualifiers = p.before.toLowerCase().match(/\b(no|not|never|without|assisted|assisting|helped|helping|learning|basic|familiar)\b/g) ?? [];
    if (qualifiers.some((word) => !new RegExp(`\\b${word}\\b`, 'i').test(p.after))) return false;
    const protectedTerms = [...aliases, ...requirements.map((r) => [r.label, ...r.aliases])];
    if (protectedTerms.some((group) => group.some((s) => containsTerm(p.after, s)) && !group.some((s) => containsTerm(p.before, s)))) return false;
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
  return { ...assessment, semanticMatches: assessment.semanticMatches.map((match) => {
    const patch = patches.find((p) => p.path === match.sourceId && normalize(p.before).includes(normalize(match.evidence)));
    return patch ? { ...match, evidence: patch.after } : match;
  }) };
}

/** Closed, meaning-preserving substitutions; no model, new claim or metric. */
export function conservativeRewrite(content: Content, requirements: Requirement[]) {
  const proposed: RewritePatch[] = [];
  for (const chunk of evidenceChunks(content)) {
    if (!/^(experience\.\d+\.bullets\.\d+|projects\.\d+\.description)$/.test(chunk.id)) continue;
    const before = readPatch(content, chunk.id);
    let after = before
      .replace(/^Participated in remote collaboration with\s+/i, 'Collaborated remotely with ')
      .replace(/^(?:Was )?Responsible for maintaining\s+/i, 'Maintained ')
      .replace(/^(?:Was )?Responsible for testing\s+/i, 'Tested ')
      .replace(/^(?:Was )?Responsible for managing\s+/i, 'Managed ')
      .replace(/^(?:Was )?Responsible for designing\s+/i, 'Designed ');
    after = after.replace(/\bCross-browser-compatible issues\b/g, 'cross-browser compatibility issues');
    for (const requirement of requirements) {
      const group = aliases.find((terms) => terms.some((term) => normalize(term) === normalize(requirement.label)));
      if (!group || containsTerm(after, requirement.label)) continue;
      // Matching aliases include noun/verb forms and version families; those
      // are not interchangeable in prose. Only normalize unambiguous names.
      if (!['JavaScript', 'TypeScript', 'Node.js', 'React', 'PostgreSQL', 'Amazon Web Services', 'Google Cloud Platform', 'Kubernetes', 'Next.js'].includes(group[0]!)) continue;
      for (const alias of group) {
        if (normalize(alias) === normalize(requirement.label)) continue;
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        after = after.replace(new RegExp(`(^|[^\\p{L}\\p{N}+#.])${escaped}(?=$|[^\\p{L}\\p{N}+#.])`, 'giu'), (_match, prefix: string) => prefix + requirement.label);
      }
    }
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
