<template>
  <div class="ui segment datahub-viewer">
    <!-- Header -->
    <div class="ui top attached header datahub-viewer-header">
      <div>
        <div class="datahub-viewer-title">{{ filePath }}</div>
        <div class="datahub-viewer-subtitle">JSONL row preview</div>
      </div>
      <span class="ui label" v-if="totalRows">{{ totalRows.toLocaleString() }} rows</span>
    </div>

    <div class="ui attached segment datahub-viewer-tools" v-if="!loading && !error && totalRows">
      <form
        class="datahub-row-jump-form"
        data-testid="datahub-row-jump-form"
        @submit.prevent="jumpToRow"
      >
        <label for="datahub-row-jump-input">Go to row</label>
        <div class="ui action input">
          <input
            id="datahub-row-jump-input"
            v-model="rowJumpValue"
            data-testid="datahub-row-jump-input"
            type="number"
            min="1"
            :max="totalRows || undefined"
            inputmode="numeric"
            placeholder="Row number"
          >
          <button class="ui button" type="button" @click="jumpToRow">Go</button>
        </div>
      </form>
      <form
        class="datahub-row-search-form"
        data-testid="datahub-row-search-form"
        @submit.prevent="searchRows"
      >
        <label for="datahub-row-search-input">Search file</label>
        <div class="ui action input">
          <input
            id="datahub-row-search-input"
            v-model="searchQuery"
            data-testid="datahub-row-search-input"
            type="search"
            placeholder="Search JSONL rows"
          >
          <button class="ui button" type="button" :class="{loading: searchLoading}" :disabled="searchLoading" @click="searchRows">Search</button>
        </div>
      </form>
    </div>
    <div v-if="rowJumpError || searchError" class="ui attached segment datahub-viewer-feedback">
      <div v-if="rowJumpError" class="ui small negative message">{{ rowJumpError }}</div>
      <div v-if="searchError" class="ui small negative message">{{ searchError }}</div>
    </div>
    <div v-if="searchResults.length" class="ui attached segment datahub-search-results">
      <div class="datahub-search-results-header">
        <strong>{{ searchResults.length }} {{ searchResults.length === 1 ? 'match' : 'matches' }}</strong>
        <span v-if="searchTotalScanned">scanned {{ searchTotalScanned.toLocaleString() }} rows</span>
        <span v-if="searchLimitReached">showing first {{ searchResults.length.toLocaleString() }}</span>
      </div>
      <button
        v-for="result in searchResults"
        :key="`${result.file}:${result.row_index}:${result.row_hash || ''}`"
        type="button"
        class="datahub-search-result"
        :data-testid="`datahub-search-result-${result.row_index}`"
        @click="goToRowIndex(result.row_index)"
      >
        <span>Row {{ result.row_index + 1 }}</span>
        <small>{{ result.highlight || rowSummary(result.content) }}</small>
      </button>
    </div>
    <div v-if="openIssueCount" class="ui attached warning message datahub-open-issue-warning">
      <div>
        <strong>{{ openIssueCount }} {{ openIssueCount === 1 ? 'open data issue' : 'open data issues' }}</strong>
        affect this preview. Resolve them before final export.
      </div>
      <a class="ui tiny basic button" :href="openIssuesHref">View issues</a>
    </div>

    <div v-if="loading" class="ui attached segment">
      <div class="datahub-viewer-loading">
        <div class="ui active inline loader"></div>
        <div>
          <strong>Loading rows</strong>
          <p>Fetching the first 50 JSONL rows.</p>
        </div>
      </div>
    </div>
    <div v-else-if="error" class="ui attached segment">
      <div class="ui negative message">{{ error }}</div>
    </div>
    <div v-else-if="rows.length === 0" class="ui attached segment">
      <div class="ui message">This JSONL manifest has no rows.</div>
    </div>

    <div v-else-if="singleRowMode" class="datahub-row-review">
      <aside class="datahub-row-index" aria-label="JSONL rows">
        <div class="datahub-row-index-list">
          <button
            v-for="(row, idx) in rows"
            :key="row.__datahubRowHash || idx"
            type="button"
            class="datahub-row-index-item"
            :class="{active: idx === selectedRowOffset, 'has-open-issue': rowIssues(row).length}"
            @click="selectRowOffset(idx)"
          >
            <span>
              Row {{ startIndex + idx + 1 }}
              <span v-if="rowIssues(row).length" class="ui mini red label datahub-row-issue-count">{{ rowIssues(row).length }}</span>
            </span>
            <small>{{ rowSummary(row) }}</small>
          </button>
        </div>
        <div class="datahub-row-pagination" v-if="totalPages > 1">
          <button
            type="button"
            class="datahub-row-page-button"
            :disabled="currentPage <= 1"
            @click="goPage(currentPage - 1)"
          >
            Prev
          </button>
          <span>Page {{ currentPage }} / {{ totalPages }}</span>
          <button
            type="button"
            class="datahub-row-page-button"
            :disabled="currentPage >= totalPages"
            @click="goPage(currentPage + 1)"
          >
            Next
          </button>
        </div>
      </aside>
      <section class="datahub-selected-row" ref="selectedRowPreview">
        <div class="datahub-selected-row-actions">
          <div>
            <strong>Row {{ selectedRowNumber }}</strong>
            <span v-if="responsibleOwner(selectedRow)" class="datahub-row-owner">owner: {{ responsibleOwner(selectedRow) }}</span>
          </div>
          <div class="datahub-selected-row-buttons">
            <a
              class="ui small basic button datahub-preview-issue-link"
              :href="issueLinkForRow(selectedRow, selectedRowNumber)"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open issue
            </a>
            <a
              v-if="rowIssues(selectedRow).length"
              class="ui small red basic button"
              :href="issueHref(rowIssues(selectedRow)[0])"
            >
              {{ rowIssues(selectedRow).length }} open
            </a>
          </div>
        </div>
        <JsonlRowRenderer
          v-if="Array.isArray(selectedRow?.messages)"
          :row="selectedRow"
          :row-number="selectedRowNumber"
        />
        <div v-else class="datahub-selected-row-raw">
          <div class="datahub-selected-row-title">Row {{ selectedRowNumber }}</div>
          <pre>{{ formatJson(selectedRow) }}</pre>
        </div>
      </section>
    </div>

    <!-- ML2/SFT conversation preview -->
    <div v-else-if="usesStructuredRows" class="datahub-sft-row-list">
      <JsonlRowRenderer
        v-for="(row, idx) in visibleRows"
        :key="startIndex + idx"
        :row="row"
        :row-number="startIndex + idx + 1"
      />
    </div>

    <!-- Table fallback -->
    <div v-else class="datahub-jsonl-table" ref="scrollContainer" @scroll="onScroll">
      <table class="ui very basic compact table">
        <thead>
          <tr>
            <th class="collapsing">#</th>
            <th v-for="col in columns" :key="col" :style="{minWidth: '150px'}">{{ col }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in visibleRows" :key="startIndex + idx">
            <td class="collapsing">{{ startIndex + idx + 1 }}</td>
            <td
              v-for="col in columns"
              :key="col"
              :class="{'datahub-complex-cell': isComplex(row[col])}"
              @click="toggleExpand(startIndex + idx, col)"
            >
              <div :class="{'datahub-cell-truncated': !isExpanded(startIndex + idx, col)}">
                {{ formatCell(row[col]) }}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="ui bottom attached segment" v-if="totalPages > 1 && !singleRowMode">
      <div class="ui pagination menu">
        <a class="item" :class="{disabled: currentPage <= 1}" @click="goPage(currentPage - 1)">Prev</a>
        <div class="item">Page {{ currentPage }} / {{ totalPages }}</div>
        <a class="item" :class="{disabled: currentPage >= totalPages}" @click="goPage(currentPage + 1)">Next</a>
      </div>
    </div>
  </div>
</template>

<script>
import {datahubFetch} from '../utils/datahub-api.js';
import {createVirtualScroll} from '../utils/virtual-scroll.js';
import JsonlRowRenderer from './JsonlRowRenderer.vue';

const PAGE_SIZE = 50;
const PLACEHOLDER_ROW_HASH_PATTERN = /^row-\d+$/i;
const DATAHUB_ROW_CONTEXT_MARKER = 'datahub-row-context';

export default {
  components: {JsonlRowRenderer},
  emits: ['open-issues-loaded'],
  props: {
    owner: String,
    repo: String,
    commitHash: String,
    filePath: String,
    singleRowMode: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      rows: [],
      columns: [],
      loading: true,
      error: null,
      totalRows: 0,
      currentPage: 1,
      totalPages: 1,
      expandedCells: new Set(),
      startIndex: 0,
      chunks: [],
      loadedChunks: {},
      virtualScroll: null,
      selectedRowOffset: 0,
      rowJumpValue: '',
      rowJumpError: null,
      searchQuery: '',
      searchLoading: false,
      searchError: null,
      searchResults: [],
      searchTotalScanned: 0,
      searchLimitReached: false,
      openIssuesByRowHash: {},
      openIssueCount: 0,
      openIssuesHref: '',
    };
  },
  computed: {
    usesStructuredRows() {
      return this.rows.some((row) => Array.isArray(row?.messages));
    },
    visibleRows() {
      if (this.usesStructuredRows) {
        return this.rows;
      }
      if (this.virtualScroll) {
        return this.virtualScroll.visibleItems;
      }
      const start = (this.currentPage - 1) * PAGE_SIZE;
      return this.rows.slice(start, start + PAGE_SIZE);
    },
    selectedRow() {
      return this.rows[this.selectedRowOffset] || null;
    },
    selectedRowNumber() {
      return this.startIndex + this.selectedRowOffset + 1;
    },
  },
  watch: {
    rows(newRows) {
      if (newRows.length > 0) {
        this.virtualScroll = createVirtualScroll({
          items: newRows,
          itemHeight: 36,
          containerHeight: 600,
        });
      }
      this.resetSelectedRowScroll();
    },
    selectedRowOffset() {
      this.resetSelectedRowScroll();
    },
  },
  async mounted() {
    try {
      await this.loadManifest();
    } catch (e) {
      this.error = e.message;
    } finally {
      this.loading = false;
    }
  },
  methods: {
    async loadManifest() {
      const manifest = await datahubFetch(
        this.owner,
        this.repo,
        `/manifest/${this.commitHash}/${this.encodePath(this.filePath)}?offset=0&limit=${PAGE_SIZE}`,
      );
      this.totalRows = manifest.total || 0;
      this.totalPages = Math.max(1, Math.ceil(this.totalRows / PAGE_SIZE));
      this.rows = await this.loadRows(manifest.entries || []);
      this.startIndex = manifest.offset || 0;
      this.loadedChunks[0] = true;
      if (this.rows.length > 0 && this.columns.length === 0) {
        this.columns = this.deriveColumns(this.rows);
      }
      await this.loadOpenRowIssues();
    },
    async loadRows(entries) {
      return Promise.all(entries.map((entry) => this.loadRow(entry)));
    },
    async loadRow(entry) {
      const inlineRow = this.extractInlineRow(entry);
      if (inlineRow) return inlineRow;

      if (!this.isFetchableRowHash(entry?.row_hash)) {
        return {
          __datahubRowHash: entry?.row_hash || null,
          __datahubPreviewError: 'Row object is not available in this manifest entry.',
        };
      }

      const data = await datahubFetch(this.owner, this.repo, `/objects/rows/${entry.row_hash}`);
      return {
        ...data,
        __datahubRowHash: entry.row_hash,
      };
    },
    extractInlineRow(entry) {
      for (const key of ['row', 'content', 'json', 'data', 'raw_json', 'raw']) {
        const value = entry?.[key];
        if (value === undefined || value === null) continue;
        const row = this.parseInlineRowValue(value);
        if (row) {
          return {
            ...row,
            ...(this.isFetchableRowHash(entry?.row_hash) ? {__datahubRowHash: entry.row_hash} : {}),
          };
        }
      }
      return null;
    },
    parseInlineRowValue(value) {
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
      return typeof value === 'object' && !Array.isArray(value) ? value : null;
    },
    isFetchableRowHash(rowHash) {
      if (!rowHash || PLACEHOLDER_ROW_HASH_PATTERN.test(String(rowHash))) return false;
      return true;
    },
    async loadPage(page) {
      const offset = (page - 1) * PAGE_SIZE;
      await this.loadOffset(offset);
      this.currentPage = page;
    },
    async loadOffset(offset) {
      const manifest = await datahubFetch(
        this.owner,
        this.repo,
        `/manifest/${this.commitHash}/${this.encodePath(this.filePath)}?offset=${offset}&limit=${PAGE_SIZE}`,
      );
      this.rows = await this.loadRows(manifest.entries || []);
      this.startIndex = offset;
      this.selectedRowOffset = 0;
      if (this.rows.length > 0 && this.columns.length === 0) {
        this.columns = this.deriveColumns(this.rows);
      }
      await this.loadOpenRowIssues();
    },
    async jumpToRow() {
      this.rowJumpError = null;
      const rowNumber = Number.parseInt(this.rowJumpValue);
      if (!Number.isFinite(rowNumber) || rowNumber < 1 || rowNumber > this.totalRows) {
        this.rowJumpError = `Enter a row number between 1 and ${this.totalRows.toLocaleString()}.`;
        return;
      }
      await this.goToRowIndex(rowNumber - 1);
    },
    async goToRowIndex(rowIndex) {
      if (!Number.isFinite(rowIndex) || rowIndex < 0 || rowIndex >= this.totalRows) return;
      const page = Math.floor(rowIndex / PAGE_SIZE) + 1;
      const offset = (page - 1) * PAGE_SIZE;
      if (page !== this.currentPage) {
        await this.loadOffset(offset);
        this.currentPage = page;
      }
      this.selectedRowOffset = rowIndex - offset;
      this.rowJumpValue = String(rowIndex + 1);
    },
    async selectRowOffset(offset) {
      this.selectedRowOffset = offset;
      await this.resetSelectedRowScroll();
    },
    async resetSelectedRowScroll() {
      await this.$nextTick();
      const preview = this.$refs.selectedRowPreview;
      if (preview) {
        preview.scrollTop = 0;
        for (const child of preview.querySelectorAll('*')) {
          if (child.scrollTop) child.scrollTop = 0;
        }
      }
    },
    async searchRows() {
      const query = this.searchQuery.trim();
      this.searchError = null;
      this.searchResults = [];
      this.searchTotalScanned = 0;
      this.searchLimitReached = false;
      if (!query) {
        this.searchError = 'Enter a search query.';
        return;
      }

      this.searchLoading = true;
      try {
        const result = await datahubFetch(this.owner, this.repo, '/search', {
          method: 'POST',
          body: JSON.stringify({
            ref: this.commitHash,
            query,
            file: this.filePath,
            limit: 50,
          }),
        });
        this.searchResults = result.matches || [];
        this.searchTotalScanned = result.total_scanned || 0;
        this.searchLimitReached = Boolean(result.limit_reached);
        if (!this.searchResults.length) {
          this.searchError = 'No matching rows in this file.';
        }
      } catch (e) {
        this.searchError = e.message;
      } finally {
        this.searchLoading = false;
      }
    },
    deriveColumns(rows) {
      const seen = new Set();
      for (const row of rows) {
        for (const key of Object.keys(row)) {
          if (!key.startsWith('__')) seen.add(key);
        }
      }
      const preferred = [
        'instruction',
        'input',
        'output',
        'response',
        'chosen',
        'rejected',
        'messages',
        'prompt',
        'completion',
        'reasoning_content',
        'tools',
        'metadata',
      ];
      const columns = [];
      for (const key of preferred) {
        if (seen.delete(key)) columns.push(key);
      }
      return columns.concat(Array.from(seen).sort());
    },
    formatCell(value) {
      if (value === null || value === undefined) return '—';
      const text = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
      return text.length > 360 ? `${text.slice(0, 360)}…` : text;
    },
    formatJson(value) {
      return JSON.stringify(value, null, 2);
    },
    encodePath(path) {
      return String(path || '').split('/').map(encodeURIComponent).join('/');
    },
    rowSummary(row) {
      if (!row) return 'empty';
      if (Array.isArray(row.messages)) {
        const roles = row.messages.map((message) => message.role || 'message').join(' → ');
        return roles || 'messages';
      }
      const keys = Object.keys(row).filter((key) => !key.startsWith('__')).slice(0, 4);
      return keys.join(', ') || 'json';
    },
    rowHash(row) {
      return row?.__datahubRowHash || row?.row_hash || row?.hash || null;
    },
    responsibleOwner(row) {
      return row?.meta_info?.owner ||
        row?.meta_info?.responsible_owner ||
        row?.meta_info?.assignee ||
        row?.metadata?.owner ||
        row?.owner ||
        '';
    },
    issueLinkForRow(row, rowNumber) {
      const title = `[Data issue] ${this.filePath} row ${rowNumber}`;
      const lines = [
        '<!-- datahub-row-context -->',
        'datahub-row-context: true',
        '### Data row context',
        '',
        `path: ${this.filePath}`,
        `commit: ${this.commitHash || 'unknown'}`,
        `row: ${rowNumber}`,
        `row_hash: ${this.rowHash(row) || 'unknown'}`,
        `responsible_owner: ${this.responsibleOwner(row) || 'unknown'}`,
        '',
        '### Issue description',
        '',
        '- ',
      ];
      const params = new URLSearchParams({title, body: lines.join('\n')});
      return `/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/issues/new?${params.toString()}`;
    },
    async loadOpenRowIssues() {
      this.openIssuesHref = this.issueListHref();
      this.openIssuesByRowHash = {};
      this.openIssueCount = 0;
      if (!this.singleRowMode || !this.rows.length) {
        this.$emit('open-issues-loaded', {count: 0, href: this.openIssuesHref, issues: []});
        return;
      }

      try {
        const params = new URLSearchParams({
          state: 'open',
          type: 'issues',
          q: DATAHUB_ROW_CONTEXT_MARKER,
          limit: '50',
        });
        const response = await fetch(`/api/v1/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/issues?${params.toString()}`, {
          headers: {
            'Content-Type': 'application/json',
            'X-Csrf-Token': document.querySelector('meta[name=_csrf]')?.content || '',
          },
        });
        if (!response.ok) throw new Error(`Issue API ${response.status}`);
        const issues = await response.json();
        this.applyOpenIssues(Array.isArray(issues) ? issues : []);
      } catch {
        this.$emit('open-issues-loaded', {count: 0, href: this.openIssuesHref, issues: []});
      }
    },
    applyOpenIssues(issues) {
      const byRowHash = {};
      const linkedIssues = [];
      for (const issue of issues) {
        if (issue?.state && issue.state !== 'open') continue;
        const body = String(issue?.body || '');
        if (!body.includes(DATAHUB_ROW_CONTEXT_MARKER)) continue;
        if (!body.includes(`path: ${this.filePath}`)) continue;
        if (this.commitHash && !body.includes(`commit: ${this.commitHash}`)) continue;
        for (const row of this.rows) {
          const rowHash = this.rowHash(row);
          if (!rowHash || !body.includes(`row_hash: ${rowHash}`)) continue;
          if (!byRowHash[rowHash]) byRowHash[rowHash] = [];
          byRowHash[rowHash].push(issue);
          linkedIssues.push(issue);
        }
      }
      this.openIssuesByRowHash = byRowHash;
      this.openIssueCount = new Set(linkedIssues.map((issue) => issue.id || issue.number || issue.html_url || issue.title)).size;
      this.$emit('open-issues-loaded', {
        count: this.openIssueCount,
        href: this.openIssuesHref,
        issues: linkedIssues,
      });
    },
    rowIssues(row) {
      const rowHash = this.rowHash(row);
      return rowHash ? (this.openIssuesByRowHash[rowHash] || []) : [];
    },
    issueHref(issue) {
      return issue?.html_url || `/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/issues/${issue?.number || issue?.index || ''}`;
    },
    issueListHref() {
      const params = new URLSearchParams({
        q: DATAHUB_ROW_CONTEXT_MARKER,
        type: 'issues',
        state: 'open',
      });
      return `/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/issues?${params.toString()}`;
    },
    isComplex(value) {
      return value !== null && typeof value === 'object';
    },
    toggleExpand(rowIdx, col) {
      const key = `${rowIdx}:${col}`;
      if (this.expandedCells.has(key)) {
        this.expandedCells.delete(key);
      } else {
        this.expandedCells.add(key);
      }
    },
    isExpanded(rowIdx, col) {
      return this.expandedCells.has(`${rowIdx}:${col}`);
    },
    async goPage(page) {
      if (page < 1 || page > this.totalPages) return;
      await this.loadPage(page);
    },
    onScroll(event) {
      if (this.virtualScroll) {
        this.virtualScroll.onScroll(event);
        this.startIndex = this.virtualScroll.startIndex;
      }
    },
  },
};
</script>

