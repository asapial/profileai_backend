/** Public plans expose labels even when the admin editor stores structured features. */
export function serializePlanFeatures(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((feature): string[] => {
    if (typeof feature === 'string') return feature.trim() ? [feature] : [];
    if (!feature || typeof feature !== 'object' || Array.isArray(feature)) return [];
    const record = feature as Record<string, unknown>;
    if (record.included === false || typeof record.label !== 'string') return [];
    return record.label.trim() ? [record.label] : [];
  });
}
