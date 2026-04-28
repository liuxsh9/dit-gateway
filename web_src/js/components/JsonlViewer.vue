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

    <div v-if="loading" class="ui attached segment">
      <div class="ui active centered inline loader"></div>
    </div>
    <div v-else-if="error" class="ui attached segment">
      <div class="ui negative message">{{ error }}</div>
    </div>
    <div v-else-if="rows.length === 0" class="ui attached segment">
      <div class="ui message">This JSONL manifest has no rows.</div>
    </div>

    <div v-else-if="singleRowMode" class="datahub-row-review">
      <aside class="datahub-row-index" aria-label="JSONL rows">
        <button
          v-for="(row, idx) in rows"
          :key="row.__datahubRowHash || idx"
          type="button"
          class="datahub-row-index-item"
          :class="{active: idx === selectedRowOffset}"
          @click="selectedRowOffset = idx"
        >
          <span>Row {{ startIndex + idx + 1 }}</span>
          <small>{{ rowSummary(row) }}</small>
        </button>
      </aside>
      <section class="datahub-selected-row">
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
    <div class="ui bottom attached segment" v-if="totalPages > 1">
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

export default {
  components: {JsonlRowRenderer},
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
    };
  },
  computed: {
    usesStructuredRows() {
      return this.rows.some((row) => Array.isArray(row?.messages));
    },
    visibleRows() {
      if (this.usesStructuredRows) {
        const start = (this.currentPage - 1) * PAGE_SIZE;
        return this.rows.slice(start, start + PAGE_SIZE);
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
  async mounted() {
    try {
      await this.loadManifest();
    } catch (e) {
      this.error = e.message;
    } finally {
      this.loading = false;
    }
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
    },
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
      this.loadedChunks[0] = true;
      if (this.rows.length > 0 && this.columns.length === 0) {
        this.columns = this.deriveColumns(this.rows);
      }
    },
    async loadRows(entries) {
      const rows = [];
      for (const entry of entries) {
        const data = await datahubFetch(this.owner, this.repo, `/objects/rows/${entry.row_hash}`);
        rows.push({
          ...data,
          __datahubRowHash: entry.row_hash,
        });
      }
      return rows;
    },
    async loadPage(page) {
      const offset = (page - 1) * PAGE_SIZE;
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
      return columns.concat([...seen].sort());
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
      this.currentPage = page;
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

.datahub-sft-row-list {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--color-secondary);
  border-top: 0;
  background: var(--color-body);
}

.datahub-row-review {
  border: 1px solid var(--color-secondary);
  border-top: 0;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  min-height: 520px;
}

.datahub-row-index {
  background: var(--color-box-header);
  border-right: 1px solid var(--color-secondary);
  max-height: 680px;
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

.datahub-row-index-item span {
  display: block;
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
  overflow: auto;
  padding: 12px;
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

  .datahub-row-review {
    grid-template-columns: 1fr;
  }

  .datahub-row-index {
    border-right: 0;
    border-bottom: 1px solid var(--color-secondary);
    max-height: 220px;
  }
}
</style>
