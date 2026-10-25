import {
  appendJobToTracker,
  createGmailDraft,
  createGoogleTracker,
  duplicateResume,
  effectiveGoogleCapabilities,
  exportPdf,
  harnessPreferenceSchema,
  optimizeForAts,
  processDeliveries,
  updateResume,
  uploadCareerDocumentToDrive,
  uploadResumeBufferToDrive
} from "./chunk-U4H2NBSR.js";
import {
  createDraft,
  discover,
  importPosting,
  jobSearchProviders,
  recheckJob
} from "./chunk-MYX6NV4L.js";
import {
  BUCKET_NAME,
  minioClient,
  redis
} from "./chunk-VYXJWAWZ.js";
import {
  prisma
} from "./chunk-3LRSKYRB.js";

// src/modules/career/career.maintenance.ts
async function purgeCareerData() {
  const now = /* @__PURE__ */ new Date();
  await prisma.careerOAuthState.deleteMany({ where: { expiresAt: { lt: now } } });
  const sources = await prisma.careerSource.findMany();
  for (const source of sources) {
    const policy = source.policy;
    const cutoff = new Date(Date.now() - (policy.retentionDays ?? 30) * 864e5);
    await prisma.job.updateMany({ where: { sourceType: { in: ["LEVER", "GREENHOUSE"] }, listings: { some: { sourceName: source.id, lastSeenAt: { lt: cutoff } } }, lastVerifiedAt: { lt: cutoff } }, data: { description: "Source retention period elapsed. Open the original listing for details.", contentHash: null } });
  }
  await prisma.careerDelivery.updateMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 864e5) }, state: { notIn: ["QUEUED", "SENDING"] } }, data: { payload: {} } });
  const deleted = await prisma.coverLetter.findMany({ where: { deletedAt: { lt: new Date(Date.now() - 7 * 864e5) } }, select: { id: true }, take: 100 });
  if (deleted.length) {
    const ids = deleted.map((d) => d.id);
    await prisma.$transaction([prisma.jobApplication.updateMany({ where: { coverLetterId: { in: ids } }, data: { coverLetterId: null } }), prisma.coverLetter.deleteMany({ where: { id: { in: ids } } })]);
  }
  await prisma.exportJob.updateMany({ where: { completedAt: { lt: new Date(Date.now() - 864e5) } }, data: { resultUrl: null } });
  if (process.env.SKIP_MINIO !== "true") {
    const stream = minioClient.listObjectsV2(BUCKET_NAME, "exports/", true);
    for await (const object of stream) {
      if (object.name && object.lastModified && object.lastModified.getTime() < Date.now() - 864e5) await minioClient.removeObject(BUCKET_NAME, object.name);
    }
  }
  const jobs = await prisma.job.findMany({ where: { sourceType: { in: ["LEVER", "GREENHOUSE"] }, lifecycle: { in: ["ACTIVE", "POSSIBLY_EXPIRED"] }, OR: [{ lastVerifiedAt: null }, { lastVerifiedAt: { lt: new Date(Date.now() - 864e5) } }] }, take: 5, orderBy: { lastVerifiedAt: "asc" } });
  for (const job of jobs) {
    try {
      await recheckJob(job.userId, job.id);
    } catch {
    }
  }
}

// src/utils/scheduler.ts
import { Queue, Worker } from "bullmq";

