import { createHmac, timingSafeEqual } from 'crypto';

export type SignatureVerificationResult =
  | { valid: true }
  | { valid: false; reason: 'missing_signature' | 'malformed_signature' | 'signature_mismatch' | 'missing_secret' };

export function verifyMetaWebhookSignature(
  rawBody: string | Buffer,
  header: string | null | undefined,
  secret: string | null | undefined,
): SignatureVerificationResult {
  if (!secret) {
    return { valid: false, reason: 'missing_secret' };
  }

  if (!header) {
    return { valid: false, reason: 'missing_signature' };
  }

  if (!header.startsWith('sha256=')) {
    return { valid: false, reason: 'malformed_signature' };
  }

  const receivedHex = header.slice('sha256='.length);
  if (!/^[0-9a-f]+$/i.test(receivedHex) || receivedHex.length === 0) {
    return { valid: false, reason: 'malformed_signature' };
  }

  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const expectedHex = createHmac('sha256', secret).update(body).digest('hex');

  const expected = Buffer.from(expectedHex, 'hex');
  const received = Buffer.from(receivedHex, 'hex');

  if (expected.length !== received.length) {
    return { valid: false, reason: 'signature_mismatch' };
  }

  if (!timingSafeEqual(expected, received)) {
    return { valid: false, reason: 'signature_mismatch' };
  }

  return { valid: true };
}

export function verifyMetaWebhookTimestamp(timestampSec: number, windowSec = 300): boolean {
  const nowSec = Math.floor(Date.now() / 1000);
  return Math.abs(nowSec - timestampSec) <= windowSec;
}
