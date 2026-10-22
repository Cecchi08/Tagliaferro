import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyWebhookSignature } from './payments.service.js';

describe('firma de notificaciones de Mercado Pago', () => {
  const secret = 'test-webhook-secret-only';
  const requestId = 'request-123';
  const paymentId = '987654321';
  const timestamp = '1742505638683';
  const manifest = `id:${paymentId};request-id:${requestId};ts:${timestamp};`;
  const signature = `ts=${timestamp},v1=${createHmac('sha256', secret).update(manifest).digest('hex')}`;

  it('acepta solo una firma HMAC válida con el ID y la solicitud recibidos', () => {
    expect(verifyWebhookSignature(signature, requestId, paymentId, secret)).toBe(true);
    expect(verifyWebhookSignature(signature, requestId, '987654322', secret)).toBe(false);
    expect(verifyWebhookSignature(signature, 'another-request', paymentId, secret)).toBe(false);
  });

  it('rechaza firmas ausentes, malformadas o sin secreto configurado', () => {
    expect(verifyWebhookSignature(undefined, requestId, paymentId, secret)).toBe(false);
    expect(verifyWebhookSignature('ts=bad,v1=xyz', requestId, paymentId, secret)).toBe(false);
    expect(verifyWebhookSignature(signature, requestId, paymentId, undefined)).toBe(false);
  });
});
