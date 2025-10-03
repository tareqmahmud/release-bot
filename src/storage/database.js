import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { logger } from '../logger.js';

let db = null;

/**
 * Initialize the database and create tables
 */
export function initDatabase() {
  try {
    // Ensure data directory exists
    const dbDir = path.dirname(config.storage.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(config.storage.dbPath);
    db.pragma('journal_mode = WAL');

    // Create repositories table
    db.exec(`
      CREATE TABLE IF NOT EXISTS repositories (
        id INTEGER PRIMARY KEY,
        full_name TEXT UNIQUE NOT NULL,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        private INTEGER DEFAULT 0,
        fork INTEGER DEFAULT 0,
        archived INTEGER DEFAULT 0,
        disabled INTEGER DEFAULT 0,
        default_branch TEXT,
        url TEXT,
        profile_owner TEXT NOT NULL,
        chat_id TEXT,
        webhook_id INTEGER,
        webhook_status TEXT DEFAULT 'pending',
        last_synced_at TEXT,
        created_at TEXT,
        updated_at TEXT,
        pushed_at TEXT,
        discovered_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create processed_releases table
    db.exec(`
      CREATE TABLE IF NOT EXISTS processed_releases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        release_id INTEGER NOT NULL,
        repo_full_name TEXT NOT NULL,
        tag_name TEXT NOT NULL,
        source TEXT DEFAULT 'webhook',
        processed_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(release_id, repo_full_name)
      )
    `);

    // Create indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_repos_full_name ON repositories(full_name);
      CREATE INDEX IF NOT EXISTS idx_repos_owner ON repositories(owner);
      CREATE INDEX IF NOT EXISTS idx_repos_profile_owner ON repositories(profile_owner);
      CREATE INDEX IF NOT EXISTS idx_repos_webhook_status ON repositories(webhook_status);
      CREATE INDEX IF NOT EXISTS idx_releases_repo ON processed_releases(repo_full_name);
      CREATE INDEX IF NOT EXISTS idx_releases_release_id ON processed_releases(release_id);
    `);

    logger.info({ dbPath: config.storage.dbPath }, 'Database initialized successfully');

    return db;

  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Failed to initialize database');
    throw error;
  }
}

/**
 * Get database instance
 */
export function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Save or update a repository
 */
export function upsertRepository(repo) {
  const database = getDatabase();

  const stmt = database.prepare(`
    INSERT INTO repositories (
      id, full_name, owner, name, description, private, fork, archived, disabled,
      default_branch, url, profile_owner, chat_id, created_at, updated_at, pushed_at
    ) VALUES (
      @id, @fullName, @owner, @name, @description, @private, @fork, @archived, @disabled,
      @defaultBranch, @url, @profileOwner, @chatId, @createdAt, @updatedAt, @pushedAt
    )
    ON CONFLICT(full_name) DO UPDATE SET
      description = @description,
      archived = @archived,
      disabled = @disabled,
      default_branch = @defaultBranch,
      chat_id = @chatId,
      updated_at = @updatedAt,
      pushed_at = @pushedAt
  `);

  return stmt.run({
    id: repo.id,
    fullName: repo.fullName,
    owner: repo.owner,
    name: repo.name,
    description: repo.description || null,
    private: repo.private ? 1 : 0,
    fork: repo.fork ? 1 : 0,
    archived: repo.archived ? 1 : 0,
    disabled: repo.disabled ? 1 : 0,
    defaultBranch: repo.defaultBranch,
    url: repo.url,
    profileOwner: repo.profileOwner,
    chatId: repo.chatId || null,
    createdAt: repo.createdAt,
    updatedAt: repo.updatedAt,
    pushedAt: repo.pushedAt
  });
}

/**
 * Update webhook status for a repository
 */
export function updateWebhookStatus(fullName, webhookId, status) {
  const database = getDatabase();

  const stmt = database.prepare(`
    UPDATE repositories
    SET webhook_id = ?, webhook_status = ?, last_synced_at = CURRENT_TIMESTAMP
    WHERE full_name = ?
  `);

  return stmt.run(webhookId, status, fullName);
}

/**
 * Get all repositories
 */
export function getAllRepositories() {
  const database = getDatabase();
  return database.prepare('SELECT * FROM repositories ORDER BY full_name').all();
}

/**
 * Get repositories by webhook status
 */
export function getRepositoriesByWebhookStatus(status) {
  const database = getDatabase();
  return database.prepare('SELECT * FROM repositories WHERE webhook_status = ?').all(status);
}

/**
 * Get a single repository by full name
 */
export function getRepository(fullName) {
  const database = getDatabase();
  return database.prepare('SELECT * FROM repositories WHERE full_name = ?').get(fullName);
}

/**
 * Check if a release has been processed
 */
export function isReleaseProcessed(releaseId, repoFullName) {
  const database = getDatabase();
  const result = database.prepare(`
    SELECT 1 FROM processed_releases
    WHERE release_id = ? AND repo_full_name = ?
  `).get(releaseId, repoFullName);

  return !!result;
}

/**
 * Mark a release as processed
 */
export function markReleaseProcessed(releaseId, repoFullName, tagName, source = 'webhook') {
  const database = getDatabase();

  const stmt = database.prepare(`
    INSERT OR IGNORE INTO processed_releases (release_id, repo_full_name, tag_name, source)
    VALUES (?, ?, ?, ?)
  `);

  return stmt.run(releaseId, repoFullName, tagName, source);
}

/**
 * Get statistics
 */
export function getStatistics() {
  const database = getDatabase();

  const totalRepos = database.prepare('SELECT COUNT(*) as count FROM repositories').get().count;

  const webhookStats = database.prepare(`
    SELECT webhook_status, COUNT(*) as count
    FROM repositories
    GROUP BY webhook_status
  `).all();

  const totalReleases = database.prepare('SELECT COUNT(*) as count FROM processed_releases').get().count;

  const recentReleases = database.prepare(`
    SELECT repo_full_name, tag_name, processed_at, source
    FROM processed_releases
    ORDER BY processed_at DESC
    LIMIT 10
  `).all();

  return {
    totalRepos,
    webhookStats: webhookStats.reduce((acc, row) => {
      acc[row.webhook_status] = row.count;
      return acc;
    }, {}),
    totalReleases,
    recentReleases
  };
}

/**
 * Clean up old processed releases (keep last 1000 per repo)
 */
export function cleanupOldReleases() {
  const database = getDatabase();

  const stmt = database.prepare(`
    DELETE FROM processed_releases
    WHERE id NOT IN (
      SELECT id FROM processed_releases
      ORDER BY processed_at DESC
      LIMIT 1000
    )
  `);

  const result = stmt.run();
  logger.info({ deletedRows: result.changes }, 'Cleaned up old processed releases');

  return result;
}

/**
 * Close database connection
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}
