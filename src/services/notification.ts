import { config } from '../config.js';
import { logger } from '../logger.js';
import { sendTelegramMessage, formatReleaseMessage } from '../utils/telegram.js';
import { getRepository, markReleaseProcessed } from '../storage/database.js';
import {
  fetchReleaseDetails,
  fetchPreviousRelease,
  generateChangelogFromCommits,
} from '../utils/github.js';
import type { NormalizedReleaseEvent } from '../types/webhook.js';

interface NotificationResult {
  success: boolean;
}

/**
 * Send a release notification to Telegram
 */
export async function sendReleaseNotification(
  payload: NormalizedReleaseEvent,
  overrideChatId: string | null = null,
  source: 'webhook' | 'polling' = 'webhook'
): Promise<NotificationResult> {
  const { repository, release } = payload;

  try {
    // Determine chat ID
    let chatId = overrideChatId;

    if (!chatId) {
      // Try to get from database (per-repo override)
      const repoData = getRepository(repository.full_name);
      if (repoData?.chat_id) {
        chatId = repoData.chat_id;
      } else {
        chatId = config.telegram.chatId;
      }
    }

    // Prepare release data
    const releaseData = {
      repoName: repository.full_name,
      name: release.name ?? release.tag_name,
      tagName: release.tag_name,
      htmlUrl: release.html_url,
      body: release.body,
      publishedAt: release.published_at,
      author: release.author?.login ?? 'Unknown',
    };

    logger.info(
      {
        releaseId: release.id,
        repoFullName: repository.full_name,
        tagName: releaseData.tagName,
        author: releaseData.author,
        source,
      },
      'Processing release notification'
    );

    // If changelog is missing or empty, try to enrich it
    if (!releaseData.body || releaseData.body.trim().length === 0) {
      logger.warn(
        {
          releaseId: release.id,
          repoFullName: repository.full_name,
        },
        'Release body is empty, attempting to generate changelog'
      );

      try {
        // Try fetching full release details first
        const fullRelease = await fetchReleaseDetails(
          release.id,
          repository.owner.login,
          repository.name
        );
        if (fullRelease.body && fullRelease.body.trim().length > 0) {
          releaseData.body = fullRelease.body;
          logger.info('Retrieved release body from GitHub API');
        } else {
          // Generate from commits
          const previousRelease = await fetchPreviousRelease(
            releaseData.tagName,
            repository.owner.login,
            repository.name
          );
          if (previousRelease) {
            const generatedChangelog = await generateChangelogFromCommits(
              previousRelease.tag_name,
              releaseData.tagName,
              repository.owner.login,
              repository.name
            );
            if (generatedChangelog) {
              releaseData.body = `Auto-generated changelog:\n\n${generatedChangelog}`;
              logger.info('Generated changelog from commits');
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(
          {
            error: message,
            releaseId: release.id,
          },
          'Failed to enrich changelog, proceeding with empty body'
        );
      }
    }

    // Format and send message
    const message = formatReleaseMessage(releaseData);

    await sendTelegramMessage({
      text: message,
      parseMode: 'HTML',
      chatId,
    });

    // Mark as processed
    markReleaseProcessed(release.id, repository.full_name, release.tag_name, source);

    logger.info(
      {
        releaseId: release.id,
        repoFullName: repository.full_name,
        tagName: releaseData.tagName,
        chatId,
        source,
      },
      'Successfully sent release notification'
    );

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error(
      {
        error: message,
        stack,
        releaseId: release.id,
        repoFullName: repository.full_name,
      },
      'Failed to send release notification'
    );

    throw error;
  }
}
