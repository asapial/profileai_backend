import type { HarnessPreferences } from './harness.schema';

type JobLike = {
  id: string;
  title: string;
  company: string;
  description: string;
  location: string | null;
  workplaceType: string;
  employmentType: string | null;
  salaryMin: { toNumber(): number } | number | null;
  salaryCurrency: string | null;
  publishedAt: Date | null;
  lastVerifiedAt: Date | null;
  lifecycle: string;
};

const words = (value: string) => new Set(value.toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean));
const includesPhrase = (haystack: string, needle: string) => haystack.toLowerCase().includes(needle.toLowerCase());
export const companyNeedsVerification = (company: string) => !company.trim() || /^unknown company$/i.test(company.trim());

const editDistance = (left: string, right: string) => {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const saved = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[right.length]!;
};

const roleMatches = (title: string, role: string) => {
  const titleWords = [...words(title)];
  const roleWords = [...words(role.replace(/\b(frontend|backend|fullstack)devloper\b/gi, '$1 developer'))];
  return roleWords.every(expected => titleWords.some(actual => actual === expected || (expected.length >= 6 && actual.length >= 6 && editDistance(actual, expected) <= 1)));
};

export function evaluateCandidate(job: JobLike, preferences: HarnessPreferences) {
  const text = `${job.title} ${job.description}`;
  const corpus = words(text);
  const reasons: Array<{ rule: string; outcome: 'MATCH' | 'RISK'; detail: string }> = [];
  const missing: string[] = [];
  let score = 45;

  const roleMatch = preferences.roles.length === 0 || preferences.roles.some(role => {
    if (roleMatches(job.title, role)) return true;
    const roleTerms = [...words(role.replace(/\b(frontend|backend|fullstack)devloper\b/gi, '$1 developer'))];
    const occupation = roleTerms.find(term => ['developer', 'engineer', 'designer', 'manager', 'analyst', 'writer'].includes(term));
    return Boolean(occupation && words(job.title).has(occupation) && preferences.requiredSkills.some(skill => includesPhrase(text, skill)));
  });
  if (roleMatch) { score += 18; reasons.push({ rule: 'role', outcome: 'MATCH', detail: 'Role matches saved targets.' }); }
  else { score -= 20; missing.push('Desired role'); }

  const requiredMatches = preferences.requiredSkills.filter(skill => [...words(skill)].every(token => corpus.has(token)));
  if (preferences.requiredSkills.length) {
    const coverage = requiredMatches.length / preferences.requiredSkills.length;
    score += Math.round(coverage * 22);
    if (coverage < 0.7) missing.push(...preferences.requiredSkills.filter(skill => !requiredMatches.includes(skill)).map(skill => `Required skill: ${skill}`));
    reasons.push({ rule: 'required-skills', outcome: coverage >= 0.7 ? 'MATCH' : 'RISK', detail: `${requiredMatches.length}/${preferences.requiredSkills.length} required skills found.` });
  }

  const optionalMatches = preferences.optionalSkills.filter(skill => includesPhrase(text, skill));
  score += Math.min(8, optionalMatches.length * 2);
  if (optionalMatches.length) reasons.push({ rule: 'optional-skills', outcome: 'MATCH', detail: `${optionalMatches.length} preferred skills found.` });

  const excluded = preferences.excludedSkills.find(skill => includesPhrase(text, skill));
  if (excluded) { score -= 25; reasons.push({ rule: 'excluded-skill', outcome: 'RISK', detail: `Excluded skill found: ${excluded}.` }); }

  if (preferences.excludedCompanies.some(company => includesPhrase(job.company, company))) {
    score = 0; missing.push('Company is excluded');
  }
  const companyUnknown = companyNeedsVerification(job.company);
  if (companyUnknown) {
    missing.push('Company name needs verification');
    reasons.push({ rule: 'company', outcome: 'RISK', detail: 'The listing does not identify the employer.' });
  }

  if (preferences.workplace !== 'ANY' && job.workplaceType !== preferences.workplace) {
    score -= 18; missing.push(`Workplace must be ${preferences.workplace.toLowerCase()}`);
  } else if (preferences.workplace !== 'ANY') {
    score += 7; reasons.push({ rule: 'workplace', outcome: 'MATCH', detail: `Workplace is ${job.workplaceType.toLowerCase()}.` });
  }

  if (preferences.allowedCountries.length && !preferences.allowedCountries.some(country => country.toLowerCase() === 'worldwide') && job.location && !preferences.allowedCountries.some(country => includesPhrase(job.location!, country))) {
    score -= 25; missing.push('Country eligibility needs review');
  }

  if (preferences.minimumSalary !== null && job.salaryMin !== null && job.salaryCurrency === preferences.salaryCurrency) {
    const salary = typeof job.salaryMin === 'number' ? job.salaryMin : job.salaryMin.toNumber();
    if (salary < preferences.minimumSalary) { score -= 20; missing.push('Salary is below minimum'); }
    else { score += 5; reasons.push({ rule: 'salary', outcome: 'MATCH', detail: 'Published salary meets minimum.' }); }
  }

  const ageAnchor = job.publishedAt ?? job.lastVerifiedAt;
  if (ageAnchor && Date.now() - ageAnchor.getTime() > preferences.maximumJobAgeDays * 86_400_000) {
    score -= 15; missing.push('Listing is older than preference');
  }

  if (job.lifecycle !== 'ACTIVE') { score -= 30; missing.push(`Listing state: ${job.lifecycle}`); }
  score = Math.max(0, Math.min(100, score));

  const hardBlock = missing.includes('Company is excluded') || job.lifecycle === 'EXPIRED' || job.lifecycle === 'REMOVED';
  const decision = hardBlock || score < preferences.autoSaveThreshold
    ? 'NOT_ELIGIBLE'
    : score >= preferences.minimumMatchScore && !companyUnknown
      ? 'ELIGIBLE'
      : 'REVIEW_REQUIRED';

  return { score, decision, reasons, missing };
}

export function canAutoSubmit(input: {
  mode: string;
  score: number;
  hostname: string;
  unknownFields: string[];
  hasSensitiveQuestion: boolean;
  preferences: HarnessPreferences;
}) {
  const { preferences } = input;
  return input.mode === 'AUTO_APPLY'
    && !preferences.requireApprovalBeforeSubmit
    && input.score >= preferences.autoApplyThreshold
    && preferences.allowedAutoApplyDomains.some(domain => input.hostname === domain || input.hostname.endsWith(`.${domain}`))
    && input.unknownFields.length === 0
    && !input.hasSensitiveQuestion;
}
