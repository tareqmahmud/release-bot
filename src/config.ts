import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

dotenv.config();

// Zod schemas for runtime validation
const ProfileSchema = z.object({
  url: z.string().url(),
  owner: z.string(),
  chatId: z.string().nullable(),
  include: z.array(z.string()),
  exclude: z.array(z.string()),
});

const AdvancedConfigSchema = z.object({
  profiles: z.array(
    z.object({
      url: z.string().url(),
      chatId: z.string().optional().nullable(),
      include: z.array(z.string()).optional(),
      exclude: z.array(z.string()).optional(),
    })
  ),
});

const EnvSchema = z.object({
  GITHUB_WEBHOOK_SECRET: z.string().min(1, 'GitHub webhook secret is required'),
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'Telegram bot token is required'),
  TELEGRAM_CHAT_ID: z.string().min(1, 'Telegram chat ID is required'),
  GITHUB_API_TOKEN: z.string().optional(),
  MONITORED_PROFILES: z.string().optional(),
  CONFIG_FILE: z.string().optional(),
  GITHUB_REPO_OWNER: z.string().optional(),
  GITHUB_REPO_NAME: z.string().optional(),
  PORT: z.string().optional(),
  WEBHOOK_BASE_URL: z.string().optional(),
  REPO_ALLOWLIST: z.string().optional(),
  REPO_BLOCKLIST: z.string().optional(),
  INCLUDE_ARCHIVED: z.string().optional(),
  INCLUDE_FORKS: z.string().optional(),
  ENABLE_POLLING: z.string().optional(),
  POLL_INTERVAL_MINUTES: z.string().optional(),
  MAX_CHANGELOG_LENGTH: z.string().optional(),
  DB_PATH: z.string().optional(),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type AdvancedConfig = z.infer<typeof AdvancedConfigSchema>;

// Validate required environment variables
const env = EnvSchema.parse(process.env);

// Parse monitored profiles from env
function parseMonitoredProfiles(): Profile[] {
  const profilesEnv = env.MONITORED_PROFILES;
  if (!profilesEnv || profilesEnv.trim() === '') {
    return [];
  }

  return profilesEnv
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0)
    .map((url) => {
      // Extract owner from GitHub URL
      const match = url.match(/github\.com\/([^/]+)/);
      if (!match || !match[1]) {
        throw new Error(`Invalid GitHub profile URL: ${url}`);
      }
      return {
        url,
        owner: match[1],
        chatId: null,
        include: ['*'],
        exclude: [],
      };
    });
}

// Load advanced config from JSON file if specified
function loadAdvancedConfig(): Profile[] | null {
  const configFile = env.CONFIG_FILE;
  if (!configFile) {
    return null;
  }

  const configPath = path.resolve(configFile);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const parsed: unknown = JSON.parse(content);
    const validated = AdvancedConfigSchema.parse(parsed);

    // Transform URLs to include owner
    if (validated.profiles) {
      const transformedProfiles: Profile[] = validated.profiles.map((profile) => {
        const match = profile.url.match(/github\.com\/([^/]+)/);
        if (!match || !match[1]) {
          throw new Error(`Invalid GitHub profile URL in config: ${profile.url}`);
        }
        return {
          url: profile.url,
          owner: match[1],
          chatId: profile.chatId ?? null,
          include: profile.include ?? ['*'],
          exclude: profile.exclude ?? [],
        };
      });
      return transformedProfiles;
    }

    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse config file: ${message}`);
  }
}

// Get final profile configuration
function getProfiles(): Profile[] {
  const advancedConfig = loadAdvancedConfig();
  if (advancedConfig) {
    return advancedConfig;
  }

  const envProfiles = parseMonitoredProfiles();
  if (envProfiles.length > 0) {
    return envProfiles;
  }

  // Fallback to legacy single-repo config for backward compatibility
  if (env.GITHUB_REPO_OWNER && env.GITHUB_REPO_NAME) {
    return [
      {
        url: `https://github.com/${env.GITHUB_REPO_OWNER}`,
        owner: env.GITHUB_REPO_OWNER,
        chatId: null,
        include: [env.GITHUB_REPO_NAME],
        exclude: [],
      },
    ];
  }

  throw new Error('No profiles configured. Set MONITORED_PROFILES or CONFIG_FILE');
}

// Parse filter patterns
function parseFilterList(envVar: string | undefined): string[] {
  if (!envVar || envVar.trim() === '') {
    return [];
  }
  return envVar
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export interface Config {
  port: number;
  webhookBaseUrl: string;
  github: {
    webhookSecret: string;
    apiToken: string;
  };
  telegram: {
    botToken: string;
    chatId: string;
  };
  profiles: Profile[];
  filters: {
    allowlist: string[];
    blocklist: string[];
    includeArchived: boolean;
    includeForks: boolean;
  };
  polling: {
    enabled: boolean;
    intervalMinutes: number;
  };
  message: {
    maxChangelogLength: number;
  };
  storage: {
    dbPath: string;
  };
}

export const config: Config = {
  port: env.PORT ? parseInt(env.PORT, 10) : 3000,
  webhookBaseUrl: env.WEBHOOK_BASE_URL ?? `http://localhost:${env.PORT ?? 3000}`,

  github: {
    webhookSecret: env.GITHUB_WEBHOOK_SECRET,
    apiToken: env.GITHUB_API_TOKEN ?? '',
  },

  telegram: {
    botToken: env.TELEGRAM_BOT_TOKEN,
    chatId: env.TELEGRAM_CHAT_ID,
  },

  profiles: getProfiles(),

  filters: {
    allowlist: parseFilterList(env.REPO_ALLOWLIST),
    blocklist: parseFilterList(env.REPO_BLOCKLIST),
    includeArchived: env.INCLUDE_ARCHIVED === 'true',
    includeForks: env.INCLUDE_FORKS === 'true',
  },

  polling: {
    enabled: env.ENABLE_POLLING !== 'false',
    intervalMinutes: parseInt(env.POLL_INTERVAL_MINUTES ?? '15', 10),
  },

  message: {
    maxChangelogLength: parseInt(env.MAX_CHANGELOG_LENGTH ?? '2500', 10),
  },

  storage: {
    dbPath: env.DB_PATH ?? 'data/releases.db',
  },
};
