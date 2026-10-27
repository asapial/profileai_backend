import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { z } from 'zod';
import { validateRequest } from './validateRequest';

test('Express 5 controllers receive coerced query values, defaults and stripped keys', async () => {
  const app = express();
  app.get('/', validateRequest(z.object({ query: z.object({
    page: z.coerce.number().int().min(1), limit: z.coerce.number().default(20),
  }) })), (req, res) => res.json(req.query));
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const result = await fetch(`http://127.0.0.1:${address.port}/?page=2&ignored=1`);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { page: 2, limit: 20 });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('body validation preserves the controller payload and rejects invalid input', async () => {
  const schema = z.object({ body: z.object({ planSlug: z.string().min(1), billing: z.enum(['monthly', 'yearly']) }) });
  const request = { body: { planSlug: 'pro', billing: 'yearly', ignored: true } };
  let error: unknown;
  await validateRequest(schema)(request as never, {} as never, (value?: unknown) => { error = value; });
  assert.equal(error, undefined);
  assert.deepEqual(request.body, { planSlug: 'pro', billing: 'yearly' });
  await validateRequest(schema)({ body: { planSlug: '', billing: 'invalid' } } as never, {} as never, (value?: unknown) => { error = value; });
  assert.ok((error as unknown) instanceof Error);
});
