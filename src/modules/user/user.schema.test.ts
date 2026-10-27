import assert from 'node:assert/strict';
import test from 'node:test';
import { updateExperiencesSchema, updateEducationsSchema, updateSkillsSchema, notificationPreferencesSchema } from './user.schema';

test('profile collection writes reject malformed rows before reaching persistence', () => {
  for (const item of [null, 1, { company: 123 }, { company: 'Example', role: 'Engineer', startDate: '-01' }]) {
    assert.equal(updateExperiencesSchema.safeParse({ body: { items: [item] } }).success, false);
  }
  assert.equal(updateEducationsSchema.safeParse({ body: { items: [{ school: 'Example', degree: 'BSc', startYear: 2020, endYear: 2019 }] } }).success, false);
  assert.equal(updateSkillsSchema.safeParse({ body: { items: [null] } }).success, false);
  assert.equal(notificationPreferencesSchema.safeParse({ body: { emailSecurity: 'false' } }).success, false);
});

test('profile collections accept normal edits and explicit empty lists', () => {
  const experience = { company: 'Example', role: 'Engineer', startDate: '2020-01-01', current: true, endDate: null };
  assert.equal(updateExperiencesSchema.safeParse({ body: { items: [experience] } }).success, true);
  for (const schema of [updateExperiencesSchema, updateEducationsSchema, updateSkillsSchema]) assert.equal(schema.safeParse({ body: { items: [] } }).success, true);
  assert.equal(updateSkillsSchema.safeParse({ body: { items: [{ id: 'a', name: 'TypeScript', level: 'EXPERT' }] } }).success, true);
});
