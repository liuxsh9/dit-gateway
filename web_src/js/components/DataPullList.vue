<template>
  <div class="datahub-pull-list">
    <div class="datahub-pr-toolbar">
      <div class="datahub-pr-search-group">
        <label class="datahub-pr-search">
          <span class="datahub-pr-filter-prefix">Filters</span>
          <svg viewBox="0 0 16 16" aria-hidden="true" class="datahub-pr-search-icon">
            <path d="M10.68 11.74a6 6 0 1 1 1.06-1.06l3.29 3.29-1.06 1.06-3.29-3.29ZM11.5 7a4.5 4.5 0 1 0-9 0 4.5 4.5 0 0 0 9 0Z"></path>
          </svg>
          <input
            v-model="query"
            type="search"
            aria-label="Search pull requests"
            placeholder="is:pr is:open"
            @input="syncStatusFromQuery"
          >
        </label>
      </div>
      <div class="datahub-pr-actions">
        <a class="primary button datahub-pr-new" :href="newPullHref">New pull request</a>
      </div>
    </div>

    <section class="datahub-pr-box" aria-label="Pull requests">
      <div class="datahub-pr-statusbar">
        <div class="datahub-pr-state-links">
          <button
            v-for="filter in filters"
            :key="filter.value"
            type="button"
            class="datahub-pr-state"
            :class="{active: selectedStatus === filter.value}"
            @click="selectStatus(filter.value)"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" class="datahub-pr-state-icon" :class="`is-${filter.value}`">
              <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.12v5.26a2.25 2.25 0 1 1-1.5 0V5.37a2.25 2.25 0 0 1-1.5-2.12Zm2.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.75-8.75a2.25 2.25 0 1 0-3 2.12v1.88c0 .69-.56 1.25-1.25 1.25H7v1.5h1.25A2.75 2.75 0 0 0 11 7.25V5.37a2.25 2.25 0 0 0 1.5-2.12Zm-2.25-.75a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z"></path>
            </svg>
            <span class="datahub-pr-state-count">{{ statusCount(filter.value) }}</span>
            {{ filter.label }}
          </button>
        </div>
        <div class="datahub-pr-filters" aria-label="Pull request filters">
          <div
            v-for="filter in tableFilters"
            :key="filter.key"
            class="datahub-pr-filter"
            :class="{disabled: filter.disabled}"
          >
            <button
              type="button"
              :disabled="filter.disabled"
              :aria-expanded="activeFilter === filter.key ? 'true' : 'false'"
              @click="toggleFilter(filter.key)"
            >
              {{ filter.label }} <span aria-hidden="true">▾</span>
            </button>
            <div v-if="activeFilter === filter.key" class="datahub-pr-filter-menu">
              <button
                v-for="option in filter.options"
                :key="`${filter.key}-${option.value}`"
                type="button"
                class="datahub-pr-filter-option"
                :class="{active: selectedFilters[filter.key] === option.value}"
                @click="selectFilter(filter.key, option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="loading" class="datahub-pr-loading">
        <div class="ui active centered inline loader"></div>
      </div>
      <div v-else-if="error" class="datahub-pr-message">
        <div class="ui negative message">{{ error }}</div>
      </div>
      <div v-else-if="visiblePulls.length === 0" class="datahub-pr-empty">
        <svg viewBox="0 0 16 16" aria-hidden="true" class="datahub-pr-empty-icon">
          <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.12v5.26a2.25 2.25 0 1 1-1.5 0V5.37a2.25 2.25 0 0 1-1.5-2.12Zm2.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.75-8.75a2.25 2.25 0 1 0-3 2.12v5.38a.75.75 0 0 0 1.5 0V5.37a2.25 2.25 0 0 0 1.5-2.12Zm-2.25-.75a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z"></path>
        </svg>
        <h3>There aren't any {{ selectedStatus }} pull requests.</h3>
        <p>Use Data to review dataset files, then open a pull request when a DIT change is ready.</p>
      </div>
      <template v-else>
        <article v-for="pull in visiblePulls" :key="pullId(pull)" class="datahub-pr-row">
          <svg viewBox="0 0 16 16" aria-hidden="true" class="datahub-pr-row-icon" :class="`is-${normalizedStatus(pull)}`">
            <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.12v5.26a2.25 2.25 0 1 1-1.5 0V5.37a2.25 2.25 0 0 1-1.5-2.12Zm2.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.75-8.75a2.25 2.25 0 1 0-3 2.12v1.88c0 .69-.56 1.25-1.25 1.25H7v1.5h1.25A2.75 2.75 0 0 0 11 7.25V5.37a2.25 2.25 0 0 0 1.5-2.12Zm-2.25-.75a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z"></path>
          </svg>
          <div class="datahub-pr-row-main">
            <a class="datahub-pr-title" :href="pullHref(pull)">{{ pull.title || 'Untitled data pull request' }}</a>
            <div class="datahub-pr-meta">
              #{{ pullId(pull) }} {{ statusVerb(pull) }} {{ relativeTime(pullTimestamp(pull)) }} by
              <span class="datahub-pr-author">{{ pull.author || 'unknown' }}</span>
              <span class="datahub-pr-dot">·</span>
              <span>{{ reviewText(pull) }}</span>
              <span class="datahub-pr-dot">·</span>
              <span class="datahub-pr-branches">
                {{ branchName(sourceRef(pull)) }} -> {{ branchName(targetRef(pull)) }}
              </span>
            </div>
          </div>
          <div class="datahub-pr-row-side">
            <div class="datahub-pr-stats" aria-label="Dataset change summary">
              <span class="added">+{{ formatCount(pull.stats_added || 0) }}</span>
              <span class="removed">-{{ formatCount(pull.stats_removed || 0) }}</span>
              <span class="refreshed">~{{ formatCount(pull.stats_refreshed || 0) }}</span>
            </div>
            <a class="datahub-pr-comments" :href="pullHref(pull)" aria-label="Comments">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M1.75 2.5h12.5c.41 0 .75.34.75.75v8.5c0 .41-.34.75-.75.75H8.7l-3.02 2.27a.75.75 0 0 1-1.2-.6V12.5H1.75a.75.75 0 0 1-.75-.75v-8.5c0-.41.34-.75.75-.75Zm.75 1.5v7h2.73c.41 0 .75.34.75.75v.92l1.97-1.48a.75.75 0 0 1 .45-.15h5.1V4h-11Z"></path>
              </svg>
              {{ formatCount(commentCount(pull)) }}
            </a>
          </div>
        </article>
      </template>
    </section>
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
      pullsByStatus: {
        open: [],
        closed: [],
        merged: [],
      },
      loading: true,
      error: null,
      query: 'is:pr is:open',
      selectedStatus: 'open',
      activeFilter: null,
      selectedFilters: {
        author: '',
        label: '',
        project: '',
        milestone: '',
        review: '',
        assignee: '',
        sort: 'updated-desc',
      },
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
    newPullHref() {
      return `${this.repoPath}#change-workflow`;
    },
    visiblePulls() {
      const query = this.searchText();
      const sort = this.queryQualifierValue('sort') || this.selectedFilters.sort;
      return (this.pullsByStatus[this.selectedStatus] || []).filter((pull) => {
        if (!query) return true;
        return [
          pull.title,
          pull.author,
          this.branchName(this.sourceRef(pull)),
          this.branchName(this.targetRef(pull)),
          String(this.pullId(pull) || ''),
        ].some((value) => String(value || '').toLowerCase().includes(query));
      }).filter((pull) => this.matchesSelectedFilters(pull)).sort((a, b) => this.comparePulls(a, b, sort));
    },
    allPulls() {
      return Object.values(this.pullsByStatus).flat();
    },
    tableFilters() {
      return [
        this.optionFilter('label', 'Label', this.uniquePullValues((pull) => this.pullLabels(pull), 'All labels')),
        this.optionFilter('milestone', 'Milestone', this.uniquePullValues((pull) => pull.milestone || pull.milestone_name, 'All milestones')),
        this.optionFilter('project', 'Project', this.uniquePullValues((pull) => pull.project || pull.project_name, 'All projects')),
        this.optionFilter('author', 'Author', this.uniquePullValues((pull) => pull.author, 'All authors')),
        this.optionFilter('assignee', 'Assignee', this.uniquePullValues((pull) => this.pullAssignees(pull), 'All assignees')),
        this.optionFilter('review', 'Reviews', [
          {value: '', label: 'All reviews'},
          {value: 'required', label: 'Review required'},
          {value: 'blocked', label: 'Needs resolution'},
          {value: 'complete', label: 'Merged or closed'},
        ]),
        this.optionFilter('sort', 'Sort', [
          {value: 'updated-desc', label: 'Newest updated'},
          {value: 'updated-asc', label: 'Oldest updated'},
          {value: 'created-desc', label: 'Newest created'},
          {value: 'created-asc', label: 'Oldest created'},
          {value: 'comments-desc', label: 'Most commented'},
          {value: 'comments-asc', label: 'Least commented'},
        ]),
      ];
    },
  },
  async mounted() {
    await this.loadPulls();
  },
  methods: {
    selectStatus(status) {
      if (this.selectedStatus === status) return;
      this.selectedStatus = status;
      this.query = `is:pr is:${status}`;
    },
    syncStatusFromQuery() {
      const status = this.query.match(/\bis:(open|closed|merged)\b/i)?.[1]?.toLowerCase();
      if (status && status !== this.selectedStatus) this.selectedStatus = status;
      this.selectedFilters = {
        ...this.selectedFilters,
        author: this.queryQualifierValue('author'),
        label: this.queryQualifierValue('label'),
        project: this.queryQualifierValue('project'),
        milestone: this.queryQualifierValue('milestone'),
        review: this.queryQualifierValue('review'),
        assignee: this.queryQualifierValue('assignee'),
        sort: this.queryQualifierValue('sort') || 'updated-desc',
      };
    },
    toggleFilter(key) {
      this.activeFilter = this.activeFilter === key ? null : key;
    },
    selectFilter(key, value) {
      this.selectedFilters = {...this.selectedFilters, [key]: value};
      this.activeFilter = null;
      this.syncQueryForFilter(key, value);
    },
    async loadPulls() {
      this.loading = true;
      this.error = null;
      try {
        const entries = await Promise.all(this.filters.map(async ({value}) => {
          const result = await datahubFetch(this.owner, this.repo, `/pulls?status=${encodeURIComponent(value)}`);
          return [value, this.normalizePulls(result, value)];
        }));
        this.pullsByStatus = Object.fromEntries(entries);
      } catch (e) {
        this.pullsByStatus = {open: [], closed: [], merged: []};
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    },
    normalizePulls(result, status) {
      const pulls = Array.isArray(result) ? result : result?.pulls || result?.pull_requests || [];
      return pulls.map((pull) => ({...pull, status: pull.status || status}));
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
    normalizedStatus(pull) {
      return pull.status || this.selectedStatus || 'open';
    },
    branchName(refName) {
      return (refName || '').replace(/^heads\//, '') || 'unknown';
    },
    statusCount(status) {
      return this.formatCount(this.pullsByStatus[status]?.length || 0);
    },
    statusVerb(pull) {
      const status = this.normalizedStatus(pull);
      if (status === 'merged') return 'merged';
      if (status === 'closed') return 'closed';
      return 'opened';
    },
    reviewText(pull) {
      if (this.normalizedStatus(pull) === 'merged') return 'Merged';
      if (this.normalizedStatus(pull) === 'closed') return 'Closed';
      if (pull.is_mergeable === false) return 'Needs resolution';
      return 'Review required';
    },
    pullTimestamp(pull) {
      return pull.updated_at || pull.updated || pull.created_at || pull.created || null;
    },
    relativeTime(timestamp) {
      if (!timestamp) return 'recently';
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return 'recently';
      const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
      if (seconds < 60) return 'just now';
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
      const days = Math.floor(hours / 24);
      if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
      return date.toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'});
    },
    commentCount(pull) {
      return pull.comments_count || pull.comment_count || pull.comments || 0;
    },
    pullLabels(pull) {
      const labels = pull.labels || pull.label_names || [];
      if (Array.isArray(labels)) {
        return labels.map((label) => (typeof label === 'string' ? label : label?.name)).filter(Boolean);
      }
      return labels ? [labels] : [];
    },
    pullAssignees(pull) {
      const assignees = pull.assignees || pull.assignee_names || pull.assignee || [];
      if (Array.isArray(assignees)) {
        return assignees.map((assignee) => (typeof assignee === 'string' ? assignee : assignee?.name || assignee?.username)).filter(Boolean);
      }
      return assignees ? [assignees] : [];
    },
    uniquePullValues(accessor, allLabel) {
      const values = new Set();
      for (const pull of this.allPulls) {
        const raw = accessor(pull);
        const items = Array.isArray(raw) ? raw : [raw];
        for (const item of items) {
          const value = String(item || '').trim();
          if (value) values.add(value);
        }
      }
      return [
        {value: '', label: allLabel},
        ...Array.from(values).sort((a, b) => a.localeCompare(b)).map((value) => ({value, label: value})),
      ];
    },
    optionFilter(key, label, options) {
      return {
        key,
        label,
        options,
        disabled: key !== 'sort' && key !== 'review' && options.length <= 1,
      };
    },
    matchesSelectedFilters(pull) {
      const selected = this.selectedFilters;
      const author = this.queryQualifierValue('author') || selected.author;
      const label = this.queryQualifierValue('label') || selected.label;
      const project = this.queryQualifierValue('project') || selected.project;
      const milestone = this.queryQualifierValue('milestone') || selected.milestone;
      const assignee = this.queryQualifierValue('assignee') || selected.assignee;
      const review = this.queryQualifierValue('review') || selected.review;
      if (author && pull.author !== author) return false;
      if (label && !this.pullLabels(pull).includes(label)) return false;
      if (project && ![pull.project, pull.project_name].includes(project)) return false;
      if (milestone && ![pull.milestone, pull.milestone_name].includes(milestone)) return false;
      if (assignee && !this.pullAssignees(pull).includes(assignee)) return false;
      if (review === 'required' && this.reviewText(pull) !== 'Review required') return false;
      if (review === 'blocked' && this.reviewText(pull) !== 'Needs resolution') return false;
      if (review === 'complete' && !['Merged', 'Closed'].includes(this.reviewText(pull))) return false;
      return true;
    },
    comparePulls(a, b, sort) {
      const [field, direction] = (sort || 'updated-desc').split('-');
      let left;
      let right;
      if (field === 'comments') {
        left = this.commentCount(a);
        right = this.commentCount(b);
      } else if (field === 'created') {
        left = new Date(a.created_at || a.created || 0).getTime();
        right = new Date(b.created_at || b.created || 0).getTime();
      } else {
        left = new Date(this.pullTimestamp(a) || 0).getTime();
        right = new Date(this.pullTimestamp(b) || 0).getTime();
      }
      if (left === right) return 0;
      return direction === 'asc' ? left - right : right - left;
    },
    syncQueryForFilter(key, value) {
      const qualifierMap = {
        author: 'author',
        label: 'label',
        project: 'project',
        milestone: 'milestone',
        assignee: 'assignee',
        review: 'review',
        sort: 'sort',
      };
      const qualifier = qualifierMap[key];
      if (!qualifier) return;
      const tokens = this.query.split(/\s+/).filter((token) => token && !token.startsWith(`${qualifier}:`));
      if (value) tokens.push(`${qualifier}:${this.formatQualifierValue(value)}`);
      this.query = tokens.join(' ');
    },
    formatQualifierValue(value) {
      return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
    },
    queryQualifierValue(key) {
      const match = this.query.match(new RegExp(`(?:^|\\s)${key}:(?:"([^"]+)"|(\\S+))`, 'i'));
      return match ? (match[1] || match[2] || '') : '';
    },
    searchText() {
      return this.query
        .toLowerCase()
        .replace(/\bis:pr\b/g, '')
        .replace(/\bis:(open|closed|merged)\b/g, '')
        .replace(/\b(author|assignee|label|project|milestone|review|sort):(?:"[^"]+"|\S+)/g, '')
        .trim();
    },
    formatCount(value) {
      return Number(value || 0).toLocaleString();
    },
  },
};
</script>

<style scoped>
.datahub-pr-toolbar {
  align-items: center;
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(0, 1fr) auto;
  margin-bottom: 14px;
}

.datahub-pr-search-group {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 4px;
  grid-column: 1;
  max-width: calc(100vw - 460px);
  min-width: min(100%, 260px);
}

.datahub-pr-search {
  align-items: stretch;
  display: flex;
  flex: 1 1 auto;
  height: 34px;
  position: relative;
  width: 100%;
}

.datahub-pr-filter-prefix {
  align-items: center;
  background: var(--color-box-header);
  border: 1px solid var(--color-secondary);
  border-radius: 6px 0 0 6px;
  border-right: 0;
  color: var(--color-text-light-2);
  display: inline-flex;
  font-size: 12px;
  font-weight: 600;
  min-height: 34px;
  padding: 0 10px;
  white-space: nowrap;
}

.datahub-pr-search-icon {
  fill: var(--color-text-light-2);
  height: 16px;
  left: 72px;
  pointer-events: none;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
}

.datahub-pr-search input {
  background: var(--color-input-background);
  border: 1px solid var(--color-secondary);
  border-radius: 0;
  flex: 1 1 auto;
  color: var(--color-text);
  height: 34px;
  line-height: 20px;
  padding: 6px 10px 6px 34px;
  min-width: 0;
}

.datahub-pr-actions {
  align-items: flex-start;
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 8px;
  grid-column: 2;
  justify-content: flex-start;
  min-width: 0;
}

.datahub-pr-secondary-action {
  align-items: center;
  border: 1px solid var(--color-secondary);
  border-radius: 6px;
  color: var(--color-text);
  display: inline-flex;
  font-weight: var(--font-weight-semibold);
  min-height: 34px;
  padding: 0 14px;
}

.datahub-pr-new {
  align-items: center;
  background: var(--color-green) !important;
  border-radius: 6px;
  color: var(--color-white) !important;
  display: inline-flex;
  font-weight: var(--font-weight-semibold);
  margin-left: 0 !important;
  min-height: 34px;
  white-space: nowrap;
}

.datahub-pr-box {
  border: 1px solid var(--color-secondary);
  border-radius: 6px;
  overflow: visible;
}

.datahub-pr-statusbar {
  align-items: center;
  background: var(--color-box-header);
  border-bottom: 1px solid var(--color-secondary);
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  justify-content: space-between;
  min-height: 0;
  padding: 10px 16px;
}

.datahub-pr-state-links,
.datahub-pr-filters {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.datahub-pr-state-links {
  flex: 0 0 auto;
}

.datahub-pr-filters {
  flex: 1 1 320px;
}

.datahub-pr-state,
.datahub-pr-filter > button {
  background: transparent;
  border: 0;
  color: var(--color-text-light);
  cursor: pointer;
  font: inherit;
  padding: 0;
}

.datahub-pr-state {
  align-items: center;
  display: inline-flex;
  gap: 5px;
  line-height: 20px;
  min-height: 0;
  white-space: nowrap;
}

.datahub-pr-state.active {
  color: var(--color-text);
  font-weight: 600;
}

.datahub-pr-state-count {
  font-weight: 600;
}

.datahub-pr-state-icon {
  fill: currentColor;
  height: 16px;
  width: 16px;
}

.datahub-pr-state-icon.is-open,
.datahub-pr-row-icon.is-open {
  color: var(--color-green);
}

.datahub-pr-state-icon.is-merged,
.datahub-pr-row-icon.is-merged {
  color: var(--color-purple);
}

.datahub-pr-row-icon.is-closed {
  color: var(--color-text-light-2);
}

.datahub-pr-filters {
  gap: 14px;
  justify-content: flex-end;
}

.datahub-pr-filter {
  position: relative;
}

.datahub-pr-filter > button {
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
}

.datahub-pr-filter.disabled > button {
  color: var(--color-text-light-3);
  cursor: default;
}

.datahub-pr-filter-menu {
  background: var(--color-menu);
  border: 1px solid var(--color-secondary);
  border-radius: 6px;
  box-shadow: 0 8px 24px var(--color-shadow);
  min-width: 180px;
  padding: 6px 0;
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 1001;
}

.datahub-pr-filter-option {
  background: transparent;
  border: 0;
  color: var(--color-text);
  cursor: pointer;
  display: block;
  font: inherit;
  line-height: 20px;
  padding: 6px 12px;
  text-align: left;
  width: 100%;
}

.datahub-pr-filter-option:hover,
.datahub-pr-filter-option.active {
  background: var(--color-hover);
}

.datahub-pr-filter-option.active {
  font-weight: 600;
}

.datahub-pr-row {
  align-items: flex-start;
  background: var(--color-body);
  border-bottom: 1px solid var(--color-secondary);
  display: grid;
  gap: 10px;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  padding: 12px 16px;
}

.datahub-pr-row:last-child {
  border-bottom: 0;
}

.datahub-pr-row:hover {
  background: var(--color-hover);
}

.datahub-pr-row-icon {
  fill: currentColor;
  height: 16px;
  margin-top: 2px;
  width: 16px;
}

.datahub-pr-title {
  color: var(--color-text);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.datahub-pr-title:hover {
  color: var(--color-primary);
  text-decoration: none;
}

.datahub-pr-meta {
  color: var(--color-text-light-2);
  font-size: 12px;
  line-height: 1.5;
  margin-top: 3px;
}

.datahub-pr-author,
.datahub-pr-branches {
  font-family: var(--fonts-monospace);
}

.datahub-pr-dot {
  padding: 0 4px;
}

.datahub-pr-row-side {
  align-items: flex-end;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  min-width: 154px;
}

.datahub-pr-stats {
  align-items: center;
  display: flex;
  font-family: var(--fonts-monospace);
  font-size: 12px;
  gap: 8px;
  white-space: nowrap;
}

.datahub-pr-stats .added {
  color: var(--color-green);
}

.datahub-pr-stats .removed {
  color: var(--color-red);
}

.datahub-pr-stats .refreshed {
  color: var(--color-yellow);
}

.datahub-pr-comments {
  align-items: center;
  color: var(--color-text-light-2);
  display: inline-flex;
  font-size: 12px;
  gap: 4px;
  white-space: nowrap;
}

.datahub-pr-comments svg {
  fill: currentColor;
  height: 16px;
  width: 16px;
}

.datahub-pr-loading,
.datahub-pr-message,
.datahub-pr-empty {
  padding: 48px 16px;
}

.datahub-pr-empty {
  color: var(--color-text-light-2);
  text-align: center;
}

.datahub-pr-empty h3 {
  color: var(--color-text);
  font-size: 18px;
  margin: 8px 0 4px;
}

.datahub-pr-empty p {
  margin: 0;
}

.datahub-pr-empty-icon {
  color: var(--color-text-light-2);
  fill: currentColor;
  height: 28px;
  width: 28px;
}

@media (max-width: 1200px) {
  .datahub-pr-statusbar {
    align-items: stretch;
    flex-direction: column;
  }

  .datahub-pr-actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .datahub-pr-search-group {
    max-width: none;
  }

  .datahub-pr-state-links,
  .datahub-pr-filters {
    flex: 0 1 auto;
    width: 100%;
  }

  .datahub-pr-statusbar {
    align-items: flex-start;
  }

  .datahub-pr-filters {
    justify-content: flex-start;
    overflow-x: auto;
    width: 100%;
  }
}

@media (max-width: 640px) {
  .datahub-pr-toolbar {
    grid-template-columns: 1fr;
  }

  .datahub-pr-search-group,
  .datahub-pr-actions {
    grid-column: 1;
    justify-content: flex-start;
  }
}

@media (max-width: 767px) {
  .datahub-pr-row,
  .datahub-pr-row-side {
    align-items: stretch;
    flex-direction: column;
  }

  .datahub-pr-row {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
  }

  .datahub-pr-row-side {
    grid-column: 2;
    min-width: 0;
  }

  .datahub-pr-stats {
    flex-wrap: wrap;
  }
}
</style>
