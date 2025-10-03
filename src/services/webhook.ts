import axios, { AxiosError } from 'axios';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { updateWebhookStatus } from '../storage/database.js';
import type { GitHubWebhook } from '../types/github.js';
import type { RepositoryInput, WebhookStatus } from '../types/models.js';

const GITHUB_API_BASE = 'https://api.github.com';

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
 * Get the webhook URL for our service
 */
function getWebhookUrl(): string {
  return `${config.webhookBaseUrl}/webhook/github/releases`;
}

/**
 * List all webhooks for a repository
 */
async function listWebhooks(owner: string, repo: string): Promise<GitHubWebhook[] | null> {
  try {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/hooks`;

    const response = await axios.get<GitHubWebhook[]>(url, {
      headers: getHeaders(),
      timeout: 10000,
    });

    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response?.status === 404 || axiosError.response?.status === 403) {
      logger.warn(
        {
          owner,
          repo,
          status: axiosError.response?.status,
        },
        'Cannot access webhooks (permission denied or repo not found)'
      );
      return null;
    }

    throw error;
  }
}

/**
 * Create a new webhook for a repository
 */
async function createWebhook(owner: string, repo: string): Promise<GitHubWebhook | null> {
  try {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/hooks`;

    const payload = {
      name: 'web',
      active: true,
      events: ['release'],
      config: {
        url: getWebhookUrl(),
        content_type: 'json',
        secret: config.github.webhookSecret,
        insecure_ssl: '0',
      },
    };

    logger.debug(
      {
        owner,
        repo,
        webhookUrl: getWebhookUrl(),
      },
      'Creating webhook'
    );

    const response = await axios.post<GitHubWebhook>(url, payload, {
      headers: getHeaders(),
      timeout: 10000,
    });

    logger.info(
      {
        owner,
        repo,
        hookId: response.data.id,
      },
      'Webhook created successfully'
    );

    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response?.status === 403 || axiosError.response?.status === 404) {
      logger.warn(
        {
          owner,
          repo,
          status: axiosError.response?.status,
        },
        'Cannot create webhook (permission denied)'
      );
      return null;
    }

    throw error;
  }
}

/**
 * Update an existing webhook
 */
async function updateWebhook(
  owner: string,
  repo: string,
  hookId: number
): Promise<GitHubWebhook | null> {
  try {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/hooks/${hookId}`;

    const payload = {
      active: true,
      events: ['release'],
      config: {
        url: getWebhookUrl(),
        content_type: 'json',
        secret: config.github.webhookSecret,
        insecure_ssl: '0',
      },
    };

    logger.debug(
      {
        owner,
        repo,
        hookId,
      },
      'Updating webhook'
    );

    const response = await axios.patch<GitHubWebhook>(url, payload, {
      headers: getHeaders(),
      timeout: 10000,
    });

    logger.info(
      {
        owner,
        repo,
        hookId: response.data.id,
      },
      'Webhook updated successfully'
    );

    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    logger.error(
      {
        error: axiosError.message,
        owner,
        repo,
        hookId,
        status: axiosError.response?.status,
      },
      'Failed to update webhook'
    );

    throw error;
  }
}

/**
 * Find our webhook in the list of webhooks
 */
function findOurWebhook(hooks: GitHubWebhook[]): GitHubWebhook | undefined {
  if (!hooks || hooks.length === 0) {
    return undefined;
  }

  const webhookUrl = getWebhookUrl();

  return hooks.find((hook) => {
    return hook.config?.url === webhookUrl && hook.events?.includes('release');
  });
}

interface WebhookSyncResult {
  status: WebhookStatus;
  hookId: number | null;
}

/**
 * Sync webhook for a repository
 */
export async function syncWebhook(repository: RepositoryInput): Promise<WebhookSyncResult> {
  const { owner, name, fullName } = repository;

  try {
    // Check if we have API token (required for webhook management)
    if (!config.github.apiToken) {
      logger.warn({ fullName }, 'No GitHub API token, cannot manage webhooks');
      updateWebhookStatus(fullName, null, 'unsupported');
      return { status: 'unsupported', hookId: null };
    }

    // List existing webhooks
    const hooks = await listWebhooks(owner, name);

    if (hooks === null) {
      // Permission denied or repo not found
      updateWebhookStatus(fullName, null, 'unsupported');
      return { status: 'unsupported', hookId: null };
    }

    // Check if our webhook already exists
    const existingHook = findOurWebhook(hooks);

    if (existingHook) {
      // Webhook exists, check if it needs updating
      const needsUpdate =
        !existingHook.active ||
        !existingHook.events?.includes('release') ||
        existingHook.config?.url !== getWebhookUrl();

      if (needsUpdate) {
        logger.info(
          { fullName, hookId: existingHook.id },
          'Webhook exists but needs update'
        );
        const updated = await updateWebhook(owner, name, existingHook.id);

        if (updated) {
          updateWebhookStatus(fullName, updated.id, 'active');
          return { status: 'active', hookId: updated.id };
        }
      } else {
        logger.debug(
          { fullName, hookId: existingHook.id },
          'Webhook already configured correctly'
        );
        updateWebhookStatus(fullName, existingHook.id, 'active');
        return { status: 'active', hookId: existingHook.id };
      }
    }

    // Webhook doesn't exist, create it
    logger.info({ fullName }, 'Creating new webhook');
    const created = await createWebhook(owner, name);

    if (created) {
      updateWebhookStatus(fullName, created.id, 'active');
      return { status: 'active', hookId: created.id };
    } else {
      updateWebhookStatus(fullName, null, 'unsupported');
      return { status: 'unsupported', hookId: null };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error(
      {
        error: message,
        fullName,
        stack,
      },
      'Failed to sync webhook'
    );

    updateWebhookStatus(fullName, null, 'failed');
    return { status: 'failed', hookId: null };
  }
}

interface WebhookSyncResults {
  active: number;
  unsupported: number;
  failed: number;
  pending: number;
  skipped: number;
}

/**
 * Sync webhooks for all repositories
 */
export async function syncAllWebhooks(
  repositories: RepositoryInput[]
): Promise<WebhookSyncResults> {
  const results: WebhookSyncResults = {
    active: 0,
    unsupported: 0,
    failed: 0,
    pending: 0,
    skipped: 0,
  };

  for (const repo of repositories) {
    try {
      const result = await syncWebhook(repo);
      results[result.status]++;

      logger.info(
        {
          fullName: repo.fullName,
          status: result.status,
          hookId: result.hookId,
        },
        'Webhook sync completed for repository'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          error: message,
          fullName: repo.fullName,
        },
        'Failed to sync webhook for repository'
      );
      results.failed++;
    }

    // Small delay between webhook operations
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  logger.info(results, 'Webhook sync completed for all repositories');

  return results;
}
