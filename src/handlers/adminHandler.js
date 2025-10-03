import { logger } from '../logger.js';
import {
  getAllRepositories,
  getStatistics,
  getRepositoriesByWebhookStatus
} from '../storage/database.js';
import { discoverAllRepositories } from '../services/discovery.js';
import { syncAllWebhooks } from '../services/webhook.js';
import { config } from '../config.js';

/**
 * GET /admin/stats
 * Return statistics about repositories and releases
 */
export async function getStats(req, res) {
  try {
    const stats = getStatistics();
    const profiles = config.profiles.map(p => ({
      owner: p.owner,
      url: p.url
    }));

    res.json({
      profiles,
      ...stats,
      config: {
        pollingEnabled: config.polling.enabled,
        pollingIntervalMinutes: config.polling.intervalMinutes
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get statistics');
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /admin/repositories
 * List all tracked repositories
 */
export async function listRepositories(req, res) {
  try {
    const status = req.query.status;
    let repos;

    if (status) {
      repos = getRepositoriesByWebhookStatus(status);
    } else {
      repos = getAllRepositories();
    }

    res.json({
      count: repos.length,
      repositories: repos.map(r => ({
        fullName: r.full_name,
        owner: r.owner,
        name: r.name,
        webhookStatus: r.webhook_status,
        webhookId: r.webhook_id,
        lastSynced: r.last_synced_at,
        archived: !!r.archived,
        fork: !!r.fork,
        chatId: r.chat_id,
        url: r.url
      }))
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to list repositories');
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /admin/discover
 * Trigger repository discovery
 */
export async function triggerDiscovery(req, res) {
  try {
    logger.info('Manually triggered repository discovery');

    // Start discovery in background
    discoverAllRepositories()
      .then(repos => {
        logger.info({ count: repos.length }, 'Manual discovery completed');
      })
      .catch(error => {
        logger.error({ error: error.message }, 'Manual discovery failed');
      });

    res.json({
      message: 'Repository discovery started in background',
      profiles: config.profiles.length
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to trigger discovery');
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /admin/sync-webhooks
 * Sync webhooks for all repositories
 */
export async function triggerWebhookSync(req, res) {
  try {
    logger.info('Manually triggered webhook sync');

    const repos = getAllRepositories();

    // Start sync in background
    syncAllWebhooks(repos)
      .then(results => {
        logger.info(results, 'Manual webhook sync completed');
      })
      .catch(error => {
        logger.error({ error: error.message }, 'Manual webhook sync failed');
      });

    res.json({
      message: 'Webhook sync started in background',
      repositories: repos.length
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to trigger webhook sync');
    res.status(500).json({ error: 'Internal server error' });
  }
}
