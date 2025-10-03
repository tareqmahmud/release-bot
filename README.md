# GitHub Release Telegram Bot (Multi-Repository)

A Telegram bot that automatically monitors **multiple GitHub profiles** and sends notifications whenever any of their
repositories publishes a new release, including complete changelog details.

## Features

### 🎯 Core Features

- ✅ **Multi-profile monitoring** - Track releases from multiple GitHub users/organizations
- ✅ **Automatic repository discovery** - Discovers all public repos from configured profiles
- ✅ **Smart filtering** - Include/exclude repos by pattern, skip forks/archived repos
- ✅ **Dual delivery modes** - Webhooks for instant notifications + polling fallback
- ✅ **Per-repo chat routing** - Send different repos to different Telegram chats

### 🔒 Security & Reliability

- ✅ Secure webhook signature verification (HMAC-SHA256)
- ✅ Persistent duplicate prevention (SQLite database)
- ✅ Rate limiting and retry logic with exponential backoff
- ✅ Comprehensive structured logging

### 💬 Message Features

- ✅ Rich formatted messages with repository name and changelogs
- ✅ Auto-generates changelog from commits if missing
- ✅ Handles long messages (auto-splits if >4096 chars)
- ✅ Configurable changelog length

## Prerequisites

- Node.js 18.x or higher
- npm or yarn
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- Telegram Chat ID (where notifications will be sent)
- GitHub Personal Access Token with `admin:repo_hook` scope (for webhook management)
- GitHub Webhook Secret (you'll create this)

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd release-bot
```

2. Install dependencies:

```bash
npm install
```

3. Configure environment variables:

```bash
cp .env.example .env
```

4. Edit `.env` with your configuration (see below)

## Configuration

### Simple Configuration (Environment Variables)

Edit `.env`:

```env
# Server Configuration
PORT=3000
WEBHOOK_BASE_URL=https://your-domain.com

# GitHub Configuration
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
GITHUB_API_TOKEN=ghp_your_token_with_admin_repo_hook_scope

# Telegram Configuration
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_CHAT_ID=your_chat_id_here

# Multi-Profile Configuration
MONITORED_PROFILES=https://github.com/openai,https://github.com/microsoft

# Repository Filtering (optional)
REPO_ALLOWLIST=codex*,gpt*
# REPO_BLOCKLIST=*-docs,*-test
INCLUDE_ARCHIVED=false
INCLUDE_FORKS=false

# Polling Configuration
POLL_INTERVAL_MINUTES=15
ENABLE_POLLING=true

# Message Configuration
MAX_CHANGELOG_LENGTH=2500
```

### Advanced Configuration (JSON File)

For per-profile customization, create `config/profiles.json`:

```json
{
  "profiles": [
    {
      "url": "https://github.com/openai",
      "chatId": null,
      "include": [
        "codex",
        "gpt*"
      ],
      "exclude": [
        "*-docs"
      ]
    },
    {
      "url": "https://github.com/microsoft",
      "chatId": "-1001234567890",
      "include": [
        "*"
      ],
      "exclude": [
        "archived-*",
        "*-test"
      ]
    }
  ]
}
```

Then set in `.env`:

```env
CONFIG_FILE=config/profiles.json
```

## Getting Required Credentials

### 1. Telegram Bot Token

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot` and follow the prompts
3. Copy the bot token (format: `123456:ABC-DEF...`)

### 2. Telegram Chat ID

**Method 1: Personal chat**

1. Send a message to your bot
2. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
3. Look for `"chat":{"id":123456789}` in the response

**Method 2: Channel/Group**

1. Add your bot to the channel/group
2. Make the bot an admin
3. Use a tool like [@userinfobot](https://t.me/userinfobot) or check the getUpdates endpoint

### 3. GitHub Personal Access Token

**Required for webhook management and higher rate limits:**

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with these scopes:
    - `admin:repo_hook` (manage webhooks)
    - `repo` (if monitoring private repos)
3. Copy and save to `.env`

### 4. GitHub Webhook Secret

1. Choose a strong random string:

```bash
openssl rand -hex 32
```

2. Save it to your `.env` file
3. The bot will use this when creating webhooks automatically

## Running the Bot

### Development mode (with auto-reload):

```bash
npm run dev
```

### Production mode:

```bash
npm start
```

### First Run

On startup, the bot will:

1. Discover all repositories from configured profiles
2. Automatically create webhooks for each repository (if possible)
3. Start polling scheduler for repos without webhooks
4. Begin listening for release events

Check the logs to monitor progress.

## Admin Commands

### Discover Repositories

Manually trigger repository discovery:

```bash
npm run admin:discover
```

### List Tracked Repositories

View all discovered repositories:

```bash
npm run admin:list-repos
```

### Clear Database

Reset all cached data:

```bash
npm run admin:clear-cache
```

## Admin API Endpoints

### GET `/admin/stats`

Get statistics about monitored repositories and releases:

```bash
curl http://localhost:3000/admin/stats
```

### GET `/admin/repositories`

List all tracked repositories:

```bash
curl http://localhost:3000/admin/repositories

# Filter by webhook status
curl http://localhost:3000/admin/repositories?status=active
curl http://localhost:3000/admin/repositories?status=unsupported
```

### POST `/admin/discover`

Trigger repository discovery:

```bash
curl -X POST http://localhost:3000/admin/discover
```

### POST `/admin/sync-webhooks`

Re-sync webhooks for all repositories:

```bash
curl -X POST http://localhost:3000/admin/sync-webhooks
```

## How It Works

### 1. Repository Discovery

- Queries GitHub API for all repos under configured profiles
- Filters by include/exclude patterns, archived/fork status
- Stores metadata in SQLite database

### 2. Webhook Management

- Automatically creates release webhooks for each repository
- Validates webhook signature on incoming events
- Falls back to polling for repos without webhook access

### 3. Polling Fallback

- Scheduled task runs every N minutes (configurable)
- Checks for new releases on repos without webhooks
- Prevents duplicates via database tracking

### 4. Notification Flow

```
GitHub Release → Webhook/Polling → Deduplication Check →
Enrich Changelog (if needed) → Format Message →
Send to Telegram (with retry)
```

## Deployment

### Recommended hosting platforms:

- **[Railway](https://railway.app)**: Easy deployment, auto HTTPS
- **[Render](https://render.com)**: Free tier available
- **[Fly.io](https://fly.io)**: Global edge deployment
- **AWS/GCP/Azure**: For enterprise needs

### Environment Setup

1. Set all required environment variables
2. Ensure `WEBHOOK_BASE_URL` points to your public HTTPS URL
3. Database will be created automatically at `data/releases.db`

### Webhook Requirements

- Must be accessible via HTTPS
- GitHub will call: `https://your-domain.com/webhook/github/releases`
- Webhooks are created automatically if you have the right token permissions

## Exposing Webhook Locally (for testing)

### Using ngrok:

```bash
ngrok http 3000
# Update WEBHOOK_BASE_URL in .env with ngrok URL
```

### Using Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://localhost:3000
# Update WEBHOOK_BASE_URL in .env with tunnel URL
```

## Troubleshooting

### Bot doesn't discover repositories

- Check `MONITORED_PROFILES` is set correctly
- Verify GitHub API token has correct permissions
- Check logs for API rate limit issues
- Run `npm run admin:discover` manually

### Webhooks not created

- Ensure `GITHUB_API_TOKEN` has `admin:repo_hook` scope
- Check if you have admin access to the repositories
- Review logs for permission errors
- Polling will work as fallback automatically

### No notifications received

- Check Telegram bot token and chat ID
- Verify bot is started (send `/start` in private chat)
- For groups/channels, ensure bot is admin
- Check `/admin/stats` endpoint for recent activity

### Webhook signature verification fails

- Verify `GITHUB_WEBHOOK_SECRET` matches the secret in webhooks
- Check that raw body middleware is working
- Review webhook delivery logs in GitHub

## Project Structure

```
release-bot/
├── src/
│   ├── index.js                    # Main entry point & server setup
│   ├── config.js                   # Configuration management
│   ├── logger.js                   # Logging setup
│   ├── handlers/
│   │   ├── releaseHandler.js       # Webhook event handler
│   │   └── adminHandler.js         # Admin API handlers
│   ├── middleware/
│   │   └── verifySignature.js      # GitHub signature verification
│   ├── services/
│   │   ├── discovery.js            # Repository discovery
│   │   ├── webhook.js              # Webhook management
│   │   ├── polling.js              # Polling scheduler
│   │   └── notification.js         # Notification orchestration
│   ├── storage/
│   │   └── database.js             # SQLite persistence layer
│   ├── utils/
│   │   ├── telegram.js             # Telegram messaging
│   │   └── github.js               # GitHub API utilities
│   └── cli/
│       ├── discover.js             # Discovery CLI
│       ├── list-repos.js           # List repos CLI
│       └── clear-cache.js          # Clear cache CLI
├── config/
│   └── profiles.example.json       # Example advanced config
├── data/                           # SQLite database (auto-created)
├── package.json
├── .env.example
└── README.md
```

## Database Schema

### `repositories` table

Stores discovered repository metadata, webhook status, and chat preferences.

### `processed_releases` table

Tracks which releases have been processed to prevent duplicates.

## Monitoring & Logs

The bot uses structured logging with Pino. Logs include:

- Repository discovery events
- Webhook creation/sync status
- Polling activity
- Release processing steps
- Telegram message delivery status
- Errors with full context

## Security Notes

- Never commit `.env` file or expose tokens
- Use strong random strings for `GITHUB_WEBHOOK_SECRET`
- Signature verification prevents unauthorized webhook calls
- Consider IP whitelisting in production (GitHub webhook IPs)
- Rotate tokens regularly
- Use environment-specific secrets management in production

## Upgrade from v1

If upgrading from the single-repo version:

1. **Update `.env`**: Add `MONITORED_PROFILES` instead of `GITHUB_REPO_OWNER`/`GITHUB_REPO_NAME`
2. **Run discovery**: `npm run admin:discover`
3. **Check repositories**: `npm run admin:list-repos`
4. **Backward compatible**: Old env vars still work as fallback

## Future Enhancements

- Support GitHub topic filters
- Per-release asset attachments to Telegram
- Web UI for monitoring and configuration
- Multi-chat routing rules (language-based, priority-based)
- Slack/email connectors
- Release note templates

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Support

For issues or questions:

- Check the troubleshooting section above
- Review logs for detailed error messages
- Open a GitHub issue with logs and configuration (redact secrets!)
