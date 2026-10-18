import { envVars } from '../../config/env';
import AppError from '../../errorHelpers/AppError';

type Json = Record<string, unknown>;

let cachedToken: { value: string; expiresAt: number } | null = null;

const config = () => {
  const { BKASH } = envVars;
  if (!BKASH.ENABLED || !BKASH.USERNAME || !BKASH.PASSWORD || !BKASH.APP_KEY || !BKASH.APP_SECRET) {
    throw new AppError(503, 'bKash checkout is not configured.');
  }
  return BKASH;
};

async function parse(response: Response): Promise<Json> {
  const body = await response.json().catch(() => ({})) as Json;
  if (!response.ok) {
    const message = String(body.statusMessage ?? body.errorMessage ?? 'bKash request failed.');
    throw new AppError(502, message);
  }
  return body;
}

async function grantToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;
  const cfg = config();
  const response = await fetch(`${cfg.BASE_URL}/tokenized/checkout/token/grant`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      username: cfg.USERNAME!,
      password: cfg.PASSWORD!,
    },
    body: JSON.stringify({ app_key: cfg.APP_KEY, app_secret: cfg.APP_SECRET }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await parse(response);
  const token = String(body.id_token ?? '');
  if (!token || String(body.statusCode ?? '0000') !== '0000') {
    throw new AppError(502, String(body.statusMessage ?? 'bKash token grant failed.'));
  }
  const seconds = Number(body.expires_in ?? 3600);
  cachedToken = { value: token, expiresAt: Date.now() + Math.max(60, seconds) * 1000 };
  return token;
}

async function request(path: string, payload: Json): Promise<Json> {
  const cfg = config();
  const send = async () => fetch(`${cfg.BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: await grantToken(),
      'x-app-key': cfg.APP_KEY!,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  let response = await send();
  if (response.status === 401) {
    cachedToken = null;
    response = await send();
  }
  return parse(response);
}

export const bkashClient = {
  createPayment: (payload: Json) => request('/tokenized/checkout/create', payload),
  executePayment: (paymentID: string) => request('/tokenized/checkout/execute', { paymentID }),
  queryPayment: (paymentID: string) => request('/tokenized/checkout/payment/status', { paymentID }),
};
