import express, { Application } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
import { indexRouter } from ".";
import { globalErrorHandler } from "./middleware/globalErrorHandler";
import { envVars } from "./config/env";
import { stripeWebhookRouter } from "./modules/billing/stripe.webhooks.router";

const app: Application = express();

// ─── Security Headers ─────────────────────────────────
app.use(helmet());

// ─── Core Middleware ──────────────────────────────────
app.use(cookieParser());

// Stripe webhook MUST run before express.json() so the signature
// verifier sees the raw byte stream.
app.use('/webhooks', stripeWebhookRouter);



// ─── CORS Setup ───────────────────────────────────────
const allowedOrigins = [
  envVars.FRONTEND_URL,
  "http://localhost:3000",
  ...(process.env.BROWSER_COMPANION_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean),
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const isAllowed =
        allowedOrigins.includes(origin);

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    exposedHeaders: ["Set-Cookie"],
  })
);

// ─── BetterAuth API Route ─────────────────────────────
app.all('/api/auth/*splat', toNodeHandler(auth));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Health Check ─────────────────────────────────────
const healthCheck = (_req: express.Request, res: express.Response) => {
  res.status(200).json({
    success: true,
    message: "ProFile AI API is running",
    service: "profileai-api",
    version: "1.0.0",
    environment: envVars.NODE_ENV,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};

app.get("/", healthCheck);
app.get("/health", healthCheck);
app.get("/api/v1/health", healthCheck);

// ─── Application Routes ───────────────────────────────
app.use("/api/v1", indexRouter);

// ─── Global Error Handler ─────────────────────────────
app.use(globalErrorHandler);

export default app;