// src/modules/harness/harness.policy.ts
var words = (value) => new Set(value.toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean));
var includesPhrase = (haystack, needle) => haystack.toLowerCase().includes(needle.toLowerCase());
var editDistance = (left, right) => {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[right.length];
};
var roleMatches = (title, role) => {
  const titleWords = [...words(title)];
  const roleWords = [...words(role.replace(/\b(frontend|backend|fullstack)devloper\b/gi, "$1 developer"))];
  return roleWords.every((expected) => titleWords.some((actual) => actual === expected || expected.length >= 6 && actual.length >= 6 && editDistance(actual, expected) <= 1));
};
function evaluateCandidate(job, preferences) {
  const text = `${job.title} ${job.description}`;
  const corpus = words(text);
  const reasons = [];
  const missing = [];
  let score = 45;
  const roleMatch = preferences.roles.length === 0 || preferences.roles.some((role) => {
    if (roleMatches(job.title, role)) return true;
    const roleTerms = [...words(role.replace(/\b(frontend|backend|fullstack)devloper\b/gi, "$1 developer"))];
    const occupation = roleTerms.find((term) => ["developer", "engineer", "designer", "manager", "analyst", "writer"].includes(term));
    return Boolean(occupation && words(job.title).has(occupation) && preferences.requiredSkills.some((skill) => includesPhrase(text, skill)));
  });
  if (roleMatch) {
    score += 18;
    reasons.push({ rule: "role", outcome: "MATCH", detail: "Role matches saved targets." });
  } else {
    score -= 20;
    missing.push("Desired role");
  }
  const requiredMatches = preferences.requiredSkills.filter((skill) => [...words(skill)].every((token) => corpus.has(token)));
  if (preferences.requiredSkills.length) {
    const coverage = requiredMatches.length / preferences.requiredSkills.length;
    score += Math.round(coverage * 22);
    if (coverage < 0.7) missing.push(...preferences.requiredSkills.filter((skill) => !requiredMatches.includes(skill)).map((skill) => `Required skill: ${skill}`));
    reasons.push({ rule: "required-skills", outcome: coverage >= 0.7 ? "MATCH" : "RISK", detail: `${requiredMatches.length}/${preferences.requiredSkills.length} required skills found.` });
  }
  const optionalMatches = preferences.optionalSkills.filter((skill) => includesPhrase(text, skill));
  score += Math.min(8, optionalMatches.length * 2);
  if (optionalMatches.length) reasons.push({ rule: "optional-skills", outcome: "MATCH", detail: `${optionalMatches.length} preferred skills found.` });
  const excluded = preferences.excludedSkills.find((skill) => includesPhrase(text, skill));
  if (excluded) {
    score -= 25;
    reasons.push({ rule: "excluded-skill", outcome: "RISK", detail: `Excluded skill found: ${excluded}.` });
  }
  if (preferences.excludedCompanies.some((company) => includesPhrase(job.company, company))) {
    score = 0;
    missing.push("Company is excluded");
  }
  if (preferences.workplace !== "ANY" && job.workplaceType !== preferences.workplace) {
    score -= 18;
    missing.push(`Workplace must be ${preferences.workplace.toLowerCase()}`);
  } else if (preferences.workplace !== "ANY") {
    score += 7;
    reasons.push({ rule: "workplace", outcome: "MATCH", detail: `Workplace is ${job.workplaceType.toLowerCase()}.` });
  }
  if (preferences.allowedCountries.length && !preferences.allowedCountries.some((country) => country.toLowerCase() === "worldwide") && job.location && !preferences.allowedCountries.some((country) => includesPhrase(job.location, country))) {
    score -= 25;
    missing.push("Country eligibility needs review");
  }
  if (preferences.minimumSalary !== null && job.salaryMin !== null && job.salaryCurrency === preferences.salaryCurrency) {
    const salary = typeof job.salaryMin === "number" ? job.salaryMin : job.salaryMin.toNumber();
    if (salary < preferences.minimumSalary) {
      score -= 20;
      missing.push("Salary is below minimum");
    } else {
      score += 5;
      reasons.push({ rule: "salary", outcome: "MATCH", detail: "Published salary meets minimum." });
    }
  }
  const ageAnchor = job.publishedAt ?? job.lastVerifiedAt;
  if (ageAnchor && Date.now() - ageAnchor.getTime() > preferences.maximumJobAgeDays * 864e5) {
    score -= 15;
    missing.push("Listing is older than preference");
  }
  if (job.lifecycle !== "ACTIVE") {
    score -= 30;
    missing.push(`Listing state: ${job.lifecycle}`);
  }
  score = Math.max(0, Math.min(100, score));
  const hardBlock = missing.includes("Company is excluded") || job.lifecycle === "EXPIRED" || job.lifecycle === "REMOVED";
  const decision = hardBlock || score < preferences.autoSaveThreshold ? "NOT_ELIGIBLE" : score >= preferences.minimumMatchScore ? "ELIGIBLE" : "REVIEW_REQUIRED";
  return { score, decision, reasons, missing };
}
function canAutoSubmit(input) {
  const { preferences } = input;
  return input.mode === "AUTO_APPLY" && !preferences.requireApprovalBeforeSubmit && input.score >= preferences.autoApplyThreshold && preferences.allowedAutoApplyDomains.some((domain) => input.hostname === domain || input.hostname.endsWith(`.${domain}`)) && input.unknownFields.length === 0 && !input.hasSensitiveQuestion;
}

