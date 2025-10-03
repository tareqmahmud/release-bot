import cron, { type ScheduledTask } from 'node-cron';
import axios, { AxiosError } from 'axios';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getRepositoriesByWebhookStatus, isReleaseProcessed } from '../storage/database.js';
import { sendReleaseNotification } from './notification.js';
import type { GitHubRelease } from '../types/github.js';
import type { Repository } from '../types/models.js';

const GITHUB_API_BASE = 'https://api.github.com';
let pollingTask: ScheduledTask | null = null;

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'GitHub-Release-Telegram-Bot',
  };

  if (config.github.apiToken) {
    headers['Authorization'] = `token ${config.github.apiToken}`;
  }

  return headers;
}

/**
 * Fetch latest releases for a repository
 */
async function fetchLatestReleases(
  owner: string,
  repo: string,
  limit = 5
): Promise<GitHubRelease[]> {
  try {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/releases`;

    const response = await axios.get<GitHubRelease[]>(url, {
      headers: getHeaders(),
      params: {
        per_page: limit,
      },
      timeout: 10000,
    });

    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response?.status === 404) {
      logger.debug({ owner, repo }, 'Repository has no releases or not found');
      return [];
    }

    logger.error(
      {
        error: axiosError.message,
        owner,
        repo,
        status: axiosError.response?.status,
      },
      'Failed to fetch latest releases'
    );

    return [];
  }
}

interface PollingResult {
  newReleases: number;
  errors: number;
}

/**
 * Check for new releases in a repository
 */
async function checkRepositoryForNewReleases(repository: Repository): Promise<PollingResult> {
  const { owner, name, full_name, chat_id } = repository;

  try {
    const releases = await fetchLatestReleases(owner, name);

    if (releases.length === 0) {
      return { newReleases: 0, errors: 0 };
    }

    let newReleases = 0;
    let errors = 0;

    // Check each release
    for (const release of releases) {
      // Skip drafts and prereleases (optional)
      if (release.draft) {
        continue;
      }

      // Check if we've already processed this release
      if (isReleaseProcessed(release.id, full_name)) {
        continue;
      }

      // We found a new release!
      logger.info(
        {
          repoFullName: full_name,
          releaseId: release.id,
          tagName: release.tag_name,
        },
        'New release detected via polling'
      );

      try {
        // Send notification
        await sendReleaseNotification(
          {
            repository: {
              full_name,
              name,
              owner: { login: owner },
            },
            release: {
              id: release.id,
              name: release.name,
              tag_name: release.tag_name,
              html_url: release.html_url,
              body: release.body,
              published_at: release.published_at,
              author: release.author,
            },
          },
          chat_id,
          'polling'
        );

        newReleases++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
          {
            error: message,
            repoFullName: full_name,
            releaseId: release.id,
          },
          'Failed to send notification for polled release'
        );
        errors++;
      }

      // Small delay between notifications
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return { newReleases, errors };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error(
      {
        error: message,
        repoFullName: full_name,
        stack,
      },
      'Error checking repository for new releases'
    );

    return { newReleases: 0, errors: 1 };
  }
}

/**
 * Poll all repositories that don't have webhooks
 */
async function pollRepositories(): Promise<void> {
  logger.info('Starting polling cycle for repositories without webhooks');

  const repositories = getRepositoriesByWebhookStatus('unsupported');

  if (repositories.length === 0) {
    logger.info('No repositories need polling');
    return;
  }

  logger.info({ count: repositories.length }, 'Polling repositories');

  let totalNewReleases = 0;
  let totalErrors = 0;

  for (const repo of repositories) {
    try {
      const result = await checkRepositoryForNewReleases(repo);
      totalNewReleases += result.newReleases;
      totalErrors += result.errors;

      // Delay between repositories to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          error: message,
          repoFullName: repo.full_name,
        },
        'Failed to poll repository'
      );
      totalErrors++;
    }
  }

  logger.info(
    {
      repositoriesPolled: repositories.length,
      newReleases: totalNewReleases,
      errors: totalErrors,
    },
    'Polling cycle completed'
  );
}

/**
 * Start the polling scheduler
 */
export function startPolling(): void {
  if (!config.polling.enabled) {
    logger.info('Polling is disabled');
    return;
  }

  if (pollingTask) {
    logger.warn('Polling task already running');
    return;
  }

  // Create cron expression for the interval
  const cronExpression = `*/${config.polling.intervalMinutes} * * * *`;

  logger.info(
    {
      intervalMinutes: config.polling.intervalMinutes,
      cronExpression,
    },
    'Starting polling scheduler'
  );

  pollingTask = cron.schedule(cronExpression, async () => {
    try {
      await pollRepositories();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      logger.error(
        {
          error: message,
          stack,
        },
        'Error in polling task'
      );
    }
  });

  // Also run once immediately on startup
  setTimeout(async () => {
    try {
      await pollRepositories();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      logger.error(
        {
          error: message,
          stack,
        },
        'Error in initial polling'
      );
    }
  }, 5000); // 5 seconds after startup
}

/**
 * Stop the polling scheduler
 */
export function stopPolling(): void {
  if (pollingTask) {
    pollingTask.stop();
    pollingTask = null;
    logger.info('Polling scheduler stopped');
  }
}
