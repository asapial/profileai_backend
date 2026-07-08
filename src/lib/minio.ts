import * as Minio from 'minio';
import { Readable } from 'stream';
import AppError from '../errorHelpers/AppError';
import status from 'http-status';
import { envVars } from '../config/env';

const { MINIO_ENDPOINT, MINIO_PORT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_USE_SSL } = envVars.MINIO;

const SKIP_MINIO = process.env.SKIP_MINIO === 'true';

/**
 * Throws a 503-style error explaining MinIO is disabled. Used by the stubbed
 * helpers below when SKIP_MINIO=true so request-time code paths fail loudly
 * instead of silently dropping uploads.
 */
const minioDisabledError = (op: string): never => {
  throw new AppError(
    status.SERVICE_UNAVAILABLE,
    `[MinIO] Operation "${op}" was called but SKIP_MINIO=true. ` +
      `Object storage is disabled in this environment.`
  );
};

/**
 * Stub client used when SKIP_MINIO=true. Implements just enough of the Minio.Client
 * surface (`bucketExists`, `makeBucket`, `putObject`, `presignedGetObject`,
 * `removeObject`) to satisfy ensureBucketExists() and the upload helpers.
 * Real uploads/deletes raise an AppError.
 */
const stubMinioClient = {
  bucketExists: async (_bucket: string): Promise<boolean> => true,
  makeBucket: async (_bucket: string, _region?: string): Promise<void> => {
    console.log(`[MinIO] (stub) would create bucket "${_bucket}".`);
  },
  putObject: async (_bucket: string, _name: string, _body: unknown, _size?: number): Promise<void> => {
    minioDisabledError('putObject');
  },
  presignedGetObject: async (_bucket: string, _name: string, _ttl?: number): Promise<string> => {
    return minioDisabledError('presignedGetObject') as never;
  },
  removeObject: async (_bucket: string, _name: string): Promise<void> => {
    minioDisabledError('removeObject');
  },
};

export const minioClient: Minio.Client = SKIP_MINIO
  ? (stubMinioClient as unknown as Minio.Client)
  : new Minio.Client({
      endPoint: MINIO_ENDPOINT,
      port: parseInt(MINIO_PORT, 10),
      useSSL: MINIO_USE_SSL === 'true',
      accessKey: MINIO_ACCESS_KEY,
      secretKey: MINIO_SECRET_KEY,
    });

export const BUCKET_NAME = envVars.MINIO.MINIO_BUCKET;

/**
 * Ensures the MinIO bucket exists; creates it if it does not.
 * When SKIP_MINIO=true this is a no-op (the stub reports the bucket as existing).
 */
export const ensureBucketExists = async (): Promise<void> => {
  if (SKIP_MINIO) {
    console.log(`[MinIO] Skipped bucket check (SKIP_MINIO=true). Bucket "${BUCKET_NAME}" assumed to exist.`);
    return;
  }
  const exists = await minioClient.bucketExists(BUCKET_NAME);
  if (!exists) {
    await minioClient.makeBucket(BUCKET_NAME, 'us-east-1');
    console.log(`[MinIO] Bucket "${BUCKET_NAME}" created.`);
  } else {
    console.log(`[MinIO] Bucket "${BUCKET_NAME}" already exists.`);
  }
};

/**
 * Upload a buffer to MinIO and return the object path.
 * Throws AppError(503) when SKIP_MINIO=true.
 */
export const uploadBuffer = async (
  objectName: string,
  buffer: Buffer,
  contentType: string
): Promise<string> => {
  await minioClient.putObject(BUCKET_NAME, objectName, buffer, buffer.length, {
    'Content-Type': contentType,
  });
  return objectName;
};

/**
 * Upload a readable stream to MinIO.
 * Throws AppError(503) when SKIP_MINIO=true.
 */
export const uploadStream = async (
  objectName: string,
  stream: NodeJS.ReadableStream,
  size: number,
  contentType: string
): Promise<string> => {
  await minioClient.putObject(
    BUCKET_NAME,
    objectName,
    stream as Readable,
    size,
    {
      'Content-Type': contentType,
    }
  );
  return objectName;
};

/**
 * Generate a presigned GET URL valid for the given TTL (default 15 minutes).
 * Throws AppError(503) when SKIP_MINIO=true.
 */
export const getPresignedUrl = async (
  objectName: string,
  ttlSeconds = 900
): Promise<string> => {
  return minioClient.presignedGetObject(BUCKET_NAME, objectName, ttlSeconds);
};

/**
 * Delete an object from MinIO.
 * Throws AppError(503) when SKIP_MINIO=true.
 */
export const deleteObject = async (objectName: string): Promise<void> => {
  await minioClient.removeObject(BUCKET_NAME, objectName);
};