// src/modules/harness/harness.engine.ts
var asObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
var HarnessBlocked = class extends Error {
  constructor(message, output) {
    super(message);
    this.output = output;
  }
  output;
};
async function activity(userId, runId, action, message, outcome = "INFO", metadata = {}) {
  await prisma.harnessAuditEvent.create({ data: { userId, runId, action, entityType: "HarnessRun", entityId: runId, outcome, metadata: { message, ...metadata } } });
}
function completedMessage(key, output) {
  if (key === "DISCOVER") return `Search finished. ${Array.isArray(output.jobIds) ? output.jobIds.length : 0} jobs saved from ${Number(output.sourceCount ?? 0)} sources.`;
  if (key === "VERIFY") return `${Array.isArray(output.verifiedJobIds) ? output.verifiedJobIds.length : 0} active jobs verified.`;
  if (key === "MATCH") return `${Array.isArray(output.eligibleJobIds) ? output.eligibleJobIds.length : 0} jobs match your preferences.`;
  if (key === "PREPARE_DOCUMENTS") {
    const prepared = Array.isArray(output.prepared) ? output.prepared.length : 0;
    const deferred = Number(output.deferred ?? 0);
    return `${prepared} tailored CV and email bundles ready for review.${deferred ? ` ${deferred} deferred by the monthly limit.` : ""}`;
  }
  if (key === "GOOGLE_SYNC") {
    const warnings = Array.isArray(output.warnings) ? output.warnings.length : 0;
    return `${Array.isArray(output.syncedRows) ? output.syncedRows.length : 0} Sheet rows, ${Array.isArray(output.driveIds) ? output.driveIds.length : 0} Drive files, and ${Array.isArray(output.draftIds) ? output.draftIds.length : 0} Gmail drafts created.${warnings ? ` Local copies kept for ${warnings} unavailable Google service${warnings === 1 ? "" : "s"}.` : ""}`;
  }
  if (key === "BROWSER_PREPARE") {
    const tasks = Array.isArray(output.tasks) ? output.tasks.length : 0;
    return tasks ? `${tasks} application tabs queued for the browser companion.` : "No browser handoff was needed.";
  }
  return `${key} completed.`;
}
async function executeStep(run, step) {
  const preferenceRow = await prisma.harnessPreferenceVersion.findUniqueOrThrow({ where: { id: run.preferenceVersionId } });
  const preferences = harnessPreferenceSchema.parse(preferenceRow.preferences);
  const completed = await prisma.harnessStep.findMany({ where: { runId: run.id, state: "SUCCEEDED" } });
  const outputFor = (key) => asObject(completed.find((row) => row.key === key)?.output);
  if (step.key === "DISCOVER") {
    const sources = await prisma.careerSource.findMany({ where: { enabled: true, id: { notIn: preferences.excludedSources } }, orderBy: { lastCheckedAt: "asc" }, take: 10 });
    const jobIds = /* @__PURE__ */ new Set();
    const failures = [];
    let inspected = 0;
    const excluded = (name) => preferences.excludedSources.some((source) => source.toLowerCase() === name.toLowerCase());
    const providers = jobSearchProviders.filter((provider) => !excluded(provider.id));
    const workerJobs = await prisma.job.findMany({
      where: {
        userId: run.userId,
        lifecycle: "ACTIVE",
        sourceName: { startsWith: "Local Worker \xB7 " },
        lastVerifiedAt: { gte: new Date(Date.now() - preferences.maximumJobAgeDays * 864e5) }
      },
      select: { id: true, sourceName: true },
      orderBy: { lastVerifiedAt: "desc" },
      take: preferences.dailySearchLimit
    });
    const allowedWorkerJobs = workerJobs.filter((job) => !excluded(job.sourceName.replace("Local Worker \xB7 ", "")));
    for (const job of allowedWorkerJobs) jobIds.add(job.id);
    if (allowedWorkerJobs.length) {
      await activity(run.userId, run.id, "WORKER_LISTINGS_IMPORTED", `${allowedWorkerJobs.length} local-browser job${allowedWorkerJobs.length === 1 ? "" : "s"} added to this run.`, "SUCCESS", { count: allowedWorkerJobs.length });
    }
    await activity(run.userId, run.id, "SEARCH_PLAN_READY", `Search plan ready: ${preferences.roles.length} role${preferences.roles.length === 1 ? "" : "s"} searched one after another across ${providers.length} job feeds.`, "RUNNING", { roles: preferences.roles, providers: providers.map((provider) => provider.id) });
    for (const role of preferences.roles) {
      for (const provider of providers) {
        if (jobIds.size >= preferences.dailySearchLimit) break;
        try {
          await activity(run.userId, run.id, "SEARCH_QUERY_STARTED", `Searching ${provider.id} for ${role}.`, "RUNNING", { role, source: provider.id });
          const found = await provider.search(run.userId, role, preferences.dailySearchLimit - jobIds.size, preferences.maximumJobAgeDays);
          inspected += found.length;
          for (const id of found) jobIds.add(id);
          await activity(run.userId, run.id, "SEARCH_QUERY_FINISHED", `Found ${found.length} current ${role} job${found.length === 1 ? "" : "s"} on ${provider.id}.`, "SUCCESS", { role, source: provider.id, count: found.length });
        } catch (error) {
          const message = error instanceof Error ? error.message : `${provider.id} search failed.`;
          failures.push({ sourceId: provider.id, error: message });
          await activity(run.userId, run.id, "SEARCH_QUERY_FAILED", `${provider.id} search for ${role} failed: ${message}`, "RETRYABLE", { role, source: provider.id, error: message });
        }
      }
    }
    for (const source of sources) {
      if (jobIds.size >= preferences.dailySearchLimit) break;
      try {
        const result = await discover(source.id, run.userId);
        for (const row of result.jobs) {
          if (jobIds.size >= preferences.dailySearchLimit) break;
          inspected += 1;
          const imported = await importPosting(run.userId, source.id, row.externalId);
          jobIds.add(imported.id);
        }
      } catch (error) {
        failures.push({ sourceId: source.id, error: error instanceof Error ? error.message : "Source failed." });
      }
    }
    if (!jobIds.size) {
      const existing = await prisma.job.findMany({ where: { userId: run.userId, lifecycle: "ACTIVE" }, select: { id: true }, orderBy: { updatedAt: "desc" }, take: preferences.dailySearchLimit });
      for (const row of existing) jobIds.add(row.id);
      if (jobIds.size) await activity(run.userId, run.id, "SEARCH_NETWORK_EMPTY", `No new postings were found. Reusing ${jobIds.size} saved active jobs.`, "PARTIAL", { count: jobIds.size });
    }
    return { sourceCount: providers.length + sources.length, inspected, jobIds: [...jobIds].slice(0, preferences.dailySearchLimit), failures };
  }
  if (step.key === "VERIFY") {
    const jobIds = outputFor("DISCOVER").jobIds ?? [];
    const rows = await prisma.job.findMany({ where: { userId: run.userId, id: { in: jobIds } }, select: { id: true, lifecycle: true, lastVerifiedAt: true, canonicalUrl: true } });
    return { verifiedJobIds: rows.filter((row) => row.lifecycle === "ACTIVE" && row.canonicalUrl).map((row) => row.id), reviewJobIds: rows.filter((row) => row.lifecycle !== "ACTIVE" || !row.canonicalUrl).map((row) => row.id) };
  }
  if (step.key === "MATCH") {
    const jobIds = outputFor("VERIFY").verifiedJobIds ?? [];
    const jobs = await prisma.job.findMany({ where: { userId: run.userId, id: { in: jobIds } } });
    const decisions = [];
    for (const job of jobs) {
      const result = evaluateCandidate(job, preferences);
      const saved = await prisma.harnessCandidateDecision.upsert({
        where: { runId_jobId: { runId: run.id, jobId: job.id } },
        create: { userId: run.userId, runId: run.id, jobId: job.id, preferenceVersion: preferenceRow.version, ...result },
        update: result
      });
      decisions.push({ id: saved.id, jobId: job.id, score: saved.score, decision: saved.decision });
    }
    for (const decision of decisions.filter((row) => row.decision === "ELIGIBLE").slice(0, 3)) {
      const job = jobs.find((row) => row.id === decision.jobId);
      if (job) await activity(run.userId, run.id, "CANDIDATE_MATCHED", `Matched ${job.title} at ${job.company} with score ${decision.score}.`, "SUCCESS", { jobId: job.id, score: decision.score });
    }
    return { decisions, eligibleJobIds: decisions.filter((row) => row.decision === "ELIGIBLE").map((row) => row.jobId) };
  }
  if (step.key === "PREPARE_DOCUMENTS") {
    if (run.mode === "RESEARCH") return { skipped: true, reason: "Research mode does not create documents." };
    const eligibleJobIds = outputFor("MATCH").eligibleJobIds ?? [];
    const [resume, evidence, limits] = await Promise.all([
      prisma.resume.findFirst({ where: { userId: run.userId }, orderBy: { updatedAt: "desc" } }),
      prisma.careerEvidence.findMany({ where: { userId: run.userId, status: { in: ["USER_CONFIRMED", "VERIFIED"] } }, orderBy: { updatedAt: "desc" }, take: 10 }),
      prisma.userLimit.findUnique({ where: { userId: run.userId } })
    ]);
    if (!resume) throw new HarnessBlocked("Add one base resume before document preparation.", { prepared: [], needsUser: ["Add one base resume."] });
    if (!evidence.length) throw new HarnessBlocked("Confirm at least one career evidence item before document preparation.", { prepared: [], needsUser: ["Confirm at least one career evidence item."] });
    const candidates = eligibleJobIds.slice(0, preferences.dailyApplicationLimit);
    const existingArtifacts = await prisma.harnessArtifact.findMany({ where: { userId: run.userId, jobId: { in: candidates }, kind: "TAILORED_RESUME" }, orderBy: { createdAt: "desc" } });
    const existingByJob = /* @__PURE__ */ new Map();
    for (const artifact of existingArtifacts) if (artifact.jobId && !existingByJob.has(artifact.jobId)) existingByJob.set(artifact.jobId, artifact);
    const remainingResumeSlots = Math.max(0, (limits?.resumeLimit ?? 0) - (limits?.resumeUsed ?? 0));
    const newCvJobs = candidates.filter((jobId) => !existingByJob.get(jobId)?.localRef);
    if (!candidates.some((jobId) => existingByJob.get(jobId)?.localRef) && newCvJobs.length && !remainingResumeSlots) {
      throw new HarnessBlocked("Monthly CV limit reached. Existing prepared CVs will be reused; increase the limit for new jobs or wait for reset.", { prepared: [], needsUser: ["CV generation limit reached."] });
    }
    const prepared = [];
    let deferred = 0;
    let newCvsUsed = 0;
    const preparationLimit = Math.min(preferences.dailyApplicationLimit, candidates.length);
    for (const jobId of candidates.slice(0, preparationLimit)) {
      const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
      const existingArtifact = existingByJob.get(jobId);
      let tailored = existingArtifact?.localRef ? await prisma.resume.findFirst({ where: { id: existingArtifact.localRef, userId: run.userId } }) : null;
      let optimizationWarning;
      if (!tailored) {
        if (newCvsUsed >= remainingResumeSlots) {
          deferred += 1;
          continue;
        }
        try {
          const copy = await duplicateResume(run.userId, resume.id);
          tailored = await updateResume(run.userId, copy.id, {
            title: `${job.title} at ${job.company}`.slice(0, 100),
            targetJobTitle: job.title,
            jobDescription: job.description.slice(0, 5e3)
          });
          newCvsUsed += 1;
          try {
            const optimized = await optimizeForAts(run.userId, tailored.id);
            tailored = optimized.resume;
          } catch (error2) {
            optimizationWarning = error2 instanceof Error ? error2.message : "ATS optimization was unavailable.";
          }
        } catch (error2) {
          prepared.push({ jobId, error: error2 instanceof Error ? error2.message : "Tailored CV generation failed." });
          continue;
        }
      }
      let document = await prisma.careerDocument.findFirst({ where: { userId: run.userId, jobId, kind: "APPLICATION" }, orderBy: { updatedAt: "desc" } });
      let error;
      if (!document) {
        try {
          document = await createDraft(run.userId, { jobId, resumeId: tailored.id, evidenceIds: evidence.map((row) => row.id), kind: "APPLICATION", tone: preferences.emailTone, length: preferences.coverLetterStyle === "CONCISE" ? "short" : "standard", targetCharacters: preferences.coverLetterStyle === "DETAILED" ? 2400 : 1600 });
        } catch (caught) {
          error = caught instanceof Error ? caught.message : "Draft generation failed.";
        }
      }
      const artifact = existingArtifact ?? await prisma.harnessArtifact.create({ data: { userId: run.userId, runId: run.id, jobId, kind: "TAILORED_RESUME", name: `${job.company}_${job.title}_Resume`, state: "NEEDS_REVIEW", localRef: tailored.id, metadata: { baseResumeId: resume.id, baseVersion: resume.version, atsScore: tailored.atsScore, optimizationWarning: optimizationWarning ?? null } } });
      if (document) {
        const emailArtifact = await prisma.harnessArtifact.findFirst({ where: { userId: run.userId, runId: run.id, jobId, kind: "APPLICATION_EMAIL" } });
        if (emailArtifact) await prisma.harnessArtifact.update({ where: { id: emailArtifact.id }, data: { localRef: document.id, metadata: { resumeId: tailored.id } } });
        else await prisma.harnessArtifact.create({ data: { userId: run.userId, runId: run.id, jobId, kind: "APPLICATION_EMAIL", name: document.title, state: "NEEDS_REVIEW", localRef: document.id, metadata: { resumeId: tailored.id } } });
      }
      prepared.push({ jobId, resumeId: tailored.id, artifactId: artifact.id, atsScore: tailored.atsScore, ...document?.id ? { documentId: document.id } : {}, ...error ? { error } : {} });
      await activity(run.userId, run.id, "APPLICATION_BUNDLE_PREPARED", `Tailored CV${document ? " and email draft" : ""} ready for ${job.title} at ${job.company}.`, error ? "PARTIAL" : "SUCCESS", { jobId, resumeId: tailored.id, documentId: document?.id ?? null, atsScore: tailored.atsScore, optimizationWarning: optimizationWarning ?? null });
    }
    const failed = prepared.filter((row) => row.error);
    const needsUser = [...failed.length ? ["Review document generation failures."] : [], ...deferred ? [`${deferred} CVs deferred by the monthly limit.`] : []];
    const output = { prepared, deferred, needsUser };
    if (!prepared.length && deferred && !remainingResumeSlots) throw new HarnessBlocked("Monthly CV limit reached. Increase the limit or wait for reset.", output);
    if (needsUser.length) await activity(run.userId, run.id, "DOCUMENT_PREPARATION_PARTIAL", needsUser.join(" "), "PARTIAL", { failed: failed.length, deferred });
    return output;
  }
  if (step.key === "GOOGLE_SYNC") {
    const decisions = outputFor("MATCH").decisions ?? [];
    const prepared = outputFor("PREPARE_DOCUMENTS").prepared ?? [];
    const syncedRows = [];
    const draftIds = [];
    const driveIds = [];
    const failures = [];
    const connection = await prisma.googleAccountConnection.findUnique({ where: { userId: run.userId }, include: { capabilities: true } });
    const capabilities = new Set(connection ? effectiveGoogleCapabilities(connection).filter((row) => row.enabled).map((row) => row.capability) : []);
    const missing = [];
    const trackable = decisions.filter((row) => row.decision !== "NOT_ELIGIBLE");
    if (trackable.length && capabilities.has("SHEET_TRACKER")) {
      try {
        const tracker = await prisma.harnessExternalSync.findUnique({ where: { userId_kind_syncKey: { userId: run.userId, kind: "SHEET_TRACKER", syncKey: "primary" } } });
        if (!tracker) await createGoogleTracker(run.userId, "ProfileAI Job Tracker");
        for (const decision of trackable) {
          const row = await appendJobToTracker(run.userId, decision.jobId, decision.score);
          syncedRows.push(row.id);
        }
      } catch (error) {
        failures.push(error instanceof Error ? error.message : "Sheet sync failed.");
      }
    } else if (trackable.length) {
      missing.push("Connect Google Sheets.");
    }
    for (const item of prepared) {
      let pdf;
      if (item.resumeId) {
        try {
          const exported = await exportPdf(run.userId, item.resumeId);
          pdf = { bytes: Buffer.from(exported.base64, "base64"), fileName: exported.fileName };
          if (capabilities.has("DRIVE_DOCUMENTS")) {
            const row = await uploadResumeBufferToDrive(run.userId, item.resumeId, pdf.bytes);
            driveIds.push(row.externalId);
          }
        } catch (error) {
          failures.push(error instanceof Error ? error.message : "CV export failed.");
        }
      }
      if (item.documentId && capabilities.has("GMAIL_DRAFTS")) {
        try {
          const row = await createGmailDraft(run.userId, item.documentId, pdf);
          draftIds.push(row.externalId);
        } catch (error) {
          failures.push(error instanceof Error ? error.message : "Gmail draft sync failed.");
        }
      }
      if (item.documentId && capabilities.has("DRIVE_DOCUMENTS")) {
        try {
          const row = await uploadCareerDocumentToDrive(run.userId, item.documentId);
          driveIds.push(row.externalId);
        } catch (error) {
          failures.push(error instanceof Error ? error.message : "Drive document sync failed.");
        }
      }
    }
    if (prepared.length && !capabilities.has("DRIVE_DOCUMENTS")) missing.push("Connect Google Drive.");
    if (prepared.some((item) => item.documentId) && !capabilities.has("GMAIL_DRAFTS")) missing.push("Connect Gmail drafts.");
    const warnings = [.../* @__PURE__ */ new Set([...missing, ...failures])];
    const output = { syncedRows, draftIds, driveIds, failures: [...new Set(failures)], needsUser: [...new Set(missing)], warnings, partial: warnings.length > 0, localSheetRows: trackable.length };
    if (!warnings.length) return output;
    await activity(run.userId, run.id, "GOOGLE_SYNC_PARTIAL", `Google sync kept everything locally. ${warnings.join(" ")}`, "PARTIAL", { warnings, localSheetRows: trackable.length });
    return output;
  }
  if (step.key === "BROWSER_PREPARE") {
    const decisions = outputFor("MATCH").decisions ?? [];
    const preparedDocs = outputFor("PREPARE_DOCUMENTS").prepared ?? [];
    if (run.mode === "RESEARCH") return { tasks: [], waitingForBrowser: false, sourceJobs: decisions.length, skipped: "Research mode keeps everything in the sheet. No browser handoff is needed." };
    const [profile, user, resume] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId: run.userId } }),
      prisma.user.findUniqueOrThrow({ where: { id: run.userId }, select: { email: true } }),
      prisma.resume.findFirst({ where: { userId: run.userId }, orderBy: { updatedAt: "desc" } })
    ]);
    const tasks = [];
    for (const decision of decisions.filter((row) => row.decision === "ELIGIBLE").slice(0, preferences.dailyApplicationLimit)) {
      const job = await prisma.job.findUniqueOrThrow({ where: { id: decision.jobId } });
      if (!job.canonicalUrl) continue;
      let target;
      try {
        target = new URL(job.canonicalUrl);
      } catch {
        continue;
      }
      if (!["http:", "https:"].includes(target.protocol)) continue;
      const hostname = target.hostname.toLowerCase();
      const adapter = hostname.includes("greenhouse") ? "GREENHOUSE" : hostname.includes("lever.co") ? "LEVER" : hostname.includes("ashbyhq") ? "ASHBY" : hostname.includes("workable") ? "WORKABLE" : "GENERIC";
      const autoApproved = canAutoSubmit({ mode: run.mode, score: decision.score, hostname, unknownFields: [], hasSensitiveQuestion: false, preferences });
      const existing = await prisma.browserTask.findFirst({ where: { userId: run.userId, jobId: job.id, state: { notIn: ["CANCELLED", "FAILED"] } } });
      const preparedDoc = preparedDocs.find((row) => row.jobId === job.id);
      const task = existing ?? await prisma.browserTask.create({ data: {
        userId: run.userId,
        runId: run.id,
        jobId: job.id,
        adapter,
        targetUrl: job.canonicalUrl,
        mode: run.mode === "REVIEW_SUBMIT" ? "REVIEW_SUBMIT" : autoApproved ? "AUTO_APPLY" : "PREPARE",
        approvedAt: autoApproved ? /* @__PURE__ */ new Date() : null,
        payload: {
          candidate: {
            firstName: profile?.firstName ?? "",
            lastName: profile?.lastName ?? "",
            email: user.email,
            phone: profile?.phone ?? "",
            location: profile?.location ?? "",
            website: profile?.website ?? "",
            linkedIn: profile?.linkedIn ?? "",
            github: profile?.github ?? "",
            workAuthorization: preferences.workAuthorization,
            requiresVisaSponsorship: preferences.requiresVisaSponsorship,
            availability: preferences.availability,
            noticePeriod: preferences.noticePeriod,
            earliestStartDate: preferences.earliestStartDate,
            relocation: preferences.relocation,
            minimumSalary: preferences.minimumSalary,
            salaryCurrency: preferences.salaryCurrency
          },
          job: { id: job.id, title: job.title, company: job.company },
          documents: { resumeId: preparedDoc?.resumeId ?? resume?.id ?? null, documentId: preparedDoc?.documentId ?? null },
          policy: { autoSubmit: autoApproved, stopOnCaptcha: true, stopOnOtp: true, stopOnLegalAgreement: true, stopOnUnknownRequiredQuestion: true, neverAnswerSensitive: true }
        }
      } });
      tasks.push({ id: task.id, jobId: job.id, mode: task.mode, adapter });
      await activity(run.userId, run.id, "BROWSER_TASK_QUEUED", `Application tab queued for ${job.title} at ${job.company}.`, "SUCCESS", { jobId: job.id, adapter });
    }
    return { tasks, waitingForBrowser: false };
  }
  return {};
}
async function processRun(runId) {
  const run = await prisma.harnessRun.findUnique({ where: { id: runId }, include: { steps: { orderBy: { position: "asc" } } } });
  if (!run || !["SCHEDULED", "RUNNING"].includes(run.state)) return;
  if (run.state === "SCHEDULED") await prisma.harnessRun.update({ where: { id: run.id }, data: { state: "RUNNING", startedAt: run.startedAt ?? /* @__PURE__ */ new Date() } });
  for (const step of run.steps) {
    const current = await prisma.harnessRun.findUnique({ where: { id: run.id }, select: { state: true } });
    if (!current || current.state !== "RUNNING") return;
    if (step.state === "SUCCEEDED" || step.state === "CANCELLED") continue;
    const claimed = await prisma.harnessStep.updateMany({ where: { id: step.id, state: { in: ["PENDING", "RETRYABLE"] }, nextAttemptAt: { lte: /* @__PURE__ */ new Date() } }, data: { state: "RUNNING", startedAt: /* @__PURE__ */ new Date(), attempt: { increment: 1 }, error: null } });
    if (!claimed.count) return;
    try {
      await activity(run.userId, run.id, "STEP_STARTED", `Started: ${step.key.toLowerCase().replaceAll("_", " ")}.`, "RUNNING", { step: step.key });
      const output = await executeStep(run, step);
      const outputObject = asObject(output);
      const partial = outputObject.partial === true || Array.isArray(outputObject.warnings) && outputObject.warnings.length > 0 || Array.isArray(outputObject.failures) && outputObject.failures.length > 0;
      await prisma.harnessStep.update({ where: { id: step.id }, data: { state: "SUCCEEDED", output, finishedAt: /* @__PURE__ */ new Date() } });
      await activity(run.userId, run.id, "STEP_COMPLETED", completedMessage(step.key, outputObject), partial ? "PARTIAL" : "SUCCESS", { step: step.key });
    } catch (error) {
      if (error instanceof HarnessBlocked) {
        await prisma.harnessStep.update({ where: { id: step.id }, data: { state: "BLOCKED", blocker: error.message, output: error.output, finishedAt: /* @__PURE__ */ new Date() } });
        await prisma.harnessRun.update({ where: { id: run.id }, data: { state: "WAITING_FOR_USER", error: error.message } });
        await activity(run.userId, run.id, "STEP_BLOCKED", error.message, "WAITING_FOR_USER", { step: step.key, ...error.output });
        return;
      }
      const attempt = step.attempt + 1;
      const message = error instanceof Error ? error.message : "Harness step failed.";
      await prisma.harnessStep.update({ where: { id: step.id }, data: attempt < 3 ? { state: "RETRYABLE", error: message, nextAttemptAt: new Date(Date.now() + 3e4 * 2 ** attempt) } : { state: "FAILED", error: message, finishedAt: /* @__PURE__ */ new Date() } });
      if (attempt >= 3) await prisma.harnessRun.update({ where: { id: run.id }, data: { state: "PARTIAL", error: message, finishedAt: /* @__PURE__ */ new Date() } });
      await activity(run.userId, run.id, "STEP_FAILED", message, attempt < 3 ? "RETRYABLE" : "FAILED", { step: step.key, attempt });
      return;
    }
  }
  const browserStep = await prisma.harnessStep.findUnique({ where: { runId_key: { runId: run.id, key: "BROWSER_PREPARE" } } });
  const browserOutput = asObject(browserStep?.output);
  const browserTasks = Array.isArray(browserOutput.tasks) ? browserOutput.tasks.length : 0;
  await prisma.harnessRun.update({ where: { id: run.id }, data: { state: "COMPLETED", finishedAt: /* @__PURE__ */ new Date(), summary: { browserTasks } } });
  await activity(run.userId, run.id, "RUN_PIPELINE_FINISHED", browserTasks ? `Harness run completed. ${browserTasks} application tab${browserTasks === 1 ? "" : "s"} wait in the review queue.` : "Harness run completed. The job sheet, CVs and email drafts are ready.", "COMPLETED", { browserTasks });
}
async function processHarnessRuns() {
  const runs = await prisma.harnessRun.findMany({ where: { state: { in: ["SCHEDULED", "RUNNING"] } }, orderBy: { requestedAt: "asc" }, take: 3 });
  for (const run of runs) await processRun(run.id);
}

