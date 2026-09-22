import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerSchema, resetPasswordSchema, twoFactorVerifySchema } from './auth.schema';
const registration = { firstName: 'Test', lastName: 'Customer', email: 'test@example.com', password: 'ValidPass123!', confirmPassword: 'ValidPass123!', acceptTerms: true };
test('registration keeps ImgBB photo and ignores client-supplied privilege fields', () => {
  const parsed = registerSchema.parse({ body: { ...registration, avatarUrl: 'https://i.ibb.co/example/photo.png', role: 'ADMIN', emailVerified: true } });
  assert.equal(parsed.body.avatarUrl, 'https://i.ibb.co/example/photo.png');
  assert.equal('role' in parsed.body, false);
  assert.equal('emailVerified' in parsed.body, false);
});
test('registration rejects unsafe or misleading image hosts', () => {
  for (const avatarUrl of ['http://i.ibb.co/photo.png', 'https://i.ibb.co.evil.example/photo.png', 'javascript:alert(1)', 'https://example.com/photo.png']) assert.equal(registerSchema.safeParse({ body: { ...registration, avatarUrl } }).success, false);
  assert.equal(registerSchema.safeParse({ body: registration }).success, true);
});
test('reset rejects mismatched passwords and 2FA rejects nonnumeric codes', () => {
  assert.equal(resetPasswordSchema.safeParse({ body: { email: registration.email, otp: '123456', newPassword: registration.password, confirmPassword: 'different' } }).success, false);
  assert.equal(twoFactorVerifySchema.safeParse({ body: { email: registration.email, otp: '12a456' } }).success, false);
});
