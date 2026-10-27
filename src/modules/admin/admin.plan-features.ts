import AppError from '../../errorHelpers/AppError';

export type PlanFeature = { key: string; label: string; included: boolean; limit?: number | null };

export function normalizePlanFeatures(value: unknown, limits: { resumeLimit: number; apiLimit: number }): PlanFeature[] {
  const features: PlanFeature[] = (Array.isArray(value) ? value : []).map((item, index) => {
    if (typeof item === 'string') return { key: `feature_${index}`, label: item, included: true };
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return { key: String(record.key ?? `feature_${index}`), label: String(record.label ?? ''), included: record.included !== false,
      ...(typeof record.limit === 'number' || record.limit === null ? { limit: record.limit as number | null } : {}) };
  });
  for (const [key, label, limit] of [['resume_limit', 'Resume limit', limits.resumeLimit], ['api_limit', 'AI actions / month', limits.apiLimit]] as const) {
    const existing = features.find(feature => feature.key === key);
    if (existing) existing.limit = limit;
    else features.unshift({ key, label, included: true, limit });
  }
  return features;
}

export function planFeatureLimits(value: unknown): { resumeLimit?: number; apiLimit?: number } {
  const result: { resumeLimit?: number; apiLimit?: number } = {};
  for (const item of Array.isArray(value) ? value : []) {
    if (!item || typeof item !== 'object') continue;
    if (item.key !== 'resume_limit' && item.key !== 'api_limit') continue;
    if (!Number.isInteger(item.limit) || item.limit < 0 || item.limit > 1_000_000) throw new AppError(400, 'Plan quotas must be whole numbers between 0 and 1000000.');
    result[item.key === 'resume_limit' ? 'resumeLimit' : 'apiLimit'] = item.included === false ? 0 : item.limit;
  }
  return result;
}
