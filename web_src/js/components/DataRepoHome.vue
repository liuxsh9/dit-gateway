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
            <th class="right aligned">Tokens</th>
            <th class="right aligned">Lang</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in tree.entries" :key="entry.name">
            <td>
              <i :class="entry.type === 'tree' ? 'folder icon' : 'file outline icon'"></i>
              <a v-if="entry.type === 'manifest'" href="#" @click.prevent="selectFile(entry)">{{ entry.name }}</a>
              <span v-else>{{ entry.name }}</span>
            </td>
            <td class="right aligned">{{ entry.row_count || '—' }}</td>
            <td class="right aligned">{{ formatSize(entry.size) }}</td>
            <td class="right aligned">
              <template v-if="entry.type === 'manifest'">
                <span v-if="sidecars[entry.name]">
                  {{ formatTokens(sidecars[entry.name].token_estimate) }}
                </span>
                <span v-else-if="sidecars[entry.name] === null">
                  <span>—</span>
                  <button
                    class="ui mini basic button"
                    :class="{loading: computingMeta[entry.name]}"
                    :disabled="computingMeta[entry.name]"
                    @click="computeMeta(entry)"
                  >Compute</button>
                </span>
              </template>
              <span v-else>—</span>
            </td>
            <td class="right aligned">
              <template v-if="entry.type === 'manifest' && sidecars[entry.name]">
                {{ formatLang(sidecars[entry.name].lang_distribution) }}
              </template>
              <span v-else>—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- JSONL Viewer -->
    <div class="ui segment" v-if="selectedFile">
      <div class="ui secondary menu">
        <a class="item" @click="clearSelection"><i class="arrow left icon"></i> Back to file list</a>
        <div class="item"><strong>{{ selectedFile.name }}</strong></div>
      </div>
      <JsonlViewer
        :owner="owner"
        :repo="repo"
        :manifest-hash="selectedFile.hash"
        :file-path="selectedFile.name"
      />
    </div>
  </div>
</template>

<script>
import {datahubFetch} from '../utils/datahub-api.js';
import JsonlViewer from './JsonlViewer.vue';

export default {
  components: {JsonlViewer},
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
      selectedFile: null,
      sidecars: {},
      computingMeta: {},
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
      const commitHash = ref.target_hash;
      this.tree = await datahubFetch(this.owner, this.repo, `/tree/${commitHash}`);
      let totalRows = 0;
      let fileCount = 0;
      const sidecars = {};
      for (const entry of this.tree.entries || []) {
        if (entry.type === 'manifest') {
          fileCount++;
          totalRows += entry.row_count || 0;
          try {
            const summary = await datahubFetch(
              this.owner, this.repo,
              `/meta/${commitHash}/${encodeURIComponent(entry.name)}/summary`,
            );
            sidecars[entry.name] = summary;
          } catch {
            sidecars[entry.name] = null;
          }
        }
      }
      this.sidecars = sidecars;
      this.stats = {fileCount, rowCount: totalRows};
    },
    selectFile(entry) {
      this.selectedFile = entry;
    },
    clearSelection() {
      this.selectedFile = null;
    },
    formatSize(bytes) {
      if (!bytes) return '—';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / 1048576).toFixed(1)} MB`;
    },
    formatTokens(n) {
      if (!n && n !== 0) return '—';
      if (n >= 1000000) return `~${(n / 1000000).toFixed(2)}M`;
      if (n >= 1000) return `~${(n / 1000).toFixed(0)}K`;
      return String(n);
    },
    formatLang(dist) {
      if (!dist || Object.keys(dist).length === 0) return '—';
      const top = Object.entries(dist).sort((a, b) => b[1] - a[1])[0];
      return `${top[0]} ${Math.round(top[1] * 100)}%`;
    },
    async computeMeta(entry) {
      this.computingMeta = {...this.computingMeta, [entry.name]: true};
      try {
        await datahubFetch(this.owner, this.repo, '/meta/compute', {
          method: 'POST',
          body: JSON.stringify({file: entry.name}),
        });
        await this.loadTree();
      } catch {
        // Silently ignore; UI shows — still
      } finally {
        const next = {...this.computingMeta};
        delete next[entry.name];
        this.computingMeta = next;
      }
    },
  },
};
</script>
