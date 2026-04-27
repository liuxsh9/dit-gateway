<template>
  <div class="ui grid datahub-diff-view">
    <div class="sixteen wide column" v-if="summary">
      <div class="ui three small statistics datahub-diff-summary">
        <div class="statistic">
          <div class="value">{{ summary.files_changed || files.length }}</div>
          <div class="label">Files changed</div>
        </div>
        <div class="statistic">
          <div class="value">+{{ summary.rows_added || 0 }}</div>
          <div class="label">Rows added</div>
        </div>
        <div class="statistic">
          <div class="value">-{{ summary.rows_removed || 0 }} / ~{{ summary.rows_refreshed || 0 }}</div>
          <div class="label">Removed / refreshed</div>
        </div>
      </div>
    </div>

    <!-- Metadata delta header -->
    <div class="sixteen wide column" v-if="metaDiff && metaDiff.length">
      <div class="ui info message">
        <div class="ui list">
          <div class="item" v-for="f in metaDiff" :key="f.path">
            <strong>{{ f.path }}</strong>:
            <span v-if="formatDelta(f.delta)">{{ formatDelta(f.delta) }}</span>
            <span v-else class="dimmed">no metadata change</span>
          </div>
        </div>
      </div>
    </div>

    <!-- File sidebar -->
    <div class="four wide column">
      <div class="ui segment">
        <div class="ui list">
          <a class="item" v-for="file in files" :key="file.path"
             :class="{active: file.path === activeFile}"
             @click="activeFile = file.path">
            <span>{{ file.path }}</span>
            <div class="ui mini labels">
              <span class="ui green label" v-if="file.added">+{{ file.added }}</span>
              <span class="ui red label" v-if="file.removed">-{{ file.removed }}</span>
              <span class="ui yellow label" v-if="file.refreshed">~{{ file.refreshed }}</span>
            </div>
          </a>
        </div>
      </div>
    </div>

    <!-- Diff content -->
    <div class="twelve wide column">
      <div class="ui segment" v-if="loading">
        <div class="ui active centered inline loader"></div>
      </div>

      <div class="ui segment" v-else-if="activeChanges">
        <!-- Added rows -->
        <div v-if="addedRows.length" class="datahub-diff-section">
          <h4 class="ui header">Added ({{ addedRows.length }})</h4>
          <div class="datahub-diff-row-list positive">
            <JsonlRowRenderer
              v-for="(row, index) in addedRows"
              :key="row.row_hash || index"
              :row="rowContent(row)"
              :row-number="row.position != null ? row.position + 1 : index + 1"
            />
          </div>
        </div>

        <!-- Removed rows -->
        <div v-if="removedRows.length" class="datahub-diff-section">
          <h4 class="ui header">Removed ({{ removedRows.length }})</h4>
          <div class="datahub-diff-row-list negative">
            <JsonlRowRenderer
              v-for="(row, index) in removedRows"
              :key="row.row_hash || index"
              :row="rowContent(row)"
              :row-number="row.position != null ? row.position + 1 : index + 1"
            />
          </div>
        </div>

        <!-- Refreshed rows -->
        <div v-if="refreshedRows.length" class="datahub-diff-section">
          <h4 class="ui header">Refreshed ({{ refreshedRows.length }})</h4>
          <div
            v-for="(row, index) in refreshedRows"
            :key="row.new_row_hash || index"
            class="datahub-diff-refresh-pair"
          >
            <div class="datahub-diff-refresh-side negative">
              <div class="datahub-diff-side-label">Before</div>
              <JsonlRowRenderer
                :row="rowContent({content: row.old_content, row_hash: row.old_row_hash})"
                :row-number="index + 1"
              />
            </div>
            <div class="datahub-diff-refresh-side positive">
              <div class="datahub-diff-side-label">After</div>
              <JsonlRowRenderer
                :row="rowContent({content: row.new_content, row_hash: row.new_row_hash})"
                :row-number="index + 1"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import {datahubFetch} from '../utils/datahub-api.js';
import JsonlRowRenderer from './JsonlRowRenderer.vue';

