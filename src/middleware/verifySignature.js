import crypto from 'crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';

export function verifyGitHubSignature(req, res, next) {
  const signature = req.headers['x-hub-signature-256'];

  if (!signature) {
    logger.warn('Missing GitHub signature header');
    return res.status(401).json({ error: 'Missing signature' });
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    logger.error('Raw body not available for signature verification');
    return res.status(500).json({ error: 'Internal server error' });
  }

  const hmac = crypto.createHmac('sha256', config.github.webhookSecret);
  hmac.update(rawBody);
  const expectedSignature = 'sha256=' + hmac.digest('hex');

  // Timing-safe comparison
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    logger.warn('Invalid GitHub signature length');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    logger.warn('Invalid GitHub signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  logger.debug('GitHub signature verified successfully');
  next();
}
