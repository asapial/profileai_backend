import {
  AppError_default,
  prisma
} from "./chunk-AQ3QEWOG.js";

// src/modules/career/career.integrations.ts
import { randomBytes as randomBytes2, createHash as createHash3 } from "crypto";
import { z } from "zod";

// src/modules/career/career.crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
function key() {
  const value = process.env.CAREER_TOKEN_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error("CAREER_TOKEN_KEY must contain 32 random bytes encoded as hex.");
  return Buffer.from(value, "hex");
}
function encryptToken(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), encrypted.toString("hex")].join(".");
}
function decryptToken(value) {
  const [iv, tag, data] = value.split(".");
  if (!iv || !tag || !data) throw new Error("Invalid encrypted token");
  const cipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "hex"));
  cipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([cipher.update(Buffer.from(data, "hex")), cipher.final()]).toString("utf8");
}

// src/modules/career/career.logic.ts
import { createHash } from "crypto";
var SCORING_VERSION = "evidence-lexical-v1";
var digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
var trustedEvidence = (status) => ["VERIFIED", "USER_CONFIRMED"].includes(status);
function flattenText(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(flattenText).join("\n");
  if (value && typeof value === "object") return Object.values(value).map(flattenText).join("\n");
  return "";
}
var tokens = (text) => [...new Set(text.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) ?? [])].filter((word) => !["the", "and", "with", "for", "you", "your", "our", "are", "will", "have", "that", "this", "from", "work", "must", "required", "experience"].includes(word));
function analyzeAlignment(description, resume, evidence, freshness, inputLabel = "resume") {
  const resumeText = flattenText(resume);
  const sentences = resumeText.split(/\n|(?<=[.!?])\s+/).filter(Boolean);
  const requirements = description.split(/\n|(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 15 && /required|must|experience|proficien|knowledge|ability|skill|familiar/i.test(s)).filter((s) => !/\b(age|gender|race|religion|ethnicity|nationality|marital|disability|pregnan\w*|male|female)\b/i.test(s)).slice(0, 24);
  const rows = requirements.map((requirement) => {
    const terms = tokens(requirement);
    const sources = [
      ...sentences.map((statement, index) => ({ id: `${inputLabel}:${index + 1}`, statement })),
      ...evidence.filter((e) => trustedEvidence(e.status)).map((e) => ({ id: `evidence:${e.id}`, statement: e.statement }))
    ];
    const ranked = sources.map((source) => ({ ...source, matched: terms.filter((t) => tokens(source.statement).includes(t)) })).sort((a, b) => b.matched.length - a.matched.length);
    const best = ranked[0];
    const coverage = terms.length && best ? best.matched.length / terms.length : 0;
    return {
      requirement,
      status: coverage >= 0.65 ? "strong" : coverage > 0 ? "uncertain" : "missing",
      coverage: Math.round(coverage * 100),
      citation: best?.matched.length ? { source: best.id, quote: best.statement } : null
    };
  });
  const wordCount = resumeText.split(/\s+/).filter(Boolean).length;
  const score = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.coverage, 0) / rows.length) : null;
  return {
    version: SCORING_VERSION,
    method: "Lexical evidence coverage",
    score,
    confidence: "limited",
    disclaimer: "Keyword overlap is a review aid, not hiring probability or a verified assessment of competence.",
    requirements: rows,
    breakdown: {
      requirementCoverage: score,
      measurableImpact: /\d+(%|\s*(users|hours|days|projects|customers))/i.test(resumeText) ? "Numeric evidence present; verify it" : "No explicit metric found",
      structure: /experience|education|skills/i.test(resumeText) ? "Common section labels found" : "Review section labels",
      readability: wordCount >= 100 && wordCount <= 1200 ? "Within common length range" : "Review document length",
      experienceAlignment: "Dates, seniority and depth require human review",
      keywordCoverage: score
    },
    risks: [
      ...rows.length ? [] : ["No explicit requirements extracted; paste clear requirement statements."],
      ...freshness === "recent" ? [] : ["Job availability is unverified or stale."],
      ...evidence.some((e) => !trustedEvidence(e.status)) ? ["Unconfirmed evidence excluded."] : []
    ],
    analyzedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function composeDraft(input, claims) {
  const greeting = input.recipientName ? `Hello ${input.recipientName},` : "Hello hiring team,";
  const openings = {
    APPLICATION: `I am applying for the ${input.title} role at ${input.company}.`,
    OUTREACH: `I would like to learn more about the ${input.title} opportunity at ${input.company}.`,
    FOLLOW_UP: `I am following up about the ${input.title} role at ${input.company}. Could you share an update on the process?`,
    THANK_YOU: `Thank you for your time discussing the ${input.title} role at ${input.company}.`,
    REFERRAL: `Would you be comfortable discussing a referral for the ${input.title} role at ${input.company}?`,
    COVER_LETTER: `I am interested in contributing to ${input.company} as a ${input.title}.`
  };
  const selected = claims.slice(0, input.length === "short" ? 1 : 3);
  const closing = input.tone === "warm" ? "I would welcome the chance to connect. Thank you for considering my note." : input.tone === "confident" ? "I would welcome a conversation about how this experience fits the role." : "Thank you for your consideration.";
  return {
    subjects: [`${input.title} \u2014 application`, `${input.title} at ${input.company}`, `Regarding the ${input.title} opportunity`],
    body: [greeting, openings[input.kind] ?? openings.APPLICATION, ...selected.map((e) => e.statement), closing].join("\n\n"),
    claims: selected.map((e) => ({ evidenceId: e.id, quote: e.statement, source: e.source })),
    missingQuestions: selected.length ? [] : ["Which relevant project or responsibility can you confirm? A metric is optional."]
  };
}
var ENTITLEMENTS = {
  free: { alignment: 3, draft: 5, tailor: 2, applications: 15, recommendations: 10, interview: 0 },
  pro: { alignment: 50, draft: 50, tailor: 20, applications: null, recommendations: 100, interview: 20 },
  "career-plus": { alignment: 150, draft: 150, tailor: 60, applications: null, recommendations: 300, interview: 60 }
};
function composeStory(evidence) {
  if (!trustedEvidence(evidence.status)) throw new Error("Only confirmed evidence can become a story.");
  const details = evidence.details && typeof evidence.details === "object" ? evidence.details : {};
  const questions = { situation: "What was happening when this project began?", task: "What were you personally responsible for?", action: "What did you personally do?", result: "What outcome can you confirm? A metric is optional." };
  const sections = ["situation", "task", "action", "result"].map((section) => {
    const value = details[section];
    const text = typeof value === "string" && value.trim() ? value.trim() : section === "action" ? evidence.statement : null;
    return { section, text, question: text ? null : questions[section], citation: text ? { evidenceId: evidence.id, quote: text, source: evidence.source } : null };
  });
  return { title: evidence.title, sections, body: sections.map((s) => `${s.section.toUpperCase()}
${s.text ?? `[To confirm: ${s.question}]`}`).join("\n\n"), claims: sections.flatMap((s) => s.citation ? [s.citation] : []) };
}

// src/modules/job/job.identity.ts
import { createHash as createHash2 } from "crypto";
var normalizeText = (value) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
function normalizeJobUrl(value) {
  if (!value) return null;
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Use an HTTP or HTTPS job URL without credentials.");
  }
  url.hash = "";
  for (const key2 of [...url.searchParams.keys()]) {
    if (/^(utm_.+|fbclid|gclid|msclkid)$/i.test(key2)) url.searchParams.delete(key2);
  }
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}
var hashJob = (job) => createHash2("sha256").update(
  [job.company, job.title, job.location ?? "", job.description].map(normalizeText).join("\n")
).digest("hex");
function duplicateReason(a, b) {
  try {
    if (a.canonicalUrl && b.canonicalUrl && normalizeJobUrl(a.canonicalUrl) === normalizeJobUrl(b.canonicalUrl)) return "url";
  } catch {
  }
  return hashJob(a) === hashJob(b) ? "content" : null;
}
function jobFreshness(job, now = /* @__PURE__ */ new Date()) {
  if (job.lifecycle === "REMOVED" || job.lifecycle === "EXPIRED") return { lifecycle: job.lifecycle, freshness: "closed" };
  if (job.expiresAt && job.expiresAt <= now) return { lifecycle: "EXPIRED", freshness: "closed" };
  if (!job.lastVerifiedAt) return { lifecycle: job.lifecycle === "ACTIVE" ? "UNKNOWN" : job.lifecycle, freshness: "unverified" };
  if (now.getTime() - job.lastVerifiedAt.getTime() >= 14 * 864e5) {
    return { lifecycle: job.lifecycle === "ACTIVE" ? "POSSIBLY_EXPIRED" : job.lifecycle, freshness: "stale" };
  }
  return { lifecycle: job.lifecycle, freshness: "recent" };
}

