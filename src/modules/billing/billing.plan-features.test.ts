import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePlanFeatures } from '../admin/admin.plan-features';
import { serializePlanFeatures } from './billing.plan-features';

test('public plans preserve legacy feature labels', () => {
  assert.deepEqual(serializePlanFeatures(['PDF export', '10 resumes']), ['PDF export', '10 resumes']);
});

test('saving a legacy plan in the admin editor still returns renderable public labels', () => {
  const savedFeatures = normalizePlanFeatures(['PDF export'], { resumeLimit: 10, apiLimit: 80 });
  const labels = serializePlanFeatures(savedFeatures);
  assert.deepEqual(labels, ['AI actions / month', 'Resume limit', 'PDF export']);
  assert.ok(labels.every(label => typeof label === 'string'));
});

test('structured features exclude disabled entries and malformed JSON', () => {
  assert.deepEqual(serializePlanFeatures([
    { key: 'pdf', label: 'PDF export', included: true },
    { key: 'premium', label: 'Premium templates', included: false },
    { label: 'ATS checks' },
    null, 7, {}, ['nested'], { label: 5 }, '', '   ', { label: ' ' },
  ]), ['PDF export', 'ATS checks']);
  assert.deepEqual(serializePlanFeatures(null), []);
  assert.deepEqual(serializePlanFeatures({ label: 'PDF export' }), []);
});
