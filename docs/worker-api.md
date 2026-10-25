# Local worker API and gateway

Backend module: `src/modules/worker/`.
Mounted at: `/api/v1/worker` plus `ws://<host>/ws/worker`.
Feature flag: `WORKER_ENABLED=true` (unset/`false` returns 404 for the whole
router, including the WebSocket handshake path).

The worker transport extends existing `BrowserTask` records. It does not replace
the harness or browser companion.

## Configuration

| Variable | Purpose |
| --- | --- |
| `WORKER_ENABLED` | Enables the worker router/gateway |
| `WORKER_KEY_ENCRYPTION_SECRET` | AES-256-GCM key material for the generated server signing key; falls back to `TOTP_ENCRYPTION_KEY` |
| `FRONTEND_URL` | Existing authenticated web origin |
| `TOTP_ENCRYPTION_KEY` | Existing 32-character fallback secret |

The server signing keypair is generated on first use and stored in
`PlatformConfig`. Only the public key is returned to a paired device. Rotating
the encryption key without rotating the signing key makes the stored private key
unreadable; revoke and re-pair devices as part of any rotation.

## Authentication layers

1. **Web oversight** — existing `checkAuth` session middleware.
2. **Device access token** — `Authorization: Bearer paiw_at_...`, SHA-256 hash
   looked up in `worker_session`; TTL 24 hours.
3. **Request signature** — required on refresh and every device mutation:

```text
message = METHOD + "\n" + PATH + "\n" + sha256(canonicalJson(body)) + "\n" + timestamp + "\n" + nonce
signature = base64url(ed25519(message))
```

Headers: `X-Worker-Device`, `X-Worker-Timestamp` (milliseconds), `X-Worker-Nonce`,
`X-Worker-Signature`. Timestamp must be within ±5 minutes; nonces are rejected
within the replay window. Canonical JSON sorts object keys, preserves arrays, and
omits `undefined`, matching `packages/protocol/src/crypto.ts`.

Refresh tokens are 30 days, hashed at rest, and rotated on every use. Access and
refresh sessions are revoked with the device.

## Public routes

### `POST /api/v1/worker/pair`

Rate limit: 20 / 10 minutes / IP. Body:

```json
{
  "code": "7K4M92QF",
  "name": "Abdullah's desktop",
  "platform": "windows",
  "appVersion": "0.1.0",
  "publicKey": "base64url-ed25519-public-key",
  "capabilities": ["capture", "prepare", "assist", "takeover", "checkpoint"]
}
```

Returns device id, access/refresh tokens and expiry, and the server public key.
The code is single-use and expires in 10 minutes.

### `POST /api/v1/worker/auth/start`

Rate limit: 10 / 10 minutes / IP. Starts the browser device-authorization flow.
Body: `{ "deviceName": "...", "platform": "windows", "appVersion": "0.1.0",
"publicKey": "base64url-ed25519-public-key", "capabilities": [...] }`.

Returns `requestId`, a one-time `secret` (shown only to the desktop), the
`verificationUrl` on the frontend, and expiry. The database stores only the
SHA-256 hash of the secret. Send the user to `verificationUrl`, where they sign
in and approve or deny the device.

### `GET /api/v1/worker/auth/requests/:id`

Rate limit: 60 / minute / IP. Public presentation data for the approval page:
device name, platform, app version, key fingerprint, status, and expiry. It never
returns the request secret or tokens.

### `POST /api/v1/worker/auth/poll`

Rate limit: 60 / minute / IP. Body: `{ "requestId": "...", "secret": "..." }`.
While pending, returns status only. On first poll after approval it creates the
device and session and returns the same payload as `/pair`: device id,
access/refresh tokens, server public key, and expiry. The request is marked used;
repeat polls return `409` and must not be retried with a new secret.

### `POST /api/v1/worker/auth/requests/:id/decision` (`checkAuth`)

Body: `{ "decision": "APPROVE" | "DENY" }`. The signed-in user owns the
resulting device. Only `PENDING`, unexpired requests can be decided.

### `POST /api/v1/worker/token/refresh`

