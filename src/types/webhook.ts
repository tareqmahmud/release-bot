// GitHub webhook event payloads

import type { GitHubRelease, GitHubRepository } from './github.js';

export interface ReleaseWebhookPayload {
  action: 'published' | 'created' | 'edited' | 'deleted' | 'prereleased' | 'released';
  release: GitHubRelease;
  repository: GitHubRepository;
}

export interface NormalizedReleaseEvent {
  repository: {
    full_name: string;
    name: string;
    owner: {
      login: string;
    };
  };
  release: {
    id: number;
    tag_name: string;
    name: string | null;
    body: string | null;
    html_url: string;
    published_at: string;
    author?: {
      login: string;
    };
  };
}
