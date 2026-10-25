import {
  AppError_default,
  envVars
} from "./chunk-QISKSLY4.js";

// src/lib/redis.ts
import { Redis } from "ioredis";
var createRedisClient = () => {
  const client = new Redis(envVars.REDIS.REDIS_URL, {
    maxRetriesPerRequest: null,
    // Required for BullMQ
    enableReadyCheck: false,
    lazyConnect: true
  });
  client.on("connect", () => {
    console.log("[Redis] Connected successfully");
  });
  client.on("error", (err) => {
    if (err.message.includes("Connection is closed")) return;
    console.error("[Redis] Connection error:", err.message);
  });
  client.on("reconnecting", () => {
    console.warn("[Redis] Reconnecting...");
  });
  return client;
};
var redis = createRedisClient();
var getPolicy = (reply) => {
  if (Array.isArray(reply)) {
    const values = reply.map(String);
    const index = values.findIndex((value) => value.toLowerCase() === "maxmemory-policy");
    return index >= 0 ? values[index + 1]?.toLowerCase() : values[1]?.toLowerCase();
  }
  if (reply && typeof reply === "object") {
    const value = reply["maxmemory-policy"];
    return typeof value === "string" ? value.toLowerCase() : void 0;
  }
  return void 0;
};
var getPolicyFromInfo = (info) => info.match(/^maxmemory_policy:([^\r\n]+)$/m)?.[1]?.trim().toLowerCase();
var errorMessage = (error) => {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object") {
    const details = Object.entries(error).filter(([, value]) => ["string", "number"].includes(typeof value)).map(([key, value]) => `${key}=${String(value)}`).join(", ");
    if (details) return details;
  }
  return "Redis rejected the CONFIG command";
};
var prepareRedisForBullMq = async () => {
  if (redis.status === "wait") await redis.connect();
  await redis.ping();
  let policy;
  try {
    policy = getPolicy(await redis.config("GET", "maxmemory-policy"));
    policy ??= getPolicyFromInfo(await redis.info());
    if (policy && policy !== "noeviction") {
      await redis.config("SET", "maxmemory-policy", "noeviction");
      policy = getPolicy(await redis.config("GET", "maxmemory-policy"));
      policy ??= getPolicyFromInfo(await redis.info());
    }
    if (policy !== "noeviction") {
      throw new Error(`Redis reported maxmemory-policy=${policy ?? "unknown"}`);
    }
    redis.options.skipVersionCheck = true;
    console.log("[Redis] Ready (PING ok, maxmemory-policy=noeviction).");
  } catch (error) {
    redis.options.skipVersionCheck = true;
    const details = errorMessage(error);
    if (process.env.NODE_ENV !== "production" && details.includes("Unsupported CONFIG parameter")) {
      console.log(
        `[Redis] Ready (provider-managed maxmemory-policy=${policy ?? "unknown"}; noeviction enforcement is deferred to production).`
      );
      return;
    }
    const guidance = `Set maxmemory-policy=noeviction in the Redis provider, then restart the API. Details: ${details}`;
    if (process.env.NODE_ENV === "production") {
      throw new Error(`[Redis] BullMQ requires a noeviction policy. ${guidance}`);
    }
    console.warn(`[Redis] BullMQ durability warning: ${guidance}`);
  }
};
var closeRedis = async () => {
  const currentStatus = redis.status;
  if (currentStatus === "ready" || currentStatus === "connecting") {
    await redis.quit().catch(() => redis.disconnect());
  } else if (currentStatus !== "end") {
    redis.disconnect();
  }
};

// src/lib/minio.ts
import * as Minio from "minio";
import status from "http-status";
var { MINIO_ENDPOINT, MINIO_PORT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_USE_SSL } = envVars.MINIO;
var SKIP_MINIO = process.env.SKIP_MINIO === "true";
var minioDisabledError = (op) => {
  throw new AppError_default(
    status.SERVICE_UNAVAILABLE,
    `[MinIO] Operation "${op}" was called but SKIP_MINIO=true. Object storage is disabled in this environment.`
  );
};
var stubMinioClient = {
  bucketExists: async (_bucket) => true,
  makeBucket: async (_bucket, _region) => {
    console.log(`[MinIO] (stub) would create bucket "${_bucket}".`);
  },
  putObject: async (_bucket, _name, _body, _size) => {
    minioDisabledError("putObject");
  },
  presignedGetObject: async (_bucket, _name, _ttl) => {
    return minioDisabledError("presignedGetObject");
  },
  removeObject: async (_bucket, _name) => {
    minioDisabledError("removeObject");
  }
};
var minioClient = SKIP_MINIO ? stubMinioClient : new Minio.Client({
  endPoint: MINIO_ENDPOINT,
  port: parseInt(MINIO_PORT, 10),
  useSSL: MINIO_USE_SSL === "true",
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY
});
var BUCKET_NAME = envVars.MINIO.MINIO_BUCKET;
var ensureBucketExists = async () => {
  if (SKIP_MINIO) {
    console.log(`[MinIO] Skipped bucket check (SKIP_MINIO=true). Bucket "${BUCKET_NAME}" assumed to exist.`);
    return;
  }
  const exists = await minioClient.bucketExists(BUCKET_NAME);
  if (!exists) {
    await minioClient.makeBucket(BUCKET_NAME, "us-east-1");
    console.log(`[MinIO] Bucket "${BUCKET_NAME}" created.`);
  } else {
    console.log(`[MinIO] Bucket "${BUCKET_NAME}" already exists.`);
  }
};
var uploadBuffer = async (objectName, buffer, contentType) => {
  await minioClient.putObject(BUCKET_NAME, objectName, buffer, buffer.length, {
    "Content-Type": contentType
  });
  return objectName;
};
var getPresignedUrl = async (objectName, ttlSeconds = 900) => {
  return minioClient.presignedGetObject(BUCKET_NAME, objectName, ttlSeconds);
};

export {
  redis,
  prepareRedisForBullMq,
  closeRedis,
  minioClient,
  BUCKET_NAME,
  ensureBucketExists,
  uploadBuffer,
  getPresignedUrl
};
