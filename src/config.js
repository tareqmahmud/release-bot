import dotenv from 'dotenv';

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

export const config = {
  port: process.env.PORT || 3000,
  github: {
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    apiToken: process.env.GITHUB_API_TOKEN || '',
    repoOwner: process.env.GITHUB_REPO_OWNER || 'openai',
    repoName: process.env.GITHUB_REPO_NAME || 'codex'
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID
  }
};
