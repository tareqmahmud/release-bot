import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { logger } from '../logger.js';

export function verifyGitHubSignature(req: Request, res: Response, next: NextFunction): void {
  const signature = req.headers['x-hub-signature-256'];

  if (!signature || typeof signature !== 'string') {
    logger.warn('Missing GitHub signature header');
    res.status(401).json({ error: 'Missing signature' });
    return;
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    logger.error('Raw body not available for signature verification');
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  const hmac = crypto.createHmac('sha256', config.github.webhookSecret);
  hmac.update(rawBody);
  const expectedSignature = 'sha256=' + hmac.digest('hex');

  // Timing-safe comparison
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    logger.warn('Invalid GitHub signature length');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    logger.warn('Invalid GitHub signature');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  logger.debug('GitHub signature verified successfully');
  next();
}
