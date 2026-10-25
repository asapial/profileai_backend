import {
  ownerLock
} from "./chunk-K2DTZXEZ.js";
import {
  AppError_default,
  prisma
} from "./chunk-KYPQMHV5.js";

// src/modules/worker/worker.gateway.ts
import { createHash as createHash2 } from "crypto";

// src/modules/worker/worker.service.ts
import { randomBytes as randomBytes2 } from "crypto";

// src/modules/worker/worker.crypto.ts
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign as cryptoSign,
  verify as cryptoVerify
} from "crypto";
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item === void 0 ? null : item)).join(",")}]`;
  const entries = Object.entries(value).filter(([, item]) => item !== void 0).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
  return `{${entries.join(",")}}`;
}
function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}
function randomToken(prefix) {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}
function randomPairingCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}
function normalizePairingCode(code) {
  return code.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}
function pairingCodeHash(code) {
  return sha256Hex(`profileai-worker-pairing:${normalizePairingCode(code)}`);
}
function tokenHash(token) {
  return sha256Hex(token);
}
function publicKeyFingerprint(publicKeyPem) {
  return sha256Hex(publicKeyPem.replace(/\s+/g, ""));
}
function generateSigningKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  };
}
function assertEd25519PublicKey(publicKeyPem) {
  let type;
  try {
    type = createPublicKey(publicKeyPem).asymmetricKeyType;
  } catch {
    throw new Error("The worker public key is not a valid PEM key.");
  }
  if (type !== "ed25519") throw new Error("The worker public key must be an Ed25519 key.");
}
function requestSignaturePayload(input) {
  return [
    input.method.toUpperCase(),
    input.path,
    sha256Hex(canonicalJson(input.body ?? {})),
    input.timestamp ?? "",
    input.nonce ?? ""
  ].join("\n");
}
function verifyRequestSignature(publicKeyPem, input, options = {}) {
  const now = options.now ?? /* @__PURE__ */ new Date();
  const maxSkew = options.maxSkewMs ?? 5 * 6e4;
  if (!input.timestamp || !input.nonce) return { valid: false, reason: "Signed timestamp and nonce are required." };
  const timestamp = Date.parse(input.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(now.getTime() - timestamp) > maxSkew) {
    return { valid: false, reason: "Request timestamp is outside the allowed window." };
  }
  if (input.nonce.length < 16) return { valid: false, reason: "Request nonce is too short." };
  try {
    const valid = cryptoVerify(
      null,
      Buffer.from(requestSignaturePayload(input)),
      createPublicKey(publicKeyPem),
      Buffer.from(input.signature, "base64")
    );
    return valid ? { valid: true } : { valid: false, reason: "Request signature is invalid." };
  } catch {
    return { valid: false, reason: "Request signature could not be checked." };
  }
}
function signTaskEnvelope(input, privateKeyPem) {
  const signature = cryptoSign(
    null,
    Buffer.from(canonicalJson(input)),
    createPrivateKey(privateKeyPem)
  ).toString("base64");
  return { ...input, signature };
}
function encryptionKey() {
  const material = process.env.WORKER_KEY_ENCRYPTION_SECRET || process.env.TOTP_ENCRYPTION_KEY || "";
  if (!material) throw new Error("WORKER_KEY_ENCRYPTION_SECRET or TOTP_ENCRYPTION_KEY is required to protect the worker signing key.");
  return createHash("sha256").update(material).digest();
}
function encryptPrivateKey(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
function decryptPrivateKey(value) {
  const [version, iv, tag, data] = value.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Worker signing key is not in the expected format.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
var NonceCache = class {
  constructor(ttlMs = 5 * 6e4, maxEntries = 2e4) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }
  ttlMs;
  maxEntries;
  entries = /* @__PURE__ */ new Map();
  remember(deviceId, nonce, now = Date.now()) {
    this.sweep(now);
    const key = `${deviceId}:${nonce}`;
    if (this.entries.has(key)) return false;
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest) this.entries.delete(oldest);
    }
    this.entries.set(key, now + this.ttlMs);
    return true;
  }
  clear() {
    this.entries.clear();
  }
  sweep(now) {
    for (const [key, expiry] of this.entries) {
      if (expiry <= now) this.entries.delete(key);
      else break;
    }
  }
};

// src/modules/worker/worker.keys.ts
var SIGNING_KEY = "worker_server_signing_key_v1";
var PUBLIC_KEY = "worker_server_public_key_v1";
var cached = null;
async function getServerSigningKey() {
  if (cached) return cached;
  const existing = await prisma.platformConfig.findUnique({ where: { key: SIGNING_KEY } });
  if (existing) {
    const publicRow2 = await prisma.platformConfig.findUnique({ where: { key: PUBLIC_KEY } });
    if (!publicRow2) throw new Error("Worker signing public key is missing.");
    cached = { publicKey: publicRow2.value, privateKey: decryptPrivateKey(existing.value) };
    return cached;
  }
  const generated = generateSigningKeyPair();
  await prisma.platformConfig.createMany({
    data: [
      {
        key: SIGNING_KEY,
        value: encryptPrivateKey(generated.privateKey),
        description: "Ed25519 private key used to sign local browser worker task envelopes. Never returned by an API.",
        updatedBy: "system"
      },
      {
        key: PUBLIC_KEY,
        value: generated.publicKey,
        description: "Ed25519 public key pinned by paired local browser workers.",
        updatedBy: "system"
      }
    ],
    skipDuplicates: true
  });
  const [privateRow, publicRow] = await Promise.all([
    prisma.platformConfig.findUnique({ where: { key: SIGNING_KEY } }),
    prisma.platformConfig.findUnique({ where: { key: PUBLIC_KEY } })
  ]);
  if (!privateRow || !publicRow) throw new Error("Worker signing key could not be initialized.");
  cached = { privateKey: decryptPrivateKey(privateRow.value), publicKey: publicRow.value };
  return cached;
}

// src/modules/worker/worker.trust.ts
function pairingCodeStatus(code, now = /* @__PURE__ */ new Date()) {
  if (code.usedAt) return "USED";
  if (code.expiresAt <= now) return "EXPIRED";
  return "VALID";
}
function accessSessionStatus(session, now = /* @__PURE__ */ new Date()) {
  if (session.device.status !== "ACTIVE" || session.device.revokedAt) return "DEVICE_REVOKED";
  if (session.revokedAt) return "REVOKED";
  if (session.accessExpiresAt <= now) return "EXPIRED";
  return "ACTIVE";
}
function refreshSessionStatus(session, now = /* @__PURE__ */ new Date()) {
  if (session.device.status !== "ACTIVE" || session.device.revokedAt) return "DEVICE_REVOKED";
  if (session.revokedAt) return "REVOKED";
  if (session.refreshExpiresAt <= now) return "EXPIRED";
  return "ACTIVE";
}
function newSessionMaterial(now = Date.now()) {
  const accessToken = randomToken("paiw_at_");
  const refreshToken = randomToken("paiw_rt_");
  return {
    accessToken,
    refreshToken,
    accessTokenHash: tokenHash(accessToken),
    refreshTokenHash: tokenHash(refreshToken),
    accessExpiresAt: new Date(now + 24 * 60 * 6e4),
    refreshExpiresAt: new Date(now + 30 * 24 * 60 * 6e4)
  };
}

// src/modules/worker/worker.policy.data.ts
var reviewedAt = "2026-10-01T00:00:00.000Z";
var REVIEWED_POLICIES = [
  {
    source: "GREENHOUSE",
    name: "Greenhouse job boards",
    version: "greenhouse-2026.10",
    level: "A",
    domains: ["boards.greenhouse.io", "job-boards.greenhouse.io", "greenhouse.io"],
    discovery: true,
    extraction: true,
    formFill: true,
    submit: true,
    userPresenceRequired: false,
    maxPagesPerRun: 40,
    maxRequestsPerMinute: 20,
    reviewedAt,
    reviewReference: "SEC-2026-041",
    notes: "Official job-board pages and public APIs. Never automate authenticated recruiter dashboards.",
    enabled: true
  },
  {
    source: "LEVER",
    name: "Lever job boards",
    version: "lever-2026.10",
    level: "A",
    domains: ["jobs.lever.co", "jobs.eu.lever.co", "lever.co"],
    discovery: true,
    extraction: true,
    formFill: true,
    submit: true,
    userPresenceRequired: false,
    maxPagesPerRun: 40,
    maxRequestsPerMinute: 20,
    reviewedAt,
    reviewReference: "SEC-2026-042",
    notes: "Public job-board pages only. Submission stays gated by the run mode and approval policy.",
    enabled: true
  },
  {
    source: "ASHBY",
    name: "Ashby job boards",
    version: "ashby-2026.10",
    level: "A",
    domains: ["jobs.ashbyhq.com", "ashbyhq.com"],
    discovery: true,
    extraction: true,
    formFill: true,
    submit: true,
    userPresenceRequired: false,
    maxPagesPerRun: 30,
    maxRequestsPerMinute: 18,
    reviewedAt,
    reviewReference: "SEC-2026-043",
    notes: "Public posting pages only. Unknown required questions always stop for review.",
    enabled: true
  },
  {
    source: "REMOTIVE",
    name: "Remotive",
    version: "remotive-2026.10",
    level: "A",
    domains: ["remotive.com", "remotive.io"],
    discovery: true,
    extraction: true,
    formFill: false,
    submit: false,
    userPresenceRequired: false,
    maxPagesPerRun: 20,
    maxRequestsPerMinute: 12,
    reviewedAt,
    reviewReference: "SEC-2026-044",
    notes: "Discovery and extraction only. Applications continue on the employer page, not on Remotive.",
    enabled: true
  },
  {
    source: "COMPANY_CAREER",
    name: "Company career pages",
    version: "career-page-2026.10",
    level: "A",
    domains: ["*"],
    discovery: true,
    extraction: true,
    formFill: true,
    submit: false,
    userPresenceRequired: false,
    maxPagesPerRun: 20,
    maxRequestsPerMinute: 10,
    reviewedAt,
    reviewReference: "SEC-2026-045",
    notes: "The task allowlist is authoritative. Submit is off by default for unknown career sites.",
    enabled: true
  },
  {
    source: "FACEBOOK",
    name: "Facebook (user-assisted)",
    version: "facebook-2026.10",
    level: "B",
    domains: ["facebook.com", "www.facebook.com", "m.facebook.com"],
    discovery: false,
    extraction: true,
    formFill: false,
    submit: false,
    userPresenceRequired: true,
    maxPagesPerRun: 1,
    maxRequestsPerMinute: 2,
    reviewedAt,
    reviewReference: "SEC-2026-046",
    notes: "The user opens a page and presses Capture current page. No crawling, pagination, messaging, or applications.",
    enabled: true
  },
  {
    source: "LINKEDIN",
    name: "LinkedIn (manual handoff)",
    version: "linkedin-2026.10",
    level: "C",
    domains: ["linkedin.com", "www.linkedin.com"],
    discovery: false,
    extraction: false,
    formFill: false,
    submit: false,
    userPresenceRequired: true,
    maxPagesPerRun: 1,
    maxRequestsPerMinute: 1,
    reviewedAt,
    reviewReference: "SEC-2026-047",
    notes: "Show a user-opened job URL only. Collection and application automation are disabled; continue on the employer site.",
    enabled: true
  },
  {
    source: "MANUAL",
    name: "Manual current page",
    version: "manual-2026.10",
    level: "C",
    domains: ["*"],
    discovery: false,
    extraction: false,
    formFill: false,
    submit: false,
    userPresenceRequired: true,
    maxPagesPerRun: 1,
    maxRequestsPerMinute: 1,
    reviewedAt,
    reviewReference: "SEC-2026-048",
    notes: "No automation. Used when a user explicitly wants to save a URL without capture.",
    enabled: true
  }
];
function policyForSource(source) {
  const policy = REVIEWED_POLICIES.find((item) => item.source === source);
  if (!policy) throw new Error(`No reviewed worker policy exists for ${source}.`);
  return policy;
}
function mapAdapterToSource(adapter, explicitSource) {
  if (explicitSource && REVIEWED_POLICIES.some((policy) => policy.source === explicitSource)) return explicitSource;
  const normalized = adapter.trim().toUpperCase();
  if (normalized === "GREENHOUSE" || normalized === "LEVER" || normalized === "ASHBY" || normalized === "REMOTIVE") return normalized;
  if (normalized === "FACEBOOK") return "FACEBOOK";
  if (normalized === "LINKEDIN") return "LINKEDIN";
  if (normalized === "MANUAL") return "MANUAL";
  return "COMPANY_CAREER";
}
var HOST_SOURCE_RULES = [
  { source: "LINKEDIN", domains: ["linkedin.com"] },
  { source: "FACEBOOK", domains: ["facebook.com"] },
  { source: "GREENHOUSE", domains: ["greenhouse.io"] },
  { source: "LEVER", domains: ["lever.co"] },
  { source: "ASHBY", domains: ["ashbyhq.com"] },
  { source: "REMOTIVE", domains: ["remotive.com", "remotive.io"] }
];
var hostMatches = (hostname, domain) => hostname === domain || hostname.endsWith(`.${domain}`);
function classifyTaskSource(adapter, targetUrl, explicitSource) {
  let hostname = "";
  try {
    const url = new URL(targetUrl ?? "");
    if (url.protocol === "http:" || url.protocol === "https:") hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    hostname = "";
  }
  if (hostname) {
    for (const rule of HOST_SOURCE_RULES) {
      if (rule.domains.some((domain) => hostMatches(hostname, domain))) return rule.source;
    }
    const hinted = explicitSource ? REVIEWED_POLICIES.find((policy) => policy.source === explicitSource) : void 0;
    if (hinted && hinted.domains.some((domain) => domain !== "*" && hostMatches(hostname, domain))) return hinted.source;
    return "COMPANY_CAREER";
  }
  return mapAdapterToSource(adapter, explicitSource);
}
function mapTaskMode(mode) {
  if (mode === "RESEARCH") return "RESEARCH";
  if (mode === "REVIEW_SUBMIT" || mode === "ASSISTED") return "ASSISTED";
  return "DRAFT";
}

// src/modules/worker/worker.policy.ts
async function ensureWorkerPolicies() {
  await prisma.$transaction(
    REVIEWED_POLICIES.map((policy) => prisma.sitePolicy.upsert({
      where: { source_version: { source: policy.source, version: policy.version } },
      create: {
        source: policy.source,
        name: policy.name,
        version: policy.version,
        level: policy.level,
        domains: policy.domains,
        discovery: policy.discovery,
        extraction: policy.extraction,
        formFill: policy.formFill,
        submit: policy.submit,
        userPresenceRequired: policy.userPresenceRequired,
        maxPagesPerRun: policy.maxPagesPerRun,
        maxRequestsPerMinute: policy.maxRequestsPerMinute,
        reviewedAt: new Date(policy.reviewedAt),
        reviewReference: policy.reviewReference,
        notes: policy.notes,
        enabled: policy.enabled,
        reviewedBy: "security"
      },
      update: {
        name: policy.name,
        level: policy.level,
        domains: policy.domains,
        discovery: policy.discovery,
        extraction: policy.extraction,
        formFill: policy.formFill,
        submit: policy.submit,
        userPresenceRequired: policy.userPresenceRequired,
        maxPagesPerRun: policy.maxPagesPerRun,
        maxRequestsPerMinute: policy.maxRequestsPerMinute,
        reviewedAt: new Date(policy.reviewedAt),
        reviewReference: policy.reviewReference,
        notes: policy.notes,
        enabled: policy.enabled
      }
    }))
  );
  const currentVersions = REVIEWED_POLICIES.map((policy) => policy.version);
  await prisma.sitePolicy.updateMany({
    where: { version: { notIn: currentVersions }, enabled: true },
    data: { enabled: false }
  });
}

// src/modules/worker/worker.service.ts
var PAIRING_TTL_MS = 10 * 6e4;
var TASK_TTL_MS = 15 * 6e4;
var asObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
var asStringArray = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.length > 0) : [];
var readString = (value, fallback = "") => typeof value === "string" ? value : fallback;
var audit = (userId, action, entityType, entityId, outcome, metadata = {}) => prisma.harnessAuditEvent.create({
  data: {
    userId,
    action,
    entityType,
    ...entityId ? { entityId } : {},
    outcome,
    metadata
  }
});
async function createPairingCode(userId, nameHint) {
  const code = randomPairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
  await prisma.$transaction([
    prisma.workerPairingCode.updateMany({
      where: { userId, usedAt: null, expiresAt: { gt: /* @__PURE__ */ new Date() } },
      data: { expiresAt: /* @__PURE__ */ new Date() }
    }),
    prisma.workerPairingCode.create({
      data: {
        userId,
        codeHash: pairingCodeHash(code),
        expiresAt,
        ...nameHint ? { nameHint } : {}
      }
    })
  ]);
  await audit(userId, "WORKER_PAIRING_CODE_CREATED", "WorkerPairingCode", null, "SUCCESS", { expiresAt: expiresAt.toISOString() });
  return { code, expiresAt: expiresAt.toISOString(), expiresInSeconds: Math.floor(PAIRING_TTL_MS / 1e3) };
}
async function pairWorker(input, ip) {
  try {
    assertEd25519PublicKey(input.publicKey);
  } catch (error) {
    throw new AppError_default(400, error instanceof Error ? error.message : "Invalid worker public key.");
  }
  const codeHash = pairingCodeHash(input.code);
  const pairing = await prisma.workerPairingCode.findUnique({ where: { codeHash } });
  if (!pairing) throw new AppError_default(401, "Pairing code is invalid.");
  const status = pairingCodeStatus(pairing);
  if (status === "USED") throw new AppError_default(409, "Pairing code has already been used.");
  if (status === "EXPIRED") throw new AppError_default(410, "Pairing code has expired. Create a new code in ProfileAI.");
  const tokens = newSessionMaterial();
  const accessToken = tokens.accessToken;
  const refreshToken = tokens.refreshToken;
  const accessExpiresAt = tokens.accessExpiresAt;
  const refreshExpiresAt = tokens.refreshExpiresAt;
  const fingerprint = publicKeyFingerprint(input.publicKey);
  const serverKey = await getServerSigningKey();
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.workerPairingCode.updateMany({
      where: { id: pairing.id, usedAt: null, expiresAt: { gt: /* @__PURE__ */ new Date() } },
      data: { usedAt: /* @__PURE__ */ new Date() }
    });
    if (!claimed.count) throw new AppError_default(409, "Pairing code has already been used.");
    const existing = await tx.workerDevice.findUnique({ where: { publicKeyFingerprint: fingerprint } });
    if (existing && existing.userId !== pairing.userId) throw new AppError_default(409, "This device key is already paired to another account.");
    const device = existing ? await tx.workerDevice.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        platform: input.platform,
        appVersion: input.appVersion,
        capabilities: input.capabilities,
        status: "ACTIVE",
        revokedAt: null,
        pairedAt: /* @__PURE__ */ new Date(),
        lastSeenAt: /* @__PURE__ */ new Date(),
        ...ip ? { lastIp: ip } : {}
      }
    }) : await tx.workerDevice.create({
      data: {
        userId: pairing.userId,
        name: input.name,
        platform: input.platform,
        appVersion: input.appVersion,
        publicKey: input.publicKey,
        publicKeyFingerprint: fingerprint,
        capabilities: input.capabilities,
        ...ip ? { lastIp: ip } : {}
      }
    });
    if (existing) {
      await tx.workerSession.updateMany({ where: { deviceId: device.id, revokedAt: null }, data: { revokedAt: /* @__PURE__ */ new Date() } });
    }
    await tx.workerSession.create({
      data: {
        deviceId: device.id,
        accessTokenHash: tokenHash(accessToken),
        refreshTokenHash: tokenHash(refreshToken),
        accessExpiresAt,
        refreshExpiresAt
      }
    });
    await tx.workerPairingCode.update({ where: { id: pairing.id }, data: { deviceId: device.id } });
    await tx.harnessAuditEvent.create({
      data: {
        userId: pairing.userId,
        action: "WORKER_DEVICE_PAIRED",
        entityType: "WorkerDevice",
        entityId: device.id,
        outcome: "SUCCESS",
        metadata: { name: input.name, platform: input.platform, appVersion: input.appVersion, fingerprint }
      }
    });
    return { deviceId: device.id, deviceName: device.name };
  });
  return {
    ...result,
    accessToken,
    refreshToken,
    accessExpiresAt: accessExpiresAt.toISOString(),
    serverPublicKey: serverKey.publicKey,
    serverName: "ProfileAI Cloud"
  };
}
async function refreshWorkerSession(input, signedDeviceId) {
  if (input.deviceId !== signedDeviceId) throw new AppError_default(401, "Refresh request device does not match the signature.");
  const session = await prisma.workerSession.findUnique({
    where: { refreshTokenHash: tokenHash(input.refreshToken) },
    include: { device: true }
  });
  if (!session || session.deviceId !== input.deviceId) throw new AppError_default(401, "Worker refresh token is invalid.");
  const status = refreshSessionStatus(session);
  if (status === "DEVICE_REVOKED") throw new AppError_default(401, "Worker device is revoked.");
  if (status !== "ACTIVE") throw new AppError_default(401, "Worker refresh token is expired or revoked.");
  const tokens = newSessionMaterial();
  const accessToken = tokens.accessToken;
  const refreshToken = tokens.refreshToken;
  const accessExpiresAt = tokens.accessExpiresAt;
  const refreshExpiresAt = tokens.refreshExpiresAt;
  const rotated = await prisma.workerSession.updateMany({
    where: { id: session.id, refreshTokenHash: tokenHash(input.refreshToken), revokedAt: null, refreshExpiresAt: { gt: /* @__PURE__ */ new Date() } },
    data: {
      accessTokenHash: tokenHash(accessToken),
      refreshTokenHash: tokenHash(refreshToken),
      accessExpiresAt,
      refreshExpiresAt,
      lastUsedAt: /* @__PURE__ */ new Date(),
      rotatedAt: /* @__PURE__ */ new Date()
    }
  });
  if (!rotated.count) throw new AppError_default(401, "Worker refresh token was already rotated.");
  await prisma.workerDevice.update({ where: { id: session.deviceId }, data: { lastSeenAt: /* @__PURE__ */ new Date() } });
  await audit(session.device.userId, "WORKER_TOKEN_ROTATED", "WorkerDevice", session.deviceId, "SUCCESS");
  return {
    accessToken,
    refreshToken,
    accessExpiresAt: accessExpiresAt.toISOString(),
    refreshExpiresAt: refreshExpiresAt.toISOString()
  };
}
async function sessionFromRawAccessToken(rawToken) {
  if (!rawToken.startsWith("paiw_at_")) return null;
  const session = await prisma.workerSession.findUnique({
    where: { accessTokenHash: tokenHash(rawToken) },
    include: { device: true }
  });
  if (!session || accessSessionStatus(session) !== "ACTIVE") return null;
  return session;
}
async function touchWorkerDevice(deviceId, userId, ip) {
  await prisma.workerDevice.updateMany({
    where: { id: deviceId, userId, status: "ACTIVE", revokedAt: null },
    data: { lastSeenAt: /* @__PURE__ */ new Date(), ...ip ? { lastIp: ip } : {} }
  });
}
async function heartbeat(userId, deviceId, ip) {
  await touchWorkerDevice(deviceId, userId, ip);
  return { ok: true, serverTime: (/* @__PURE__ */ new Date()).toISOString() };
}
async function revokeDevice(userId, deviceId) {
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.workerDevice.updateMany({
      where: { id: deviceId, userId, revokedAt: null },
      data: { status: "REVOKED", revokedAt: /* @__PURE__ */ new Date() }
    });
    if (!updated.count) throw new AppError_default(404, "Worker device not found.");
    await tx.workerSession.updateMany({ where: { deviceId, revokedAt: null }, data: { revokedAt: /* @__PURE__ */ new Date() } });
    await tx.workerApproval.updateMany({ where: { deviceId, state: "PENDING" }, data: { state: "REVOKED", decidedAt: /* @__PURE__ */ new Date(), decidedBy: userId, decisionNote: "Device revoked." } });
    await tx.harnessAuditEvent.create({
      data: { userId, action: "WORKER_DEVICE_REVOKED", entityType: "WorkerDevice", entityId: deviceId, outcome: "SUCCESS", metadata: { message: "All worker sessions and pending approvals were revoked." } }
    });
    return tx.workerDevice.findUnique({ where: { id: deviceId }, select: { id: true, name: true, revokedAt: true } });
  });
  return result;
}
function envelopeInputForTask(task, deviceId, policyVersion, now) {
  let url;
  try {
    url = new URL(task.targetUrl);
  } catch {
    throw new AppError_default(409, "Browser task has an invalid target URL.");
  }
  if (!["https:", "http:"].includes(url.protocol)) throw new AppError_default(409, "Browser task target must use HTTP or HTTPS.");
  const source = classifyTaskSource(task.adapter, task.targetUrl, task.source);
  const policy = policyForSource(source);
  const payload = asObject(task.payload);
  const requestedDomains = asStringArray(payload.allowedDomains).map((item) => item.trim().toLowerCase()).filter(Boolean);
  const policyDomains = policy.domains.filter((domain) => domain !== "*");
  const allowedDomains = [.../* @__PURE__ */ new Set([url.hostname.toLowerCase(), ...policyDomains, ...requestedDomains])].slice(0, 60);
  const limits = asObject(payload.limits);
  const requestedPages = typeof limits.maxPages === "number" ? Math.floor(limits.maxPages) : 12;
  const rawDocuments = Array.isArray(payload.documents) ? payload.documents : [];
  const documents = rawDocuments.flatMap((item) => {
    const document = asObject(item);
    const kind = readString(document.kind);
    if (!document.id || !document.name || !["RESUME", "COVER_LETTER", "EMAIL", "ANSWER"].includes(kind)) return [];
    return [{
      id: String(document.id).slice(0, 200),
      kind,
      name: String(document.name).slice(0, 300),
      version: typeof document.version === "number" ? Math.max(1, Math.floor(document.version)) : 1,
      ...typeof document.sha256 === "string" && /^[a-f0-9]{64}$/.test(document.sha256) ? { sha256: document.sha256 } : {},
      ...typeof document.url === "string" ? { url: document.url } : {}
    }];
  }).slice(0, 20);
  const taskType = readString(payload.taskType, task.adapter === "SEARCH" ? "DISCOVER" : "PREPARE");
  const allowedTypes = ["DISCOVER", "CAPTURE", "PREPARE", "VERIFY", "SUBMIT"];
  const type = allowedTypes.includes(taskType) ? taskType : "PREPARE";
  return {
    protocolVersion: 1,
    taskId: task.id,
    deviceId,
    runId: task.runId,
    type,
    mode: mapTaskMode(task.mode),
    source,
    targetUrl: task.targetUrl,
    allowedDomains: allowedDomains.length ? allowedDomains : [url.hostname.toLowerCase()],
    limits: {
      maxPages: Math.max(1, Math.min(requestedPages, policy.maxPagesPerRun)),
      maxActions: typeof limits.maxActions === "number" ? Math.max(1, Math.min(2e3, Math.floor(limits.maxActions))) : 80,
      maxDurationMs: typeof limits.maxDurationMs === "number" ? Math.max(1e3, Math.min(36e5, Math.floor(limits.maxDurationMs))) : 6e5,
      maxConcurrentPages: typeof limits.maxConcurrentPages === "number" ? Math.max(1, Math.min(3, Math.floor(limits.maxConcurrentPages))) : 1
    },
    policyVersion,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TASK_TTL_MS).toISOString(),
    nonce: randomBytes2(18).toString("hex"),
    payload,
    documents
  };
}
async function claimTask(userId, deviceId) {
  const device = await prisma.workerDevice.findFirst({ where: { id: deviceId, userId, status: "ACTIVE", revokedAt: null } });
  if (!device) throw new AppError_default(401, "Worker device is not active.");
  const serverKey = await getServerSigningKey();
  return prisma.$transaction(async (tx) => {
    await ownerLock(tx, userId);
    await tx.browserTask.updateMany({
      where: { userId, deviceId, state: "CLAIMED", claimedAt: { lt: new Date(Date.now() - TASK_TTL_MS) } },
      data: { state: "WAITING_FOR_USER", error: "The worker did not finish this task in time. Verify the page before retrying." }
    });
    for (let candidates = 0; candidates < 8; candidates += 1) {
      const task = await tx.browserTask.findFirst({
        where: {
          userId,
          state: "QUEUED",
          mode: { not: "AUTO_APPLY" },
          AND: [
            { OR: [{ deviceId: null }, { deviceId }] },
            { OR: [{ expiresAt: null }, { expiresAt: { gt: /* @__PURE__ */ new Date() } }] }
          ]
        },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }]
      });
      if (!task) return { task: null };
      const source = classifyTaskSource(task.adapter, task.targetUrl, task.source);
      const claimPolicy = policyForSource(source);
      if (claimPolicy.level !== "A" || claimPolicy.userPresenceRequired) {
        const blockedAt = /* @__PURE__ */ new Date();
        await tx.browserTask.update({
          where: { id: task.id },
          data: {
            state: "BLOCKED",
            source,
            finishedAt: blockedAt,
            error: `${claimPolicy.name} requires an explicit user-assisted session and cannot be claimed automatically.`
          }
        });
        await tx.harnessAuditEvent.create({
          data: {
            userId,
            runId: task.runId,
            action: "WORKER_TASK_BLOCKED",
            entityType: "BrowserTask",
            entityId: task.id,
            outcome: "BLOCKED",
            metadata: { source, level: claimPolicy.level, message: "User-assisted source is not eligible for automatic claims." }
          }
        });
        continue;
      }
      const now = /* @__PURE__ */ new Date();
      let envelope;
      try {
        envelope = signTaskEnvelope(envelopeInputForTask(task, deviceId, claimPolicy.version, now), serverKey.privateKey);
      } catch (error) {
        await tx.browserTask.update({
          where: { id: task.id },
          data: {
            state: "BLOCKED",
            error: error instanceof Error ? error.message : "Task policy validation failed.",
            finishedAt: now
          }
        });
        await tx.harnessAuditEvent.create({
          data: { userId, runId: task.runId, action: "WORKER_TASK_BLOCKED", entityType: "BrowserTask", entityId: task.id, outcome: "BLOCKED", metadata: { message: error instanceof Error ? error.message : "Task policy validation failed." } }
        });
        continue;
      }
      const issuedExpiry = new Date(envelope.expiresAt);
      const claimed = await tx.browserTask.updateMany({
        where: { id: task.id, state: "QUEUED", OR: [{ deviceId: null }, { deviceId }] },
        data: {
          state: "CLAIMED",
          deviceId,
          claimedAt: now,
          expiresAt: issuedExpiry,
          source,
          signature: envelope.signature,
          policyVersion: envelope.policyVersion,
          revision: { increment: 1 },
          attempt: { increment: 1 },
          progress: 5,
          error: null
        }
      });
      if (!claimed.count) continue;
      await tx.harnessAuditEvent.create({
        data: { userId, runId: task.runId, action: "WORKER_TASK_CLAIMED", entityType: "BrowserTask", entityId: task.id, outcome: "CLAIMED", metadata: { deviceId, source, policyVersion: envelope.policyVersion, revision: task.revision + 1 } }
      });
      return { task: envelope };
    }
    return { task: null };
  });
}
async function recordEvents(userId, deviceId, taskId, events) {
  const task = await prisma.browserTask.findFirst({ where: { id: taskId, userId } });
  if (!task) throw new AppError_default(404, "Browser task not found.");
  if (task.deviceId && task.deviceId !== deviceId) throw new AppError_default(403, "Browser task belongs to another worker.");
  if (events.some((event) => event.taskId !== taskId)) throw new AppError_default(400, "Every event must belong to the task in the route.");
  const progressEvent = [...events].reverse().find((event) => event.type === "PROGRESS");
  const progressValue = progressEvent ? progressEvent.data.progress : void 0;
  const progress = typeof progressValue === "number" && Number.isFinite(progressValue) ? Math.max(0, Math.min(100, Math.floor(progressValue))) : task.progress;
  const created = await prisma.browserTaskEvent.createMany({
    data: events.map((event) => ({
      taskId,
      userId,
      seq: event.seq,
      type: event.type,
      message: event.message,
      data: event.data,
      redacted: event.redacted,
      createdAt: Number.isFinite(Date.parse(event.at)) ? new Date(event.at) : /* @__PURE__ */ new Date()
    })),
    skipDuplicates: true
  });
  if (created.count) {
    await prisma.browserTask.update({
      where: { id: taskId },
      data: { progress }
    });
    const latest = events[events.length - 1];
    await prisma.harnessAuditEvent.create({
      data: { userId, runId: task.runId, action: "WORKER_TASK_EVENTS", entityType: "BrowserTask", entityId: taskId, outcome: "SUCCESS", metadata: { accepted: created.count, latestType: latest.type, latestSeq: latest.seq } }
    });
  }
  const last = await prisma.browserTaskEvent.findFirst({ where: { taskId }, orderBy: { seq: "desc" }, select: { seq: true } });
  return { accepted: created.count, lastSeq: last?.seq ?? null };
}
async function recordCheckpoint(userId, deviceId, checkpoint) {
  const task = await prisma.browserTask.findFirst({ where: { id: checkpoint.taskId, userId } });
  if (!task) throw new AppError_default(404, "Browser task not found.");
  if (task.deviceId && task.deviceId !== deviceId) throw new AppError_default(403, "Browser task belongs to another worker.");
  if (checkpoint.deviceId !== deviceId) throw new AppError_default(403, "Checkpoint device does not match the signed request.");
  if (checkpoint.submitted) {
    const approval = await prisma.workerApproval.findFirst({
      where: { taskId: task.id, userId, kind: "SUBMIT", state: "APPROVED", expiresAt: { gt: /* @__PURE__ */ new Date() } },
      orderBy: { decidedAt: "desc" }
    });
    if (!approval) throw new AppError_default(409, "A submitted checkpoint requires a live, approved submit approval.");
  }
  const saved = await prisma.browserTaskCheckpoint.upsert({
    where: { taskId_sequence: { taskId: checkpoint.taskId, sequence: checkpoint.sequence } },
    create: {
      taskId: checkpoint.taskId,
      deviceId,
      userId,
      sequence: checkpoint.sequence,
      state: checkpoint.state,
      url: checkpoint.url,
      step: checkpoint.step,
      observationHash: checkpoint.observationHash,
      completedActions: checkpoint.completedActions,
      submitted: checkpoint.submitted,
      metadata: checkpoint.metadata,
      createdAt: Number.isFinite(Date.parse(checkpoint.createdAt)) ? new Date(checkpoint.createdAt) : /* @__PURE__ */ new Date()
    },
    update: {
      state: checkpoint.state,
      url: checkpoint.url,
      step: checkpoint.step,
      observationHash: checkpoint.observationHash,
      completedActions: checkpoint.completedActions,
      submitted: checkpoint.submitted,
      metadata: checkpoint.metadata
    }
  });
  await prisma.harnessAuditEvent.create({
    data: { userId, runId: task.runId, action: "WORKER_TASK_CHECKPOINT", entityType: "BrowserTask", entityId: task.id, outcome: checkpoint.submitted ? "SUBMITTED" : "SUCCESS", metadata: { sequence: checkpoint.sequence, state: checkpoint.state, submitted: checkpoint.submitted } }
  });
  return saved;
}
async function reportResult(userId, deviceId, taskId, report) {
  return prisma.$transaction(async (tx) => {
    await ownerLock(tx, userId);
    const task = await tx.browserTask.findFirst({ where: { id: taskId, userId } });
    if (!task) throw new AppError_default(404, "Browser task not found.");
    if (task.deviceId && task.deviceId !== deviceId) throw new AppError_default(403, "Browser task belongs to another worker.");
    const terminal = ["COMPLETED", "SUBMITTED", "BLOCKED", "FAILED", "CANCELLED"].includes(report.state);
    if (["COMPLETED", "SUBMITTED", "BLOCKED", "FAILED", "CANCELLED"].includes(task.state)) {
      if (task.state === report.state) return task;
      throw new AppError_default(409, `This task already finished as ${task.state} and cannot change to ${report.state}.`);
    }
    const now = /* @__PURE__ */ new Date();
    const policy = policyForSource(classifyTaskSource(task.adapter, task.targetUrl, task.source));
    if (report.state === "SUBMITTED") {
      if (!["REVIEW_SUBMIT", "ASSISTED"].includes(task.mode)) throw new AppError_default(409, "This task was not started in assisted submit mode. Nothing may be submitted.");
      if (!policy.submit || policy.level !== "A") throw new AppError_default(409, `${policy.name} does not permit automated submission.`);
      const approval = await tx.workerApproval.findFirst({
        where: { userId, taskId: task.id, kind: "SUBMIT", state: "APPROVED", expiresAt: { gt: /* @__PURE__ */ new Date() } },
        orderBy: { decidedAt: "desc" }
      });
      if (!approval) throw new AppError_default(409, "Submission requires a live, approved submit approval.");
      const confirmationUrl = report.confirmation?.url?.trim() ?? "";
      const confirmationText = report.confirmation?.text?.trim() ?? "";
      if (!confirmationUrl && !confirmationText) throw new AppError_default(409, "A submitted result requires visible confirmation evidence.");
      if (confirmationUrl) {
        let parsed;
        try {
          parsed = new URL(confirmationUrl);
        } catch {
          throw new AppError_default(400, "The submitted confirmation URL is invalid.");
        }
        if (!["https:", "http:"].includes(parsed.protocol)) throw new AppError_default(400, "The submitted confirmation URL must use HTTP or HTTPS.");
      }
    }
    const updated = await tx.browserTask.update({
      where: { id: task.id },
      data: {
        state: report.state,
        result: report,
        error: report.blocker ?? null,
        progress: report.progress ?? (report.state === "SUBMITTED" || report.state === "COMPLETED" ? 100 : task.progress),
        finishedAt: terminal ? now : null
      }
    });
    if (report.state === "SUBMITTED") {
      const job = await tx.job.findFirst({ where: { id: task.jobId, userId } });
      if (!job) throw new AppError_default(404, "Job not found for submitted task.");
      const application = task.applicationId ? await tx.jobApplication.findFirst({ where: { id: task.applicationId, userId } }) : await tx.jobApplication.findFirst({ where: { userId, jobId: job.id } });
      const saved = application ? await tx.jobApplication.update({ where: { id: application.id }, data: { status: "APPLIED", appliedAt: now } }) : await tx.jobApplication.create({ data: { userId, jobId: job.id, company: job.company, role: job.title, jobUrl: job.canonicalUrl, location: job.location, status: "APPLIED" } });
      await tx.applicationEvent.create({
        data: { userId, applicationId: saved.id, type: "STATUS_CHANGE", payload: { source: "LOCAL_BROWSER_WORKER", taskId: task.id, confirmation: report.confirmation ?? null } }
      });
      await tx.browserTask.update({ where: { id: task.id }, data: { applicationId: saved.id } });
    }
    await tx.harnessAuditEvent.create({
      data: {
        userId,
        runId: task.runId,
        action: "WORKER_TASK_REPORTED",
        entityType: "BrowserTask",
        entityId: task.id,
        outcome: report.state,
        metadata: {
          adapter: report.adapter || task.adapter,
          deviceId,
          unknownFields: report.unknownFields,
          message: report.blocker ?? (report.state === "SUBMITTED" ? "Application submitted after explicit approval." : report.state === "COMPLETED" ? "Task completed without submission." : `Task is ${report.state.toLowerCase().replaceAll("_", " ")}.`)
        }
      }
    });
    if (task.runId) {
      const remaining = await tx.browserTask.count({ where: { runId: task.runId, state: { in: ["QUEUED", "CLAIMED", "OPENED", "FILLED", "WAITING_FOR_USER", "BLOCKED"] } } });
      if (!remaining) {
        const failed = await tx.browserTask.count({ where: { runId: task.runId, state: "FAILED" } });
        await tx.harnessRun.updateMany({
          where: { id: task.runId, userId, state: "WAITING_FOR_USER" },
          data: { state: failed ? "PARTIAL" : "COMPLETED", finishedAt: now, error: failed ? "One or more browser tasks failed." : null }
        });
      }
    }
    return updated;
  });
}
async function requestApproval(userId, deviceId, taskId, input) {
  if (input.taskId !== taskId) throw new AppError_default(400, "Approval task does not match the route.");
  if (input.deviceId !== deviceId) throw new AppError_default(403, "Approval device does not match the signed request.");
  const task = await prisma.browserTask.findFirst({ where: { id: taskId, userId } });
  if (!task) throw new AppError_default(404, "Browser task not found.");
  if (task.deviceId && task.deviceId !== deviceId) throw new AppError_default(403, "Browser task belongs to another worker.");
  const policy = policyForSource(classifyTaskSource(task.adapter, task.targetUrl, task.source));
  if (input.kind === "SUBMIT" && (!policy.submit || policy.level !== "A")) {
    throw new AppError_default(409, `${policy.name} does not permit submission. No approval was created.`);
  }
  if (input.kind === "SUBMIT" && !["REVIEW_SUBMIT", "ASSISTED"].includes(task.mode)) {
    throw new AppError_default(409, "Submit approval can only be requested in assisted submit mode.");
  }
  const expiresAt = new Date(input.expiresAt);
  if (!Number.isFinite(expiresAt.getTime())) throw new AppError_default(400, "Approval expiry is invalid.");
  if (expiresAt <= /* @__PURE__ */ new Date()) throw new AppError_default(410, "Approval request has already expired.");
  if (expiresAt.getTime() > Date.now() + 24 * 60 * 6e4) throw new AppError_default(400, "Approval expiry cannot exceed 24 hours.");
  const existing = await prisma.workerApproval.findFirst({
    where: { taskId, userId, deviceId, kind: input.kind, summary: input.summary, state: "PENDING", expiresAt: { gt: /* @__PURE__ */ new Date() } }
  });
  if (existing) return { id: existing.id, expiresAt: existing.expiresAt.toISOString(), reused: true };
  const requestedId = readString(input.evidence.approvalId);
  const approvalId = /^apr_[A-Za-z0-9-]{8,100}$/.test(requestedId) ? requestedId : void 0;
  if (approvalId) {
    const existingById = await prisma.workerApproval.findUnique({ where: { id: approvalId } });
    if (existingById) {
      if (existingById.userId !== userId || existingById.taskId !== taskId) throw new AppError_default(409, "Approval id is already used by another task.");
      return { id: existingById.id, expiresAt: existingById.expiresAt.toISOString(), reused: true };
    }
  }
  const actionHash = sha256Hex(canonicalJson({ taskId, deviceId, kind: input.kind, summary: input.summary, targetUrl: input.targetUrl }));
  const approval = await prisma.workerApproval.create({
    data: {
      ...approvalId ? { id: approvalId } : {},
      userId,
      deviceId,
      taskId,
      kind: input.kind,
      summary: input.summary,
      targetUrl: input.targetUrl,
      risk: input.risk,
      actionHash,
      evidence: input.evidence,
      expiresAt
    }
  });
  await prisma.browserTask.updateMany({
    where: { id: taskId, state: { in: ["CLAIMED", "OPENED", "FILLED"] } },
    data: { state: "WAITING_FOR_USER", progress: 70 }
  });
  await prisma.harnessAuditEvent.create({
    data: { userId, runId: task.runId, action: "WORKER_APPROVAL_REQUESTED", entityType: "WorkerApproval", entityId: approval.id, outcome: "PENDING", metadata: { taskId, kind: input.kind, risk: input.risk, expiresAt: expiresAt.toISOString() } }
  });
  return { id: approval.id, expiresAt: approval.expiresAt.toISOString(), reused: false };
}
async function decideApprovalRecord(userId, approvalId, decision, note, options = {}) {
  const result = await prisma.$transaction(async (tx) => {
    const approval = await tx.workerApproval.findFirst({ where: { id: approvalId, userId } });
    if (!approval) throw new AppError_default(404, "Approval not found.");
    if (options.deviceId && approval.deviceId !== options.deviceId) throw new AppError_default(403, "Approval belongs to another worker device.");
    if (approval.state !== "PENDING") throw new AppError_default(409, "Approval has already been decided.");
    if (approval.expiresAt <= /* @__PURE__ */ new Date()) {
      await tx.workerApproval.update({ where: { id: approval.id }, data: { state: "EXPIRED", decidedAt: /* @__PURE__ */ new Date(), decidedBy: userId, decisionNote: "Expired before a decision." } });
      throw new AppError_default(410, "Approval has expired. The worker will not act on it.");
    }
    const task = await tx.browserTask.findFirst({ where: { id: approval.taskId, userId } });
    if (!task) throw new AppError_default(404, "Browser task not found.");
    if (options.deviceId && task.deviceId && task.deviceId !== options.deviceId) throw new AppError_default(403, "Browser task belongs to another worker.");
    const now = /* @__PURE__ */ new Date();
    const updated = await tx.workerApproval.update({
      where: { id: approval.id },
      data: { state: decision, decidedAt: now, decidedBy: userId, decisionNote: note }
    });
    if (decision === "APPROVED" && approval.kind === "SUBMIT") {
      await tx.browserTask.update({ where: { id: approval.taskId }, data: { approvedAt: now } });
    }
    if (decision === "TAKEOVER") {
      await tx.browserTask.update({ where: { id: approval.taskId }, data: { state: "TAKEOVER" } });
    }
    await tx.harnessAuditEvent.create({
      data: {
        userId,
        runId: task.runId,
        action: "WORKER_APPROVAL_DECIDED",
        entityType: "WorkerApproval",
        entityId: approval.id,
        outcome: decision,
        metadata: {
          taskId: approval.taskId,
          kind: approval.kind,
          note,
          actor: options.deviceId ? "desktop" : "web",
          ...options.deviceId ? { deviceId: options.deviceId } : {}
        }
      }
    });
    return updated;
  });
  return result;
}
async function decideApproval(userId, approvalId, decision, note) {
  return decideApprovalRecord(userId, approvalId, decision, note);
}
async function decideApprovalFromDevice(userId, deviceId, approvalId, decision, note) {
  return decideApprovalRecord(userId, approvalId, decision, note, { deviceId });
}
async function controlTask(userId, taskId, action) {
  const result = await prisma.$transaction(async (tx) => {
    const task = await tx.browserTask.findFirst({ where: { id: taskId, userId } });
    if (!task) throw new AppError_default(404, "Browser task not found.");
    if (["COMPLETED", "SUBMITTED", "FAILED", "CANCELLED"].includes(task.state)) throw new AppError_default(409, "This task has already finished.");
    const now = /* @__PURE__ */ new Date();
    const state = action === "pause" ? "PAUSED" : action === "resume" || action === "handback" ? "CLAIMED" : action === "takeover" ? "TAKEOVER" : "CANCELLED";
    const updated = await tx.browserTask.update({
      where: { id: task.id },
      data: {
        state,
        ...action === "stop" ? { finishedAt: now, error: "Stopped by the account owner." } : {},
        ...action === "takeover" ? { error: "The account owner took control of the browser." } : {}
      }
    });
    await tx.harnessAuditEvent.create({
      data: { userId, runId: task.runId, action: `WORKER_TASK_${action.toUpperCase()}`, entityType: "BrowserTask", entityId: task.id, outcome: state, metadata: { deviceId: task.deviceId, previousState: task.state } }
    });
    return updated;
  });
  return result;
}
function dayStart() {
  const now = /* @__PURE__ */ new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
async function overview(userId) {
  await prisma.workerApproval.updateMany({
    where: { userId, state: "PENDING", expiresAt: { lt: /* @__PURE__ */ new Date() } },
    data: { state: "EXPIRED", decidedAt: /* @__PURE__ */ new Date(), decisionNote: "Expired before a decision." }
  });
  let policies = await prisma.sitePolicy.findMany({ where: { enabled: true }, orderBy: { source: "asc" } });
  if (!policies.length) {
    await ensureWorkerPolicies();
    policies = await prisma.sitePolicy.findMany({ where: { enabled: true }, orderBy: { source: "asc" } });
  }
  const [devices, tasks, approvals, events, audits, capturedCount, submissionsToday] = await Promise.all([
    prisma.workerDevice.findMany({ where: { userId }, orderBy: { pairedAt: "desc" } }),
    prisma.browserTask.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, jobId: true, runId: true, adapter: true, source: true, targetUrl: true, mode: true, state: true, progress: true, error: true, createdAt: true, updatedAt: true, finishedAt: true, deviceId: true }
    }),
    prisma.workerApproval.findMany({ where: { userId }, orderBy: [{ state: "asc" }, { requestedAt: "desc" }], take: 30 }),
    prisma.browserTaskEvent.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, taskId: true, seq: true, type: true, message: true, createdAt: true } }),
    prisma.harnessAuditEvent.findMany({ where: { userId, action: { startsWith: "WORKER_" } }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.browserTaskEvent.count({ where: { userId, type: "JOB_CAPTURED" } }),
    prisma.browserTask.count({ where: { userId, state: "SUBMITTED", finishedAt: { gte: dayStart() } } })
  ]);
  const jobIds = [...new Set(tasks.map((task) => task.jobId))];
  const jobs = jobIds.length ? await prisma.job.findMany({ where: { userId, id: { in: jobIds } }, select: { id: true, title: true, company: true, location: true } }) : [];
  const onlineCutoff = Date.now() - 2 * 6e4;
  const activeTasks = tasks.filter((task) => ["QUEUED", "CLAIMED", "OPENED", "FILLED", "WAITING_FOR_USER", "PAUSED", "TAKEOVER"].includes(task.state));
  const pendingApprovals = approvals.filter((approval) => approval.state === "PENDING");
  const activeDevices = devices.filter((device) => device.status === "ACTIVE" && !device.revokedAt);
  return {
    status: !activeDevices.length ? "NOT_PAIRED" : activeDevices.some((device) => device.lastSeenAt && device.lastSeenAt.getTime() > onlineCutoff) ? "ONLINE" : "OFFLINE",
    serverTime: (/* @__PURE__ */ new Date()).toISOString(),
    summary: {
      devices: activeDevices.length,
      pendingApprovals: pendingApprovals.length,
      activeTasks: activeTasks.length,
      capturedListings: capturedCount,
      submissionsToday,
      policyCount: policies.length
    },
    devices: devices.map((device) => ({
      id: device.id,
      name: device.name,
      platform: device.platform,
      appVersion: device.appVersion,
      publicKeyFingerprint: device.publicKeyFingerprint,
      capabilities: device.capabilities,
      status: device.status,
      pairedAt: device.pairedAt.toISOString(),
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
      lastIp: device.lastIp,
      online: device.status === "ACTIVE" && Boolean(device.lastSeenAt && device.lastSeenAt.getTime() > onlineCutoff)
    })),
    tasks: tasks.map((task) => ({
      ...task,
      source: task.source ?? classifyTaskSource(task.adapter, task.targetUrl),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      finishedAt: task.finishedAt?.toISOString() ?? null,
      job: jobs.find((job) => job.id === task.jobId) ?? null
    })),
    approvals: approvals.map((approval) => ({
      id: approval.id,
      taskId: approval.taskId,
      kind: approval.kind,
      state: approval.state,
      summary: approval.summary,
      targetUrl: approval.targetUrl,
      risk: approval.risk,
      evidence: approval.evidence,
      requestedAt: approval.requestedAt.toISOString(),
      expiresAt: approval.expiresAt.toISOString(),
      decidedAt: approval.decidedAt?.toISOString() ?? null,
      expired: approval.state === "PENDING" && approval.expiresAt <= /* @__PURE__ */ new Date()
    })),
    events: events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
    audits: audits.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
    policies: policies.map((policy) => ({
      source: policy.source,
      name: policy.name,
      version: policy.version,
      level: policy.level,
      domains: policy.domains,
      discovery: policy.discovery,
      extraction: policy.extraction,
      formFill: policy.formFill,
      submit: policy.submit,
      userPresenceRequired: policy.userPresenceRequired,
      maxPagesPerRun: policy.maxPagesPerRun,
      maxRequestsPerMinute: policy.maxRequestsPerMinute,
      reviewedAt: policy.reviewedAt.toISOString(),
      reviewReference: policy.reviewReference,
      notes: policy.notes,
      enabled: policy.enabled
    }))
  };
}
async function listPolicies() {
  let policies = await prisma.sitePolicy.findMany({ where: { enabled: true }, orderBy: { source: "asc" } });
  if (!policies.length) {
    await ensureWorkerPolicies();
    policies = await prisma.sitePolicy.findMany({ where: { enabled: true }, orderBy: { source: "asc" } });
  }
  return policies;
}
async function listDevices(userId) {
  return prisma.workerDevice.findMany({ where: { userId }, orderBy: { pairedAt: "desc" } });
}
async function listApprovals(userId, state) {
  return prisma.workerApproval.findMany({
    where: { userId, ...state ? { state } : {} },
    orderBy: { requestedAt: "desc" },
    take: 100
  });
}
async function listApprovalsForDevice(userId, deviceId) {
  return prisma.workerApproval.findMany({
    where: {
      userId,
      deviceId,
      OR: [
        { state: "PENDING" },
        {
          state: { in: ["APPROVED", "REJECTED", "TAKEOVER"] },
          decidedAt: { gte: new Date(Date.now() - 24 * 60 * 6e4) }
        }
      ]
    },
    orderBy: { requestedAt: "desc" },
    take: 100,
    select: {
      id: true,
      taskId: true,
      kind: true,
      state: true,
      summary: true,
      expiresAt: true,
      decidedAt: true,
      decisionNote: true
    }
  });
}
async function saveCapturedListings(userId, deviceId, listings) {
  let accepted = 0;
  for (const listing of listings) {
    const fingerprint = sha256Hex(canonicalJson({
      source: listing.source,
      canonicalUrl: listing.canonicalUrl,
      title: listing.title,
      company: listing.company
    }));
    const result = await prisma.capturedListing.upsert({
      where: { userId_fingerprint: { userId, fingerprint } },
      create: {
        userId,
        deviceId,
        source: listing.source,
        externalId: listing.externalId,
        fingerprint,
        canonicalUrl: listing.canonicalUrl,
        payload: listing,
        capturedAt: Number.isFinite(Date.parse(listing.capturedAt)) ? new Date(listing.capturedAt) : /* @__PURE__ */ new Date()
      },
      update: {
        externalId: listing.externalId,
        canonicalUrl: listing.canonicalUrl,
        payload: listing,
        capturedAt: Number.isFinite(Date.parse(listing.capturedAt)) ? new Date(listing.capturedAt) : /* @__PURE__ */ new Date()
      }
    });
    if (result) accepted += 1;
  }
  await audit(userId, "WORKER_LISTINGS_CAPTURED", "CapturedListing", null, "SUCCESS", { deviceId, accepted });
  return { accepted };
}

// src/modules/worker/worker.gateway.ts
var clients = /* @__PURE__ */ new Map();
var pending = /* @__PURE__ */ new Map();
var heartbeat2 = null;
var websocketFrame = (opcode, payload = Buffer.alloc(0)) => {
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.from([128 | opcode, length]);
  } else if (length <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 128 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 128 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, Buffer.from(payload)]);
};
var send = (socket, message) => {
  if (socket.destroyed || !socket.writable) return;
  socket.write(websocketFrame(1, Buffer.from(JSON.stringify(message), "utf8")));
};
var rejectUpgrade = (socket, code, message) => {
  socket.end(`HTTP/1.1 ${code} ${message}\r
