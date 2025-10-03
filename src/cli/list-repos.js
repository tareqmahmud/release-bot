#!/usr/bin/env node

import { initDatabase, getAllRepositories } from '../storage/database.js';

function main() {
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
    const grouped = repos.reduce((acc, repo) => {
      const status = repo.webhook_status || 'unknown';
      if (!acc[status]) acc[status] = [];
      acc[status].push(repo);
      return acc;
    }, {});

    for (const [status, repoList] of Object.entries(grouped)) {
      console.log(`${status.toUpperCase()} (${repoList.length}):`);
      repoList.forEach(repo => {
        const hookInfo = repo.webhook_id ? `[hook: ${repo.webhook_id}]` : '';
        const chatInfo = repo.chat_id ? `[chat: ${repo.chat_id}]` : '';
        console.log(`  - ${repo.full_name} ${hookInfo} ${chatInfo}`);
      });
      console.log('');
    }

    process.exit(0);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
