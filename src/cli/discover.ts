#!/usr/bin/env node

import { initDatabase, upsertRepository } from '../storage/database.js';
import { discoverAllRepositories } from '../services/discovery.js';
import { logger } from '../logger.js';

async function main(): Promise<void> {
  try {
    logger.info('Starting repository discovery...');

    // Initialize database
    initDatabase();

    // Discover repositories
    const repos = await discoverAllRepositories();

    // Save to database
    for (const repo of repos) {
      upsertRepository(repo);
    }

    logger.info(
      {
        totalRepos: repos.length,
      },
      'Repository discovery completed successfully'
    );

    console.log(`\nDiscovered ${repos.length} repositories:`);
    console.log(repos.map((r) => `  - ${r.fullName}`).join('\n'));

    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error({ error: message, stack }, 'Discovery failed');
    console.error('Error:', message);
    process.exit(1);
  }
}

void main();
