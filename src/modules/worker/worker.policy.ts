import { prisma } from '../../lib/prisma';
import { REVIEWED_POLICIES } from './worker.policy.data';

export {
  REVIEWED_POLICIES,
  classifyTaskSource,
  policyForSource,
  mapAdapterToSource,
  mapTaskMode,
  type ReviewedPolicy,
} from './worker.policy.data';

export async function ensureWorkerPolicies(): Promise<void> {
  await prisma.$transaction(
    REVIEWED_POLICIES.map(policy => prisma.sitePolicy.upsert({
      where: { source_version: { source: policy.source, version: policy.version } },
      create: {
        source: policy.source,
        name: policy.name,
        version: policy.version,
        level: policy.level,
        domains: policy.domains,
        discovery: policy.discovery,
        search: policy.search,
        scroll: policy.scroll,
        extraction: policy.extraction,
        formFill: policy.formFill,
        submit: policy.submit,
        userPresenceRequired: policy.userPresenceRequired,
        maxPagesPerRun: policy.maxPagesPerRun,
        maxRequestsPerMinute: policy.maxRequestsPerMinute,
        reviewedAt: new Date(policy.reviewedAt),
        reviewReference: policy.reviewReference,
        notes: policy.notes,
        enabled: policy.enabled,
        reviewedBy: 'security',
      },
      update: {
        name: policy.name,
        level: policy.level,
        domains: policy.domains,
        discovery: policy.discovery,
        search: policy.search,
        scroll: policy.scroll,
        extraction: policy.extraction,
        formFill: policy.formFill,
        submit: policy.submit,
        userPresenceRequired: policy.userPresenceRequired,
        maxPagesPerRun: policy.maxPagesPerRun,
        maxRequestsPerMinute: policy.maxRequestsPerMinute,
        reviewedAt: new Date(policy.reviewedAt),
        reviewReference: policy.reviewReference,
        notes: policy.notes,
        enabled: policy.enabled,
      },
    })),
  );
  const currentVersions = REVIEWED_POLICIES.map(policy => policy.version);
  await prisma.sitePolicy.updateMany({
    where: { version: { notIn: currentVersions }, enabled: true },
    data: { enabled: false },
  });
}
