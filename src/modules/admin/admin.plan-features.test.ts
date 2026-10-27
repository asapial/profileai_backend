import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePlanFeatures, planFeatureLimits } from './admin.plan-features';

test('legacy feature strings render with labels and real database quotas', () => {
  const features = normalizePlanFeatures(['PDF export'], { resumeLimit: 10, apiLimit: 80 });
  assert.equal(features.find(feature => feature.key === 'feature_0')?.label, 'PDF export');
  assert.deepEqual(planFeatureLimits(features), { apiLimit: 80, resumeLimit: 10 });
});

test('edited quota features update enforced limits and invalid values fail', () => {
  assert.deepEqual(planFeatureLimits([{ key: 'resume_limit', limit: 25, included: true }]), { resumeLimit: 25 });
  assert.deepEqual(planFeatureLimits([{ key: 'api_limit', limit: 25, included: false }]), { apiLimit: 0 });
  assert.throws(() => planFeatureLimits([{ key: 'resume_limit', limit: -1 }]));
});
