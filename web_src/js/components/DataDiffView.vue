<template>
  <div class="datahub-diff-view" :class="{'is-review-mode': reviewMode}">
    <div class="datahub-diff-header" v-if="summary">
      <div class="datahub-diff-summary">
        <div class="datahub-diff-stat">
          <strong>{{ summary.files_changed || files.length }}</strong>
          <span>Files changed</span>
        </div>
        <div class="datahub-diff-stat">
          <strong class="datahub-stat-add">+{{ summary.rows_added || 0 }}</strong>
          <span>Rows added</span>
        </div>
        <div class="datahub-diff-stat">
          <strong>
            <span class="datahub-stat-remove">-{{ summary.rows_removed || 0 }}</span>
            <span class="datahub-stat-refresh">~{{ summary.rows_refreshed || 0 }}</span>
          </strong>
          <span>Removed / refreshed</span>
        </div>
      </div>
    </div>

    <div class="datahub-review-toolbar" v-if="reviewMode">
      <div class="datahub-review-progress">
        <strong>Viewed {{ viewedCount }} of {{ files.length }} files</strong>
        <div class="datahub-review-progress-track" aria-hidden="true">
          <div class="datahub-review-progress-fill" :style="{width: viewedPercent}"></div>
        </div>
      </div>
      <div class="datahub-review-controls">
        <label class="datahub-review-toggle">
          <input v-model="activeFileViewed" type="checkbox">
          Viewed
        </label>
        <label class="datahub-review-toggle">
          <input v-model="hideViewed" type="checkbox">
          Hide viewed
        </label>
        <button
          type="button"
          class="datahub-review-control-button"
          :class="{active: whitespaceMode === 'ignore'}"
          @click="toggleWhitespace"
        >
          Whitespace
        </button>
      </div>
    </div>

    <div class="datahub-meta-delta" v-if="metaDiff && metaDiff.length">
      <div class="datahub-meta-delta-row" v-for="f in metaDiff" :key="f.path">
        <strong>{{ f.path }}</strong>
        <span v-if="formatDelta(f.delta)">{{ formatDelta(f.delta) }}</span>
        <span v-else class="datahub-muted">no metadata change</span>
      </div>
    </div>

    <div class="datahub-diff-layout">
      <aside class="datahub-file-sidebar" aria-label="Changed files">
        <div class="datahub-file-sidebar-header">
          <strong>Files changed</strong>
          <span>{{ visibleFiles.length }} shown</span>
        </div>
        <button
          v-for="file in visibleFiles"
          :key="file.path"
          type="button"
          class="datahub-file-item"
          :class="{active: file.path === activeFile, viewed: isViewed(file.path)}"
          @click="selectFile(file.path)"
        >
          <span class="datahub-file-path">{{ file.path }}</span>
          <span class="datahub-file-badges">
            <span class="datahub-file-viewed" v-if="isViewed(file.path)">Viewed</span>
            <span class="datahub-file-added" v-if="file.added">+{{ file.added }}</span>
            <span class="datahub-file-removed" v-if="file.removed">-{{ file.removed }}</span>
            <span class="datahub-file-refreshed" v-if="file.refreshed">~{{ file.refreshed }}</span>
          </span>
        </button>
        <div class="datahub-file-empty" v-if="files.length && visibleFiles.length === 0">
          All viewed files are hidden.
        </div>
      </aside>

      <main class="datahub-diff-content-column">
        <div class="ui segment" v-if="loading">
          <div class="ui active centered inline loader"></div>
        </div>

        <div class="datahub-file-diff" v-else-if="activeFileData">
          <div class="datahub-file-diff-header">
            <div>
              <strong>{{ activeFileData.path }}</strong>
              <span>{{ fileChangeSummary(activeFileData) }}</span>
            </div>
            <div class="datahub-file-review-actions" v-if="reviewMode">
              <button
                type="button"
                class="datahub-row-comment-button"
                @click="toggleCommentForm(fileCommentContext())"
              >
                Comment
              </button>
              <label class="datahub-review-toggle">
                <input v-model="activeFileViewed" type="checkbox">
                Viewed
              </label>
            </div>
          </div>
          <form
            v-if="isCommentFormOpen(fileCommentContext())"
            class="datahub-inline-comment-form"
            @submit.prevent="submitInlineComment(fileCommentContext())"
          >
            <textarea
              v-model="inlineCommentBody"
              class="datahub-inline-comment-textarea"
              placeholder="Leave a file-level review comment"
            ></textarea>
            <div class="datahub-inline-comment-actions">
              <span v-if="commentError" class="datahub-inline-comment-error">{{ commentError }}</span>
              <button type="button" class="ui small basic button" @click="closeCommentForm">Cancel</button>
              <button type="submit" class="ui small primary button" :disabled="submittingCommentKey === commentKey(fileCommentContext())">
                Add comment
              </button>
            </div>
          </form>

          <div v-if="hasNoRows" class="datahub-empty-diff">
            No row-level content is available for this file.
          </div>

          <div v-if="addedRows.length" class="datahub-diff-section">
            <h4>Added ({{ addedRows.length }})</h4>
            <div class="datahub-diff-row-list positive">
              <div
                v-for="(row, index) in addedRows"
                :key="row.row_hash || index"
                class="datahub-row-review-item"
              >
                <div class="datahub-row-actions">
                  <span>{{ rowContextLabel(row, index, 'added') }}</span>
                  <span class="datahub-row-action-buttons">
                    <button
                      v-if="reviewMode"
                      type="button"
                      class="datahub-row-comment-button"
                      @click="toggleCommentForm(rowCommentContext(row, index, 'added'))"
                    >
                      Comment
                    </button>
                    <a class="datahub-row-issue-link" :href="issueLinkForRow(row, index, 'added')">
                      Open issue
                    </a>
                  </span>
                </div>
                <form
                  v-if="isCommentFormOpen(rowCommentContext(row, index, 'added'))"
                  class="datahub-inline-comment-form"
                  @submit.prevent="submitInlineComment(rowCommentContext(row, index, 'added'))"
                >
                  <textarea
                    v-model="inlineCommentBody"
                    class="datahub-inline-comment-textarea"
                    placeholder="Leave a row-level review comment"
                  ></textarea>
                  <div class="datahub-inline-comment-actions">
                    <span v-if="commentError" class="datahub-inline-comment-error">{{ commentError }}</span>
                    <button type="button" class="ui small basic button" @click="closeCommentForm">Cancel</button>
                    <button type="submit" class="ui small primary button" :disabled="submittingCommentKey === commentKey(rowCommentContext(row, index, 'added'))">
                      Add comment
                    </button>
                  </div>
                </form>
                <JsonlRowRenderer
                  :row="rowContent(row)"
                  :row-number="row.position != null ? row.position + 1 : index + 1"
                />
              </div>
            </div>
          </div>

          <div v-if="removedRows.length" class="datahub-diff-section">
            <h4>Removed ({{ removedRows.length }})</h4>
            <div class="datahub-diff-row-list negative">
              <div
                v-for="(row, index) in removedRows"
                :key="row.row_hash || index"
                class="datahub-row-review-item"
              >
                <div class="datahub-row-actions">
                  <span>{{ rowContextLabel(row, index, 'removed') }}</span>
                  <span class="datahub-row-action-buttons">
                    <button
                      v-if="reviewMode"
                      type="button"
                      class="datahub-row-comment-button"
                      @click="toggleCommentForm(rowCommentContext(row, index, 'removed'))"
                    >
                      Comment
                    </button>
                    <a class="datahub-row-issue-link" :href="issueLinkForRow(row, index, 'removed')">
                      Open issue
                    </a>
                  </span>
                </div>
                <form
                  v-if="isCommentFormOpen(rowCommentContext(row, index, 'removed'))"
                  class="datahub-inline-comment-form"
                  @submit.prevent="submitInlineComment(rowCommentContext(row, index, 'removed'))"
                >
                  <textarea
                    v-model="inlineCommentBody"
                    class="datahub-inline-comment-textarea"
                    placeholder="Leave a row-level review comment"
                  ></textarea>
                  <div class="datahub-inline-comment-actions">
                    <span v-if="commentError" class="datahub-inline-comment-error">{{ commentError }}</span>
                    <button type="button" class="ui small basic button" @click="closeCommentForm">Cancel</button>
                    <button type="submit" class="ui small primary button" :disabled="submittingCommentKey === commentKey(rowCommentContext(row, index, 'removed'))">
                      Add comment
                    </button>
                  </div>
                </form>
                <JsonlRowRenderer
                  :row="rowContent(row)"
                  :row-number="row.position != null ? row.position + 1 : index + 1"
                />
              </div>
            </div>
          </div>

          <div v-if="refreshedRows.length" class="datahub-diff-section">
            <h4>Refreshed ({{ refreshedRows.length }})</h4>
            <div
              v-for="(row, index) in refreshedRows"
              :key="row.new_row_hash || index"
              class="datahub-diff-refresh-pair"
            >
              <div class="datahub-diff-refresh-side negative">
                <div class="datahub-diff-side-label">Before</div>
                <div class="datahub-row-actions">
                  <span>{{ rowContextLabel({row_hash: row.old_row_hash}, index, 'before refresh') }}</span>
                  <span class="datahub-row-action-buttons">
                    <button
                      v-if="reviewMode"
                      type="button"
                      class="datahub-row-comment-button"
                      @click="toggleCommentForm(rowCommentContext({content: row.old_content, row_hash: row.old_row_hash}, index, 'before refresh'))"
                    >
                      Comment
                    </button>
                    <a
                      class="datahub-row-issue-link"
                      :href="issueLinkForRow({content: row.old_content, row_hash: row.old_row_hash}, index, 'before refresh')"
                    >
                      Open issue
                    </a>
                  </span>
                </div>
                <form
                  v-if="isCommentFormOpen(rowCommentContext({content: row.old_content, row_hash: row.old_row_hash}, index, 'before refresh'))"
                  class="datahub-inline-comment-form"
                  @submit.prevent="submitInlineComment(rowCommentContext({content: row.old_content, row_hash: row.old_row_hash}, index, 'before refresh'))"
                >
                  <textarea
                    v-model="inlineCommentBody"
                    class="datahub-inline-comment-textarea"
                    placeholder="Leave a row-level review comment"
                  ></textarea>
                  <div class="datahub-inline-comment-actions">
                    <span v-if="commentError" class="datahub-inline-comment-error">{{ commentError }}</span>
                    <button type="button" class="ui small basic button" @click="closeCommentForm">Cancel</button>
                    <button type="submit" class="ui small primary button" :disabled="submittingCommentKey === commentKey(rowCommentContext({content: row.old_content, row_hash: row.old_row_hash}, index, 'before refresh'))">
                      Add comment
                    </button>
                  </div>
                </form>
                <JsonlRowRenderer
                  :row="rowContent({content: row.old_content, row_hash: row.old_row_hash})"
                  :row-number="index + 1"
                />
              </div>
              <div class="datahub-diff-refresh-side positive">
                <div class="datahub-diff-side-label">After</div>
                <div class="datahub-row-actions">
                  <span>{{ rowContextLabel({row_hash: row.new_row_hash}, index, 'after refresh') }}</span>
                  <span class="datahub-row-action-buttons">
                    <button
                      v-if="reviewMode"
                      type="button"
                      class="datahub-row-comment-button"
                      @click="toggleCommentForm(rowCommentContext({content: row.new_content, row_hash: row.new_row_hash}, index, 'after refresh'))"
                    >
                      Comment
                    </button>
                    <a
                      class="datahub-row-issue-link"
                      :href="issueLinkForRow({content: row.new_content, row_hash: row.new_row_hash}, index, 'after refresh')"
                    >
                      Open issue
                    </a>
                  </span>
                </div>
                <form
                  v-if="isCommentFormOpen(rowCommentContext({content: row.new_content, row_hash: row.new_row_hash}, index, 'after refresh'))"
                  class="datahub-inline-comment-form"
                  @submit.prevent="submitInlineComment(rowCommentContext({content: row.new_content, row_hash: row.new_row_hash}, index, 'after refresh'))"
                >
                  <textarea
                    v-model="inlineCommentBody"
                    class="datahub-inline-comment-textarea"
                    placeholder="Leave a row-level review comment"
                  ></textarea>
                  <div class="datahub-inline-comment-actions">
                    <span v-if="commentError" class="datahub-inline-comment-error">{{ commentError }}</span>
                    <button type="button" class="ui small basic button" @click="closeCommentForm">Cancel</button>
                    <button type="submit" class="ui small primary button" :disabled="submittingCommentKey === commentKey(rowCommentContext({content: row.new_content, row_hash: row.new_row_hash}, index, 'after refresh'))">
                      Add comment
                    </button>
                  </div>
                </form>
                <JsonlRowRenderer
                  :row="rowContent({content: row.new_content, row_hash: row.new_row_hash})"
                  :row-number="index + 1"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="ui message" v-else-if="files.length === 0">
          No file changes were reported for this comparison.
        </div>
      </main>
    </div>
  </div>
