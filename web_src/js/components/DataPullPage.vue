<template>
  <div class="ui segments datahub-pull-page">
    <div class="ui segment datahub-page-header">
      <div>
        <div class="datahub-eyebrow">DIT pull request</div>
        <h2 class="ui header datahub-page-title">
          <span v-if="pull">#{{ pullNumber(pull) }}</span>
          {{ pullTitle }}
        </h2>
        <div class="datahub-overview-detail" v-if="pull">
          {{ pull.author || 'unknown author' }} wants to merge
          <span class="datahub-branch">{{ branchName(sourceRef(pull)) }}</span>
          into
          <span class="datahub-branch">{{ branchName(targetRef(pull)) }}</span>
        </div>
      </div>
      <div class="datahub-header-actions">
        <a class="ui small basic button" :href="pullsPath">
          <i class="arrow left icon"></i> Pull requests
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
    <template v-else-if="pull">
      <div class="ui segment datahub-pull-meta">
        <span class="ui label" :class="statusClass(pull.status)">{{ statusLabel(pull.status) }}</span>
        <span class="ui label" :class="pull.is_mergeable === false ? 'red' : 'green'">
          {{ pull.is_mergeable === false ? 'Needs resolution' : 'Mergeable' }}
        </span>
        <span class="ui green label">+{{ formatCount(pull.stats_added || 0) }}</span>
        <span class="ui red label">-{{ formatCount(pull.stats_removed || 0) }}</span>
        <span class="ui yellow label">~{{ formatCount(pull.stats_refreshed || 0) }}</span>
      </div>

      <div class="ui top attached tabular menu datahub-pull-tabs">
        <a class="active item">Conversation</a>
        <a class="item">Commits</a>
        <a class="item">Files changed</a>
      </div>

      <section class="ui attached segment datahub-pull-section">
        <h3 class="ui header">Conversation</h3>
        <p class="datahub-overview-detail">
          Review discussion and merge readiness for this DIT pull request.
        </p>
      </section>

      <section class="ui attached segment datahub-pull-section">
        <h3 class="ui header">Commits</h3>
        <div class="datahub-commit-range">
          <span class="ui label datahub-hash">base {{ shortHash(pull.target_commit) }}</span>
          <span class="ui label datahub-hash">head {{ shortHash(pull.source_commit) }}</span>
        </div>
      </section>

      <section class="ui bottom attached segment datahub-pull-section">
        <h3 class="ui header">Files changed</h3>
        <DataDiffView
          v-if="hasDiffCommits"
          :owner="owner"
          :repo="repo"
          :old-commit="pull.target_commit"
          :new-commit="pull.source_commit"
        />
        <div class="ui message" v-else>
          No comparable DIT commits are available for this pull request yet.
        </div>
      </section>
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
    pullId: String,
  },
  data() {
    return {
      pull: null,
      loading: true,
      error: null,
    };
  },
  computed: {
    repoPath() {
      return `/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
    },
    pullsPath() {
      return `${this.repoPath}/data/pulls`;
    },
    pullTitle() {
      return this.pull?.title || 'Untitled data pull request';
    },
    hasDiffCommits() {
      return Boolean(this.pull?.target_commit && this.pull?.source_commit);
    },
  },
  async mounted() {
    try {
      this.pull = await datahubFetch(this.owner, this.repo, `/pulls/${this.pullId}`);
    } catch (e) {
      this.error = e.message;
    } finally {
      this.loading = false;
    }
  },
  methods: {
    pullNumber(pull) {
      return pull.pull_request_id || pull.id || this.pullId;
    },
    sourceRef(pull) {
      return pull.source_ref || pull.source_branch || '';
    },
    targetRef(pull) {
      return pull.target_ref || pull.target_branch || '';
    },
    branchName(refName) {
      return (refName || '').replace(/^heads\//, '') || 'unknown';
    },
    statusLabel(status) {
      if (status === 'merged') return 'Merged';
      if (status === 'closed') return 'Closed';
      return 'Open';
    },
    statusClass(status) {
      if (status === 'merged') return 'purple';
      if (status === 'closed') return 'grey';
      return 'green';
    },
    shortHash(hash) {
      return hash ? hash.slice(0, 7) : '-';
    },
    formatCount(value) {
      return Number(value || 0).toLocaleString();
    },
  },
};
</script>

<style scoped>
.datahub-pull-page {
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

.datahub-header-actions,
.datahub-pull-meta,
.datahub-commit-range {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.datahub-branch,
.datahub-hash {
  font-family: var(--fonts-monospace);
}

.datahub-pull-tabs {
  overflow-x: auto;
}

.datahub-pull-section h3 {
  margin-top: 0 !important;
}

@media (max-width: 767px) {
  .datahub-page-header {
    flex-direction: column;
  }

  .datahub-header-actions,
  .datahub-pull-meta,
  .datahub-commit-range {
    justify-content: flex-start;
  }
}
</style>