// src/modules/career/career.service.ts
var ownerLock = (tx, userId) => tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))::text`;
async function checkApplicationQuota(tx, userId) {
  await ownerLock(tx, userId);
  const subscription = await tx.subscription.findFirst({ where: { userId, status: "ACTIVE", currentPeriodEnd: { gt: /* @__PURE__ */ new Date() }, plan: { slug: { in: ["pro", "career-plus", "business"] } } } });
  if (!subscription && await tx.jobApplication.count({ where: { userId } }) >= 15) throw new AppError_default(429, "Free plans include 15 saved applications.");
}
async function entitlements(userId, db = prisma) {
  const subscription = await db.subscription.findFirst({ where: { userId, status: "ACTIVE", currentPeriodEnd: { gt: /* @__PURE__ */ new Date() } }, include: { plan: true }, orderBy: { currentPeriodEnd: "desc" } });
  const slug = subscription?.plan.slug;
  const plan = slug === "career-plus" || slug === "business" ? "career-plus" : slug === "pro" ? "pro" : "free";
  return { plan, limits: ENTITLEMENTS[plan] };
}
async function charge(tx, userId, feature, units = 1) {
  await ownerLock(tx, userId);
  const subscription = await tx.subscription.findFirst({ where: { userId, status: "ACTIVE", currentPeriodEnd: { gt: /* @__PURE__ */ new Date() } }, include: { plan: true } });
  const slug = subscription?.plan.slug;
  const plan = slug === "career-plus" || slug === "business" ? "career-plus" : slug === "pro" ? "pro" : "free";
  const monday = /* @__PURE__ */ new Date();
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const period = feature === "recommendations" ? monday.toISOString().slice(0, 10) : (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
  const row = await tx.careerUsage.upsert({ where: { userId_feature_period: { userId, feature, period } }, create: { userId, feature, period }, update: {} });
  if (row.used + units > ENTITLEMENTS[plan][feature]) throw new AppError_default(429, `${feature} allowance reached. Review your plan and usage.`);
  await tx.careerUsage.update({ where: { id: row.id }, data: { used: { increment: units } } });
}
async function chargeRecommendations(userId, sourceId, externalIds) {
  const monday = /* @__PURE__ */ new Date();
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const period = monday.toISOString().slice(0, 10);
  const features = [...new Set(externalIds)].map((id) => `recommendation_seen:${digest({ sourceId, id })}`);
  if (!features.length) return;
  await prisma.$transaction(async (tx) => {
    await ownerLock(tx, userId);
    const seen = await tx.careerUsage.findMany({ where: { userId, period, feature: { in: features } }, select: { feature: true } });
    const unseen = features.filter((feature) => !seen.some((row) => row.feature === feature));
    if (!unseen.length) return;
    await charge(tx, userId, "recommendations", unseen.length);
    await tx.careerUsage.createMany({ data: unseen.map((feature) => ({ userId, period, feature, used: 1 })) });
  }, { maxWait: 2e4, timeout: 2e4 });
}
async function overview(userId) {
  const monday = /* @__PURE__ */ new Date();
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const [evidence, documents, jobs, resumes, usage, plan, preference, applications] = await Promise.all([
    prisma.careerEvidence.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 200 }),
    prisma.careerDocument.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 100 }),
    prisma.job.findMany({ where: { userId }, select: { id: true, title: true, company: true }, take: 100 }),
    prisma.resume.findMany({ where: { userId }, select: { id: true, title: true, version: true }, take: 100 }),
    prisma.careerUsage.findMany({ where: { userId, OR: [{ period: (/* @__PURE__ */ new Date()).toISOString().slice(0, 7), feature: { in: ["alignment", "draft", "tailor", "interview"] } }, { period: monday.toISOString().slice(0, 10), feature: "recommendations" }] } }),
    entitlements(userId),
    prisma.careerPreference.findUnique({ where: { userId } }),
    prisma.jobApplication.findMany({ where: { userId }, select: { status: true, resumeId: true, company: true, role: true, jobId: true } })
  ]);
  const outcomes = Object.fromEntries([...new Set(applications.map((a) => a.status))].map((status) => [status, applications.filter((a) => a.status === status).length]));
  return { evidence, documents, jobs, resumes, usage, ...plan, preference, outcomes, cost: { model: "deterministic", tokens: 0, providerCost: 0 }, resetAt: new Date(Date.UTC((/* @__PURE__ */ new Date()).getUTCFullYear(), (/* @__PURE__ */ new Date()).getUTCMonth() + 1, 1)).toISOString() };
}
var saveEvidence = (userId, body) => prisma.careerEvidence.create({ data: { ...body, userId, details: body.details } });
async function removeEvidence(userId, id) {
  return prisma.$transaction(async (tx) => {
    await ownerLock(tx, userId);
    const result = await tx.careerEvidence.deleteMany({ where: { id, userId } });
    if (!result.count) throw new AppError_default(404, "Evidence not found.");
    await tx.careerAnalysis.deleteMany({ where: { userId } });
    const documents = await tx.careerDocument.findMany({ where: { userId }, select: { id: true, evidence: true } });
    const ids = documents.filter((d) => JSON.stringify(d.evidence).includes(id)).map((d) => d.id);
    await tx.careerDocument.deleteMany({ where: { userId, id: { in: ids } } });
    for (const draftId of ids) await tx.careerDelivery.updateMany({ where: { userId, state: "QUEUED", payload: { path: ["draftId"], equals: draftId } }, data: { state: "CANCELLED", payload: {} } });
    return { id };
  }, { maxWait: 2e4, timeout: 2e4 });
}
async function alignment(userId, jobId, resumeId, documentId, combined = false) {
  const [job, resume, evidence] = await Promise.all([
    prisma.job.findFirst({ where: { id: jobId, userId } }),
    prisma.resume.findFirst({ where: { id: resumeId, userId } }),
    prisma.careerEvidence.findMany({ where: { userId }, orderBy: { id: "asc" } })
  ]);
  if (!job || !resume) throw new AppError_default(404, "Job or resume not found.");
  const document = documentId ? await prisma.careerDocument.findFirst({ where: { id: documentId, userId } }) : null;
  if (documentId && !document) throw new AppError_default(404, "Document not found.");
  const analysisContent = document ? combined ? { resume: resume.contentData, draft: document.body } : document.body : resume.contentData;
  const freshness = jobFreshness(job).freshness;
  const cacheKey = digest({ job: job.description, content: analysisContent, documentId, combined, version: resume.version, evidence, freshness, scoring: SCORING_VERSION });
  return prisma.$transaction(async (tx) => {
    await ownerLock(tx, userId);
    const existing = await tx.careerAnalysis.findUnique({ where: { userId_cacheKey: { userId, cacheKey } } });
    if (existing) return { ...existing, cached: true };
    await charge(tx, userId, "alignment");
    const result = { ...analyzeAlignment(job.description, analysisContent, evidence, freshness, document ? combined ? "combined-input" : `draft:${document.id}` : "resume"), documentType: document ? combined ? "COMBINED" : document.kind : "RESUME" };
    return tx.careerAnalysis.create({ data: { userId, cacheKey, jobId, resumeId, result } });
  }, { maxWait: 2e4, timeout: 2e4 });
}
async function createDraft(userId, body) {
  return prisma.$transaction(async (tx) => {
    await ownerLock(tx, userId);
    const job = await tx.job.findFirst({ where: { id: body.jobId, userId } });
    if (!job) throw new AppError_default(404, "Job not found.");
    if (body.resumeId && !await tx.resume.findFirst({ where: { id: body.resumeId, userId } })) throw new AppError_default(404, "Resume not found.");
    const evidence = await tx.careerEvidence.findMany({ where: { userId, id: { in: body.evidenceIds } } });
    if (evidence.length !== new Set(body.evidenceIds).size || evidence.some((e) => !trustedEvidence(e.status))) throw new AppError_default(400, "Select only confirmed evidence that you own.");
    await charge(tx, userId, "draft");
    const draft = composeDraft({ ...body, title: job.title, company: job.company }, evidence);
    const document = await tx.careerDocument.create({ data: {
      userId,
      jobId: job.id,
      resumeId: body.resumeId ?? null,
      kind: body.kind,
      title: `${job.title} \xB7 ${body.kind}`,
      subject: draft.subjects[0],
      body: draft.body,
      evidence: draft.claims,
      versions: []
    } });
    return { ...document, subjects: draft.subjects, missingQuestions: draft.missingQuestions };
  }, { maxWait: 2e4, timeout: 2e4 });
}
async function editDraft(userId, id, body) {
  return prisma.$transaction(async (tx) => {
    await ownerLock(tx, userId);
    const old = await tx.careerDocument.findFirst({ where: { id, userId } });
    if (!old) throw new AppError_default(404, "Draft not found.");
    const versions = [...Array.isArray(old.versions) ? old.versions : [], { subject: old.subject, body: old.body, savedAt: old.updatedAt.toISOString() }].slice(-30);
    return tx.careerDocument.update({ where: { id }, data: {
      subject: body.subject,
      body: body.body,
      recipient: body.recipient ?? null,
      reviewedAt: body.reviewed ? /* @__PURE__ */ new Date() : null,
      versions
    } });
  }, { maxWait: 2e4, timeout: 2e4 });
}
async function tailor(userId, resumeId, jobId, evidenceIds, accept, expectedPreviewKey) {
  return prisma.$transaction(async (tx) => {
    await ownerLock(tx, userId);
    const resume = await tx.resume.findFirst({ where: { userId, id: resumeId } });
    const job = await tx.job.findFirst({ where: { userId, id: jobId } });
    const evidence = await tx.careerEvidence.findMany({ where: { userId, id: { in: evidenceIds } }, orderBy: { id: "asc" } });
    if (!resume || !job) throw new AppError_default(404, "Resume or job not found.");
    if (evidence.length !== new Set(evidenceIds).size || evidence.some((e) => !trustedEvidence(e.status))) throw new AppError_default(400, "Only confirmed evidence can be used.");
    const content = resume.contentData;
    if (!content || typeof content !== "object" || Array.isArray(content)) throw new AppError_default(400, "Resume content must be structured.");
    const after = { ...content, summary: evidence.map((e) => e.statement).join(" ") };
    if (!evidence.length) throw new AppError_default(400, "Select at least one confirmed achievement.");
    const previewKey = digest({ resumeId, content, version: resume.version, jobId, jobUpdatedAt: job.updatedAt, evidence });
    if (accept && expectedPreviewKey !== previewKey) throw new AppError_default(409, "The resume, job or evidence changed. Generate and review a fresh preview.");
    if (!accept) return { previewKey, before: content, after, evidence: evidence.map((e) => ({ id: e.id, source: e.source, statement: e.statement })), version: resume.version };
    const paid = await tx.subscription.findFirst({ where: { userId, status: "ACTIVE", currentPeriodEnd: { gt: /* @__PURE__ */ new Date() }, plan: { slug: { in: ["pro", "career-plus", "business"] } } } });
    if (!paid && resume.version >= 3) throw new AppError_default(429, "Free plans include three resume versions.");
    await charge(tx, userId, "tailor");
    await tx.resumeHistory.create({ data: { resumeId, version: resume.version, snapshot: content, changedBy: userId } });
    return tx.resume.update({ where: { id: resumeId }, data: { contentData: after, version: { increment: 1 }, targetJobTitle: job.title } });
  }, { maxWait: 2e4, timeout: 2e4 });
}
async function updateEvidence(userId, id, body) {
  return prisma.$transaction(async (tx) => {
    await ownerLock(tx, userId);
    if (!await tx.careerEvidence.findFirst({ where: { id, userId } })) throw new AppError_default(404, "Evidence not found.");
    const updated = await tx.careerEvidence.update({ where: { id }, data: body });
    await tx.careerAnalysis.deleteMany({ where: { userId } });
    const drafts = await tx.careerDocument.findMany({ where: { userId }, select: { id: true, evidence: true } });
    for (const draft of drafts) {
      if (!Array.isArray(draft.evidence) || !draft.evidence.some((c) => c && typeof c === "object" && !Array.isArray(c) && c.evidenceId === id)) continue;
      await tx.careerDocument.update({ where: { id: draft.id }, data: { reviewedAt: null } });
      await tx.careerDelivery.updateMany({ where: { userId, state: "QUEUED", payload: { path: ["draftId"], equals: draft.id } }, data: { state: "CANCELLED", payload: {} } });
    }
    return updated;
  }, { maxWait: 2e4, timeout: 2e4 });
}
async function savePreferences(userId, patch) {
  return prisma.$transaction(async (tx) => {
    await ownerLock(tx, userId);
    const old = await tx.careerPreference.findUnique({ where: { userId } });
    const preferences = { ...old?.preferences && typeof old.preferences === "object" && !Array.isArray(old.preferences) ? old.preferences : {}, ...patch };
    return tx.careerPreference.upsert({ where: { userId }, create: { userId, preferences }, update: { preferences } });
  });
}
async function createStory(userId, evidenceId) {
  return prisma.$transaction(async (tx) => {
    await ownerLock(tx, userId);
    const evidence = await tx.careerEvidence.findFirst({ where: { id: evidenceId, userId } });
    if (!evidence) throw new AppError_default(404, "Evidence not found.");
    if (!trustedEvidence(evidence.status)) throw new AppError_default(400, "Select confirmed evidence for your story.");
    await charge(tx, userId, "interview");
    const story = composeStory(evidence);
    const document = await tx.careerDocument.create({ data: { userId, kind: "INTERVIEW_STORY", title: `${story.title} \xB7 Interview story`, subject: story.title, body: story.body, evidence: story.claims, versions: [] } });
    return { ...document, sections: story.sections };
  }, { maxWait: 2e4, timeout: 2e4 });
}

// src/modules/career/career.integrations.ts
var scopes = { mail: "https://www.googleapis.com/auth/gmail.send", calendar: "https://www.googleapis.com/auth/calendar.events.owned" };
var tokenSchema = z.object({ access_token: z.string(), refresh_token: z.string().optional(), expires_in: z.number(), scope: z.string().optional() });
function config() {
  const client_id = process.env.CAREER_GOOGLE_CLIENT_ID;
  const client_secret = process.env.CAREER_GOOGLE_CLIENT_SECRET;
  const redirect_uri = process.env.CAREER_GOOGLE_REDIRECT_URI;
  if (!client_id || !client_secret || !redirect_uri || !process.env.CAREER_TOKEN_KEY) throw new AppError_default(503, "Google integration is not configured by the administrator.");
  return { client_id, client_secret, redirect_uri };
}
async function connectGoogle(userId, purpose) {
  const cfg = config();
  const state = randomBytes2(32).toString("hex");
  const verifier = randomBytes2(48).toString("base64url");
  await prisma.careerOAuthState.deleteMany({ where: { OR: [{ expiresAt: { lt: /* @__PURE__ */ new Date() } }, { userId, purpose }] } });
  await prisma.careerOAuthState.create({ data: { id: createHash3("sha256").update(state).digest("hex"), userId, purpose, verifier: encryptToken(verifier), expiresAt: new Date(Date.now() + 6e5) } });
  const params = new URLSearchParams({ client_id: cfg.client_id, redirect_uri: cfg.redirect_uri, response_type: "code", scope: scopes[purpose], access_type: "offline", prompt: "consent", state, code_challenge: createHash3("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
}
async function oauthCallback(code, state) {
  const id = createHash3("sha256").update(state).digest("hex");
  const record = await prisma.$transaction(async (tx) => {
    const row = await tx.careerOAuthState.findUnique({ where: { id } });
    if (!row || row.expiresAt < /* @__PURE__ */ new Date()) throw new AppError_default(400, "OAuth request expired. Connect again.");
    const removed = await tx.careerOAuthState.deleteMany({ where: { id } });
    if (!removed.count) throw new AppError_default(400, "OAuth request already used.");
    return row;
  });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ ...config(), code, code_verifier: decryptToken(record.verifier), grant_type: "authorization_code" }), signal: AbortSignal.timeout(1e4) });
  if (!response.ok) throw new AppError_default(502, "Google authorization failed. Connect again.");
  const tokens2 = tokenSchema.parse(await response.json());
  const scope = scopes[record.purpose];
  if (!tokens2.scope?.split(" ").includes(scope)) throw new AppError_default(400, "Required permission was not granted.");
  const provider = `google-${record.purpose}`;
  const existing = await prisma.careerConnection.findUnique({ where: { userId_provider: { userId: record.userId, provider } } });
  const previous = existing ? JSON.parse(decryptToken(existing.tokens)) : {};
  const saved = { ...tokens2, refresh_token: tokens2.refresh_token ?? previous.refresh_token };
  if (!saved.refresh_token) throw new AppError_default(400, "Offline access was not granted. Reconnect with consent.");
  const data = { tokens: encryptToken(JSON.stringify(saved)), scopes: scope, expiresAt: new Date(Date.now() + tokens2.expires_in * 1e3) };
  await prisma.careerConnection.upsert({ where: { userId_provider: { userId: record.userId, provider } }, create: { userId: record.userId, provider, ...data }, update: data });
  return { connected: provider };
}
async function accessToken(userId, purpose) {
  const row = await prisma.careerConnection.findUnique({ where: { userId_provider: { userId, provider: `google-${purpose}` } } });
  if (!row) throw new AppError_default(400, "Connect Google first.");
  let tokens2 = JSON.parse(decryptToken(row.tokens));
  if (row.expiresAt.getTime() < Date.now() + 6e4) {
    const cfg = config();
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ client_id: cfg.client_id, client_secret: cfg.client_secret, grant_type: "refresh_token", refresh_token: tokens2.refresh_token }), signal: AbortSignal.timeout(1e4) });
    if (!response.ok) throw new AppError_default(400, "Google connection needs to be renewed.");
    const next = tokenSchema.parse(await response.json());
    tokens2 = { access_token: next.access_token, refresh_token: next.refresh_token ?? tokens2.refresh_token };
    await prisma.careerConnection.update({ where: { id: row.id }, data: { tokens: encryptToken(JSON.stringify(tokens2)), expiresAt: new Date(Date.now() + next.expires_in * 1e3) } });
  }
  return tokens2.access_token;
}
async function disconnectGoogle(userId, purpose) {
  const provider = `google-${purpose}`;
  const row = await prisma.careerConnection.findUnique({ where: { userId_provider: { userId, provider } } });
  if (row) {
    const tokens2 = JSON.parse(decryptToken(row.tokens));
    const response = await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", body: new URLSearchParams({ token: tokens2.refresh_token }), signal: AbortSignal.timeout(1e4) });
    if (!response.ok && response.status !== 400) throw new AppError_default(502, "Revocation failed. Please retry disconnecting.");
    await prisma.careerConnection.deleteMany({ where: { userId, provider: { startsWith: "google-" } } });
    await prisma.careerDelivery.updateMany({ where: { userId, state: "QUEUED" }, data: { state: "CANCELLED", payload: {} } });
  }
  return { disconnected: true };
}
var calendarBody = z.object({ key: z.string().uuid(), summary: z.string().min(2).max(160), start: z.iso.datetime(), end: z.iso.datetime(), reviewed: z.literal(true) }).refine((v) => Date.parse(v.end) > Date.parse(v.start), "End must follow start.");
async function queueMail(userId, draftId, key2) {
  return prisma.$transaction(async (tx) => {
    await ownerLock(tx, userId);
    const old = await tx.careerDelivery.findUnique({ where: { userId_key: { userId, key: key2 } } });
    if (old) return old;
    const draft = await tx.careerDocument.findFirst({ where: { id: draftId, userId } });
    if (draft?.kind === "INTERVIEW_STORY") throw new AppError_default(400, "Interview stories are private preparation documents, not emails.");
    if (!draft?.reviewedAt || !draft.recipient) throw new AppError_default(400, "Review and save a recipient before sending.");
    const already = await tx.careerDelivery.findFirst({ where: { userId, kind: "mail", payload: { path: ["draftId"], equals: draftId }, state: { in: ["QUEUED", "SENDING", "SENT", "UNKNOWN"] } } });
    if (already) return already;
    if (!await tx.careerConnection.findUnique({ where: { userId_provider: { userId, provider: "google-mail" } } })) throw new AppError_default(400, "Connect Gmail first.");
    const count = await tx.careerDelivery.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 864e5) } } });
    if (count >= 20) throw new AppError_default(429, "Daily delivery limit reached.");
    return tx.careerDelivery.create({ data: { userId, key: key2, kind: "mail", payload: { draftId, recipient: draft.recipient, subject: draft.subject, body: draft.body } } });
  });
}
async function queueCalendar(userId, input) {
  if (!await prisma.careerConnection.findUnique({ where: { userId_provider: { userId, provider: "google-calendar" } } })) throw new AppError_default(400, "Connect Google Calendar first.");
  return prisma.$transaction(async (tx) => {
    await ownerLock(tx, userId);
    const existing = await tx.careerDelivery.findUnique({ where: { userId_key: { userId, key: input.key } } });
    if (existing) return existing;
    const count = await tx.careerDelivery.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 864e5) } } });
    if (count >= 20) throw new AppError_default(429, "Daily delivery limit reached.");
    return tx.careerDelivery.create({ data: { userId, key: input.key, kind: "calendar", payload: input } });
  });
}
async function processDeliveries() {
  await prisma.careerDelivery.updateMany({ where: { state: "SENDING", updatedAt: { lt: new Date(Date.now() - 12e4) } }, data: { state: "UNKNOWN", error: "Delivery interrupted. Check the provider before retrying." } });
  const rows = await prisma.careerDelivery.findMany({ where: { state: "QUEUED", nextAttemptAt: { lte: /* @__PURE__ */ new Date() } }, orderBy: { createdAt: "asc" }, take: 10 });
  for (const row of rows) {
    const claimed = await prisma.careerDelivery.updateMany({ where: { id: row.id, state: "QUEUED" }, data: { state: "SENDING", attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    let started = false;
    try {
      const token = await accessToken(row.userId, row.kind);
      const p = row.payload;
      const raw = row.kind === "mail" ? Buffer.from([`To: ${z.email().parse(p.recipient)}`, `Subject: =?UTF-8?B?${Buffer.from(p.subject).toString("base64")}?=`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", Buffer.from(p.body).toString("base64")].join("\r\n")).toString("base64url") : "";
      const eventId = createHash3("sha256").update(row.id).digest("hex");
      started = true;
      const response = await fetch(row.kind === "mail" ? "https://gmail.googleapis.com/gmail/v1/users/me/messages/send" : "https://www.googleapis.com/calendar/v3/calendars/primary/events", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(row.kind === "mail" ? { raw } : { id: eventId, summary: p.summary, start: { dateTime: p.start }, end: { dateTime: p.end } }), signal: AbortSignal.timeout(15e3) });
      if (response.status === 429 && row.attempts < 4) {
        await prisma.careerDelivery.update({ where: { id: row.id }, data: { state: "QUEUED", nextAttemptAt: new Date(Date.now() + 6e4 * 2 ** row.attempts), error: "Provider rate limit; retry scheduled." } });
        continue;
      }
      if (!response.ok && !(row.kind === "calendar" && response.status === 409)) {
        await prisma.careerDelivery.update({ where: { id: row.id }, data: { state: response.status >= 500 ? "UNKNOWN" : "FAILED", error: "Provider did not confirm delivery. Review before resending." } });
        continue;
      }
      const result = response.status === 409 ? { id: eventId } : z.object({ id: z.string() }).parse(await response.json());
      await prisma.careerDelivery.update({ where: { id: row.id }, data: { state: "SENT", providerId: result.id, error: null } });
    } catch {
      await prisma.careerDelivery.update({ where: { id: row.id }, data: { state: started ? "UNKNOWN" : "FAILED", error: started ? "Outcome uncertain. Check Google before sending again." : "Connection unavailable. Reconnect and retry." } });
    }
  }
}

// src/modules/career/career.sources.ts
import { z as z2 } from "zod";
var sourceBody = z2.object({
  provider: z2.enum(["LEVER", "GREENHOUSE"]),
  board: z2.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  company: z2.string().min(2).max(160),
  enabled: z2.boolean(),
  policy: z2.object({ accessMethod: z2.literal("PUBLIC_API"), storageAllowed: z2.boolean(), republicationAllowed: z2.boolean(), indexingAllowed: z2.boolean(), retentionDays: z2.number().int().min(1).max(90), attribution: z2.string().min(1).max(300), display: z2.enum(["FULL", "SUMMARY", "LINK_ONLY"]), reviewedAt: z2.iso.datetime(), reference: z2.url() })
});
var lever = z2.object({ id: z2.string(), text: z2.string().min(2), hostedUrl: z2.url(), descriptionPlain: z2.string().default(""), additionalPlain: z2.string().default(""), lists: z2.array(z2.object({ text: z2.string(), content: z2.string() })).default([]), categories: z2.object({ location: z2.string().optional(), commitment: z2.string().optional() }).default({}), workplaceType: z2.string().optional() });
var greenhouse = z2.object({ id: z2.number(), title: z2.string().min(2), absolute_url: z2.url(), content: z2.string().default(""), location: z2.object({ name: z2.string() }), updated_at: z2.string().optional() });
var plain = (text) => text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
function normalizePosting(provider, value, company) {
  if (provider === "LEVER") {
    const row2 = lever.parse(value);
    return { externalId: row2.id, title: row2.text, company, location: row2.categories.location ?? "", description: [row2.descriptionPlain, ...row2.lists.map((l) => `${l.text}: ${plain(l.content)}`), row2.additionalPlain].join("\n").trim(), canonicalUrl: normalizeJobUrl(row2.hostedUrl), workplaceType: row2.workplaceType === "remote" ? "REMOTE" : row2.workplaceType === "hybrid" ? "HYBRID" : "UNSPECIFIED" };
  }
  const row = greenhouse.parse(value);
  return { externalId: String(row.id), title: row.title, company, location: row.location.name, description: plain(row.content), canonicalUrl: normalizeJobUrl(row.absolute_url), workplaceType: "UNSPECIFIED" };
}
var cache = /* @__PURE__ */ new Map();
async function fetchBoard(id) {
  const source = await prisma.careerSource.findUnique({ where: { id } });
  if (!source || !source.enabled) throw new AppError_default(404, "Source unavailable or paused.");
  const policy = sourceBody.shape.policy.parse(source.policy);
  if (!policy.storageAllowed || Date.now() - Date.parse(policy.reviewedAt) > 90 * 864e5) throw new AppError_default(403, "Source policy needs review.");
  const cached = cache.get(id);
  if (cached && cached.expires > Date.now()) return { source, policy, rows: cached.rows };
  const claim = await prisma.careerSource.updateMany({ where: { id, enabled: true, OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: /* @__PURE__ */ new Date() } }] }, data: { nextCheckAt: new Date(Date.now() + 6e4) } });
  if (!claim.count) throw new AppError_default(429, "This source is cooling down. Try again shortly.");
  const url = source.provider === "LEVER" ? `https://api.lever.co/v0/postings/${encodeURIComponent(source.board)}?mode=json&limit=100` : `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.board)}/jobs?content=true`;
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(1e4) });
    if (!response.ok || !response.body) throw new Error("Source HTTP failure");
    let size = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 4e6) {
        await response.body.cancel().catch(() => {
        });
        throw new Error("Source response exceeds budget");
      }
      chunks.push(chunk);
    }
    const json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const raw = source.provider === "LEVER" ? z2.array(z2.unknown()).parse(json) : z2.object({ jobs: z2.array(z2.unknown()) }).parse(json).jobs;
    const rows = raw.slice(0, 100).map((row) => normalizePosting(source.provider, row, source.company));
    if (rows.some((r) => r.description.length < 20)) throw new Error("Source contract changed");
    cache.set(id, { expires: Date.now() + 6e4, rows });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    await prisma.careerSource.update({ where: { id }, data: { failures: 0, lastError: null, lastCheckedAt: /* @__PURE__ */ new Date() } });
    return { source, policy, rows };
  } catch {
    const failures = source.failures + 1;
    await prisma.careerSource.update({ where: { id }, data: { failures, enabled: failures < 3, lastCheckedAt: /* @__PURE__ */ new Date(), nextCheckAt: new Date(Date.now() + Math.min(36e5, 6e4 * 2 ** failures)), lastError: "Fetch or parser validation failed; review the source contract." } });
    throw new AppError_default(503, "Source temporarily unavailable. Its health status has been updated.");
  }
}
async function discover(sourceId, userId) {
  const { source, policy, rows } = await fetchBoard(sourceId);
  const preferences = await prisma.careerPreference.findUnique({ where: { userId } });
  const p = preferences?.preferences;
  const ranked = rows.map((row) => {
    const why = [
      ...p?.roles?.some((role) => row.title.toLowerCase().includes(role.toLowerCase())) ? ["Matches a preferred role"] : [],
      ...p?.locations?.some((location) => row.location.toLowerCase().includes(location.toLowerCase())) ? ["Matches a preferred location"] : [],
      ...p?.workplace && p.workplace === row.workplaceType ? ["Matches workplace preference"] : []
    ];
    return { ...row, why, uncertainty: "Salary, industry and experience fit need review." };
  }).sort((a, b) => b.why.length - a.why.length).slice(0, 10);
  if (ranked.length) await chargeRecommendations(userId, sourceId, ranked.map((row) => row.externalId));
  return { source: { id: source.id, company: source.company, attribution: policy.attribution }, jobs: ranked.map((row) => ({ ...row, description: policy.display === "LINK_ONLY" ? "" : policy.display === "SUMMARY" ? row.description.slice(0, 350) : row.description, parseConfidence: "validated-fields", display: policy.display })) };
}
async function importPosting(userId, sourceId, externalId) {
  const { source, policy, rows } = await fetchBoard(sourceId);
  const row = rows.find((r) => r.externalId === externalId);
  if (!row) throw new AppError_default(404, "Posting is no longer in this source response.");
  return prisma.$transaction(async (tx) => {
    await ownerLock(tx, userId);
    const jobs = await tx.job.findMany({ where: { userId } });
    const prior = await tx.jobSourceListing.findFirst({ where: { sourceName: source.id, externalId, job: { userId } }, include: { job: true } });
    const duplicate = prior?.job ?? jobs.find((job2) => duplicateReason(job2, row));
    const description = policy.display === "LINK_ONLY" ? "Open the original listing to review the job description." : policy.display === "SUMMARY" ? row.description.slice(0, 350) : row.description;
    const fields = { title: row.title, company: row.company, location: row.location, canonicalUrl: row.canonicalUrl, workplaceType: row.workplaceType };
    const job = duplicate ?? await tx.job.create({ data: { ...fields, description, userId, sourceName: source.company, sourceType: source.provider, lifecycle: "ACTIVE", lastVerifiedAt: /* @__PURE__ */ new Date(), contentHash: hashJob({ ...row, description }), isPrivate: true } });
    await tx.jobSourceListing.upsert({ where: { jobId_sourceName_externalId: { jobId: job.id, sourceName: source.id, externalId } }, create: { jobId: job.id, sourceName: source.id, sourceType: source.provider, externalId, sourceUrl: row.canonicalUrl, canonicalUrl: row.canonicalUrl, attribution: policy.attribution, lastVerifiedAt: /* @__PURE__ */ new Date(), rawHash: hashJob(row) }, update: { lastSeenAt: /* @__PURE__ */ new Date(), lastVerifiedAt: /* @__PURE__ */ new Date(), rawHash: hashJob(row) } });
    return job;
  });
}
async function recheckJob(userId, jobId) {
  const job = await prisma.job.findFirst({ where: { id: jobId, userId }, include: { listings: true } });
  if (!job) throw new AppError_default(404, "Job not found.");
  const listing = job.listings.find((l) => l.sourceType === "LEVER" || l.sourceType === "GREENHOUSE");
  if (!listing) throw new AppError_default(400, "This private import must be checked manually at the source.");
  const { rows } = await fetchBoard(listing.sourceName);
  const found = rows.find((r) => r.externalId === listing.externalId);
  return prisma.job.update({ where: { id: jobId }, data: { lifecycle: found ? "ACTIVE" : "POSSIBLY_EXPIRED", ...found ? { lastVerifiedAt: /* @__PURE__ */ new Date() } : {} } });
}

export {
  normalizeJobUrl,
  hashJob,
  duplicateReason,
  jobFreshness,
  ownerLock,
  checkApplicationQuota,
  overview,
  saveEvidence,
  removeEvidence,
  alignment,
  createDraft,
  editDraft,
  tailor,
  updateEvidence,
  savePreferences,
  createStory,
  connectGoogle,
  oauthCallback,
  disconnectGoogle,
  calendarBody,
  queueMail,
  queueCalendar,
  processDeliveries,
  sourceBody,
  discover,
  importPosting,
  recheckJob
};