// src/utils/scheduler.ts
var QUEUE_NAME = "profileai-scheduler";
var schedulerQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5e3 }
  }
});
var schedulerWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    if (job.name === "career-maintenance") await purgeCareerData();
    if (job.name === "career-deliveries") await processDeliveries();
    if (job.name === "harness-runs") await processHarnessRuns();
    if (job.name === "monthly-limit-reset") {
      console.log("[Scheduler] Running monthly limit reset...");
      const resetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3);
      await prisma.userLimit.updateMany({
        data: { resumeUsed: 0, apiUsed: 0, resetAt }
      });
      await prisma.userProfile.updateMany({
        data: { apiCallCount: 0 }
      });
      console.log(`[Scheduler] Monthly limits reset for all users. Next reset: ${resetAt.toISOString()}`);
    }
  },
  { connection: redis }
);
var scheduleMonthlyReset = async () => {
  if (process.env.CAREER_MAINTENANCE_ENABLED === "true") await schedulerQueue.add("career-maintenance", {}, { repeat: { every: 36e5 }, jobId: "career-maintenance", removeOnComplete: 20, removeOnFail: 20 });
  await schedulerQueue.add("career-deliveries", {}, { repeat: { every: 6e4 }, jobId: "career-deliveries", removeOnComplete: 20, removeOnFail: 20 });
  await schedulerQueue.add("harness-runs", {}, { repeat: { every: 3e4 }, jobId: "harness-runs", removeOnComplete: 20, removeOnFail: 20 });
  await schedulerQueue.removeRepeatable("monthly-limit-reset", {
    pattern: "0 0 1 * *"
    // 1st of every month at midnight
  });
  await schedulerQueue.add(
    "monthly-limit-reset",
    {},
    {
      repeat: { pattern: "0 0 1 * *" }
      // Cron: every 1st at midnight
    }
  );
  console.log("[Scheduler] Monthly limit reset job scheduled.");
};
schedulerWorker.on("completed", (job) => {
  console.log(`[Scheduler] Job "${job.name}" completed.`);
});
schedulerWorker.on("failed", (job, err) => {
  console.error(`[Scheduler] Job "${job?.name}" failed:`, err.message);
});
var closeScheduler = async () => {
  await Promise.allSettled([schedulerWorker.close(), schedulerQueue.close()]);
};
export {
  closeScheduler,
  scheduleMonthlyReset,
  schedulerQueue,
  schedulerWorker
};
