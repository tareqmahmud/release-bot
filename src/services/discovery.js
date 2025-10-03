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

/**
 * Check if a repository name matches include/exclude patterns
 */
function matchesPattern(repoName, patterns) {
  if (!patterns || patterns.length === 0) {
    return false;
  }

  return patterns.some(pattern => {
    if (pattern === '*') return true;

    // Convert glob-style pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(repoName);
  });
}

/**
 * Check if repo should be included based on profile filters
 */
function shouldIncludeRepo(repo, profile) {
  const { name, archived, fork } = repo;

  // Check archived filter
  if (archived && !config.filters.includeArchived) {
    return false;
  }

  // Check fork filter
  if (fork && !config.filters.includeForks) {
    return false;
  }

  // Check global blocklist
  if (config.filters.blocklist.length > 0) {
    if (matchesPattern(name, config.filters.blocklist)) {
      return false;
    }
  }

  // Check global allowlist (if set, must match)
  if (config.filters.allowlist.length > 0) {
    if (!matchesPattern(name, config.filters.allowlist)) {
      return false;
    }
  }

  // Check profile-specific exclude
  if (profile.exclude && profile.exclude.length > 0) {
    if (matchesPattern(name, profile.exclude)) {
      return false;
    }
  }

  // Check profile-specific include
  if (profile.include && profile.include.length > 0) {
    return matchesPattern(name, profile.include);
  }

  return true;
}

/**
 * Determine if the profile is a user or organization
 */
async function getProfileType(owner) {
  try {
    const url = `${GITHUB_API_BASE}/users/${owner}`;
    const response = await axios.get(url, {
      headers: getHeaders(),
      timeout: 10000
    });

    return response.data.type.toLowerCase(); // 'user' or 'organization'
  } catch (error) {
    logger.error({
      error: error.message,
      owner,
      status: error.response?.status
    }, 'Failed to determine profile type');

    // Default to user if we can't determine
    return 'user';
  }
}

/**
 * Fetch all repositories for a profile with pagination
 */
async function fetchAllRepositories(owner, profileType) {
  const repos = [];
  let page = 1;
  const perPage = 100;

  const endpoint = profileType === 'organization'
    ? `/orgs/${owner}/repos`
    : `/users/${owner}/repos`;

  while (true) {
    try {
      const url = `${GITHUB_API_BASE}${endpoint}`;

      logger.debug({
        owner,
        profileType,
        page,
        perPage
      }, 'Fetching repositories page');

      const response = await axios.get(url, {
        headers: getHeaders(),
        params: {
          page,
          per_page: perPage,
          sort: 'updated',
          direction: 'desc'
        },
        timeout: 15000
      });

      const pageRepos = response.data;

      if (pageRepos.length === 0) {
        break;
      }

      repos.push(...pageRepos);

      // Check if we've reached the last page
      const linkHeader = response.headers.link;
      if (!linkHeader || !linkHeader.includes('rel="next"')) {
        break;
      }

      page++;

      // Small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      logger.error({
        error: error.message,
        owner,
        page,
        status: error.response?.status
      }, 'Failed to fetch repositories page');

      throw error;
    }
  }

  return repos;
}

/**
 * Discover repositories for a single profile
 */
export async function discoverRepositoriesForProfile(profile) {
  try {
    logger.info({ owner: profile.owner }, 'Starting repository discovery for profile');

    const profileType = await getProfileType(profile.owner);
    const allRepos = await fetchAllRepositories(profile.owner, profileType);

    logger.info({
      owner: profile.owner,
      totalRepos: allRepos.length
    }, 'Fetched all repositories');

    // Filter repositories based on criteria
    const filteredRepos = allRepos.filter(repo => shouldIncludeRepo(repo, profile));

    logger.info({
      owner: profile.owner,
      totalRepos: allRepos.length,
      filteredRepos: filteredRepos.length
    }, 'Filtered repositories');

    // Transform to our internal format
    const repositories = filteredRepos.map(repo => ({
      id: repo.id,
      fullName: repo.full_name,
      owner: repo.owner.login,
      name: repo.name,
      description: repo.description,
      private: repo.private,
      fork: repo.fork,
      archived: repo.archived,
      disabled: repo.disabled,
      hasReleases: repo.has_downloads, // Not perfect but a hint
      defaultBranch: repo.default_branch,
      url: repo.html_url,
      profileOwner: profile.owner,
      chatId: profile.chatId, // Per-profile chat override
      createdAt: repo.created_at,
      updatedAt: repo.updated_at,
      pushedAt: repo.pushed_at
    }));

    return repositories;

  } catch (error) {
    logger.error({
      error: error.message,
      owner: profile.owner,
      stack: error.stack
    }, 'Failed to discover repositories for profile');

    throw error;
  }
}

/**
 * Discover repositories for all configured profiles
 */
export async function discoverAllRepositories() {
  const allRepos = [];

  for (const profile of config.profiles) {
    try {
      const repos = await discoverRepositoriesForProfile(profile);
      allRepos.push(...repos);

      logger.info({
        owner: profile.owner,
        reposFound: repos.length
      }, 'Completed discovery for profile');

    } catch (error) {
      logger.error({
        error: error.message,
        owner: profile.owner
      }, 'Failed to discover repos for profile, continuing with others');
    }

    // Delay between profiles to be nice to API
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  logger.info({
    totalProfiles: config.profiles.length,
    totalRepos: allRepos.length
  }, 'Completed repository discovery for all profiles');

  return allRepos;
}
