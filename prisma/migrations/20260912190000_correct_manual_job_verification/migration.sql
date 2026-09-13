-- Manual entry previously stamped source verification without checking a source.
-- Correct those claims without touching application snapshots or terminal states.
UPDATE "job"
SET "lastVerifiedAt" = NULL,
    "lifecycle" = CASE
      WHEN "lifecycle" IN ('REMOVED', 'EXPIRED') THEN "lifecycle"
      WHEN "expiresAt" <= CURRENT_TIMESTAMP THEN 'EXPIRED'::"JobLifecycle"
      ELSE 'UNKNOWN'::"JobLifecycle"
    END
WHERE "sourceType" IN ('MANUAL', 'USER_URL');
