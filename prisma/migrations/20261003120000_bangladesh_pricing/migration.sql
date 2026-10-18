-- Localize the canonical self-serve plans for Bangladesh.
-- Amounts use the smallest currency unit (poisha).
UPDATE "plan"
SET
  "name" = 'Free',
  "description" = 'Start building job-ready applications at no cost.',
  "amount" = 0,
  "currency" = 'bdt',
  "apiLimit" = 6,
  "resumeLimit" = 2,
  "features" = '["2 resumes","2 alignment analyses / month","1 tailored resume / month","3 application drafts / month","10 saved applications"]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'free';

UPDATE "plan"
SET
  "name" = 'Job Seeker',
  "description" = 'Full toolkit for an active job search.',
  "amount" = 29900,
  "currency" = 'bdt',
  "apiLimit" = 80,
  "resumeLimit" = 10,
  "features" = '["10 resume versions","25 alignment analyses / month","15 tailored resumes / month","30 application drafts / month","Unlimited application tracking"]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'pro';

UPDATE "plan"
SET
  "name" = 'Career Pro',
  "description" = 'Advanced preparation for a focused career move.',
  "amount" = 59900,
  "currency" = 'bdt',
  "apiLimit" = 265,
  "resumeLimit" = 1000,
  "features" = '["Unlimited resume versions","75 alignment analyses / month","50 tailored resumes / month","100 application drafts / month","Advanced interview preparation"]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'business';
