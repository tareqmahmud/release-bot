import type { Request, Response } from 'express';
import { logger } from '../logger.js';
import {
  getAllRepositories,
  getStatistics,
  getRepositoriesByWebhookStatus,
} from '../storage/database.js';
import { discoverAllRepositories } from '../services/discovery.js';
import { syncAllWebhooks } from '../services/webhook.js';
import { config } from '../config.js';
import type { WebhookStatus } from '../types/models.js';

/**
 * GET /admin/stats
 * Return statistics about repositories and releases
 */
export async function getStats(_req: Request, res: Response): Promise<void> {
  try {
    const stats = getStatistics();
    const profiles = config.profiles.map((p) => ({
      owner: p.owner,
      url: p.url,
    }));

    res.json({
      profiles,
      ...stats,
      config: {
        pollingEnabled: config.polling.enabled,
        pollingIntervalMinutes: config.polling.intervalMinutes,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Failed to get statistics');
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /admin/repositories
 * List all tracked repositories
 */
export async function listRepositories(req: Request, res: Response): Promise<void> {
  try {
    const status = req.query['status'] as WebhookStatus | undefined;
    const repos = status ? getRepositoriesByWebhookStatus(status) : getAllRepositories();

    res.json({
      count: repos.length,
      repositories: repos.map((r) => ({
        fullName: r.full_name,
        owner: r.owner,
        name: r.name,
        webhookStatus: r.webhook_status,
        webhookId: r.webhook_id,
        lastSynced: r.last_synced_at,
        archived: !!r.archived,
        fork: !!r.fork,
        chatId: r.chat_id,
        url: r.url,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Failed to list repositories');
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /admin/discover
 * Trigger repository discovery
 */
export async function triggerDiscovery(_req: Request, res: Response): Promise<void> {
  try {
    logger.info('Manually triggered repository discovery');

    // Start discovery in background
    void discoverAllRepositories()
      .then((repos) => {
        logger.info({ count: repos.length }, 'Manual discovery completed');
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error: message }, 'Manual discovery failed');
      });

    res.json({
      message: 'Repository discovery started in background',
      profiles: config.profiles.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Failed to trigger discovery');
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /admin/sync-webhooks
 * Sync webhooks for all repositories
 */
export async function triggerWebhookSync(_req: Request, res: Response): Promise<void> {
  try {
    logger.info('Manually triggered webhook sync');

    const repos = getAllRepositories();

    // Transform Repository[] to RepositoryInput[]
    const reposInput = repos.map(r => ({
      id: r.id,
      fullName: r.full_name,
      owner: r.owner,
      name: r.name,
      description: r.description,
      private: !!r.private,
      fork: !!r.fork,
      archived: !!r.archived,
      disabled: !!r.disabled,
      defaultBranch: r.default_branch,
      url: r.url ?? '',
      profileOwner: r.profile_owner,
      chatId: r.chat_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      pushedAt: r.pushed_at
    }));

    // Start sync in background
    void syncAllWebhooks(reposInput)
      .then((results) => {
        logger.info(results, 'Manual webhook sync completed');
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error: message }, 'Manual webhook sync failed');
      });

    res.json({
      message: 'Webhook sync started in background',
      repositories: reposInput.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Failed to trigger webhook sync');
    res.status(500).json({ error: 'Internal server error' });
  }
}
