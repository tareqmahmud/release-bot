import axios from 'axios';
import { config } from '../config.js';
import { logger } from '../logger.js';

const GITHUB_API_BASE = 'https://api.github.com';

function getHeaders() {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'GitHub-Release-Telegram-Bot'
  };

  if (config.github.apiToken) {
    headers['Authorization'] = `token ${config.github.apiToken}`;
  }

  return headers;
}

export async function fetchReleaseDetails(releaseId) {
  try {
    const url = `${GITHUB_API_BASE}/repos/${config.github.repoOwner}/${config.github.repoName}/releases/${releaseId}`;

    logger.debug({ releaseId, url }, 'Fetching release details from GitHub API');

    const response = await axios.get(url, {
      headers: getHeaders(),
      timeout: 10000
    });

    return response.data;
  } catch (error) {
    logger.error({
      error: error.message,
      releaseId,
      status: error.response?.status
    }, 'Failed to fetch release details from GitHub');

    throw error;
  }
}

export async function fetchPreviousRelease(currentTagName) {
  try {
    const url = `${GITHUB_API_BASE}/repos/${config.github.repoOwner}/${config.github.repoName}/releases`;

    logger.debug({ currentTagName }, 'Fetching previous releases');

    const response = await axios.get(url, {
      headers: getHeaders(),
      params: {
        per_page: 10
      },
      timeout: 10000
    });

    const releases = response.data;
    const currentIndex = releases.findIndex(r => r.tag_name === currentTagName);

    if (currentIndex === -1 || currentIndex === releases.length - 1) {
      logger.debug('No previous release found');
      return null;
    }

    return releases[currentIndex + 1];
  } catch (error) {
    logger.error({
      error: error.message,
      status: error.response?.status
    }, 'Failed to fetch previous releases');

    return null;
  }
}

export async function generateChangelogFromCommits(baseTag, headTag) {
  try {
    const url = `${GITHUB_API_BASE}/repos/${config.github.repoOwner}/${config.github.repoName}/compare/${baseTag}...${headTag}`;

    logger.debug({ baseTag, headTag }, 'Generating changelog from commits');

    const response = await axios.get(url, {
      headers: getHeaders(),
      timeout: 10000
    });

    const commits = response.data.commits.slice(0, 20); // Limit to 20 commits

    if (commits.length === 0) {
      return 'No commits found for this release.';
    }

    const changelogLines = commits.map(commit => {
      const message = commit.commit.message.split('\n')[0]; // First line only
      const author = commit.commit.author.name;
      const shortSha = commit.sha.substring(0, 7);
      return `• ${message} (${shortSha})`;
    });

    return changelogLines.join('\n');
  } catch (error) {
    logger.error({
      error: error.message,
      baseTag,
      headTag,
      status: error.response?.status
    }, 'Failed to generate changelog from commits');

    return null;
  }
}
