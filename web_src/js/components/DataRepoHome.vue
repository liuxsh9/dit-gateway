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

    <!-- Stats panel (collapsed by default) -->
    <div class="ui segment" v-if="commitHash">
      <div class="ui accordion">
        <div class="title" @click="toggleStats" style="cursor:pointer;">
          <i class="dropdown icon"></i>
          <strong>Dataset Stats</strong>
          <span v-if="repoStats" class="ui small label" style="margin-left:8px;">
            {{ formatTokens(repoStats.totals.token_estimate) }} tokens
          </span>
        </div>
        <div class="content" v-show="statsOpen">
          <div v-if="statsLoading" class="ui active centered inline loader" style="margin:1em 0;"></div>
          <div v-else-if="statsError" class="ui small negative message">{{ statsError }}</div>
          <div v-else-if="repoStats">

            <!-- Totals row -->
            <div class="ui tiny statistics" style="margin-bottom:1em;">
              <div class="statistic">
                <div class="value">{{ repoStats.totals.row_count != null ? repoStats.totals.row_count.toLocaleString() : '—' }}</div>
                <div class="label">Total Rows</div>
              </div>
              <div class="statistic">
                <div class="value">{{ formatTokens(repoStats.totals.token_estimate) }}</div>
                <div class="label">Est. Tokens</div>
              </div>
              <div class="statistic">
                <div class="value">{{ formatSize(repoStats.totals.char_count) }}</div>
                <div class="label">Chars</div>
              </div>
              <div class="statistic">
                <div class="value">{{ repoStats.totals.files_with_sidecar }}/{{ repoStats.totals.file_count }}</div>
                <div class="label">Files w/ Meta</div>
              </div>
            </div>

            <!-- Language distribution bars -->
            <div v-if="topLangs.length > 0" style="margin-bottom:1em;">
              <strong>Language distribution</strong>
              <div v-for="([lang, pct]) in topLangs" :key="lang" style="margin-top:4px;">
                <span style="display:inline-block;width:4em;">{{ lang }}</span>
                <span
                  style="display:inline-block;background:#2185d0;height:10px;vertical-align:middle;"
                  :style="{width: (pct * 2) + 'px'}"
                ></span>
                <span style="margin-left:6px;font-size:0.9em;">{{ Math.round(pct) }}%</span>
              </div>
            </div>

            <!-- Per-file breakdown table -->
            <table class="ui very basic compact table">
              <thead>
                <tr>
                  <th>File</th>
                  <th class="right aligned">Rows</th>
                  <th class="right aligned">Tokens</th>
                  <th class="right aligned">Avg fields</th>
                  <th class="right aligned">Top lang</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="f in repoStats.files" :key="f.path">
                  <td>{{ f.path }}</td>
                  <td class="right aligned">{{ f.row_count != null ? f.row_count.toLocaleString() : '—' }}</td>
                  <td class="right aligned">{{ f.has_sidecar ? formatTokens(f.token_estimate) : '—' }}</td>
                  <td class="right aligned">{{ f.avg_fields != null ? f.avg_fields.toFixed(1) : '—' }}</td>
                  <td class="right aligned">{{ f.has_sidecar ? formatLang(f.lang_distribution) : '—' }}</td>
                </tr>
              </tbody>
            </table>

          </div>
        </div>
      </div>
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
      commitHash: null,
      statsOpen: false,
      statsLoading: false,
      statsError: null,
      repoStats: null,
    };
  },
  computed: {
    topLangs() {
      if (!this.repoStats?.totals?.lang_distribution) return [];
      const dist = this.repoStats.totals.lang_distribution;
      const total = Object.values(dist).reduce((a, b) => a + b, 0);
      if (total === 0) return [];
      return Object.entries(dist)
        .map(([lang, count]) => [lang, (count / total) * 100])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    },
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
      this.commitHash = commitHash;
      this.repoStats = null;
      this.statsOpen = false;
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
    async toggleStats() {
      this.statsOpen = !this.statsOpen;
      if (this.statsOpen && !this.repoStats && !this.statsLoading) {
        await this.loadStats();
      }
    },
    async loadStats() {
      this.statsLoading = true;
      this.statsError = null;
      try {
        this.repoStats = await datahubFetch(
          this.owner, this.repo,
          `/stats/${this.commitHash}`,
        );
      } catch (e) {
        this.statsError = e.message;
      } finally {
        this.statsLoading = false;
      }
    },
  },
};
</script>