<style scoped>
.datahub-jsonl-table {
  max-height: 600px;
  overflow: auto;
  border: 1px solid var(--color-secondary);
  border-top: 0;
}

.datahub-viewer-loading {
  align-items: center;
  color: var(--color-text-light-2);
  display: flex;
  gap: 12px;
  min-height: 96px;
}

.datahub-viewer-loading strong {
  color: var(--color-text);
}

.datahub-viewer-loading p {
  margin: 2px 0 0;
}

.datahub-sft-row-list {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--color-secondary);
  border-top: 0;
  background: var(--color-body);
}

.datahub-viewer-tools {
  align-items: end;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.datahub-row-jump-form,
.datahub-row-search-form {
  display: grid;
  gap: 4px;
}

.datahub-row-jump-form label,
.datahub-row-search-form label {
  color: var(--color-text-light-2);
  font-size: 12px;
  font-weight: 600;
}

.datahub-row-jump-form input {
  width: 130px;
}

.datahub-row-search-form {
  flex: 1 1 280px;
}

.datahub-row-search-form .input {
  width: 100%;
}

.datahub-viewer-feedback {
  display: grid;
  gap: 8px;
}

.datahub-viewer-feedback .message {
  margin: 0;
}

.datahub-open-issue-warning {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.datahub-search-results {
  background: var(--color-box-header);
  display: grid;
  gap: 6px;
  max-height: 220px;
  overflow: auto;
}

.datahub-search-results-header {
  align-items: center;
  color: var(--color-text-light-2);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
}

.datahub-search-result {
  background: var(--color-box-body);
  border: 1px solid var(--color-secondary);
  border-radius: 6px;
  color: var(--color-text);
  cursor: pointer;
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  text-align: left;
}

.datahub-search-result:hover {
  border-color: var(--color-primary-light-4);
}

.datahub-search-result span {
  font-weight: 600;
}

.datahub-search-result small {
  color: var(--color-text-light-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.datahub-row-review {
  border: 1px solid var(--color-secondary);
  border-top: 0;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  height: min(760px, calc(100vh - 260px));
  min-height: 520px;
  overflow: hidden;
}

.datahub-row-index {
  background: var(--color-box-header);
  border-right: 1px solid var(--color-secondary);
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-height: 0;
  overflow: hidden;
}

.datahub-row-index-list {
  min-height: 0;
  overflow: auto;
  padding: 8px;
}

.datahub-row-index-item {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--color-text);
  cursor: pointer;
  display: block;
  margin: 0 0 4px;
  padding: 8px;
  text-align: left;
  width: 100%;
}

.datahub-row-index-item.active {
  background: var(--color-active);
  border-color: var(--color-primary-light-4);
}

.datahub-row-index-item.has-open-issue {
  border-color: var(--color-red);
}

.datahub-row-index-item span {
  align-items: center;
  display: flex;
  gap: 6px;
  font-weight: 600;
  justify-content: space-between;
}

.datahub-row-issue-count {
  margin-left: auto !important;
}

.datahub-row-owner {
  color: var(--color-text-light-2);
  font-size: 12px;
  font-weight: 400;
  margin-left: 8px;
}

.datahub-selected-row-actions {
  align-items: center;
  background: var(--color-box-header);
  border: 1px solid var(--color-secondary);
  border-radius: 6px;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 8px 10px;
}

.datahub-selected-row-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.datahub-row-index-item > span {
  font-weight: 600;
}

.datahub-row-index-item small {
  color: var(--color-text-light-2);
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.datahub-selected-row {
  background: var(--color-body);
  min-height: 0;
  overflow: auto;
  padding: 12px;
}

.datahub-row-pagination {
  align-items: center;
  background: var(--color-box-header);
  border-top: 1px solid var(--color-secondary);
  display: grid;
  gap: 6px;
  grid-template-columns: 1fr;
  padding: 8px;
}

.datahub-row-pagination span {
  color: var(--color-text-light);
  font-size: 12px;
  text-align: center;
}

.datahub-row-page-button {
  background: var(--color-box-body);
  border: 1px solid var(--color-secondary);
  border-radius: 6px;
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 28px;
  padding: 0 10px;
}

.datahub-row-page-button:hover:not(:disabled) {
  background: var(--color-active);
}

.datahub-row-page-button:disabled {
  color: var(--color-text-light-2);
  cursor: not-allowed;
  opacity: 0.7;
}

.datahub-selected-row-raw {
  border: 1px solid var(--color-secondary);
  border-radius: 8px;
  background: var(--color-box-body);
  padding: 12px;
}

.datahub-selected-row-title {
  font-weight: 600;
  margin-bottom: 8px;
}

.datahub-selected-row-raw pre {
  background: var(--color-code-bg);
  border-radius: 6px;
  overflow: auto;
  padding: 12px;
}
.datahub-cell-truncated {
  max-width: 360px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.datahub-viewer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.datahub-viewer-title {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.datahub-viewer-subtitle {
  color: var(--color-text-light-2);
  font-size: 12px;
  font-weight: 400;
}

.datahub-complex-cell {
  font-family: var(--fonts-monospace);
  white-space: pre-wrap;
}

@media (max-width: 767px) {
  .datahub-viewer-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .datahub-viewer-tools {
    align-items: stretch;
    flex-direction: column;
  }

  .datahub-row-review {
    height: auto;
    grid-template-columns: 1fr;
  }

  .datahub-row-index {
    border-right: 0;
    border-bottom: 1px solid var(--color-secondary);
    max-height: 320px;
  }
}
</style>
