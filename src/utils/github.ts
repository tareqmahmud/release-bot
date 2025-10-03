import axios, { AxiosError } from 'axios';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type { GitHubRelease, GitHubCompareResponse } from '../types/github.js';

const GITHUB_API_BASE = 'https://api.github.com';

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'GitHub-Release-Telegram-Bot',
  };

  if (config.github.apiToken) {
    headers['Authorization'] = `token ${config.github.apiToken}`;
  }

  return headers;
}

export async function fetchReleaseDetails(
  releaseId: number,
  owner: string,
  repo: string
): Promise<GitHubRelease> {
  try {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/releases/${releaseId}`;

    logger.debug({ releaseId, owner, repo, url }, 'Fetching release details from GitHub API');

    const response = await axios.get<GitHubRelease>(url, {
      headers: getHeaders(),
      timeout: 10000,
    });

    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    logger.error(
      {
        error: axiosError.message,
        releaseId,
        owner,
        repo,
        status: axiosError.response?.status,
      },
      'Failed to fetch release details from GitHub'
    );

    throw error;
  }
}

export async function fetchPreviousRelease(
  currentTagName: string,
  owner: string,
  repo: string
): Promise<GitHubRelease | null> {
  try {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/releases`;

    logger.debug({ currentTagName, owner, repo }, 'Fetching previous releases');

    const response = await axios.get<GitHubRelease[]>(url, {
      headers: getHeaders(),
      params: {
        per_page: 10,
      },
      timeout: 10000,
    });

    const releases = response.data;
    const currentIndex = releases.findIndex((r) => r.tag_name === currentTagName);

    if (currentIndex === -1 || currentIndex === releases.length - 1) {
      logger.debug('No previous release found');
      return null;
    }

    const previousRelease = releases[currentIndex + 1];
    return previousRelease ?? null;
  } catch (error) {
    const axiosError = error as AxiosError;
    logger.error(
      {
        error: axiosError.message,
        owner,
        repo,
        status: axiosError.response?.status,
      },
      'Failed to fetch previous releases'
    );

    return null;
  }
}

export async function generateChangelogFromCommits(
  baseTag: string,
  headTag: string,
  owner: string,
  repo: string
): Promise<string | null> {
  try {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/compare/${baseTag}...${headTag}`;

    logger.debug({ baseTag, headTag, owner, repo }, 'Generating changelog from commits');

    const response = await axios.get<GitHubCompareResponse>(url, {
      headers: getHeaders(),
      timeout: 10000,
    });

    const commits = response.data.commits.slice(0, 20); // Limit to 20 commits

    if (commits.length === 0) {
      return 'No commits found for this release.';
    }

    const changelogLines = commits.map((commit) => {
      const message = commit.commit.message.split('\n')[0]; // First line only
      const shortSha = commit.sha.substring(0, 7);
      return `• ${message} (${shortSha})`;
    });

    return changelogLines.join('\n');
  } catch (error) {
    const axiosError = error as AxiosError;
    logger.error(
      {
        error: axiosError.message,
        baseTag,
        headTag,
        owner,
        repo,
        status: axiosError.response?.status,
      },
      'Failed to generate changelog from commits'
    );

    return null;
  }
}
