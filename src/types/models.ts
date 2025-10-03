// Domain models

export interface Repository {
  id: number;
  full_name: string;
  owner: string;
  name: string;
  description: string | null;
  private: number; // SQLite boolean (0 or 1)
  fork: number; // SQLite boolean (0 or 1)
  archived: number; // SQLite boolean (0 or 1)
  disabled: number; // SQLite boolean (0 or 1)
  default_branch: string | null;
  url: string | null;
  profile_owner: string;
  chat_id: string | null;
  webhook_id: number | null;
  webhook_status: WebhookStatus;
  last_synced_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  pushed_at: string | null;
  discovered_at: string;
}

export type WebhookStatus = 'pending' | 'active' | 'failed' | 'skipped' | 'unsupported';

export interface RepositoryInput {
  id: number;
  fullName: string;
  owner: string;
  name: string;
  description?: string | null;
  private: boolean;
  fork: boolean;
  archived: boolean;
  disabled: boolean;
  defaultBranch: string | null;
  url: string;
  profileOwner: string;
  chatId?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  pushedAt: string | null;
}

export interface ProcessedRelease {
  id: number;
  release_id: number;
  repo_full_name: string;
  tag_name: string;
  source: 'webhook' | 'polling';
  processed_at: string;
}

export interface Statistics {
  totalRepos: number;
  webhookStats: Record<WebhookStatus, number>;
  totalReleases: number;
  recentReleases: Array<{
    repo_full_name: string;
    tag_name: string;
    processed_at: string;
    source: string;
  }>;
}

export interface WebhookStatusRow {
  webhook_status: WebhookStatus;
  count: number;
}

export interface CountResult {
  count: number;
}