export default {
  components: {JsonlRowRenderer},
  props: {
    owner: String,
    repo: String,
    oldCommit: String,
    newCommit: String,
  },
  data() {
    return {
      files: [],
      activeFile: null,
      activeChanges: null,
      loading: false,
      metaDiff: null,
      summary: null,
    };
  },
  computed: {
    addedRows() {
      if (this.activeFileData?.added_rows) return this.activeFileData.added_rows;
      return (this.activeChanges || []).filter((c) => c.type === 'added');
    },
    removedRows() {
      if (this.activeFileData?.removed_rows) return this.activeFileData.removed_rows;
      return (this.activeChanges || []).filter((c) => c.type === 'removed');
    },
    refreshedRows() {
      if (this.activeFileData?.refreshed_rows) return this.activeFileData.refreshed_rows;
      return (this.activeChanges || []).filter((c) => c.type === 'refreshed');
    },
    activeFileData() {
      return this.files.find((f) => f.path === this.activeFile) || null;
    },
    metaDeltaByPath() {
      if (!this.metaDiff) return {};
      const map = {};
      for (const f of this.metaDiff) {
        map[f.path] = f.delta || {};
      }
      return map;
    },
  },
  async mounted() {
    const diff = await datahubFetch(this.owner, this.repo, `/diff/${this.oldCommit}/${this.newCommit}`);
    this.summary = diff.summary || null;
    this.files = diff.files || [];
    if (this.files.length > 0) {
      this.activeFile = this.files[0].path;
      this.activeChanges = this.files[0].changes || [];
    }
    try {
      const meta = await datahubFetch(
        this.owner, this.repo,
        `/meta/diff/${this.oldCommit}/${this.newCommit}`,
      );
      this.metaDiff = meta.files || [];
    } catch {
      this.metaDiff = null;
    }
  },
  watch: {
    activeFile(newPath) {
      const file = this.files.find((f) => f.path === newPath);
      this.activeChanges = file?.changes || [];
    },
  },
  methods: {
    formatRow(content) {
      if (!content) return '';
      return JSON.stringify(content, null, 2);
    },
    rowContent(row) {
      const content = row.content || row.row_content || row;
      return {
        ...content,
        __datahubRowHash: row.row_hash || content.__datahubRowHash,
      };
    },
    formatDelta(delta) {
      if (!delta) return null;
      const parts = [];
      if (delta.row_count !== null && delta.row_count !== undefined) {
        const sign = delta.row_count >= 0 ? '+' : '';
        parts.push(`${sign}${delta.row_count} rows`);
      }
      if (delta.token_estimate !== null && delta.token_estimate !== undefined) {
        const sign = delta.token_estimate >= 0 ? '+' : '';
        const abs = Math.abs(delta.token_estimate);
        const fmt = abs >= 1000 ? `${sign}${Math.round(delta.token_estimate / 1000)}K` : `${sign}${delta.token_estimate}`;
        parts.push(`${fmt} tokens`);
      }
      return parts.length ? parts.join(', ') : null;
    },
  },
};
</script>

<style scoped>
.datahub-diff-section {
  margin-bottom: 1em;
}
.datahub-diff-summary {
  margin: 0;
}
.datahub-diff-row-list {
  display: grid;
  gap: 10px;
  padding: 10px;
  border-left: 3px solid var(--color-secondary);
  border-radius: 6px;
}
.datahub-diff-row-list.positive {
  border-left-color: var(--color-green);
  background: var(--color-diff-added-row-bg, #e6ffec);
}
.datahub-diff-row-list.negative {
  border-left-color: var(--color-red);
  background: var(--color-diff-removed-row-bg, #ffeef0);
}
.datahub-diff-refresh-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.datahub-diff-refresh-side {
  padding: 10px;
  border-radius: 6px;
}
.datahub-diff-refresh-side.negative {
  background: var(--color-diff-removed-row-bg, #ffeef0);
}
.datahub-diff-refresh-side.positive {
  background: var(--color-diff-added-row-bg, #e6ffec);
}
.datahub-diff-side-label {
  margin-bottom: 8px;
  color: var(--color-text-light-2);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}
.datahub-diff-content {
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow: auto;
  font-size: 12px;
  margin: 0;
}
.datahub-diff-side {
  padding: 4px 8px;
  margin: 2px 0;
  border-radius: 3px;
}
.datahub-diff-side.negative {
  background-color: var(--color-diff-removed-row-bg, #ffeef0);
}
.datahub-diff-side.positive {
  background-color: var(--color-diff-added-row-bg, #e6ffec);
}
@media (max-width: 767px) {
  .datahub-diff-refresh-pair {
    grid-template-columns: 1fr;
  }
}
</style>
