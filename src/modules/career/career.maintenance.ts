import { prisma } from '../../lib/prisma';
import { minioClient, BUCKET_NAME } from '../../lib/minio';
import { recheckJob } from './career.sources';

export async function purgeCareerData() {
  const now = new Date();
  await prisma.careerOAuthState.deleteMany({ where: { expiresAt: { lt: now } } });
  const sources = await prisma.careerSource.findMany();
  for (const source of sources) {
    const policy = source.policy as { retentionDays?: number };
    const cutoff = new Date(Date.now() - (policy.retentionDays ?? 30) * 86400000);
    await prisma.job.updateMany({ where: { sourceType: { in: ['LEVER', 'GREENHOUSE'] }, listings: { some: { sourceName: source.id, lastSeenAt: { lt: cutoff } } }, lastVerifiedAt: { lt: cutoff } }, data: { description: 'Source retention period elapsed. Open the original listing for details.', contentHash: null } });
  }
  await prisma.careerDelivery.updateMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86400000) }, state: { notIn: ['QUEUED', 'SENDING'] } }, data: { payload: {} } });
  const deleted = await prisma.coverLetter.findMany({ where: { deletedAt: { lt: new Date(Date.now() - 7 * 86400000) } }, select: { id: true }, take: 100 });
  if (deleted.length) {
    const ids = deleted.map(d => d.id);
    await prisma.$transaction([prisma.jobApplication.updateMany({ where: { coverLetterId: { in: ids } }, data: { coverLetterId: null } }), prisma.coverLetter.deleteMany({ where: { id: { in: ids } } })]);
  }
  await prisma.exportJob.updateMany({ where: { completedAt: { lt: new Date(Date.now() - 86400000) } }, data: { resultUrl: null } });
  if (process.env.SKIP_MINIO !== 'true') {
    const stream = minioClient.listObjectsV2(BUCKET_NAME, 'exports/', true);
    for await (const object of stream) {
      if (object.name && object.lastModified && object.lastModified.getTime() < Date.now() - 86400000) await minioClient.removeObject(BUCKET_NAME, object.name);
    }
  }
  const jobs = await prisma.job.findMany({ where: { sourceType: { in: ['LEVER', 'GREENHOUSE'] }, lifecycle: { in: ['ACTIVE', 'POSSIBLY_EXPIRED'] }, OR: [{ lastVerifiedAt: null }, { lastVerifiedAt: { lt: new Date(Date.now() - 86400000) } }] }, take: 5, orderBy: { lastVerifiedAt: 'asc' } });
  for (const job of jobs) { try { await recheckJob(job.userId, job.id); } catch { /* Source health records retain failure status. */ } }
}
