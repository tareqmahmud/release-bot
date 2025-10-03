import { logger } from '../logger.js';
import { sendTelegramMessage, formatReleaseMessage } from '../utils/telegram.js';
import { fetchReleaseDetails, fetchPreviousRelease, generateChangelogFromCommits } from '../utils/github.js';

// In-memory set to track processed releases (prevents duplicates)
const processedReleases = new Set();

export async function handleReleaseEvent(req, res) {
  try {
    const eventType = req.headers['x-github-event'];
    const deliveryId = req.headers['x-github-delivery'];

    logger.info({
      eventType,
      deliveryId,
      action: req.body.action
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

    const release = req.body.release;

    // Check for duplicates
    if (processedReleases.has(release.id)) {
      logger.warn({ releaseId: release.id }, 'Duplicate release event, skipping');
      return res.status(200).json({ message: 'Duplicate event, already processed' });
    }

    // Extract release details
    let releaseData = {
      name: release.name || release.tag_name,
      tagName: release.tag_name,
      htmlUrl: release.html_url,
      body: release.body,
      publishedAt: release.published_at,
      author: release.author?.login || 'Unknown'
    };

    logger.info({
      releaseId: release.id,
      tagName: releaseData.tagName,
      author: releaseData.author
    }, 'Processing release');

    // If changelog is missing or empty, try to generate one
    if (!releaseData.body || releaseData.body.trim().length === 0) {
      logger.warn({ releaseId: release.id }, 'Release body is empty, attempting to generate changelog');

      try {
        // Try fetching full release details first
        const fullRelease = await fetchReleaseDetails(release.id);
        if (fullRelease.body && fullRelease.body.trim().length > 0) {
          releaseData.body = fullRelease.body;
          logger.info('Retrieved release body from GitHub API');
        } else {
          // Generate from commits
          const previousRelease = await fetchPreviousRelease(releaseData.tagName);
          if (previousRelease) {
            const generatedChangelog = await generateChangelogFromCommits(
              previousRelease.tag_name,
              releaseData.tagName
            );
            if (generatedChangelog) {
              releaseData.body = `Auto-generated changelog:\n\n${generatedChangelog}`;
              logger.info('Generated changelog from commits');
            }
          }
        }
      } catch (error) {
        logger.warn({ error: error.message }, 'Failed to enrich changelog, proceeding with empty body');
      }
    }

    // Format and send Telegram message
    const message = formatReleaseMessage(releaseData);

    await sendTelegramMessage({
      text: message,
      parseMode: 'HTML'
    });

    // Mark as processed
    processedReleases.add(release.id);

    // Cleanup old entries if set grows too large (keep last 100)
    if (processedReleases.size > 100) {
      const entries = Array.from(processedReleases);
      entries.slice(0, entries.length - 100).forEach(id => processedReleases.delete(id));
    }

    logger.info({
      releaseId: release.id,
      tagName: releaseData.tagName
    }, 'Successfully processed and sent release notification');

    return res.status(200).json({ message: 'Release notification sent successfully' });

  } catch (error) {
    logger.error({
      error: error.message,
      stack: error.stack
    }, 'Error handling release event');

    return res.status(500).json({ error: 'Internal server error' });
  }
}
