import express from 'express';
import { config } from './config.js';
import { logger } from './logger.js';
import { verifyGitHubSignature } from './middleware/verifySignature.js';
import { handleReleaseEvent } from './handlers/releaseHandler.js';

const app = express();

// Middleware to capture raw body for signature verification
app.use(express.json({
  verify: (req, res, buf, encoding) => {
    req.rawBody = buf.toString(encoding || 'utf8');
  }
}));

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.status(200).json({
    name: 'GitHub Release Telegram Bot',
    status: 'running',
    endpoints: {
      health: '/healthz',
      webhook: '/webhook/github/releases'
    }
  });
});

// GitHub webhook endpoint
app.post('/webhook/github/releases', verifyGitHubSignature, handleReleaseEvent);

// Global error handler
app.use((err, req, res, next) => {
  logger.error({
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  }, 'Unhandled error');

  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const server = app.listen(config.port, () => {
  logger.info({
    port: config.port,
    repoOwner: config.github.repoOwner,
    repoName: config.github.repoName
  }, 'GitHub Release Telegram Bot started successfully');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
