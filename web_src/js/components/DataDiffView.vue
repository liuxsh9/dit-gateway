<template>
  <div class="ui grid">
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
          <table class="ui very basic table">
            <tr v-for="row in addedRows" :key="row.row_hash" class="positive">
              <td class="collapsing">{{ row.row_hash?.slice(0, 8) }}</td>
              <td><pre class="datahub-diff-content">{{ formatRow(row.row_content) }}</pre></td>
            </tr>
          </table>
        </div>

        <!-- Removed rows -->
        <div v-if="removedRows.length" class="datahub-diff-section">
          <h4 class="ui header">Removed ({{ removedRows.length }})</h4>
          <table class="ui very basic table">
            <tr v-for="row in removedRows" :key="row.row_hash" class="negative">
              <td class="collapsing">{{ row.row_hash?.slice(0, 8) }}</td>
              <td><pre class="datahub-diff-content">{{ formatRow(row.row_content) }}</pre></td>
            </tr>
          </table>
        </div>

        <!-- Refreshed rows -->
        <div v-if="refreshedRows.length" class="datahub-diff-section">
          <h4 class="ui header">Refreshed ({{ refreshedRows.length }})</h4>
          <table class="ui very basic table">
            <tr v-for="row in refreshedRows" :key="row.new_row_hash" class="warning">
              <td class="collapsing">{{ row.new_row_hash?.slice(0, 8) }}</td>
              <td>
                <div class="datahub-diff-side negative"><pre>{{ formatRow(row.old_content) }}</pre></div>
                <div class="datahub-diff-side positive"><pre>{{ formatRow(row.new_content) }}</pre></div>
              </td>
            </tr>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import {datahubFetch} from '../utils/datahub-api.js';

export default {
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
    };
  },
  computed: {
    addedRows() {
      return (this.activeChanges || []).filter((c) => c.type === 'added');
    },
    removedRows() {
      return (this.activeChanges || []).filter((c) => c.type === 'removed');
    },
    refreshedRows() {
      return (this.activeChanges || []).filter((c) => c.type === 'refreshed');
    },
  },
  async mounted() {
    const diff = await datahubFetch(this.owner, this.repo, `/diff/${this.oldCommit}/${this.newCommit}`);
    this.files = diff.files || [];
    if (this.files.length > 0) {
      this.activeFile = this.files[0].path;
      this.activeChanges = this.files[0].changes || [];
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
  },
};
</script>

<style scoped>
.datahub-diff-section {
  margin-bottom: 1em;
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
</style>
