import { createHash } from 'node:crypto';

export const SCORING_VERSION = 'evidence-lexical-v1';
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const trustedEvidence = (status: string) => ['VERIFIED', 'USER_CONFIRMED'].includes(status);
export function flattenText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(flattenText).join('\n');
  if (value && typeof value === 'object') return Object.values(value).map(flattenText).join('\n');
  return '';
}
const tokens = (text: string) => [...new Set(text.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) ?? [])]
  .filter(word => !['the', 'and', 'with', 'for', 'you', 'your', 'our', 'are', 'will', 'have', 'that', 'this', 'from', 'work', 'must', 'required', 'experience'].includes(word));

// This transparent baseline intentionally makes no semantic or hiring-probability claim.
export function analyzeAlignment(description: string, resume: unknown, evidence: Array<{ id: string; statement: string; status: string }>, freshness: string, inputLabel = "resume") {
  const resumeText = flattenText(resume);
  const sentences = resumeText.split(/\n|(?<=[.!?])\s+/).filter(Boolean);
  const requirements = description.split(/\n|(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 15 && /required|must|experience|proficien|knowledge|ability|skill|familiar/i.test(s))
    .filter(s => !/\b(age|gender|race|religion|ethnicity|nationality|marital|disability|pregnan\w*|male|female)\b/i.test(s)).slice(0, 24);
  const rows = requirements.map(requirement => {
    const terms = tokens(requirement);
    const sources = [ ...sentences.map((statement, index) => ({ id: `${inputLabel}:${index + 1}`, statement })),
      ...evidence.filter(e => trustedEvidence(e.status)).map(e => ({ id: `evidence:${e.id}`, statement: e.statement })) ];
    const ranked = sources.map(source => ({ ...source, matched: terms.filter(t => tokens(source.statement).includes(t)) })).sort((a, b) => b.matched.length - a.matched.length);
    const best = ranked[0];
    const coverage = terms.length && best ? best.matched.length / terms.length : 0;
    return { requirement, status: coverage >= .65 ? 'strong' : coverage > 0 ? 'uncertain' : 'missing',
      coverage: Math.round(coverage * 100), citation: best?.matched.length ? { source: best.id, quote: best.statement } : null };
  });
  const wordCount = resumeText.split(/\s+/).filter(Boolean).length;
  const score = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.coverage, 0) / rows.length) : null;
  return { version: SCORING_VERSION, method: 'Lexical evidence coverage', score, confidence: 'limited',
    disclaimer: 'Keyword overlap is a review aid, not hiring probability or a verified assessment of competence.',
    requirements: rows, breakdown: { requirementCoverage: score, measurableImpact: /\d+(%|\s*(users|hours|days|projects|customers))/i.test(resumeText) ? 'Numeric evidence present; verify it' : 'No explicit metric found',
      structure: /experience|education|skills/i.test(resumeText) ? 'Common section labels found' : 'Review section labels',
      readability: wordCount >= 100 && wordCount <= 1200 ? 'Within common length range' : 'Review document length',
      experienceAlignment: 'Dates, seniority and depth require human review', keywordCoverage: score },
    risks: [ ...(rows.length ? [] : ['No explicit requirements extracted; paste clear requirement statements.']),
      ...(freshness === 'recent' ? [] : ['Job availability is unverified or stale.']),
      ...(evidence.some(e => !trustedEvidence(e.status)) ? ['Unconfirmed evidence excluded.'] : []) ],
    analyzedAt: new Date().toISOString() };
}

export function composeDraft(input: { kind: string; tone: string; length: string; title: string; company: string; recipientName?: string | undefined }, claims: Array<{ id: string; statement: string; source: string }>) {
  const greeting = input.recipientName ? `Hello ${input.recipientName},` : 'Hello hiring team,';
  const openings: Record<string, string> = {
    APPLICATION: `I am applying for the ${input.title} role at ${input.company}.`,
    OUTREACH: `I would like to learn more about the ${input.title} opportunity at ${input.company}.`,
    FOLLOW_UP: `I am following up about the ${input.title} role at ${input.company}. Could you share an update on the process?`,
    THANK_YOU: `Thank you for your time discussing the ${input.title} role at ${input.company}.`,
    REFERRAL: `Would you be comfortable discussing a referral for the ${input.title} role at ${input.company}?`,
    COVER_LETTER: `I am interested in contributing to ${input.company} as a ${input.title}.`,
  };
  const selected = claims.slice(0, input.length === 'short' ? 1 : 3);
  const closing = input.tone === 'warm' ? 'I would welcome the chance to connect. Thank you for considering my note.' : input.tone === 'confident' ? 'I would welcome a conversation about how this experience fits the role.' : 'Thank you for your consideration.';
  return { subjects: [`${input.title} — application`, `${input.title} at ${input.company}`, `Regarding the ${input.title} opportunity`],
    body: [greeting, openings[input.kind] ?? openings.APPLICATION, ...selected.map(e => e.statement), closing].join('\n\n'),
    claims: selected.map(e => ({ evidenceId: e.id, quote: e.statement, source: e.source })),
    missingQuestions: selected.length ? [] : ['Which relevant project or responsibility can you confirm? A metric is optional.'] };
}

export const ENTITLEMENTS = {
  free: { alignment: 3, draft: 5, tailor: 2, applications: 15, recommendations: 10, interview: 0 },
  pro: { alignment: 50, draft: 50, tailor: 20, applications: null, recommendations: 100, interview: 20 },
  'career-plus': { alignment: 150, draft: 150, tailor: 60, applications: null, recommendations: 300, interview: 60 },
} as const;

export function composeStory(evidence: { id: string; title: string; statement: string; status: string; source: string; details: unknown }) {
  if (!trustedEvidence(evidence.status)) throw new Error('Only confirmed evidence can become a story.');
  const details = evidence.details && typeof evidence.details === 'object' ? evidence.details as Record<string, unknown> : {};
  const questions: Record<string, string> = { situation: 'What was happening when this project began?', task: 'What were you personally responsible for?', action: 'What did you personally do?', result: 'What outcome can you confirm? A metric is optional.' };
  const sections = ['situation', 'task', 'action', 'result'].map(section => {
    const value = details[section];
    const text = typeof value === 'string' && value.trim() ? value.trim() : section === 'action' ? evidence.statement : null;
    return { section, text, question: text ? null : questions[section]!, citation: text ? { evidenceId: evidence.id, quote: text, source: evidence.source } : null };
  });
  return { title: evidence.title, sections, body: sections.map(s => `${s.section.toUpperCase()}\n${s.text ?? `[To confirm: ${s.question}]`}`).join('\n\n'), claims: sections.flatMap(s => s.citation ? [s.citation] : []) };
}
