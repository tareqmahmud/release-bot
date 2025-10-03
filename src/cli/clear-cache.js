#!/usr/bin/env node

import fs from 'fs';
import { config } from '../config.js';
import { logger } from '../logger.js';

function main() {
  try {
    const dbPath = config.storage.dbPath;

    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log(`Deleted database: ${dbPath}`);
      logger.info({ dbPath }, 'Database cleared');
    } else {
      console.log('No database file found');
    }

    // Also delete WAL files if they exist
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;

    if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath);
      console.log(`Deleted WAL file: ${walPath}`);
    }

    if (fs.existsSync(shmPath)) {
      fs.unlinkSync(shmPath);
      console.log(`Deleted SHM file: ${shmPath}`);
    }

    console.log('\nCache cleared successfully!');
    console.log('Run discovery again: npm run admin:discover\n');

    process.exit(0);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