</template>

<script>
import {datahubFetch} from '../utils/datahub-api.js';
import JsonlRowRenderer from './JsonlRowRenderer.vue';

export default {
  components: {JsonlRowRenderer},
  emits: ['summary-loaded', 'comment-created'],
  props: {
    owner: String,
    repo: String,
    oldCommit: String,
    newCommit: String,
    pullId: [String, Number],
    currentUser: {
      type: String,
      default: '',
    },
    reviewMode: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      files: [],
      activeFile: null,
      activeChanges: null,
      loading: false,
      metaDiff: null,
      summary: null,
      viewedFiles: {},
      hideViewed: false,
      whitespaceMode: 'show',
      openCommentKey: null,
      inlineCommentBody: '',
      submittingCommentKey: null,
      commentError: null,
    };
  },
  computed: {
    visibleFiles() {
      if (!this.hideViewed) return this.files;
      return this.files.filter((file) => !this.isViewed(file.path));
    },
    viewedCount() {
      return this.files.filter((file) => this.isViewed(file.path)).length;
    },
    viewedPercent() {
      if (!this.files.length) return '0%';
      return `${Math.round((this.viewedCount / this.files.length) * 100)}%`;
    },
    activeFileViewed: {
      get() {
        return this.activeFile ? this.isViewed(this.activeFile) : false;
      },
      set(value) {
        if (!this.activeFile) return;
        this.viewedFiles = {
          ...this.viewedFiles,
          [this.activeFile]: value,
        };
        this.ensureVisibleActiveFile();
      },
    },
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
    hasNoRows() {
      return !this.addedRows.length && !this.removedRows.length && !this.refreshedRows.length;
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
    this.$emit('summary-loaded', {summary: this.summary, filesCount: this.files.length});
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
    hideViewed() {
      this.ensureVisibleActiveFile();
    },
  },
  methods: {
    selectFile(path) {
      this.activeFile = path;
    },
    isViewed(path) {
      return Boolean(this.viewedFiles[path]);
    },
    ensureVisibleActiveFile() {
      if (!this.hideViewed || !this.activeFile || !this.isViewed(this.activeFile)) return;
      this.activeFile = this.visibleFiles[0]?.path || this.files[0]?.path || null;
    },
    toggleWhitespace() {
      this.whitespaceMode = this.whitespaceMode === 'show' ? 'ignore' : 'show';
    },
    fileChangeSummary(file) {
      const parts = [];
      if (file.added) parts.push(`+${file.added}`);
      if (file.removed) parts.push(`-${file.removed}`);
      if (file.refreshed) parts.push(`~${file.refreshed}`);
      return parts.length ? parts.join(' ') : 'no row count';
    },
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
    rowHash(row) {
      return row.row_hash || row.new_row_hash || row.old_row_hash || this.rowContent(row).__datahubRowHash || '';
    },
    rowPosition(row, index) {
      return row.position != null ? row.position + 1 : index + 1;
    },
    rowContextLabel(row, index, changeType) {
      const hash = this.rowHash(row);
      const shortHash = hash ? ` ${hash.slice(0, 10)}` : '';
      return `${changeType} row ${this.rowPosition(row, index)}${shortHash}`;
    },
    fileCommentContext() {
      return {
        file_path: this.activeFileData?.path || this.activeFile || '',
        row_hash: null,
        change_type: 'file',
        field_path: null,
      };
    },
    rowCommentContext(row, index, changeType) {
      return {
        file_path: this.activeFileData?.path || this.activeFile || '',
        row_hash: this.rowHash(row) || null,
        change_type: changeType,
        field_path: `row:${this.rowPosition(row, index)}`,
      };
    },
    commentKey(context) {
      return [
        context.file_path || '',
        context.change_type || '',
        context.field_path || '',
        context.row_hash || '',
      ].join('|');
    },
    isCommentFormOpen(context) {
      return this.openCommentKey === this.commentKey(context);
    },
    toggleCommentForm(context) {
      const key = this.commentKey(context);
      this.commentError = null;
      if (this.openCommentKey === key) {
        this.closeCommentForm();
        return;
      }
      this.openCommentKey = key;
      this.inlineCommentBody = '';
    },
    closeCommentForm() {
      this.openCommentKey = null;
      this.inlineCommentBody = '';
      this.commentError = null;
    },
    async submitInlineComment(context) {
      const body = this.inlineCommentBody.trim();
      if (!body || !this.pullId) return;
      const key = this.commentKey(context);
      this.submittingCommentKey = key;
      this.commentError = null;
      const payload = {
        author: this.currentUser || 'reviewer',
        body,
        file_path: context.file_path || null,
        row_hash: context.row_hash || null,
        change_type: context.change_type || null,
        field_path: context.field_path || null,
      };
      try {
        const comment = await datahubFetch(this.owner, this.repo, `/pulls/${this.pullId}/comments`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        this.$emit('comment-created', comment);
        this.closeCommentForm();
      } catch (e) {
        this.commentError = e.message;
      } finally {
        this.submittingCommentKey = null;
      }
    },
    issueLinkForRow(row, index, changeType) {
      const rowHash = this.rowHash(row);
      const path = this.activeFileData?.path || this.activeFile || '';
      const position = this.rowPosition(row, index);
      const title = `[Data row] ${path} ${changeType} row ${position}`.trim();
      const lines = [
        '### Data row context',
        '',
        `path: ${path}`,
        `row_hash: ${rowHash || 'unknown'}`,
        `change: ${changeType}`,
        `row: ${position}`,
        `base_commit: ${this.oldCommit || 'unknown'}`,
        `commit: ${this.newCommit || 'unknown'}`,
        '',
        '### Review notes',
        '',
        '- ',
      ];
      const params = new URLSearchParams({title, body: lines.join('\n')});
      return `/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/issues/new?${params.toString()}`;
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
.datahub-diff-view {
  display: grid;
  gap: 12px;
}

.datahub-diff-header,
.datahub-review-toolbar,
.datahub-meta-delta,
.datahub-file-sidebar,
.datahub-file-diff {
  background: var(--color-box-body);
  border: 1px solid var(--color-secondary);
  border-radius: 6px;
}

.datahub-diff-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.datahub-diff-stat {
  border-right: 1px solid var(--color-secondary);
  display: grid;
  gap: 2px;
  padding: 12px 14px;
}

.datahub-diff-stat:last-child {
  border-right: 0;
}

.datahub-diff-stat strong {
  color: var(--color-text);
  font-size: 18px;
  line-height: 1.2;
}

.datahub-diff-stat span,
.datahub-muted {
  color: var(--color-text-light-2);
  font-size: 12px;
}

.datahub-stat-add {
  color: var(--color-green) !important;
}

.datahub-stat-remove {
  color: var(--color-red) !important;
}

.datahub-stat-refresh {
  color: var(--color-yellow) !important;
}

.datahub-review-toolbar {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  padding: 10px 12px;
}

.datahub-review-progress {
  display: grid;
  flex: 1 1 220px;
  gap: 6px;
}

.datahub-review-progress-track {
  background: var(--color-secondary);
  border-radius: 999px;
  height: 6px;
  overflow: hidden;
}

.datahub-review-progress-fill {
  background: var(--color-green);
  height: 100%;
  transition: width 0.16s ease;
}

.datahub-review-controls {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.datahub-review-toggle {
  align-items: center;
  color: var(--color-text-light);
  display: inline-flex;
  gap: 6px;
  font-size: 13px;
  white-space: nowrap;
}

.datahub-review-control-button {
  background: var(--color-box-body);
  border: 1px solid var(--color-secondary);
  border-radius: 6px;
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  min-height: 30px;
  padding: 0 10px;
}

.datahub-review-control-button.active {
  background: var(--color-info-bg);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.datahub-meta-delta {
  display: grid;
  overflow: hidden;
}

.datahub-meta-delta-row {
  align-items: center;
  border-bottom: 1px solid var(--color-secondary);
  display: flex;
  gap: 8px;
  justify-content: space-between;
  padding: 9px 12px;
}

.datahub-meta-delta-row:last-child {
  border-bottom: 0;
}

.datahub-diff-layout {
  align-items: start;
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(220px, 28%) minmax(0, 1fr);
}

.datahub-file-sidebar {
  max-height: calc(100vh - 180px);
  overflow: auto;
}

.datahub-file-sidebar-header,
.datahub-file-diff-header {
  align-items: center;
  background: var(--color-box-header);
  border-bottom: 1px solid var(--color-secondary);
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 10px 12px;
}

.datahub-file-sidebar-header span,
.datahub-file-diff-header span {
  color: var(--color-text-light-2);
  font-size: 12px;
}

.datahub-file-item {
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--color-secondary);
  color: var(--color-text);
  cursor: pointer;
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  text-align: left;
  width: 100%;
}

.datahub-file-item:last-child {
  border-bottom: 0;
}

.datahub-file-item.active {
  box-shadow: inset 3px 0 0 var(--color-primary);
  background: var(--color-active);
}

.datahub-file-item.viewed:not(.active) {
  color: var(--color-text-light-2);
}

.datahub-file-path {
  font-family: var(--fonts-monospace);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.datahub-file-badges {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.datahub-file-badges span {
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  padding: 0 6px;
}

.datahub-file-viewed {
  background: var(--color-secondary);
  color: var(--color-text-light);
}

.datahub-file-added {
  background: var(--color-diff-added-row-bg, #e6ffec);
  color: var(--color-green);
}

.datahub-file-removed {
  background: var(--color-diff-removed-row-bg, #ffeef0);
  color: var(--color-red);
}

.datahub-file-refreshed {
  background: var(--color-yellow-light);
  color: var(--color-yellow);
}

.datahub-file-empty,
.datahub-empty-diff {
  color: var(--color-text-light-2);
  padding: 16px;
  text-align: center;
}

.datahub-diff-section {
  padding: 12px;
}

.datahub-diff-section + .datahub-diff-section {
  border-top: 1px solid var(--color-secondary);
}

.datahub-diff-section h4 {
  font-size: 14px;
  letter-spacing: 0;
  margin: 0 0 10px;
}

.datahub-diff-row-list {
  border-left: 3px solid var(--color-secondary);
  border-radius: 6px;
  display: grid;
  gap: 10px;
  padding: 10px;
}

.datahub-diff-row-list.positive {
  background: var(--color-diff-added-row-bg, #e6ffec);
  border-left-color: var(--color-green);
}

.datahub-diff-row-list.negative {
  background: var(--color-diff-removed-row-bg, #ffeef0);
  border-left-color: var(--color-red);
}

.datahub-row-review-item {
  display: grid;
  gap: 6px;
}

.datahub-row-actions {
  align-items: center;
  color: var(--color-text-light-2);
  display: flex;
  flex-wrap: wrap;
  font-size: 12px;
  gap: 8px;
  justify-content: space-between;
}

.datahub-file-review-actions,
.datahub-row-action-buttons,
.datahub-inline-comment-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.datahub-row-issue-link,
.datahub-row-comment-button {
  align-items: center;
  background: var(--color-box-body);
  border: 1px solid var(--color-secondary);
  border-radius: 6px;
  color: var(--color-accent);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 24px;
  padding: 0 8px;
  text-decoration: none;
}

.datahub-row-comment-button {
  color: var(--color-text);
}

.datahub-row-issue-link:hover,
.datahub-row-comment-button:hover {
  background: var(--color-active);
  text-decoration: none;
}

.datahub-inline-comment-form {
  background: var(--color-box-header);
  border: 1px solid var(--color-secondary);
  border-radius: 6px;
  display: grid;
  gap: 8px;
  margin: 8px 0;
  padding: 10px;
}

.datahub-inline-comment-textarea {
  background: var(--color-input-background);
  border: 1px solid var(--color-secondary);
  border-radius: 6px;
  color: var(--color-text);
  font: inherit;
  min-height: 76px;
  padding: 8px 10px;
  resize: vertical;
}

.datahub-inline-comment-actions {
  justify-content: flex-end;
}

.datahub-inline-comment-error {
  color: var(--color-red);
  flex: 1;
  font-size: 12px;
}

.datahub-diff-refresh-pair {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.datahub-diff-refresh-side {
  border-radius: 6px;
  padding: 10px;
}

.datahub-diff-refresh-side.negative {
  background: var(--color-diff-removed-row-bg, #ffeef0);
}

.datahub-diff-refresh-side.positive {
  background: var(--color-diff-added-row-bg, #e6ffec);
}

.datahub-diff-side-label {
  color: var(--color-text-light-2);
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.datahub-diff-content {
  font-size: 12px;
  margin: 0;
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.datahub-diff-side {
  border-radius: 3px;
  margin: 2px 0;
  padding: 4px 8px;
}

.datahub-diff-side.negative {
  background-color: var(--color-diff-removed-row-bg, #ffeef0);
}

.datahub-diff-side.positive {
  background-color: var(--color-diff-added-row-bg, #e6ffec);
}

@media (max-width: 900px) {
  .datahub-diff-layout {
    grid-template-columns: 1fr;
  }

  .datahub-file-sidebar {
    max-height: none;
  }
}

@media (max-width: 767px) {
  .datahub-diff-summary,
  .datahub-diff-refresh-pair {
    grid-template-columns: 1fr;
  }

  .datahub-diff-stat {
    border-right: 0;
    border-bottom: 1px solid var(--color-secondary);
  }

  .datahub-diff-stat:last-child {
    border-bottom: 0;
  }

  .datahub-review-toolbar,
  .datahub-file-diff-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .datahub-review-controls {
    justify-content: flex-start;
  }
}
</style>
