# GitHub Release Telegram Bot

A Telegram bot that automatically sends notifications when the `codex-cli` repository publishes a new GitHub release, including complete changelog details.

## Features

- ✅ Automatic notifications on new GitHub releases
- ✅ Secure webhook signature verification
- ✅ Rich formatted messages with changelogs
- ✅ Auto-generates changelog from commits if missing
- ✅ Handles long messages (splits if >4096 chars)
- ✅ Duplicate event prevention
- ✅ Retry logic with exponential backoff
- ✅ Comprehensive logging

## Prerequisites

- Node.js 18.x or higher
- npm or yarn
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- Telegram Chat ID (where notifications will be sent)
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

4. Edit `.env` with your credentials:
```env
PORT=3000

GITHUB_WEBHOOK_SECRET=your_secret_here
GITHUB_API_TOKEN=ghp_your_token_here_optional

TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_CHAT_ID=your_chat_id_here
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

### 3. GitHub Webhook Secret

1. Choose a strong random string (e.g., generate with `openssl rand -hex 32`)
2. Save it to your `.env` file
3. You'll use this same secret when configuring the webhook in GitHub

### 4. GitHub API Token (Optional)

Only needed if you hit rate limits or the repository is private:

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with `repo` scope
3. Copy and save to `.env`

## Running the Bot

### Development mode (with auto-reload):
```bash
npm run dev
```

### Production mode:
```bash
npm start
```

The server will start on `http://localhost:3000` (or your configured PORT).

## Exposing Webhook Locally (for testing)

Since GitHub needs to reach your webhook endpoint, you'll need to expose your local server:

### Using ngrok:
```bash
# Install ngrok first: https://ngrok.com/download
ngrok http 3000
```

### Using Cloudflare Tunnel:
```bash
# Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation
cloudflared tunnel --url http://localhost:3000
```

Copy the public HTTPS URL (e.g., `https://abc123.ngrok.io`)

## Configuring GitHub Webhook

1. Go to your repository on GitHub (or organization settings for org-wide webhooks)
2. Navigate to Settings → Webhooks → Add webhook
3. Configure:
   - **Payload URL**: `https://your-public-url.com/webhook/github/releases`
   - **Content type**: `application/json`
   - **Secret**: The same secret from your `.env` file
   - **Events**: Select "Let me select individual events" → Check only **Releases**
   - **Active**: ✅ Checked
4. Click "Add webhook"

## Testing

### Test the health endpoint:
```bash
curl http://localhost:3000/healthz
```

### Test with a sample GitHub webhook payload:

Create a file `test-payload.json`:
```json
{
  "action": "published",
  "release": {
    "id": 123456,
    "tag_name": "v1.0.0",
    "name": "Version 1.0.0",
    "body": "## Changes\\n- Feature 1\\n- Bug fix 2",
    "html_url": "https://github.com/openai/codex/releases/tag/v1.0.0",
    "published_at": "2024-01-01T12:00:00Z",
    "author": {
      "login": "octocat"
    }
  }
}
```

Send test request (you'll need to generate a valid signature):
```bash
# This is a simplified test - in production, GitHub signs the payload
curl -X POST http://localhost:3000/webhook/github/releases \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: release" \
  -H "X-GitHub-Delivery: test-123" \
  -H "X-Hub-Signature-256: sha256=<computed-hmac>" \
  -d @test-payload.json
```

## Project Structure

```
release-bot/
├── src/
│   ├── index.js                    # Main entry point & Express server
│   ├── config.js                   # Configuration management
│   ├── logger.js                   # Logging setup
│   ├── handlers/
│   │   └── releaseHandler.js       # Release event processing logic
│   ├── middleware/
│   │   └── verifySignature.js      # GitHub signature verification
│   └── utils/
│       ├── telegram.js             # Telegram messaging utilities
│       └── github.js               # GitHub API utilities
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## Deployment

### Recommended hosting platforms:

- **[Railway](https://railway.app)**: Easy deployment, auto HTTPS
- **[Render](https://render.com)**: Free tier available
- **[Fly.io](https://fly.io)**: Global edge deployment
- **AWS/GCP/Azure**: For enterprise needs

### Environment variables to set in production:
- All variables from `.env.example`
- Ensure `NODE_ENV=production`

## Troubleshooting

### Bot doesn't receive messages:
- Check Telegram bot token is correct
- Verify chat ID is correct
- Ensure bot has been started (send `/start` in private chat)
- For groups/channels, ensure bot is an admin

### Webhook signature verification fails:
- Verify `GITHUB_WEBHOOK_SECRET` matches GitHub webhook configuration
- Check that raw body middleware is working correctly

### No changelog in message:
- Check if release has a body/description in GitHub
- Bot will auto-generate from commits if missing
- Verify `GITHUB_API_TOKEN` if repository is private

### Rate limiting:
- Add `GITHUB_API_TOKEN` to increase rate limits
- Bot has built-in retry logic for Telegram rate limits

## Logs

The bot uses structured logging with Pino. Logs include:
- Incoming webhook events
- Signature verification status
- Release processing steps
- Telegram message delivery status
- Errors with full context

## Security Notes

- Never commit `.env` file or expose tokens
- Use strong random strings for `GITHUB_WEBHOOK_SECRET`
- Signature verification prevents unauthorized webhook calls
- Consider IP whitelisting in production (GitHub webhook IPs)

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
