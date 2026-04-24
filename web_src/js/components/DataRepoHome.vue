<template>
  <div class="ui segments">
    <!-- Branch selector -->
    <div class="ui segment">
      <div class="ui inline fields">
        <div class="field">
          <select class="ui dropdown" v-model="currentBranch" @change="onBranchChange">
            <option v-for="ref in refs" :key="ref.name" :value="ref.name">
              {{ ref.name.replace('heads/', '') }}
            </option>
          </select>
        </div>
        <div class="field" v-if="stats">
          <span class="ui label">{{ stats.fileCount }} files</span>
          <span class="ui label">{{ stats.rowCount }} rows</span>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div class="ui segment" v-if="loading">
      <div class="ui active centered inline loader"></div>
    </div>

    <!-- Error -->
    <div class="ui segment" v-else-if="error">
      <div class="ui negative message">
        <p>{{ error }}</p>
      </div>
    </div>

    <!-- File tree -->
    <div class="ui segment" v-else-if="tree">
      <table class="ui very basic table">
        <thead>
          <tr>
            <th>Name</th>
            <th class="right aligned">Rows</th>
            <th class="right aligned">Size</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in tree.entries" :key="entry.name">
            <td>
              <i :class="entry.type === 'tree' ? 'folder icon' : 'file outline icon'"></i>
              <a v-if="entry.type === 'manifest'" :href="viewerUrl(entry)">{{ entry.name }}</a>
              <span v-else>{{ entry.name }}</span>
            </td>
            <td class="right aligned">{{ entry.row_count || '—' }}</td>
            <td class="right aligned">{{ formatSize(entry.size) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
import {datahubFetch} from '../utils/datahub-api.js';

export default {
  props: {
    owner: String,
    repo: String,
    defaultBranch: String,
  },
  data() {
    return {
      refs: [],
      currentBranch: '',
      tree: null,
      stats: null,
      loading: true,
      error: null,
    };
  },
  async mounted() {
    try {
      const refsData = await datahubFetch(this.owner, this.repo, '/refs');
      this.refs = refsData.filter((r) => r.name.startsWith('heads/'));
      this.currentBranch = this.refs.find((r) => r.name === `heads/${this.defaultBranch}`)?.name || this.refs[0]?.name || '';
      if (this.currentBranch) await this.loadTree();
    } catch (e) {
      this.error = e.message;
    } finally {
      this.loading = false;
    }
  },
  methods: {
    async onBranchChange() {
      this.loading = true;
      this.error = null;
      try {
        await this.loadTree();
      } catch (e) {
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    },
    async loadTree() {
      const ref = await datahubFetch(this.owner, this.repo, `/refs/${this.currentBranch}`);
      this.tree = await datahubFetch(this.owner, this.repo, `/tree/${ref.target_hash}`);
      let totalRows = 0;
      let fileCount = 0;
      for (const entry of this.tree.entries || []) {
        if (entry.type === 'manifest') {
          fileCount++;
          totalRows += entry.row_count || 0;
        }
      }
      this.stats = {fileCount, rowCount: totalRows};
    },
    viewerUrl(entry) {
      const branch = this.currentBranch.replace('heads/', '');
      return `/${this.owner}/${this.repo}/src/branch/${branch}/${entry.name}`;
    },
    formatSize(bytes) {
      if (!bytes) return '—';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / 1048576).toFixed(1)} MB`;
    },
  },
};
</script>
