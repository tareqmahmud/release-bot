import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const requiredEnvVars = [
  'GITHUB_WEBHOOK_SECRET',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID'
];

// Validate required environment variables
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Parse monitored profiles from env
function parseMonitoredProfiles() {
  const profilesEnv = process.env.MONITORED_PROFILES;
  if (!profilesEnv || profilesEnv.trim() === '') {
    return [];
  }

  return profilesEnv
    .split(',')
    .map(url => url.trim())
    .filter(url => url.length > 0)
    .map(url => {
      // Extract owner from GitHub URL
      const match = url.match(/github\.com\/([^\/]+)/);
      if (!match) {
        throw new Error(`Invalid GitHub profile URL: ${url}`);
      }
      return {
        url,
        owner: match[1],
        chatId: null, // Use default
        include: ['*'],
        exclude: []
      };
    });
}

// Load advanced config from JSON file if specified
function loadAdvancedConfig() {
  const configFile = process.env.CONFIG_FILE;
  if (!configFile) {
    return null;
  }

  const configPath = path.resolve(configFile);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(content);

    // Transform URLs to include owner
    if (parsed.profiles) {
      parsed.profiles = parsed.profiles.map(profile => {
        const match = profile.url.match(/github\.com\/([^\/]+)/);
        if (!match) {
          throw new Error(`Invalid GitHub profile URL in config: ${profile.url}`);
        }
        return {
          ...profile,
          owner: match[1],
          include: profile.include || ['*'],
          exclude: profile.exclude || []
        };
      });
    }

    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse config file: ${error.message}`);
  }
}

// Get final profile configuration
function getProfiles() {
  const advancedConfig = loadAdvancedConfig();
  if (advancedConfig && advancedConfig.profiles) {
    return advancedConfig.profiles;
  }

  const envProfiles = parseMonitoredProfiles();
  if (envProfiles.length > 0) {
    return envProfiles;
  }

  // Fallback to legacy single-repo config for backward compatibility
  if (process.env.GITHUB_REPO_OWNER && process.env.GITHUB_REPO_NAME) {
    return [{
      url: `https://github.com/${process.env.GITHUB_REPO_OWNER}`,
      owner: process.env.GITHUB_REPO_OWNER,
      chatId: null,
      include: [process.env.GITHUB_REPO_NAME],
      exclude: []
    }];
  }

  throw new Error('No profiles configured. Set MONITORED_PROFILES or CONFIG_FILE');
}

// Parse filter patterns
function parseFilterList(envVar) {
  const value = process.env[envVar];
  if (!value || value.trim() === '') {
    return [];
  }
  return value.split(',').map(p => p.trim()).filter(p => p.length > 0);
}

export const config = {
  port: process.env.PORT || 3000,
  webhookBaseUrl: process.env.WEBHOOK_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,

  github: {
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    apiToken: process.env.GITHUB_API_TOKEN || '',
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID
  },

  profiles: getProfiles(),

  filters: {
    allowlist: parseFilterList('REPO_ALLOWLIST'),
    blocklist: parseFilterList('REPO_BLOCKLIST'),
    includeArchived: process.env.INCLUDE_ARCHIVED === 'true',
    includeForks: process.env.INCLUDE_FORKS === 'true'
  },

  polling: {
    enabled: process.env.ENABLE_POLLING !== 'false',
    intervalMinutes: parseInt(process.env.POLL_INTERVAL_MINUTES || '15', 10)
  },

  message: {
    maxChangelogLength: parseInt(process.env.MAX_CHANGELOG_LENGTH || '2500', 10)
  },

  storage: {
    dbPath: process.env.DB_PATH || 'data/releases.db'
  }
};
