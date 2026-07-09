# Backend Unit Testing Skills

## Purpose

Use this file as the backend unit testing standard for the ProFile AI project.

Every backend route, service, middleware, validation schema, worker, and integration wrapper must be tested before the feature is considered complete.

The goal is to protect authentication, authorization, user-owned data, admin actions, AI usage, payments, file uploads, webhooks, and security-sensitive workflows.


---

## Recommended Backend Testing Stack

Use the following tools:

```txt
Vitest or Jest
Supertest
Prisma test database
Testcontainers or Docker test database
Zod validation tests
Nock or MSW Node for external API mocks
Redis test instance where needed
```

Recommended use:

- Vitest/Jest: backend test runner
- Supertest: Express route testing
- Prisma test database: database behavior testing
- Testcontainers: isolated PostgreSQL/Redis test infrastructure
- Nock/MSW Node: external API mocking
- Zod: request schema validation tests

Do not call real third-party APIs from automated tests.


---

## Testing Philosophy

### Core Principles

Every test must be:

- Clear
- Deterministic
- Fast
- Isolated
- Easy to read
- Easy to debug
- Focused on behavior, not implementation details

Do not write tests only to increase coverage numbers.
Write tests that prove the feature works correctly and safely.

### Testing Priorities

Prioritize tests for:

1. Authentication and authorization
2. User-owned data protection
3. Admin-only actions
4. Resume creation and editing
5. AI request preparation and response handling
6. Payment and webhook logic
7. File upload validation
8. Form validation
9. Critical UI workflows
10. Security-sensitive actions

---

---

## Test Types

### 3.1 Unit Test

Tests one small unit in isolation.

Examples:

- Utility function
- Zod schema
- React component
- Custom hook
- Service method
- Access-control helper
- Data transformer
- AI prompt builder
- Resume scoring function

### 3.2 Component Test

Tests a frontend component as the user sees it.

Examples:

- LoginForm
- ResumeCard
- TemplateCard
- ATSScoreGauge
- ThemeToggle
- ConfirmDialog
- ResumeSectionEditor

### 3.3 Route/Controller Test

Tests backend API route behavior.

Examples:

- POST /auth/login
- GET /resumes
- PUT /resumes/:id
- POST /resumes/:id/export
- PATCH /admin/users/:id/status

### 3.4 Integration Test

Tests multiple units together.

Examples:

- Login API with database
- Resume creation with Prisma transaction
- Stripe webhook verification
- File upload validation
- Admin action with audit log

### 3.5 End-to-End Test

E2E testing is not the main focus of this file, but critical workflows should later be tested with Playwright.

Examples:

- Register -> Verify Email -> Login
- Create Resume -> Edit -> Export PDF
- Admin Login -> Ban User -> Audit Log

---

---

## Coverage Targets

Minimum required coverage:

```txt
Statements: 80%
Branches: 75%
Functions: 80%
Lines: 80%
```

High-risk modules must target 90%+ coverage:

- Authentication
- Authorization
- RBAC
- Object-level authorization
- Payment webhook handling
- AI usage limits
- File upload validation
- Admin audit logging
- Account deletion
- Password reset
- OTP verification

Coverage must not be achieved by testing implementation details only.
Behavior and security outcomes matter more than raw coverage.

---

---

## Backend Unit Testing Rules

### 12.1 What Must Be Tested in Backend

Test every backend unit:

```txt
routes/
controllers/
services/
repositories/
middlewares/
schemas/
utils/
workers/
integrations/
```

Required backend test categories:

- Zod schemas
- Auth middleware
- RBAC middleware
- Object authorization helpers
- Service methods
- Controller behavior
- Prisma query logic
- External integration wrappers
- Queue job processors
- Webhook handlers
- File upload validators

---

---

## Backend Validation Testing

Every Zod schema must be tested.

Test:

1. Valid payload passes
2. Missing required fields fail
3. Wrong data type fails
4. Invalid enum fails
5. Extra unexpected fields are rejected or stripped based on policy
6. String length limits work
7. Numeric min/max limits work
8. URL/email formats work
9. Nested object validation works
10. Array limits work

Schemas that must be tested:

```txt
registerSchema
loginSchema
otpVerifySchema
resetPasswordSchema
resumeCreateSchema
resumeUpdateSchema
atsCheckSchema
aiModifySchema
templateCreateSchema
templateUpdateSchema
applicationCreateSchema
profileUpdateSchema
billingCheckoutSchema
adminUserUpdateSchema
platformSettingsSchema
couponCreateSchema
webhookEventSchema
```

