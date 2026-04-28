<template>
  <div class="ui segments datahub-commit-detail">
    <div class="ui segment datahub-page-header">
      <div>
        <div class="datahub-eyebrow">DIT commit</div>
        <h2 class="ui header datahub-page-title">{{ commitMessage }}</h2>
        <div class="datahub-overview-detail" v-if="commit">
          <span class="datahub-hash">{{ shortHash(commit.commit_hash || commitHash) }}</span>
          by {{ commit.author || 'unknown author' }} · {{ formatTimestamp(commit.timestamp) }}
        </div>
      </div>
      <div class="datahub-header-actions">
        <a class="ui small basic button" :href="commitsPath">
          <i class="history icon"></i> Commits
        </a>
        <a class="ui small basic button" :href="repoPath">
          Dataset summary
        </a>
      </div>
    </div>

    <div class="ui segment" v-if="loading">
      <div class="ui active centered inline loader"></div>
    </div>
    <div class="ui segment" v-else-if="error">
      <div class="ui negative message">{{ error }}</div>
    </div>
    <template v-else-if="commit">
      <div class="ui segment datahub-commit-meta">
        <span class="ui label datahub-hash">commit {{ commit.commit_hash || commitHash }}</span>
        <span v-if="parentHash" class="ui label datahub-hash">parent {{ parentHash }}</span>
        <span v-else class="ui label">root commit</span>
      </div>
      <div class="ui segment" v-if="parentHash">
        <DataDiffView
          :owner="owner"
          :repo="repo"
          :old-commit="parentHash"
          :new-commit="commit.commit_hash || commitHash"
        />
      </div>
      <div class="ui segment" v-else>
        <div class="ui message">This is the first DIT commit, so there is no parent diff to display.</div>
      </div>
    </template>
  </div>
</template>

<script>
import {datahubFetch} from '../utils/datahub-api.js';
import DataDiffView from './DataDiffView.vue';

export default {
  components: {DataDiffView},
  props: {
    owner: String,
    repo: String,
    commitHash: String,
  },
  data() {
    return {
      commit: null,
      loading: true,
      error: null,
    };
  },
  computed: {
    repoPath() {
      return `/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
    },
    commitsPath() {
      return `${this.repoPath}/data/commits/main`;
    },
    commitMessage() {
      return this.commit?.message || 'No commit message';
    },
    parentHash() {
      if (!this.commit) return null;
      if (Array.isArray(this.commit.parent_hashes) && this.commit.parent_hashes.length) return this.commit.parent_hashes[0];
      return this.commit.parent_hash || null;
    },
  },
  async mounted() {
    try {
      this.commit = await datahubFetch(this.owner, this.repo, `/objects/commits/${this.commitHash}`);
      this.commit.commit_hash ||= this.commitHash;
    } catch (e) {
      this.error = e.message;
    } finally {
      this.loading = false;
    }
  },
  methods: {
    shortHash(hash) {
      return hash ? hash.slice(0, 7) : '-';
    },
    formatTimestamp(value) {
      if (!value) return 'unknown time';
      const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    },
  },
};
</script>

<style scoped>
.datahub-commit-detail {
  border: 0;
}

.datahub-page-header {
  align-items: flex-start;
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.datahub-page-title {
  margin: 2px 0 0 !important;
  overflow-wrap: anywhere;
}

.datahub-header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
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

.datahub-commit-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.datahub-hash {
  font-family: var(--fonts-monospace);
}

@media (max-width: 767px) {
  .datahub-page-header {
    flex-direction: column;
  }

  .datahub-header-actions {
    justify-content: flex-start;
  }
}
</style>

