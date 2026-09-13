import { connect } from 'node:net';
import AppError from '../errorHelpers/AppError';

export function imageExtension(buffer: Buffer, mimetype: string) {
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new AppError(400, 'Image must be between 1 byte and 5 MB.');
  if (mimetype === 'image/png' && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
  if (mimetype === 'image/jpeg' && buffer.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return 'jpg';
  if (mimetype === 'image/webp' && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  throw new AppError(400, 'Upload a valid PNG, JPEG or WebP image.');
}
export async function scanUpload(buffer: Buffer) {
  const host = process.env.CLAMAV_HOST;
  if (!host) {
    if (process.env.NODE_ENV === 'production') throw new AppError(503, 'Upload scanning is not configured.');
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const socket = connect({ host, port: Number(process.env.CLAMAV_PORT ?? 3310) });
    socket.setTimeout(15000); let response = '';
    socket.on('connect', () => { socket.write('zINSTREAM\0'); const size = Buffer.alloc(4); size.writeUInt32BE(buffer.length); socket.write(size); socket.write(buffer); socket.write(Buffer.alloc(4)); });
    socket.on('data', data => { response += data.toString(); if (response.includes('\0')) { socket.destroy(); response.includes('stream: OK') ? resolve() : reject(new AppError(400, 'Upload did not pass scanning.')); } });
    socket.on('timeout', () => { socket.destroy(); reject(new AppError(503, 'Upload scanner timed out.')); });
    socket.on('error', () => reject(new AppError(503, 'Upload scanner unavailable.')));
    socket.on('end', () => { if (!response.includes('\0')) reject(new AppError(503, 'Incomplete scanner response.')); });
  });
}
