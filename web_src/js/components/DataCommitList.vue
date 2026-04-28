<template>
  <div class="ui segments datahub-commit-page">
    <div class="ui segment datahub-page-header">
      <div>
        <div class="datahub-eyebrow">Dit dataset</div>
        <h2 class="ui header datahub-page-title">DIT commits</h2>
        <div class="datahub-overview-detail">History for {{ normalizedRef }}</div>
      </div>
      <a class="ui small basic button" :href="repoPath">
        <i class="arrow left icon"></i> Dataset summary
      </a>
    </div>

    <div class="ui segment" v-if="loading">
      <div class="ui active centered inline loader"></div>
    </div>
    <div class="ui segment" v-else-if="error">
      <div class="ui negative message">{{ error }}</div>
    </div>
    <div class="ui segment" v-else-if="commits.length === 0">
      <div class="ui message">No DIT commits are available for this branch yet.</div>
    </div>
    <div class="ui segment datahub-commit-timeline" v-else>
      <article v-for="commit in commits" :key="commit.commit_hash" class="datahub-commit-card">
        <div class="datahub-commit-card-main">
          <a class="datahub-commit-title" :href="commitHref(commit.commit_hash)">
            {{ commit.message || 'No commit message' }}
          </a>
          <div class="datahub-overview-detail">
            {{ commit.author || 'unknown author' }} committed {{ formatTimestamp(commit.timestamp) }}
          </div>
        </div>
        <div class="datahub-commit-card-side">
          <a class="ui tiny basic button datahub-hash" :href="commitHref(commit.commit_hash)">
            {{ shortHash(commit.commit_hash) }}
          </a>
          <span v-if="commitBase(commit)" class="ui tiny label">parent {{ shortHash(commitBase(commit)) }}</span>
        </div>
      </article>
    </div>
  </div>
</template>

<script>
import {datahubFetch} from '../utils/datahub-api.js';

export default {
  props: {
    owner: String,
    repo: String,
    branch: {
      type: String,
      default: 'main',
    },
  },
  data() {
    return {
      commits: [],
      loading: true,
      error: null,
    };
  },
  computed: {
    normalizedRef() {
      return this.branch.startsWith('heads/') ? this.branch : `heads/${this.branch || 'main'}`;
    },
    repoPath() {
      return `/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
    },
  },
  async mounted() {
    try {
      const result = await datahubFetch(
        this.owner,
        this.repo,
        `/log?ref=${this.normalizedRef}&limit=50`,
      );
      this.commits = result.commits || [];
    } catch (e) {
      this.error = e.message;
    } finally {
      this.loading = false;
    }
  },
  methods: {
    commitHref(hash) {
      return `${this.repoPath}/data/commit/${encodeURIComponent(hash)}`;
    },
    commitBase(commit) {
      if (Array.isArray(commit.parent_hashes) && commit.parent_hashes.length) return commit.parent_hashes[0];
      return commit.parent_hash || null;
    },
    shortHash(hash) {
      return hash ? hash.slice(0, 7) : '-';
    },
    formatTimestamp(value) {
      if (!value) return 'at an unknown time';
      const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    },
  },
};
</script>

<style scoped>
.datahub-commit-page {
  border: 0;
}

.datahub-page-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.datahub-page-title {
  margin: 2px 0 0 !important;
}

.datahub-eyebrow {
  color: var(--color-text-light-2);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.datahub-overview-detail {
  margin-top: 3px;
  color: var(--color-text-light-2);
  font-size: 12px;
}

.datahub-commit-timeline {
  display: grid;
  gap: 10px;
}

.datahub-commit-card {
  align-items: center;
  border: 1px solid var(--color-secondary);
  border-radius: 8px;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  padding: 12px;
}

.datahub-commit-title {
  color: var(--color-text);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.datahub-commit-card-side {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.datahub-hash {
  font-family: var(--fonts-monospace);
}

@media (max-width: 767px) {
  .datahub-page-header,
  .datahub-commit-card {
    align-items: flex-start;
    flex-direction: column;
  }

  .datahub-commit-card-side {
    justify-content: flex-start;
  }
}
</style>
