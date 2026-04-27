<template>
  <div class="ui segments datahub-home">
    <!-- Branch selector -->
    <div class="ui segment datahub-toolbar">
      <div class="datahub-toolbar-main">
        <div>
          <div class="datahub-eyebrow">Dit dataset</div>
          <div class="datahub-title">SFT data repository</div>
        </div>
        <div class="field datahub-branch-picker">
          <select class="ui dropdown" v-model="currentBranch" @change="onBranchChange">
            <option v-for="ref in refs" :key="ref.name" :value="ref.name">
              {{ ref.name.replace('heads/', '') }}
            </option>
          </select>
        </div>
        <div v-if="stats" class="datahub-metrics">
          <span class="ui label">{{ formatCount(stats.fileCount) }} files</span>
          <span class="ui label">{{ formatCount(stats.rowCount) }} rows</span>
          <span class="ui label">{{ formatCount(stats.charCount) }} chars</span>
          <span class="ui label">{{ formatTokens(stats.tokenEstimate) }} tokens</span>
        </div>
        <div>
          <span v-if="checksStatus" class="ui tiny label" :class="checksStatusClass" style="margin-left: 6px;">
            <i :class="checksStatusIcon"></i> {{ checksStatusText }}
          </span>
          <span v-else-if="checksLoading" class="ui tiny label" style="margin-left: 6px;">
            <i class="spinner loading icon"></i>
          </span>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div class="ui segment" v-if="loading">
      <div class="ui active centered inline loader"></div>
    </div>

    <!-- No refs yet -->
    <div class="ui segment" v-else-if="!currentBranch">
      <div class="ui message datahub-empty-state">
        <div class="header">No branches have been published yet</div>
        <p>Push JSONL data with dit to create the first dataset branch, then this page will show files, rows, tokens, and validation status.</p>
      </div>
    </div>

    <!-- Error -->
    <div class="ui segment" v-else-if="error">
      <div class="ui negative message">
        <p>{{ error }}</p>
      </div>
    </div>

    <!-- File tree -->
    <div class="ui segment" v-else-if="tree">
      <div v-if="(tree.entries || []).length === 0" class="ui message">
        This data repository has no JSONL manifests on the selected branch yet.
      </div>
      <table v-else class="ui very basic table datahub-file-table">
        <thead>
          <tr>
            <th>Name</th>
            <th class="right aligned">Rows</th>
            <th class="right aligned">Chars</th>
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
              <button
                v-if="entry.type === 'manifest'"
                class="ui mini basic button"
                style="margin-left:8px;"
                @click="loadBlame(entry.name)"
              >Blame</button>
            </td>
            <td class="right aligned">{{ formatCount(entry.row_count) }}</td>
            <td class="right aligned">{{ formatCount(entry.char_count) }}</td>
            <td class="right aligned">
              <template v-if="entry.type === 'manifest'">
                <span v-if="entry.token_estimate != null">
                  {{ formatTokens(entry.token_estimate) }}
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
              <template v-if="entry.type === 'manifest' && entry.lang_distribution">
                {{ formatLang(entry.lang_distribution) }}
              </template>
              <span v-else>—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Blame panel -->
    <div class="ui segment" v-if="blameFile">
      <div class="ui secondary menu" style="margin-bottom:0.5em;">
        <div class="item"><strong>Blame: {{ blameFile }}</strong></div>
        <div class="right menu">
          <a class="item" @click="closeBlame"><i class="times icon"></i> Close</a>
        </div>
      </div>

      <div v-if="blameLoading" class="ui active centered inline loader" style="margin:1em 0;"></div>
      <div v-else-if="blameError" class="ui negative message"><p>{{ blameError }}</p></div>
      <template v-else-if="blameData">
        <div style="margin-bottom:0.75em;">
          <span class="ui small label">{{ blameData.summary.total_rows }} rows</span>
          <span class="ui small label">{{ blameData.summary.unique_commits }} commits</span>
          <span class="ui small label">{{ blameData.summary.unique_authors }} authors</span>
        </div>
        <table class="ui very basic compact selectable table">
          <thead>
            <tr>
              <th class="right aligned" style="width:3em;">Row</th>
              <th style="width:6em;">Commit</th>
              <th>Author</th>
              <th>Date</th>
              <th>Content</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="entry in blameData.entries"
              :key="entry.row_index"
              style="cursor:pointer;"
              @click="loadRowHistory(entry.row_index)"
            >
              <td class="right aligned">{{ entry.row_index }}</td>
              <td style="font-family:monospace;">{{ entry.commit_hash ? entry.commit_hash.slice(0,7) : '—' }}</td>
              <td>{{ entry.author }}</td>
              <td>{{ formatBlameDate(entry.timestamp) }}</td>
              <td style="font-family:monospace;font-size:0.85em;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ entry.content_preview }}</td>
            </tr>
          </tbody>
        </table>

        <!-- Row history sub-panel -->
        <div v-if="rowHistoryData || rowHistoryLoading" style="margin-top:1em;">
          <strong>Row history</strong>
          <div v-if="rowHistoryLoading" class="ui active centered inline loader" style="margin:0.5em 0;"></div>
          <table v-else-if="rowHistoryData" class="ui very basic compact table" style="margin-top:0.5em;">
            <thead>
              <tr>
                <th style="width:6em;">Event</th>
                <th style="width:6em;">Commit</th>
                <th>Author</th>
                <th>Date</th>
                <th>Content</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(ev, idx) in rowHistoryData.events" :key="idx">
                <td>
                  <span
                    class="ui tiny label"
                    :class="{
                      'green':  ev.event === 'added',
                      'blue':   ev.event === 'refresh',
                      'red':    ev.event === 'removed',
                    }"
                  >{{ ev.event }}</span>
                </td>
                <td style="font-family:monospace;">{{ ev.commit_hash ? ev.commit_hash.slice(0,7) : '—' }}</td>
                <td>{{ ev.author }}</td>
                <td>{{ formatBlameDate(ev.timestamp) }}</td>
                <td style="font-family:monospace;font-size:0.85em;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ ev.content_preview }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
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

    <!-- Search bar -->
    <div class="ui segment" v-if="commitHash">
      <div class="ui action input" style="width:100%;">
        <input
          type="text"
          placeholder='Search rows (e.g. "LRU缓存")'
          v-model="searchQuery"
          @keyup.enter="submitSearch"
        />
        <select class="ui compact selection dropdown" v-model="searchField" style="min-width:160px;">
          <option value="">Full row</option>
          <option value="instruction">instruction</option>
          <option value="response">response</option>
          <option value="messages[0].content">messages[0].content</option>
        </select>
        <button class="ui button" :class="{loading: searchLoading}" @click="submitSearch">
          <i class="search icon"></i> Search
        </button>
      </div>
    </div>

    <!-- Search results (collapsible) -->
    <div class="ui segment" v-if="searchResults">
      <div class="ui accordion">
        <div class="title" @click="searchResultsOpen = !searchResultsOpen" style="cursor:pointer;">
          <i class="dropdown icon"></i>
          <strong>Search Results</strong>
          <span class="ui small label" style="margin-left:8px;">
            {{ searchResults.matches.length }} match{{ searchResults.matches.length !== 1 ? 'es' : '' }}
            (scanned {{ searchResults.total_scanned.toLocaleString() }} rows)
          </span>
          <span v-if="searchResults.limit_reached" class="ui small yellow label" style="margin-left:4px;">
            limit reached
          </span>
        </div>
        <div class="content" v-show="searchResultsOpen">
          <div v-if="searchError" class="ui small negative message">{{ searchError }}</div>
          <div v-else-if="searchResults.matches.length === 0" class="ui small message">
            No matches found for "{{ searchResults.query }}".
          </div>
          <table v-else class="ui very basic compact table">
            <thead>
              <tr>
                <th>File</th>
                <th>Row</th>
                <th>Excerpt</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in searchResults.matches" :key="m.file + ':' + m.row_index">
                <td>{{ m.file }}</td>
                <td class="right aligned">{{ m.row_index }}</td>
                <td style="font-family:monospace;font-size:0.9em;white-space:pre-wrap;">{{ m.highlight }}</td>
              </tr>
            </tbody>
          </table>
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
        :commit-hash="commitHash"
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
      searchQuery: '',
      searchField: '',
      searchLoading: false,
      searchError: null,
      searchResults: null,
      searchResultsOpen: true,
      checksLoading: false,
      checksData: null,
      blameData: null,
      blameLoading: false,
      blameError: null,
      blameFile: null,
      rowHistoryData: null,
      rowHistoryLoading: false,
    };
  },
  computed: {
    checksStatus() {
      if (!this.checksData || this.checksData.checks.length === 0) return null;
      const statuses = this.checksData.checks.map(c => c.status);
      if (statuses.includes('fail')) return 'fail';
      if (statuses.includes('pending')) return 'pending';
      return 'pass';
    },
    checksStatusClass() {
      return {
        'green': this.checksStatus === 'pass',
        'red':   this.checksStatus === 'fail',
        'grey':  this.checksStatus === 'pending',
      };
    },
    checksStatusIcon() {
      return {
        'pass':    'check icon',
        'fail':    'times icon',
        'pending': 'clock icon',
      }[this.checksStatus] || '';
    },
    checksStatusText() {
      return {'pass': 'CI pass', 'fail': 'CI fail', 'pending': 'CI pending'}[this.checksStatus] || '';
    },
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
      this.checksData = null;
      this.repoStats = null;
      this.statsOpen = false;
      this.searchResults = null;
      this.searchQuery = '';
      this.searchField = '';
      const [tree, repoStats] = await Promise.all([
        datahubFetch(this.owner, this.repo, `/tree/${commitHash}`),
        this.fetchStats(commitHash),
      ]);
      this.repoStats = repoStats;
      const statsByPath = new Map((repoStats?.files || []).map((file) => [file.path, file]));
      this.tree = {
        ...tree,
        entries: (tree.entries || []).map((entry) => ({
          ...entry,
          ...(statsByPath.get(entry.name) || {}),
          type: entry.type || entry.obj_type,
          hash: entry.hash || entry.obj_hash,
        })),
      };
      let totalRows = repoStats?.totals?.row_count || 0;
      let fileCount = repoStats?.totals?.file_count || 0;
      let charCount = repoStats?.totals?.char_count || 0;
      let tokenEstimate = repoStats?.totals?.token_estimate || 0;
      const sidecars = {};
      for (const entry of this.tree.entries || []) {
        if (entry.type === 'manifest') {
          if (!repoStats?.totals) {
            fileCount++;
            totalRows += entry.row_count || 0;
            charCount += entry.char_count || 0;
            tokenEstimate += entry.token_estimate || 0;
          }
          try {
            const summary = await datahubFetch(
              this.owner, this.repo,
              `/meta/${commitHash}/${encodeURIComponent(entry.name)}/summary`,
            );
            sidecars[entry.name] = summary;
            entry.row_count ??= summary.row_count;
            entry.char_count ??= summary.char_count;
            entry.token_estimate ??= summary.token_estimate;
            entry.lang_distribution ??= summary.lang_distribution;
          } catch {
            sidecars[entry.name] = null;
          }
        }
      }
      this.sidecars = sidecars;
      this.stats = {fileCount, rowCount: totalRows, charCount, tokenEstimate};
      await this.loadChecks();
    },
    async fetchStats(commitHash) {
      try {
        return await datahubFetch(this.owner, this.repo, `/stats/${commitHash}`);
      } catch {
        return null;
      }
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
    formatCount(n) {
      if (n === null || n === undefined) return '—';
      return Number(n).toLocaleString();
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
      const total = Object.values(dist).reduce((sum, value) => sum + value, 0);
      const pct = total > 1 ? (top[1] / total) * 100 : top[1] * 100;
      return `${top[0]} ${Math.round(pct)}%`;
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
    async loadChecks() {
      if (!this.commitHash) return;
      this.checksLoading = true;
      try {
        this.checksData = await datahubFetch(
          this.owner, this.repo,
          `/checks/${this.commitHash}`,
        );
      } catch {
        this.checksData = null;
      } finally {
        this.checksLoading = false;
      }
    },
    async submitSearch() {
      if (!this.searchQuery.trim()) return;
      this.searchLoading = true;
      this.searchError = null;
      this.searchResults = null;
      try {
        this.searchResults = await datahubFetch(
          this.owner, this.repo,
          '/search',
          {
            method: 'POST',
            body: JSON.stringify({
              ref: this.commitHash,
              query: this.searchQuery.trim(),
              field: this.searchField || null,
              limit: 50,
            }),
          },
        );
        this.searchResultsOpen = true;
      } catch (e) {
        this.searchError = e.message;
      } finally {
        this.searchLoading = false;
      }
    },
    async loadBlame(filePath) {
      this.blameFile = filePath;
      this.blameData = null;
      this.blameError = null;
      this.blameLoading = true;
      this.rowHistoryData = null;
      this.rowHistoryLoading = false;
      try {
        this.blameData = await datahubFetch(
          this.owner, this.repo,
          `/blame/${this.commitHash}/${encodeURIComponent(filePath)}`,
        );
      } catch (e) {
        this.blameError = e.message;
      } finally {
        this.blameLoading = false;
      }
    },
    closeBlame() {
      this.blameFile = null;
      this.blameData = null;
      this.blameError = null;
      this.blameLoading = false;
      this.rowHistoryData = null;
      this.rowHistoryLoading = false;
    },
    async loadRowHistory(rowIndex) {
      this.rowHistoryData = null;
      this.rowHistoryLoading = true;
      try {
        this.rowHistoryData = await datahubFetch(
          this.owner, this.repo,
          `/blame/${this.commitHash}/${encodeURIComponent(this.blameFile)}?row=${rowIndex}`,
        );
      } catch {
        // Silently ignore; history panel stays hidden
      } finally {
        this.rowHistoryLoading = false;
      }
    },
    formatBlameDate(timestamp) {
      if (!timestamp) return '—';
      const d = new Date(timestamp * 1000);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
             `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
    },
  },
};
</script>

<style scoped>
.datahub-home {
  border: 0;
}

.datahub-toolbar {
  background: linear-gradient(135deg, var(--color-box-header), var(--color-body));
}

.datahub-toolbar-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
}

.datahub-eyebrow {
  color: var(--color-text-light-2);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.datahub-title {
  font-size: 20px;
  font-weight: 600;
}

.datahub-branch-picker {
  min-width: 160px;
}

.datahub-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.datahub-file-table td,
.datahub-file-table th {
  vertical-align: middle;
}

.datahub-empty-state {
  margin: 0;
}
</style>
