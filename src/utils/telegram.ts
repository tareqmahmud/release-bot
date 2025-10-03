import axios, { AxiosError } from 'axios';
import { config } from '../config.js';
import { logger } from '../logger.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const MAX_MESSAGE_LENGTH = 4096;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms

interface TelegramMessageOptions {
  text: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  chatId?: string | null;
}

interface TelegramResponse {
  ok: boolean;
  result: {
    message_id: number;
    chat: {
      id: number;
    };
  };
}

interface TelegramError {
  parameters?: {
    retry_after?: number;
  };
}

interface ReleaseMessageParams {
  repoName: string;
  name: string | null;
  tagName: string;
  htmlUrl: string;
  body: string | null;
  publishedAt: string;
  author: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function truncateChangelog(changelog: string, maxLength = 2500): string {
  if (changelog.length <= maxLength) {
    return changelog;
  }
  return changelog.substring(0, maxLength) + '\n\n... (truncated)';
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendTelegramMessage({
  text,
  parseMode = 'HTML',
  chatId = null,
}: TelegramMessageOptions): Promise<void> {
  const targetChatId = chatId ?? config.telegram.chatId;

  // Split message if too long
  if (text.length > MAX_MESSAGE_LENGTH) {
    logger.warn(`Message exceeds ${MAX_MESSAGE_LENGTH} characters, splitting...`);
    const parts: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= MAX_MESSAGE_LENGTH) {
        parts.push(remaining);
        break;
      }

      // Try to split at a newline
      let splitIndex = remaining.lastIndexOf('\n', MAX_MESSAGE_LENGTH);
      if (splitIndex === -1 || splitIndex < MAX_MESSAGE_LENGTH / 2) {
        splitIndex = MAX_MESSAGE_LENGTH;
      }

      parts.push(remaining.substring(0, splitIndex));
      remaining = remaining.substring(splitIndex);
    }

    // Send each part
    for (let i = 0; i < parts.length; i++) {
      await sendSingleMessage(
        { text: parts[i] ?? '', parseMode, chatId: targetChatId },
        i + 1,
        parts.length
      );
      if (i < parts.length - 1) {
        await sleep(500); // Small delay between messages
      }
    }
  } else {
    await sendSingleMessage({ text, parseMode, chatId: targetChatId });
  }
}

async function sendSingleMessage(
  { text, parseMode, chatId }: TelegramMessageOptions & { chatId: string },
  partNumber: number | null = null,
  totalParts: number | null = null
): Promise<TelegramResponse> {
  const url = `${TELEGRAM_API_BASE}/bot${config.telegram.botToken}/sendMessage`;

  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: parseMode,
    disable_web_page_preview: false,
  };

  let lastError: Error | AxiosError | undefined;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post<TelegramResponse>(url, payload, {
        timeout: 10000,
      });

      const messageInfo = partNumber ? `(part ${partNumber}/${totalParts})` : '';

      logger.info(
        {
          messageId: response.data.result.message_id,
          chatId: chatId,
        },
        `Telegram message sent successfully ${messageInfo}`
      );

      return response.data;
    } catch (error) {
      lastError = error as AxiosError<TelegramError>;
      const axiosError = error as AxiosError<TelegramError>;

      if (axiosError.response?.status === 429) {
        const retryAfter = axiosError.response.data?.parameters?.retry_after ?? 5;
        logger.warn(`Rate limited by Telegram. Retrying after ${retryAfter} seconds...`);
        await sleep(retryAfter * 1000);
        continue;
      }

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY * Math.pow(2, attempt - 1);
        logger.warn(
          `Failed to send message (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${delay}ms...`
        );
        await sleep(delay);
        continue;
      }

      logger.error(
        {
          error: axiosError.message,
          response: axiosError.response?.data,
          status: axiosError.response?.status,
        },
        'Failed to send Telegram message after all retries'
      );

      throw error;
    }
  }

  throw lastError;
}

export function formatReleaseMessage({
  repoName,
  tagName,
  htmlUrl,
  body,
  publishedAt,
  author,
}: ReleaseMessageParams): string {
  const escapedRepoName = escapeHtml(repoName);
  const escapedTag = escapeHtml(tagName);
  const escapedAuthor = escapeHtml(author);

  const date = new Date(publishedAt);
  const formattedDate = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const maxLength = config.message.maxChangelogLength;
  const changelog = body
    ? escapeHtml(truncateChangelog(body, maxLength))
    : '<i>No changelog provided</i>';

  return `🚀 <b>${escapedRepoName}</b> — new release <code>${escapedTag}</code>

📅 Published by ${escapedAuthor} on ${formattedDate}

<b>📋 Release Notes:</b>
${changelog}

🔗 <a href="${htmlUrl}">View full release on GitHub</a>`;
}
