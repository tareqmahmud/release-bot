import axios from 'axios';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { updateWebhookStatus } from '../storage/database.js';

const GITHUB_API_BASE = 'https://api.github.com';

function getHeaders() {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'GitHub-Release-Telegram-Bot'
  };

  if (config.github.apiToken) {
    headers['Authorization'] = `token ${config.github.apiToken}`;
  }

  return headers;
}

/**
 * Get the webhook URL for our service
 */
function getWebhookUrl() {
  return `${config.webhookBaseUrl}/webhook/github/releases`;
}

/**
 * List all webhooks for a repository
 */
async function listWebhooks(owner, repo) {
  try {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/hooks`;

    const response = await axios.get(url, {
      headers: getHeaders(),
      timeout: 10000
    });

    return response.data;
  } catch (error) {
    if (error.response?.status === 404 || error.response?.status === 403) {
      logger.warn({
        owner,
        repo,
        status: error.response?.status
      }, 'Cannot access webhooks (permission denied or repo not found)');
      return null;
    }

    throw error;
  }
}

/**
 * Create a new webhook for a repository
 */
async function createWebhook(owner, repo) {
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
        insecure_ssl: '0'
      }
    };

    logger.debug({
      owner,
      repo,
      webhookUrl: getWebhookUrl()
    }, 'Creating webhook');

    const response = await axios.post(url, payload, {
      headers: getHeaders(),
      timeout: 10000
    });

    logger.info({
      owner,
      repo,
      hookId: response.data.id
    }, 'Webhook created successfully');

    return response.data;

  } catch (error) {
    if (error.response?.status === 403 || error.response?.status === 404) {
      logger.warn({
        owner,
        repo,
        status: error.response?.status
      }, 'Cannot create webhook (permission denied)');
      return null;
    }

    throw error;
  }
}

/**
 * Update an existing webhook
 */
async function updateWebhook(owner, repo, hookId) {
  try {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/hooks/${hookId}`;

    const payload = {
      active: true,
      events: ['release'],
      config: {
        url: getWebhookUrl(),
        content_type: 'json',
        secret: config.github.webhookSecret,
        insecure_ssl: '0'
      }
    };

    logger.debug({
      owner,
      repo,
      hookId
    }, 'Updating webhook');

    const response = await axios.patch(url, payload, {
      headers: getHeaders(),
      timeout: 10000
    });

    logger.info({
      owner,
      repo,
      hookId: response.data.id
    }, 'Webhook updated successfully');

    return response.data;

  } catch (error) {
    logger.error({
      error: error.message,
      owner,
      repo,
      hookId,
      status: error.response?.status
    }, 'Failed to update webhook');

    throw error;
  }
}

/**
 * Find our webhook in the list of webhooks
 */
function findOurWebhook(hooks) {
  if (!hooks || hooks.length === 0) {
    return null;
  }

  const webhookUrl = getWebhookUrl();

  return hooks.find(hook => {
    return hook.config?.url === webhookUrl &&
           hook.events?.includes('release');
  });
}

/**
 * Sync webhook for a repository
 * Returns { status: 'active'|'unsupported'|'failed', hookId: number|null }
 */
export async function syncWebhook(repository) {
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
      const needsUpdate = !existingHook.active ||
                         !existingHook.events?.includes('release') ||
                         existingHook.config?.url !== getWebhookUrl();

      if (needsUpdate) {
        logger.info({ fullName, hookId: existingHook.id }, 'Webhook exists but needs update');
        const updated = await updateWebhook(owner, name, existingHook.id);

        if (updated) {
          updateWebhookStatus(fullName, updated.id, 'active');
          return { status: 'active', hookId: updated.id };
        }
      } else {
        logger.debug({ fullName, hookId: existingHook.id }, 'Webhook already configured correctly');
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
    logger.error({
      error: error.message,
      fullName,
      stack: error.stack
    }, 'Failed to sync webhook');

    updateWebhookStatus(fullName, null, 'failed');
    return { status: 'failed', hookId: null };
  }
}

/**
 * Sync webhooks for all repositories
 */
export async function syncAllWebhooks(repositories) {
  const results = {
    active: 0,
    unsupported: 0,
    failed: 0
  };

  for (const repo of repositories) {
    try {
      const result = await syncWebhook(repo);
      results[result.status]++;

      logger.info({
        fullName: repo.fullName,
        status: result.status,
        hookId: result.hookId
      }, 'Webhook sync completed for repository');

    } catch (error) {
      logger.error({
        error: error.message,
        fullName: repo.fullName
      }, 'Failed to sync webhook for repository');
      results.failed++;
    }

    // Small delay between webhook operations
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  logger.info(results, 'Webhook sync completed for all repositories');

  return results;
}