Connection: close\r
Content-Type: text/plain\r
\r
${message}`);
};
var acceptUpgrade = (socket, key) => {
  const accept = createHash2("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write(
    `HTTP/1.1 101 Switching Protocols\r
Upgrade: websocket\r
Connection: Upgrade\r
Sec-WebSocket-Accept: ${accept}\r
\r
`
  );
};
function parseFrame(buffer) {
  if (buffer.length < 2) return null;
  const opcode = buffer[0] & 15;
  const masked = Boolean(buffer[1] & 128);
  let length = buffer[1] & 127;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < 4) return null;
    length = buffer.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buffer.length < 10) return null;
    const large = buffer.readBigUInt64BE(2);
    if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    length = Number(large);
    offset = 10;
  }
  if (length > 64 * 1024) return null;
  const total = offset + (masked ? 4 : 0) + length;
  if (buffer.length < total) return null;
  let payload = buffer.subarray(offset + (masked ? 4 : 0), total);
  if (masked) {
    const mask = buffer.subarray(offset, offset + 4);
    payload = Buffer.from(payload);
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] = payload[index] ^ mask[index % 4];
    }
  }
  return { opcode, payload, length: total };
}
async function authenticatePending(client, payload) {
  let message;
  try {
    message = JSON.parse(payload.toString("utf8"));
  } catch {
    rejectClient(client, "Authentication message must be JSON.");
    return;
  }
  if (message.type !== "AUTH" || typeof message.deviceId !== "string" || typeof message.token !== "string") {
    rejectClient(client, "The first worker message must authenticate the device.");
    return;
  }
  const session = await sessionFromRawAccessToken(message.token);
  if (!session || session.deviceId !== message.deviceId) {
    rejectClient(client, "Worker WebSocket token is invalid or revoked.");
    return;
  }
  clearTimeout(client.timer);
  pending.delete(client.socket);
  const socket = client.socket;
  clients.set(socket, { userId: session.device.userId, deviceId: session.deviceId, alive: true });
  await touchWorkerDevice(session.deviceId, session.device.userId).catch(() => void 0);
  send(socket, { type: "connection.ready", data: { deviceId: session.deviceId, protocolVersion: 1 } });
}
function rejectClient(client, message) {
  clearTimeout(client.timer);
  pending.delete(client.socket);
  send(client.socket, { type: "error", data: { message } });
  if (!client.socket.destroyed) client.socket.end(websocketFrame(8));
}
function handleFrame(client, frame) {
  if (frame.opcode === 8) {
    client.socket.end(websocketFrame(8));
    return;
  }
  if (frame.opcode === 9) {
    client.socket.write(websocketFrame(10, frame.payload));
    return;
  }
  if (frame.opcode === 10) {
    client.socket.write(websocketFrame(10));
    return;
  }
  if (frame.opcode !== 1) {
    rejectClient(client, "The worker socket only accepts text control frames.");
    return;
  }
  void authenticatePending(client, frame.payload).catch(() => rejectClient(client, "Worker authentication failed."));
}
function handleAuthenticatedFrame(socket, frame) {
  const context = clients.get(socket);
  if (!context) return;
  if (frame.opcode === 8) {
    socket.end(websocketFrame(8));
  } else if (frame.opcode === 9) {
    socket.write(websocketFrame(10, frame.payload));
  } else if (frame.opcode === 10) {
    context.alive = true;
  }
}
var onUpgrade = async (request, socket, head) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname !== "/ws/worker") return;
  if (request.headers.origin) {
    rejectUpgrade(socket, 403, "Forbidden");
    return;
  }
  if (request.headers.upgrade?.toLowerCase() !== "websocket") {
    rejectUpgrade(socket, 400, "Bad Request");
    return;
  }
  const key = request.headers["sec-websocket-key"];
  if (typeof key !== "string") {
    rejectUpgrade(socket, 400, "Bad Request");
    return;
  }
  acceptUpgrade(socket, key);
  if ("setNoDelay" in socket && typeof socket.setNoDelay === "function") socket.setNoDelay(true);
  const client = {
    socket,
    buffer: head.length ? Buffer.from(head) : Buffer.alloc(0),
    timer: setTimeout(() => rejectClient(client, "Worker authentication timed out."), 1e4)
  };
  client.timer.unref?.();
  pending.set(socket, client);
  socket.on("data", (chunk) => {
    const current = pending.get(socket);
    if (current) {
      current.buffer = Buffer.concat([current.buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))]);
      const frame2 = parseFrame(current.buffer);
      if (frame2) handleFrame(current, frame2);
      return;
    }
    const authenticated = clients.get(socket);
    if (!authenticated) return;
    const frame = parseFrame(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    if (frame) {
      authenticated.alive = true;
      handleAuthenticatedFrame(socket, frame);
    }
  });
  const cleanup = () => {
    const current = pending.get(socket);
    if (current) clearTimeout(current.timer);
    pending.delete(socket);
    clients.delete(socket);
  };
  socket.on("close", cleanup);
  socket.on("end", cleanup);
  socket.on("error", cleanup);
  if (client.buffer.length) {
    const frame = parseFrame(client.buffer);
    if (frame) handleFrame(client, frame);
  }
};
var workerGateway = {
  attach(server) {
    server.on("upgrade", (request, socket, head) => {
      void onUpgrade(request, socket, head).catch(() => {
        if (!socket.destroyed) rejectUpgrade(socket, 500, "Internal Server Error");
      });
    });
    heartbeat2 ??= setInterval(() => {
      for (const [socket, context] of clients) {
        if (!context.alive) {
          clients.delete(socket);
          socket.destroy();
          continue;
        }
        context.alive = false;
        if (socket.writable) socket.write(websocketFrame(9));
      }
    }, 3e4);
    heartbeat2.unref();
  },
  sendTaskAvailable(deviceId, task) {
    for (const [socket, context] of clients) {
      if (context.deviceId === deviceId) send(socket, { type: "task.available", data: { task } });
    }
  },
  sendApprovalDecision(deviceId, approvalId, decision, actor) {
    for (const [socket, context] of clients) {
      if (context.deviceId === deviceId) send(socket, { type: "approval.decision", data: { approvalId, decision, actor } });
    }
  },
  sendControl(deviceId, taskId, action) {
    for (const [socket, context] of clients) {
      if (context.deviceId === deviceId) send(socket, { type: "control", data: { taskId, action } });
    }
  },
  isDeviceOnline(deviceId) {
    return [...clients.values()].some((context) => context.deviceId === deviceId);
  },
  connectionCount() {
    return clients.size;
  },
  close() {
    if (heartbeat2) {
      clearInterval(heartbeat2);
      heartbeat2 = null;
    }
    for (const client of pending.values()) {
      clearTimeout(client.timer);
      client.socket.destroy();
    }
    pending.clear();
    for (const socket of clients.keys()) socket.destroy();
    clients.clear();
  }
};

export {
  verifyRequestSignature,
  NonceCache,
  createPairingCode,
  pairWorker,
  refreshWorkerSession,
  sessionFromRawAccessToken,
  touchWorkerDevice,
  heartbeat,
  revokeDevice,
  claimTask,
  recordEvents,
  recordCheckpoint,
  reportResult,
  requestApproval,
  decideApproval,
  decideApprovalFromDevice,
  controlTask,
  overview,
  listPolicies,
  listDevices,
  listApprovals,
  listApprovalsForDevice,
  saveCapturedListings,
  workerGateway
};
