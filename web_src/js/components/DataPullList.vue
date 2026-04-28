<template>
  <div class="ui segments datahub-pull-list">
    <div class="ui segment datahub-page-header">
      <div>
        <div class="datahub-eyebrow">Dit dataset</div>
        <h2 class="ui header datahub-page-title">DIT pull requests</h2>
        <div class="datahub-overview-detail">Review proposed dataset changes before merging.</div>
      </div>
      <a class="ui small basic button" :href="repoPath">
        <i class="arrow left icon"></i> Dataset summary
      </a>
    </div>

    <div class="ui segment datahub-pull-filters">
      <button
        v-for="filter in filters"
        :key="filter.value"
        type="button"
        class="ui small basic button"
        :class="{active: selectedStatus === filter.value}"
        @click="selectStatus(filter.value)"
      >
        {{ filter.label }}
      </button>
    </div>

    <div class="ui segment" v-if="loading">
      <div class="ui active centered inline loader"></div>
    </div>
    <div class="ui segment" v-else-if="error">
      <div class="ui negative message">{{ error }}</div>
    </div>
    <div class="ui segment" v-else-if="visiblePulls.length === 0">
      <div class="ui message">No {{ selectedStatus }} DIT pull requests are available.</div>
    </div>
    <div class="ui segment datahub-pull-card-list" v-else>
      <article v-for="pull in visiblePulls" :key="pullId(pull)" class="datahub-pull-card">
        <div class="datahub-pull-card-main">
          <a class="datahub-pull-title" :href="pullHref(pull)">
            #{{ pullId(pull) }} {{ pull.title || 'Untitled data pull request' }}
          </a>
          <div class="datahub-overview-detail">
            {{ pull.author || 'unknown author' }} wants to merge
            <span class="datahub-branch">{{ branchName(sourceRef(pull)) }}</span>
            →
            <span class="datahub-branch">{{ branchName(targetRef(pull)) }}</span>
          </div>
          <div class="datahub-pull-stats">
            <span class="ui green label">+{{ formatCount(pull.stats_added || 0) }}</span>
            <span class="ui red label">-{{ formatCount(pull.stats_removed || 0) }}</span>
            <span class="ui yellow label">~{{ formatCount(pull.stats_refreshed || 0) }}</span>
          </div>
        </div>
        <div class="datahub-pull-card-side">
          <span class="ui tiny label" :class="statusClass(pull.status)">
            {{ statusLabel(pull.status) }}
          </span>
          <span class="ui tiny label" :class="pull.is_mergeable === false ? 'red' : 'green'">
            {{ pull.is_mergeable === false ? 'Needs resolution' : 'Mergeable' }}
          </span>
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
  },
  data() {
    return {
      pulls: [],
      loading: true,
      error: null,
      selectedStatus: 'open',
      filters: [
        {value: 'open', label: 'Open'},
        {value: 'closed', label: 'Closed'},
        {value: 'merged', label: 'Merged'},
      ],
    };
  },
  computed: {
    repoPath() {
      return `/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
    },
    visiblePulls() {
      return this.pulls.filter((pull) => (pull.status || 'open') === this.selectedStatus);
    },
  },
  async mounted() {
    await this.loadPulls();
  },
  methods: {
    async selectStatus(status) {
      if (this.selectedStatus === status) return;
      this.selectedStatus = status;
      await this.loadPulls();
    },
    async loadPulls() {
      this.loading = true;
      this.error = null;
      try {
        const result = await datahubFetch(this.owner, this.repo, `/pulls?status=${encodeURIComponent(this.selectedStatus)}`);
        this.pulls = this.normalizePulls(result);
      } catch (e) {
        this.pulls = [];
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    },
    normalizePulls(result) {
      if (Array.isArray(result)) return result;
      return result?.pulls || result?.pull_requests || [];
    },
    pullId(pull) {
      return pull.pull_request_id || pull.id;
    },
    pullHref(pull) {
      return `${this.repoPath}/data/pulls/${encodeURIComponent(this.pullId(pull))}`;
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
    formatCount(value) {
      return Number(value || 0).toLocaleString();
    },
  },
};
</script>

<style scoped>
.datahub-pull-list {
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

.datahub-pull-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.datahub-pull-card-list {
  display: grid;
  gap: 10px;
}

.datahub-pull-card {
  align-items: flex-start;
  border: 1px solid var(--color-secondary);
  border-radius: 8px;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  padding: 12px;
}

.datahub-pull-title {
  color: var(--color-text);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.datahub-branch {
  font-family: var(--fonts-monospace);
}

.datahub-pull-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.datahub-pull-card-side {
  align-items: flex-end;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

@media (max-width: 767px) {
  .datahub-page-header,
  .datahub-pull-card {
    align-items: flex-start;
    flex-direction: column;
  }

  .datahub-pull-card-side {
    align-items: flex-start;
    justify-content: flex-start;
  }
}
</style>
