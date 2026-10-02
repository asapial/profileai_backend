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

export function composeDraft(input: { kind: string; tone: string; length: string; targetCharacters?: number; title: string; company: string; recipientName?: string | undefined }, claims: Array<{ id: string; statement: string; source: string }>) {
  const greeting = input.recipientName ? `Hello ${input.recipientName},` : 'Hello hiring team,';
  const openings: Record<string, string> = {
    APPLICATION: `I am writing to express my interest in the ${input.title} position at ${input.company}. The role stands out as an opportunity to contribute relevant, hands-on experience while continuing to grow with a thoughtful team.`,
    OUTREACH: `I am reaching out because I am interested in the ${input.title} opportunity at ${input.company}. I would value the chance to learn more about the team’s priorities and the problems this role is expected to solve.`,
    FOLLOW_UP: `I wanted to follow up regarding the ${input.title} opportunity at ${input.company}. I remain genuinely interested in the role and in the possibility of contributing to the team.`,
    THANK_YOU: `Thank you for taking the time to speak with me about the ${input.title} role at ${input.company}. I appreciated the conversation and the opportunity to better understand the position and the team’s goals.`,
    REFERRAL: `I am exploring the ${input.title} opportunity at ${input.company} and wanted to ask for your perspective. The position appears closely connected to the kind of work I am interested in continuing.`,
    COVER_LETTER: `I am pleased to submit my interest in the ${input.title} position at ${input.company}. I am drawn to the opportunity to apply relevant experience in a role where careful execution, collaboration, and measurable contribution matter.`,
  };
  const targetCharacters = input.targetCharacters ?? (input.length === 'short' ? 900 : 1600);
  const evidenceLimit = targetCharacters <= 1000 ? 2 : targetCharacters <= 2200 ? 4 : 6;
  const selected = claims.slice(0, evidenceLimit);
  const evidenceParagraph = selected.length
    ? `My background offers concrete experience relevant to this work. ${selected.map((e, index) => `${index === 0 ? 'For example' : index === selected.length - 1 ? 'Additionally' : 'I also'}: ${e.statement}`).join(' ')}`
    : `My background has prepared me to approach this opportunity with care, curiosity, and a strong sense of ownership. I would be glad to discuss the most relevant examples from my experience in a conversation.`;
  const intent: Record<string, string> = {
    APPLICATION: `I would bring this experience to ${input.company} with a focus on understanding the team’s needs, communicating clearly, and delivering dependable work. The position aligns well with the direction in which I would like to continue developing my career.`,
    OUTREACH: `I am particularly interested in how the team defines success for this position and which priorities would need attention first. Any context you can share about the role or the hiring process would be greatly appreciated.`,
    FOLLOW_UP: `The opportunity continues to align with my experience and career direction. If there is any additional information I can provide to support the team’s review, I would be happy to send it.`,
    THANK_YOU: `Our discussion reinforced my interest in the opportunity. I would be excited to bring my experience to the team and contribute with the same care and accountability reflected in my previous work.`,
    REFERRAL: `If you believe my background may be relevant, I would appreciate any insight you can offer about the team or the role. If appropriate, I would also be grateful for your guidance on the best way to introduce my application.`,
    COVER_LETTER: `I would bring this experience to ${input.company} with a practical, collaborative approach and a commitment to producing work the team can rely on. I am especially interested in contributing where the role’s needs and my confirmed experience overlap.`,
  };
  const closing = input.tone === 'warm' ? 'I would be glad to share more context and learn more about the team’s needs. Thank you for your time and consideration—I hope we have the opportunity to connect.\n\nBest regards,' : input.tone === 'confident' ? 'I would welcome a conversation about how this experience can support the team’s goals and would be happy to provide any additional information. Thank you for your consideration.\n\nBest regards,' : 'I would appreciate the opportunity to discuss how my experience aligns with the role and to learn more about the team’s priorities. Thank you for your time and consideration.\n\nSincerely,';
  return { subjects: [`${input.title} — application`, `${input.title} at ${input.company}`, `Regarding the ${input.title} opportunity`],
    body: [greeting, openings[input.kind] ?? openings.APPLICATION, evidenceParagraph, intent[input.kind] ?? intent.APPLICATION, closing].join('\n\n'),
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
