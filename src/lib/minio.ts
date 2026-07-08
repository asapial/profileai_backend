import * as Minio from 'minio';
import { Readable } from 'stream';
import { envVars } from '../config/env';

const { MINIO_ENDPOINT, MINIO_PORT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_USE_SSL } = envVars.MINIO;

export const minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT,
  port: parseInt(MINIO_PORT, 10),
  useSSL: MINIO_USE_SSL === 'true',
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

export const BUCKET_NAME = envVars.MINIO.MINIO_BUCKET;

/**
 * Ensures the MinIO bucket exists; creates it if it does not.
 */
export const ensureBucketExists = async (): Promise<void> => {
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
 */
export const getPresignedUrl = async (
  objectName: string,
  ttlSeconds = 900
): Promise<string> => {
  return minioClient.presignedGetObject(BUCKET_NAME, objectName, ttlSeconds);
};

/**
 * Delete an object from MinIO.
 */
export const deleteObject = async (objectName: string): Promise<void> => {
  await minioClient.removeObject(BUCKET_NAME, objectName);
};
