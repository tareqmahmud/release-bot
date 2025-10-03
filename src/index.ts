import express, { type Request, type Response, type ErrorRequestHandler } from 'express';
import { config } from './config.js';
import { logger } from './logger.js';
import { verifyGitHubSignature } from './middleware/verifySignature.js';
import { handleReleaseEvent } from './handlers/releaseHandler.js';
import {
  getStats,
  listRepositories,
  triggerDiscovery,
  triggerWebhookSync,
} from './handlers/adminHandler.js';
import {
  initDatabase,
  upsertRepository,
  closeDatabase,
  updateWebhookStatus,
} from './storage/database.js';
import { discoverAllRepositories } from './services/discovery.js';
import { syncAllWebhooks } from './services/webhook.js';
import { startPolling, stopPolling } from './services/polling.js';
import type { Server } from 'http';

const app = express();

// Initialize database on startup
initDatabase();

// Middleware to capture raw body for signature verification
app.use(
  express.json({
    verify: (req: Request, _res, buf, encoding) => {
      req.rawBody = buf.toString((encoding as BufferEncoding) || 'utf8');
    },
  })
);

// Health check endpoint
app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    name: 'GitHub Release Telegram Bot (Multi-Repo)',
    version: '2.0.0',
    status: 'running',
    endpoints: {
      health: '/healthz',
      webhook: '/webhook/github/releases',
      admin: {
        stats: '/admin/stats',
        repositories: '/admin/repositories',
        discover: 'POST /admin/discover',
        syncWebhooks: 'POST /admin/sync-webhooks',
      },
    },
  });
});

// GitHub webhook endpoint
app.post('/webhook/github/releases', verifyGitHubSignature, handleReleaseEvent);

// Admin endpoints
app.get('/admin/stats', getStats);
app.get('/admin/repositories', listRepositories);
app.post('/admin/discover', triggerDiscovery);
app.post('/admin/sync-webhooks', triggerWebhookSync);

// Global error handler
const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  logger.error(
    {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    },
    'Unhandled error'
  );

  res.status(500).json({ error: 'Internal server error' });
};

app.use(errorHandler);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const server: Server = app.listen(config.port, async () => {
  logger.info(
    {
      port: config.port,
      profiles: config.profiles.length,
      webhookBaseUrl: config.webhookBaseUrl,
    },
    'GitHub Release Telegram Bot started successfully'
  );

  // Run initial discovery and webhook sync
  try {
    logger.info('Running initial repository discovery...');
    const repos = await discoverAllRepositories();

    for (const repo of repos) {
      upsertRepository(repo);
    }

    logger.info({ count: repos.length }, 'Initial repository discovery completed');

    // Sync webhooks
    if (config.github.apiToken) {
      logger.info('Syncing webhooks for discovered repositories...');
      const results = await syncAllWebhooks(repos);
      logger.info(results, 'Initial webhook sync completed');
    } else {
      logger.warn('No GitHub API token configured, skipping webhook setup');

      // Mark repositories so polling picks them up immediately
      for (const repo of repos) {
        try {
          updateWebhookStatus(repo.fullName, null, 'unsupported');
        } catch (statusError) {
          const message = statusError instanceof Error ? statusError.message : String(statusError);
          logger.error(
            {
              error: message,
              fullName: repo.fullName,
            },
            'Failed to flag repository for polling fallback'
          );
        }
      }
    }

    // Start polling scheduler
    startPolling();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error(
      {
        error: message,
        stack,
      },
      'Failed during initial setup'
    );
  }
});

// Graceful shutdown
async function shutdown(): Promise<void> {
  logger.info('Shutting down gracefully...');

  // Stop polling
  stopPolling();

  // Close server
  server.close(() => {
    logger.info('Server closed');

    // Close database
    closeDatabase();

    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
