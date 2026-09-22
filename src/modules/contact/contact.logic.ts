const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeContactRecipients(...values: unknown[]): string[] {
  const recipients = values.flatMap((value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return value.split(/[\s,;]+/);
    return [];
  });

  return [...new Set(
    recipients
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => EMAIL_RE.test(value)),
  )].slice(0, 20);
}
