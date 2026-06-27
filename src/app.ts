import express, { Application } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
import { indexRouter } from ".";
import { globalErrorHandler } from "./middleware/globalErrorHandler";
import { envVars } from "./config/env";

const app: Application = express();

// ─── Security Headers ─────────────────────────────────
app.use(helmet());

// ─── Core Middleware ──────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── CORS Setup ───────────────────────────────────────
const allowedOrigins = [envVars.FRONTEND_URL, "http://localhost:3000"].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const isAllowed =
        allowedOrigins.includes(origin) ||
        /^https:\/\/.*\.vercel\.app$/.test(origin);

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

// ─── Health Check ─────────────────────────────────────
app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "ProFile AI API is running",
    service: "profileai-api",
    version: "1.0.0",
    environment: envVars.NODE_ENV,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ─── Application Routes ───────────────────────────────
app.use("/api/v1", indexRouter);

// ─── Global Error Handler ─────────────────────────────
app.use(globalErrorHandler);

export default app;