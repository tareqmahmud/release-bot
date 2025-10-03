#!/usr/bin/env node

import { initDatabase, getAllRepositories } from '../storage/database.js';
import type { Repository, WebhookStatus } from '../types/models.js';

function main(): void {
  try {
    // Initialize database
    initDatabase();

    // Get all repositories
    const repos = getAllRepositories();

    console.log(`\nTotal repositories: ${repos.length}\n`);

    if (repos.length === 0) {
      console.log('No repositories found. Run discovery first: npm run admin:discover\n');
      process.exit(0);
    }

    // Group by webhook status
    const grouped = repos.reduce(
      (acc, repo) => {
        const status: WebhookStatus = repo.webhook_status;
        if (!acc[status]) {
          acc[status] = [];
        }
        acc[status]?.push(repo);
        return acc;
      },
      {} as Record<WebhookStatus, Repository[]>
    );

    for (const [status, repoList] of Object.entries(grouped)) {
      if (!repoList) continue;
      console.log(`${status.toUpperCase()} (${repoList.length}):`);
      for (const repo of repoList) {
        const hookInfo = repo.webhook_id ? `[hook: ${repo.webhook_id}]` : '';
        const chatInfo = repo.chat_id ? `[chat: ${repo.chat_id}]` : '';
        console.log(`  - ${repo.full_name} ${hookInfo} ${chatInfo}`);
      }
      console.log('');
    }

    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error:', message);
    process.exit(1);
  }
}

main();