Rate limit: 30 / minute / IP. Requires a device signature. Body:
`{ "deviceId": "...", "refreshToken": "..." }`. Returns a new access token,
new refresh token, and access expiry. Previous refresh token is invalidated.

## Device routes (access token + signature)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/heartbeat` | Update device `lastSeenAt`/IP |
| POST | `/tasks/claim` | Claim the next eligible `QUEUED` task; returns a signed envelope or `{task:null}` |
| POST | `/tasks/:id/events` | Append idempotent events `(taskId, seq)` |
| POST | `/tasks/:id/checkpoints` | Store a checkpoint; body task id must match route |
| POST | `/tasks/:id/result` | Report state and visible confirmation |
| POST | `/tasks/:id/approvals` | Request a `SUBMIT`, `UPLOAD`, `CAPTURE`, etc. approval |
| POST | `/listings` | Upsert captured listings by fingerprint |
| GET | `/approvals/pending` | Pending approvals plus last-24h decisions for this device (REST fallback) |
| POST | `/device/approvals/:id/decision` | Record a desktop approval decision; approval/task must belong to this device |

`GET` requests are still signed; the body hash is the hash of `{}`.

### Claim behavior

- Selects `QUEUED` tasks for this user where `deviceId` is null or this device and
  the task has not expired.
- Excludes `AUTO_APPLY`.
- Classifies source from the target host, then policy.
- Blocks and audits Level B/C or user-presence write tasks. Explicitly consented
  `DISCOVER`/`CAPTURE` reads may be claimed within the source policy and page cap.
- Returns a signed envelope with task id, device id, run id, type, mode, source,
  target URL, allowlisted domains, limits, policy version, issued/expiry times,
  nonce, payload, and document references.
- Sets `BrowserTask` to `CLAIMED`, increments `revision` and `attempt`, and stores
  signature/policy version/expiry.
- Stale `CLAIMED` rows older than the envelope TTL move to `WAITING_FOR_USER` on
  the next claim; they are not automatically retried.

### Result behavior

Allowed states: `CLAIMED`, `OPENED`, `FILLED`, `WAITING_FOR_USER`, `PAUSED`,
`TAKEOVER`, `COMPLETED`, `SUBMITTED`, `BLOCKED`, `FAILED`, `CANCELLED`.

- A terminal task cannot change to a different terminal state; same-state
  reporting is idempotent.
- `SUBMITTED` requires assisted mode, a Level A policy with `submit: true`, an
  `APPROVED` non-expired `SUBMIT` approval, and confirmation URL/text.
- `SUBMITTED` writes `approvedAt` from the approval decision and creates an
  application/audit path consistent with the existing harness.
- Every result reports an event and audit record.

## Web oversight routes (`checkAuth`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/overview` | Devices, 20 recent tasks, approvals, latest events/audits, policies, consents, captured listings, counts |
| POST | `/pairing-code` | Create a single-use code (normalized, 10-minute expiry) |
| POST | `/auth/requests/:id/decision` | Approve or deny a browser sign-in request |
| GET | `/devices` | List devices |
| DELETE | `/devices/:id` | Revoke device, sessions, pending approvals |
| GET | `/approvals?state=PENDING` | List approvals |
| POST | `/approvals/:id/decision` | `APPROVED`, `REJECTED`, `TAKEOVER` with note |
| POST | `/tasks/:id/control` | `pause`, `resume`, `stop`, `takeover`, `handback` |
| GET | `/policies` | Seeded reviewed source policies |
| GET | `/consents` | Per-source capability consent and effective page caps |
| PUT | `/consents/:source` | `search`, `scroll`, `capture`, `maxPages`, `acknowledgedRisk` |
| POST | `/job-searches` | Run public providers now and queue consented private-source browser tasks |
| POST | `/search-tasks` | Queue a `DISCOVER` search/capture task (`jobId` nullable) |
| POST | `/capture-tasks` | Queue a one-page `CAPTURE` task (`jobId` nullable) |
| GET | `/listings` | Paginated captured findings returned by devices |

