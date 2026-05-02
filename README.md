# ProFileAI Backend

Express + Prisma + Better Auth backend for the ProFileAI platform.

---

## Prerequisites

- **Node.js** ≥ 20
- **npm** ≥ 10
- **PostgreSQL** database (or Prisma Postgres)

---

## Quick Start

```bash
# 1. Install all dependencies (listed below)
npm install

# 2. Generate Prisma client
npx prisma generate

# 3. Run database migrations
npx prisma migrate dev

# 4. Start the dev server
npm run dev
```

The server will start at `http://localhost:5000`.

---

## NPM Packages Required

### Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | ^5.2.1 | Web framework |
| `cors` | ^2.8.6 | Cross-origin resource sharing |
| `cookie-parser` | ^1.4.7 | Cookie parsing middleware |
| `dotenv` | ^17.4.2 | Environment variable loading |
| `better-auth` | ^1.6.9 | Authentication framework |
| `prisma` | ^7.8.0 | Database ORM CLI / engine |
| `@prisma/client` | ^7.8.0 | Prisma client for queries |
| `@prisma/adapter-pg` | ^7.8.0 | Prisma PostgreSQL driver adapter |
| `cloudinary` | latest | Cloud image/file storage |
| `multer` | latest | File upload middleware |
| `multer-storage-cloudinary` | latest | Cloudinary storage engine for multer |
| `stripe` | latest | Payment processing |
| `nodemailer` | latest | Email sending |
| `ejs` | latest | Email template rendering |
| `jsonwebtoken` | latest | JWT token creation/verification |
| `http-status` | latest | HTTP status code constants |
| `zod` | latest | Schema validation |

### Dev Dependencies (Type Definitions & Tooling)

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^6.0.3 | TypeScript compiler |
| `tsx` | ^4.21.0 | TypeScript execution (dev server) |
| `tsup` | ^8.5.1 | TypeScript bundler (production build) |
| `@types/node` | ^25.6.0 | Node.js type definitions |
| `@types/express` | ^5.0.6 | Express type definitions |
| `@types/cors` | ^2.8.19 | CORS type definitions |
| `@types/cookie-parser` | ^1.4.10 | cookie-parser type definitions |
| `@types/jsonwebtoken` | latest | jsonwebtoken type definitions |
| `@types/nodemailer` | latest | nodemailer type definitions |
| `@types/multer` | latest | multer type definitions |
| `@types/ejs` | latest | ejs type definitions |

---

## Install Commands

### All-in-one install (copy & paste)

**Production dependencies:**

```bash
npm install express cors cookie-parser dotenv better-auth prisma @prisma/client @prisma/adapter-pg cloudinary multer multer-storage-cloudinary stripe nodemailer ejs jsonwebtoken http-status zod
```

**Dev / type dependencies:**

```bash
npm install -D typescript tsx tsup @types/node @types/express @types/cors @types/cookie-parser @types/jsonwebtoken @types/nodemailer @types/multer @types/ejs
```

---

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `npx tsx watch src/server.ts` | Start dev server with hot reload |
| `build` | `prisma generate && tsup ...` | Production build |
| `generate` | `npx prisma generate` | Generate Prisma client |
| `migrate` | `npx prisma migrate dev` | Run DB migrations |
| `seeding` | `npx tsx src/scripts/seedingAdmin.ts` | Seed super admin user |
| `postinstall` | `prisma generate` | Auto-generate Prisma client on install |

---

## Environment Variables

Copy the `.env` file and fill in your values. Required variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | ✅ Yes | Auth secret key (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | ✅ Yes | Backend URL (e.g. `http://localhost:5000`) |
| `NODE_ENV` | No | `development` / `production` |
| `PORT` | No | Server port (default: `5000`) |
| `ACCESS_TOKEN_SECRET` | No | JWT access token secret |
| `REFRESH_TOKEN_SECRET` | No | JWT refresh token secret |
| `FRONTEND_URL` | No | Frontend URL for CORS |
| `CLOUDINARY_*` | No | Cloudinary credentials |
| `STRIPE_*` | No | Stripe credentials |
| `EMAIL_SENDER_*` | No | SMTP email config |
| `GOOGLE_*` | No | Google OAuth credentials |
| `SUPER_ADMIN_*` | No | Super admin seeding credentials |

---

## Project Structure

```
profileai_backend/
├── prisma/
│   ├── schema/          # Prisma schema files
│   └── migrations/      # Database migrations
├── generated/prisma/    # Generated Prisma client
├── src/
│   ├── config/          # env, cloudinary, multer, stripe configs
│   ├── errorHelpers/    # AppError, Zod error handler
│   ├── lib/             # auth (better-auth), prisma client
│   ├── middleware/       # checkAuth, globalErrorHandler, validateRequest
│   ├── module/          # Feature modules (auth, user, doctor, etc.)
│   ├── routes/          # Route aggregator
│   ├── shared/          # catchAsync, sendResponse
│   ├── templates/       # EJS email templates
│   └── utils/           # JWT, token, email, cookie, QueryBuilder, seed
├── .env                 # Environment variables
├── package.json
├── prisma.config.ts
└── tsconfig.json
```
