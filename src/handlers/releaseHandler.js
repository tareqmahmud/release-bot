import { logger } from '../logger.js';
import { isReleaseProcessed } from '../storage/database.js';
import { sendReleaseNotification } from '../services/notification.js';

export async function handleReleaseEvent(req, res) {
  try {
    const eventType = req.headers['x-github-event'];
    const deliveryId = req.headers['x-github-delivery'];

    logger.info({
      eventType,
      deliveryId,
      action: req.body.action,
      repository: req.body.repository?.full_name
    }, 'Received GitHub webhook event');

    // Only process release events with action "published"
    if (eventType !== 'release') {
      logger.debug({ eventType }, 'Ignoring non-release event');
      return res.status(202).json({ message: 'Event ignored (not a release)' });
    }

    if (req.body.action !== 'published') {
      logger.debug({ action: req.body.action }, 'Ignoring non-published release action');
      return res.status(202).json({ message: 'Event ignored (not published)' });
    }

    const { release, repository } = req.body;

    if (!repository || !release) {
      logger.warn('Missing repository or release in webhook payload');
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // Check for duplicates using database
    if (isReleaseProcessed(release.id, repository.full_name)) {
      logger.warn({
        releaseId: release.id,
        repoFullName: repository.full_name
      }, 'Duplicate release event, skipping');
      return res.status(200).json({ message: 'Duplicate event, already processed' });
    }

    // Send notification (handles everything including marking as processed)
    await sendReleaseNotification(req.body, null, 'webhook');

    return res.status(200).json({ message: 'Release notification sent successfully' });

  } catch (error) {
    logger.error({
      error: error.message,
      stack: error.stack,
      repository: req.body?.repository?.full_name,
      releaseId: req.body?.release?.id
    }, 'Error handling release event');

    return res.status(500).json({ error: 'Internal server error' });
  }
}
