import { prisma } from '../lib/prisma';

/** Record one successful, billable AI operation for time-based admin metrics. */
export async function recordAiUsage(userId: string, feature: string): Promise<void> {
  try {
    await prisma.aiUsageEvent.create({ data: { userId, feature } });
  } catch (error) {
    // Operational telemetry must never turn a successful user-facing AI
    // operation into a 500 response.
    console.error('[ai-usage] failed to record usage event', error);
  }
}