---

---

## Backend Authentication Tests

Authentication tests must cover:

### Register

- Creates user with valid data
- Rejects duplicate email
- Hashes password
- Creates UserProfile
- Creates UserLimit
- Creates verification OTP
- Queues verification email
- Does not return password hash

### Login

- Accepts valid credentials
- Rejects invalid credentials
- Rejects banned user
- Rejects unverified user if policy requires
- Triggers 2FA flow when enabled
- Creates session when valid
- Registers device
- Enforces device limit
- Rate limits repeated failed attempts

### Email Verification

- Accepts valid OTP
- Rejects expired OTP
- Rejects wrong OTP
- Rejects reused OTP
- Marks email as verified

### Password Reset

- Forgot password returns generic success
- Creates OTP only if user exists
- Reset accepts valid OTP
- Reset rejects expired OTP
- Updates password hash
- Revokes old sessions
- Sends notification

---

---

## Backend Authorization Tests

Authorization is critical.

Test these rules:

- Unauthenticated user cannot access protected user APIs
- USER cannot access admin APIs
- ADMIN can access admin APIs only after required checks
- USER cannot access another user's resume
- USER cannot access another user's cover letter
- USER cannot access another user's application
- USER cannot access another user's invoice
- USER cannot delete another user's file
- ADMIN cannot mutate user-owned content except through approved admin endpoints
- Public route exposes only public-safe fields

Object-level authorization must be tested for every resource ID:

```txt
resumeId
coverLetterId
applicationId
invoiceId
userId
templateId
folderId
notificationId
referenceId
projectId
```

---

---

## Backend Rate Limiting Tests

Rate limiting must be tested for:

- Login
- OTP resend
- OTP verify
- Forgot password
- AI calls
- PDF exports
- Public resume tracking
- Admin bulk actions
- Stripe webhook replay if applicable

Test:

1. Request under limit succeeds
2. Request over limit fails with 429
3. Limit is scoped correctly by IP, user, or endpoint
4. Reset window works
5. Admin bulk actions have stricter protection

---

---

## Backend Service Testing

Service tests should focus on business rules.

### ResumeService

- Creates resume for valid user
- Enforces resume limit
- Duplicates resume correctly
- Updates only owner resume
- Saves section order
- Creates history snapshot
- Restores snapshot
- Deletes or soft deletes resume

### AIService

- Builds correct prompt input
- Sends structured request
- Validates AI JSON response
- Rejects malformed AI response
- Handles API failure
- Does not expose secret API key
- Increments usage only according to policy

### ATSService

- Extracts keywords
- Calculates score
- Handles empty job description
- Handles empty resume
- Returns matched and missing keywords
- Normalizes case and punctuation

### ExportService

- Generates PDF job
- Validates paper size
- Stores PDF URL
- Handles Puppeteer failure
- Prevents non-owner export

### TemplateService

- Creates template
- Sanitizes HTML/CSS
- Blocks unsafe script
- Sets default template transactionally
- Creates version history
- Restores previous version
- Prevents deletion when template is in use

### BillingService

- Creates checkout session
- Validates plan
- Applies coupon correctly
- Handles subscription update
- Handles failed payment
- Updates user limits

### NotificationService

- Creates notification
- Marks notification as read
- Marks all as read
- Does not expose another user's notifications

### AdminService

- Bans user
- Unbans user
- Updates user limit
- Promotes role safely
- Prevents invalid role escalation
- Creates audit log for every action

---

---

## Backend API Route Testing

Use Supertest for Express routes.

For every route, test:

1. Success response
2. Validation failure
3. Unauthenticated request
4. Forbidden request
5. Resource not found
6. Ownership failure
7. Server error handling where practical

Example route test matrix:

```txt
POST /resumes/generate
- 201 success
- 400 invalid body
- 401 unauthenticated
- 403 over limit or forbidden
- 500 AI failure handled safely

GET /admin/users
- 200 admin success
- 401 unauthenticated
- 403 normal user forbidden
- supports pagination
- supports search
```

---

---

## Database Testing Rules

Use a separate test database.

Required:

- Never use production database in tests
- Reset database between test files or test suites
- Use factories for test data
- Use transactions where possible
- Seed only required data
- Avoid depending on test order