Search tasks require an active `WorkerSiteConsent` with `search: true` (and
`scroll: true` before more than one page or any scroll round), plus the reviewed
site policy. Capture tasks require `capture: true` and a policy with
`extraction: true`; LinkedIn stays `extraction: false`. `claimTask` rechecks the
same consent on the server and marks a task `BLOCKED` if permission was revoked
after queueing. Page caps are clamped by both the user consent and the policy,
and `CAPTURE` is always one page.

`POST /job-searches` is the unified web entry point. Remotive, Jobicy and
Arbeitnow run server-side; configured Greenhouse and Lever boards are imported;
Facebook and BDJobs are queued to the paired worker. LinkedIn is queued only as
a manual browser handoff and is never extracted automatically.

Approval decisions push `approval.decision` to the connected device; control
actions push `control`. The sidecar also polls pending approvals for fallback.

## WebSocket `/ws/worker`

Handshake requires a standard WebSocket upgrade with **no** `Origin` header. The
first text frame within 10 seconds:

```json
{ "type": "AUTH", "deviceId": "dev_...", "token": "paiw_at_..." }
```

Server messages:

```json
{ "type": "connection.ready", "data": { "deviceId": "...", "protocolVersion": 1 } }
{ "type": "task.available", "data": { "task": { /* signed envelope */ } } }
{ "type": "approval.decision", "data": { "approvalId": "apr_...", "decision": "APPROVED", "actor": "..." } }
{ "type": "control", "data": { "taskId": "task_...", "action": "stop" } }
{ "type": "error", "data": { "message": "..." } }
```

The socket uses ping/pong every 30 seconds and drops unresponsive clients. REST
is authoritative for claim/events/checkpoints/results; a dropped socket does not
stop a run.

## Data model

Migration: `prisma/migrations/20261021180000_local_browser_worker/migration.sql`;
browser auth and consent: `prisma/migrations/20261022120000_worker_browser_auth_and_consent/migration.sql`.
Models: `worker_device`, `worker_pairing_code`, `worker_session`,
`worker_auth_request`, `worker_site_consent`, `browser_task_event`,
`browser_task_checkpoint`, `worker_approval`, `site_policy`, `captured_listing`,
plus `browser_task` columns `deviceId`, `source`, `priority`, `expiresAt`,
`signature`, `revision`, `progress`, `attempt`, `policyVersion`. Search and
capture tasks use `adapter = 'SEARCH'` with a nullable `jobId`; their `payload`
holds `taskType` (`DISCOVER` or `CAPTURE`), limits, allowed domains, and the
consent id.

Existing rows are preserved. New task fields are nullable/defaulted. Event
upload is idempotent on `(taskId, seq)`; listings dedupe on
`(userId, fingerprint)`. `worker_auth_request.requestHash` stores only the
SHA-256 hash of the desktop-held secret.

### Migration verification

`npx prisma validate` and `npx prisma generate` are required. The migration was
dry-run against PostgreSQL inside `BEGIN … ROLLBACK` before `migrate deploy`, then
`prisma migrate status` confirmed up to date. For future edits, re-run a
transactional dry-run; do not edit an applied migration.

### Rollback

Set `WORKER_ENABLED=false` first. Archive worker tables, then drop them in this
order: `captured_listing`, `site_policy`, `worker_approval`,
`browser_task_checkpoint`, `browser_task_event`, `worker_session`,
`worker_pairing_code`, `worker_device`; then drop added `browser_task` columns.
Full SQL and operational steps: `profileai_worker/docs/OPERATIONS.md`.

## Tests

`src/modules/worker/worker.test.ts` covers:

- pairing code normalization, one-use, expiry;
- public key fingerprints and Ed25519 validation;
- signed request method/path/body/timestamp/nonce rejection and tamper detection;
- nonce replay cache;
- token rotation/hashing and revoked/expired states;
- task envelope tamper/expiry/wrong-device rejection;
- A/B/C policy capabilities and restricted-source submit bans;
- target-host source classification (including spoofed adapters);
- result schema and confirmation evidence.

The tests are pure service/crypto tests and do not require a database. The wider
backend `tsx --test src/**/*.test.ts` run includes them; build/typecheck may still
surface pre-existing unrelated errors.
