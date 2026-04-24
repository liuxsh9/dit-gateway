<template>
  <div class="ui segment">
    <!-- Header -->
    <div class="ui top attached header">
      <span>{{ filePath }}</span>
      <span class="ui label" v-if="totalRows">{{ totalRows }} rows</span>
    </div>

    <!-- Table -->
    <div class="datahub-jsonl-table" ref="scrollContainer" @scroll="onScroll">
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
            <td v-for="col in columns" :key="col" @click="toggleExpand(startIndex + idx, col)">
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

const PAGE_SIZE = 50;

export default {
  props: {
    owner: String,
    repo: String,
    manifestHash: String,
    filePath: String,
  },
  data() {
    return {
      rows: [],
      columns: [],
      totalRows: 0,
      currentPage: 1,
      totalPages: 1,
      expandedCells: new Set(),
      startIndex: 0,
    };
  },
  computed: {
    visibleRows() {
      const start = (this.currentPage - 1) * PAGE_SIZE;
      return this.rows.slice(start, start + PAGE_SIZE);
    },
  },
  async mounted() {
    await this.loadManifest();
  },
  methods: {
    async loadManifest() {
      const manifest = await datahubFetch(this.owner, this.repo, `/manifest/${this.manifestHash}`);
      this.totalRows = manifest.row_count || 0;
      this.totalPages = Math.ceil(this.totalRows / PAGE_SIZE);
      if (manifest.chunks && manifest.chunks.length > 0) {
        await this.loadChunk(manifest.chunks[0]);
      }
    },
    async loadChunk(chunkHash) {
      const data = await datahubFetch(this.owner, this.repo, `/objects/${chunkHash}`);
      if (typeof data === 'string') {
        this.rows = data.split('\n').filter(Boolean).map((line) => JSON.parse(line));
      } else if (Array.isArray(data)) {
        this.rows = data;
      }
      if (this.rows.length > 0) {
        this.columns = Object.keys(this.rows[0]);
      }
    },
    formatCell(value) {
      if (value === null || value === undefined) return '—';
      if (typeof value === 'object') return JSON.stringify(value).slice(0, 200);
      return String(value).slice(0, 200);
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
    goPage(page) {
      if (page < 1 || page > this.totalPages) return;
      this.currentPage = page;
      this.startIndex = (page - 1) * PAGE_SIZE;
    },
    onScroll() {
      // placeholder for virtual scroll enhancement
    },
  },
};
</script>

<style scoped>
.datahub-jsonl-table {
  max-height: 600px;
  overflow: auto;
}
.datahub-cell-truncated {
  max-width: 300px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
</style>