Recommended factory examples:

```txt
createTestUser()
createTestAdmin()
createTestResume()
createTestTemplate()
createTestPlan()
createTestInvoice()
createTestApplication()
```

Test database should verify:

- Required relations
- Cascade deletion rules
- Unique constraints
- Ownership relationships
- Audit log creation
- Soft delete behavior
- Transaction rollback

---

---

## External Integration Mocking

External services must be mocked in unit and integration tests.

Mock:

- OpenAI API
- Stripe API
- SMTP email provider
- MinIO/S3 storage
- Puppeteer PDF rendering
- Virus scanner
- Redis if test does not require real Redis
- Geo/IP lookup if used

Do not call real third-party APIs during automated tests.

---

---

## Stripe Webhook Testing

Stripe webhook tests are mandatory if billing is implemented.

Test:

1. Valid signature accepted
2. Invalid signature rejected
3. Duplicate event is idempotent
4. checkout.session.completed creates/updates subscription
5. invoice.payment_succeeded updates invoice and limits
6. invoice.payment_failed marks invoice failed
7. customer.subscription.deleted downgrades account
8. Unknown event type is safely ignored
9. Webhook response is fast and reliable

Webhook handler must use raw body for signature verification.

---

---

## File Upload Testing

File upload validation must be tested.

Test:

- Valid PDF accepted
- Valid DOCX accepted
- Invalid MIME type rejected
- Wrong extension rejected
- Oversized file rejected
- Empty file rejected
- Corrupted file rejected
- File with unsafe name handled safely
- File stored outside public web root
- Virus scan failure rejects upload if scanner is enabled

Upload features that require tests:

- Resume import
- Avatar upload
- Project image upload
- Template thumbnail upload
- Data export download if generated

---

---

## Security Testing Rules

Security-related unit tests are mandatory.

Test:

- Passwords are hashed
- OTPs are hashed
- API keys are hashed
- Recovery tokens are hashed
- Session cookies are httpOnly
- Secure cookie flag enabled in production
- SameSite policy configured
- CSRF required when cookie session is used
- Input sanitization removes unsafe HTML
- Template HTML blocks scripts
- Public resume view does not expose private fields
- Admin impersonation is audit-logged
- Account deletion requires confirmation
- Dangerous admin actions require audit logs

---

---

## Audit Logging Tests

Every admin action and sensitive user action must create audit logs.

Test audit logs for:

- Admin login if required
- Ban user
- Unban user
- Promote role
- Edit user limits
- Delete user
- Impersonate user
- Create template
- Edit template
- Restore template version
- Enable maintenance mode
- Change platform settings
- Create coupon
- Revoke API key
- Run backup
- User account deletion
- User data export request
- Password change
- 2FA enable/disable

Audit log must include:

```txt
actorId
actorRole
action
targetType
targetId
ipAddress if available
userAgent if available
before value where useful
after value where useful
createdAt
```

---

---

## Queue and Worker Testing

Background jobs must be tested separately.

Workers to test:

- Email worker
- PDF export worker
- Weekly digest worker
- Data export worker
- AI moderation worker
- Backup worker
- Failed payment dunning worker
- Follow-up reminder worker

Test:

1. Job receives valid payload
2. Job rejects invalid payload
3. Job performs expected side effect
4. Job retries on temporary failure
5. Job fails safely after max retries
6. Job is idempotent where required

---

---

## Backend Test File Structure

Recommended backend structure:

```txt
apps/api/
  src/
    modules/
      auth/
        auth.service.ts
        auth.service.test.ts
        auth.routes.ts
        auth.routes.test.ts
        auth.schema.ts
        auth.schema.test.ts
      resumes/
        resume.service.ts
        resume.service.test.ts
        resume.routes.ts
        resume.routes.test.ts
    middlewares/
      require-auth.ts
      require-auth.test.ts
      require-admin.ts
      require-admin.test.ts
    utils/
      sanitize-html.ts
      sanitize-html.test.ts
  test/
    setup.ts
    db.ts
    factories.ts
    mocks/
      openai.mock.ts
      stripe.mock.ts
      storage.mock.ts
```

---

---

## Backend Feature Test Matrix

### Auth Module

Test:

- Register
- Login
- Logout
- 2FA verify
- Email verify
- Forgot password
- Reset password
- Device registration
- Session creation
- Session revocation

### Resume Module

Test:

- Create resume
- Generate resume through AI
- Update resume
- Delete resume
- Duplicate resume
- Folder assignment
- Section reorder
- History snapshot
- Restore version
- Export PDF
- Public share
- Public analytics

### AI Module

Test:

- Resume generation prompt
- JD tailoring
- ATS scoring
- Keyword gap analysis
- Cover letter generation
- Grammar check
- Translation
- Moderation scan
- Usage limit enforcement
- AI error handling

### Admin Module

Test:

- User list
- Ban/unban
- Role promotion
- Limit override
- Force password reset
- Manual email verification
- User deletion
- Impersonation
- Audit log
- Platform settings
- Feature flags
- Announcements

### Billing Module

Test:

- Plan list
- Checkout session creation
- Coupon validation
- Invoice listing
- Stripe webhook success
- Stripe webhook failure
- Subscription cancellation
- Dunning retry

### Notification Module

Test:

- Create notification
- List notifications
- Mark read
- Mark all read
- Weekly digest job
- Follow-up reminder job

---

---

## Example Backend Route Test Pattern

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../app";
import { createTestUser, createTestResume } from "../../test/factories";

describe("GET /resumes/:id", () => {
  it("should return resume when user owns it", async () => {
    const user = await createTestUser();
    const resume = await createTestResume({ userId: user.id });
    const token = await loginAs(user);

    const res = await request(app)
      .get(`/resumes/${resume.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(resume.id);
  });

  it("should reject access to another user's resume", async () => {
    const owner = await createTestUser();
    const otherUser = await createTestUser();
    const resume = await createTestResume({ userId: owner.id });
    const token = await loginAs(otherUser);

    const res = await request(app)
      .get(`/resumes/${resume.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
```

---

---

## Naming Rules

Use clear test names.

Good:

```txt
should reject login when password is incorrect
should prevent user from reading another user's resume
should create audit log when admin bans user
should show validation error when email is invalid
```

Bad:

```txt
works
test login
renders
should be ok
```

Use this pattern:

```txt
describe("FeatureName", () => {
  it("should do expected behavior when condition is true", () => {})
})
```

---

---

## Test Data Rules

Use factories instead of repeated hardcoded objects.

Good:

```ts
const user = await createTestUser({ email: "user@example.com" });
const resume = await createTestResume({ userId: user.id });
```

Avoid:

- Repeating full objects in every test
- Depending on real user IDs
- Depending on current date without freezing time
- Using random data without controlling it

Use fixed dates when testing date logic.

---

---

## Mocking Rules

Mock only external boundaries.

Allowed mocks:

- OpenAI
- Stripe
- Email provider
- Storage provider
- PDF renderer
- Redis where appropriate
- Browser APIs in frontend tests
- Router navigation in frontend tests

Avoid mocking:

- The function being tested
- Business logic that should be verified
- Validation schemas
- Authorization checks

---

---

## CI Testing Rules

Every pull request must run:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:coverage
```

Recommended scripts:

```json
{
  "scripts": {
    "test": "turbo run test",
    "test:web": "npm --workspace apps/web run test",
    "test:api": "npm --workspace apps/api run test",
    "test:coverage": "turbo run test:coverage",
    "typecheck": "turbo run typecheck",
    "lint": "turbo run lint"
  }
}
```

CI must fail if:

- Tests fail
- Type checking fails
- Linting fails
- Coverage drops below threshold
- Security-critical tests are skipped

---

---

## Backend Definition of Done

A backend feature is not complete until:

- Zod schema tests are written
- Service tests are written
- Route/controller tests are written if an API exists
- Authentication tests are written where needed
- Authorization and object ownership tests are written
- Validation failure paths are tested
- Rate limit behavior is tested where applicable
- Audit logging is tested for sensitive actions
- External services are mocked
- Database behavior is verified where relevant
- Tests pass locally
- Tests pass in CI
- Coverage threshold is maintained

Never ship backend logic that only tests the happy path.


---

## Final Backend Instruction for AI Agent or Developer

When building a backend feature:

1. Define the Zod schema first.
2. Write schema tests.
3. Write service tests.
4. Write route/controller tests.
5. Implement the service logic.
6. Implement the route/controller.
7. Add authentication, RBAC, and object-level authorization checks.
8. Add audit logging for sensitive actions.
9. Mock all external integrations.
10. Run the backend test suite before marking the feature complete.

Backend tests must protect data, security, and business rules.
