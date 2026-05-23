import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyMetaWebhookSignature, verifyMetaWebhookTimestamp } from './webhook-validator.ts';

function makeSignature(body: string, secret: string): string {
  const hex = createHmac('sha256', secret).update(Buffer.from(body, 'utf8')).digest('hex');
  return `sha256=${hex}`;
}

describe('verifyMetaWebhookSignature', () => {
  const SECRET = 'test-secret';
  const BODY = '{"object":"instagram","entry":[]}';

  test('valid signature passes', () => {
    const header = makeSignature(BODY, SECRET);
    const result = verifyMetaWebhookSignature(BODY, header, SECRET);
    assert.equal(result.valid, true);
  });

  test('tampered body fails with signature_mismatch', () => {
    const header = makeSignature(BODY, SECRET);
    const result = verifyMetaWebhookSignature(BODY + ' tampered', header, SECRET);
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, 'signature_mismatch');
  });

  test('missing header returns missing_signature', () => {
    const result = verifyMetaWebhookSignature(BODY, null, SECRET);
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, 'missing_signature');
  });

  test('header without sha256= prefix returns malformed_signature', () => {
    const result = verifyMetaWebhookSignature(BODY, 'md5=abcdef', SECRET);
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, 'malformed_signature');
  });

  test('missing secret returns missing_secret', () => {
    const header = makeSignature(BODY, SECRET);
    const result = verifyMetaWebhookSignature(BODY, header, null);
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, 'missing_secret');
  });
});

describe('verifyMetaWebhookTimestamp', () => {
  test('timestamp 4 minutes ago is valid (within 300s window)', () => {
    const fourMinutesAgo = Math.floor(Date.now() / 1000) - 4 * 60;
    assert.equal(verifyMetaWebhookTimestamp(fourMinutesAgo), true);
  });

  test('timestamp 6 minutes ago is invalid (outside 300s window)', () => {
    const sixMinutesAgo = Math.floor(Date.now() / 1000) - 6 * 60;
    assert.equal(verifyMetaWebhookTimestamp(sixMinutesAgo), false);
  });
});
