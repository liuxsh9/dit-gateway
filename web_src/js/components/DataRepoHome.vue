<template>
  <div class="ui segments datahub-home">
    <div class="ui segment datahub-toolbar">
      <div class="datahub-toolbar-main">
        <div>
          <div class="datahub-eyebrow">Dit dataset</div>
          <div class="datahub-title">SFT data repository</div>
        </div>
        <div class="field datahub-branch-picker">
          <select aria-label="Branch" class="ui dropdown" v-model="currentBranch" @change="onBranchChange">
            <option v-for="ref in refs" :key="ref.name" :value="ref.name">
              {{ ref.name.replace('heads/', '') }}
            </option>
          </select>
        </div>
        <span v-if="checksStatus" class="ui tiny label" :class="checksStatusClass">
          <i :class="checksStatusIcon"></i> {{ checksStatusText }}
        </span>
        <span v-else-if="checksLoading" class="ui tiny label">
          <i class="spinner loading icon"></i>
        </span>
      </div>
    </div>

    <div class="ui segment" v-if="loading">
      <div class="ui active centered inline loader"></div>
    </div>

    <div class="ui segment" v-else-if="!currentBranch">
      <div class="ui message datahub-empty-state">
        <div class="header">No branches have been published yet</div>
        <p>Push JSONL data with dit to create the first dataset branch, then this page will show files, rows, tokens, and validation status.</p>
      </div>
    </div>

    <div class="ui segment" v-else-if="error">
      <div class="ui negative message">
        <p>{{ error }}</p>
      </div>
    </div>

    <template v-else-if="tree">
      <div class="ui segment datahub-explorer">
        <div class="datahub-explorer-header">
          <div>
            <div class="datahub-eyebrow">Data</div>
            <h2 class="ui header datahub-explorer-title">Files</h2>
            <div class="datahub-overview-detail">Click a JSONL file to open the dedicated ML 2.0 row review page.</div>
          </div>
          <label class="datahub-tool-field datahub-go-to-file">
            <span>Go to file</span>
            <input
              class="datahub-go-to-file-input"
              type="text"
              placeholder="Filter files"
              v-model="fileFilter"
            />
          </label>
        </div>

        <div v-if="metaComputeError" class="ui small negative message datahub-inline-message">{{ metaComputeError }}</div>
        <div v-if="activityError" class="ui small negative message datahub-inline-message">{{ activityError }}</div>

        <div class="datahub-file-browser">
          <div class="datahub-file-browser-tools">
            <nav class="datahub-path-breadcrumbs" aria-label="Dataset path">
              <a href="#" @click.prevent="openFolder('')">{{ branchName(currentBranch) }}</a>
              <template v-for="crumb in pathCrumbs" :key="crumb.path">
                <span>/</span>
                <a href="#" @click.prevent="openFolder(crumb.path)">{{ crumb.name }}</a>
              </template>
            </nav>
            <a class="ui mini basic button" :href="commitsHref">
              {{ recentCommits.length ? `${recentCommits.length} commits` : 'Commits' }}
            </a>
          </div>

          <div v-if="manifestEntries.length === 0" class="ui message datahub-table-message">
            This data repository has no JSONL manifests on the selected branch yet.
          </div>
          <div v-else-if="filteredDirectoryEntries.length === 0" class="ui message datahub-table-message">
            No files match "{{ fileFilter }}".
          </div>
          <div v-else class="datahub-file-table-wrap">
            <table class="ui very basic table datahub-file-table">
              <colgroup>
                <col class="datahub-file-col-name">
                <col class="datahub-file-col-count">
                <col class="datahub-file-col-count">
                <col class="datahub-file-col-count">
                <col class="datahub-file-col-lang">
              </colgroup>
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
                <tr v-for="entry in filteredDirectoryEntries" :key="entry.path">
                  <td>
                    <div class="datahub-file-name-cell">
                      <i :class="entry.type === 'tree' ? 'folder icon' : 'file outline icon'"></i>
                      <a
                        v-if="entry.type === 'tree'"
                        class="datahub-file-link"
                        href="#"
                        @click.prevent="openFolder(entry.path)"
                      >{{ entry.displayName }}</a>
                      <a
                        v-else
                        class="datahub-file-link"
                        :href="previewHref(entry.path)"
                      >{{ entry.displayName }}</a>
                      <span v-if="entry.type === 'manifest' && sidecars[entry.path] === null" class="ui tiny basic label">metadata missing</span>
                      <button
                        v-if="entry.type === 'manifest' && sidecars[entry.path] === null"
                        class="ui mini basic button"
                        :class="{loading: computingMeta[entry.path]}"
                        :disabled="computingMeta[entry.path]"
                        @click="computeMeta(entry)"
                      >Compute</button>
                    </div>
                    <div v-if="entry.path !== entry.displayName" class="datahub-file-path">{{ entry.path }}</div>
                  </td>
                  <td class="right aligned">{{ formatCount(entry.row_count) }}</td>
                  <td class="right aligned">{{ formatCount(entry.char_count) }}</td>
                  <td class="right aligned">{{ entry.token_estimate != null ? formatTokens(entry.token_estimate) : '—' }}</td>
                  <td class="right aligned">{{ entry.lang_distribution ? formatLang(entry.lang_distribution) : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="ui segment datahub-pr-workflow">
        <div class="datahub-section-header datahub-compact-header">
          <div>
            <div class="datahub-overview-label">Change workflow</div>
            <h3 class="ui header datahub-section-title">Pull requests</h3>
            <div class="datahub-overview-detail">Review SFT dataset changes before merge.</div>
          </div>
          <span v-if="activityLoading" class="ui tiny label">
            <i class="spinner loading icon"></i> Loading
          </span>
        </div>
        <div v-if="openPulls.length === 0" class="datahub-empty-inline">
          No open data reviews. Push a branch and open a review with the command below to preview row-level SFT changes before merge.
        </div>
        <div v-else class="datahub-pr-list">
          <div v-for="pull in openPulls" :key="pull.pull_request_id || pull.id" class="datahub-pr-card">
            <div class="datahub-pr-card-header">
              <div>
                <div class="datahub-pr-title">#{{ pull.pull_request_id }} {{ pull.title || 'Untitled data review' }}</div>
                <div class="datahub-overview-detail">
                  {{ pull.author || 'unknown author' }} · {{ branchName(pull.source_ref) }} → {{ branchName(pull.target_ref) }}
                </div>
              </div>
              <span class="ui tiny label" :class="pull.is_mergeable ? 'green' : 'red'">
                {{ pull.is_mergeable ? 'Mergeable' : 'Needs resolution' }}
              </span>
            </div>
            <div class="datahub-pr-stats">
              <span class="ui green label">+{{ formatCount(pull.stats_added || 0) }}</span>
              <span class="ui red label">-{{ formatCount(pull.stats_removed || 0) }}</span>
              <span class="ui yellow label">~{{ formatCount(pull.stats_refreshed || 0) }}</span>
            </div>
            <div class="datahub-overview-detail" v-if="pull.updated_at">
              Updated {{ formatTimestamp(pull.updated_at) }}
            </div>
            <button
              class="ui mini primary button datahub-review-button"
              :disabled="!pull.target_commit || !pull.source_commit"
              @click="previewPull(pull)"
            >
              Open review
            </button>
          </div>
        </div>
        <details class="datahub-command-details">
          <summary>Use this dataset: clone, update, review</summary>
          <div class="datahub-command-card">
            <code>{{ cloneCommand }}</code>
            <code>dit checkout -b update/sft-batch</code>
            <code>dit add &lt;jsonl-file&gt; &amp;&amp; dit commit -m "update SFT data"</code>
            <code>dit push --remote origin --branch update/sft-batch</code>
            <code>{{ createReviewCommand }}</code>
          </div>
        </details>
      </div>

      <div class="ui segment datahub-commit-panel">
        <div class="datahub-section-header datahub-compact-header">
          <div>
            <div class="datahub-overview-label">Repository activity</div>
            <h3 class="ui header datahub-section-title">Recent commits</h3>
          </div>
          <a class="ui mini basic button datahub-view-all-link" :href="commitsHref">View all commits</a>
        </div>
        <div v-if="recentCommits.length === 0" class="datahub-empty-inline">
          No commits are available for this branch yet.
        </div>
        <div v-else class="datahub-commit-list">
          <div v-for="commit in recentCommits" :key="commit.commit_hash" class="datahub-commit-row">
            <div class="datahub-commit-main">
              <span class="datahub-hash">{{ shortHash(commit.commit_hash) }}</span>
              <span class="datahub-commit-message">{{ commit.message || 'No commit message' }}</span>
            </div>
            <div class="datahub-overview-detail">
              {{ commit.author || 'unknown author' }} · {{ formatTimestamp(commit.timestamp) }}
            </div>
            <a class="ui mini basic primary button datahub-commit-preview-button" :href="commitHref(commit.commit_hash)">
              View commit
            </a>
          </div>
        </div>
      </div>
    </template>

    <div class="ui segment datahub-review-preview" v-if="activeReview">
      <div class="ui secondary menu">
        <div class="item">
          <strong>Review data changes</strong>
          <span class="datahub-review-title">{{ activeReview.title }}</span>
        </div>
        <div class="right menu">
          <a class="item" @click="closeReview"><i class="times icon"></i> Close</a>
        </div>
      </div>
      <div v-if="reviewConflictText" class="ui small warning message">
        {{ reviewConflictText }}
      </div>
      <DataDiffView
        :owner="owner"
        :repo="repo"
        :old-commit="activeReview.oldCommit"
        :new-commit="activeReview.newCommit"
      />
    </div>
  </div>
</template>

<script>
import {datahubFetch} from '../utils/datahub-api.js';
import DataDiffView from './DataDiffView.vue';

export default {
  components: {DataDiffView},
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
      sidecars: {},
      computingMeta: {},
      commitHash: null,
      repoStats: null,
      fileFilter: '',
      currentPath: '',
      checksLoading: false,
      checksData: null,
      latestCommit: null,
      recentCommits: [],
      openPulls: [],
      activityLoading: false,
      activityError: null,
      activeReview: null,
      metaComputeError: null,
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
    manifestEntries() {
      return (this.tree?.entries || []).filter((entry) => entry.type === 'manifest');
    },
    directoryEntries() {
      const current = this.normalizePath(this.currentPath);
      const folders = new Map();
      const files = [];
      for (const entry of this.manifestEntries) {
        const path = this.normalizePath(entry.name || entry.path);
        if (!path.startsWith(current)) continue;
        const rest = path.slice(current.length);
        if (!rest) continue;
        const parts = rest.split('/');
        if (parts.length > 1) {
          const folderName = parts[0];
          const folderPath = `${current}${folderName}/`;
          const existing = folders.get(folderPath) || {
            type: 'tree',
            path: folderPath,
            displayName: folderName,
            row_count: 0,
            char_count: 0,
            token_estimate: 0,
            lang_distribution: {},
          };
          existing.row_count += entry.row_count || 0;
          existing.char_count += entry.char_count || 0;
          existing.token_estimate += entry.token_estimate || 0;
          existing.lang_distribution = this.mergeLangDistribution(existing.lang_distribution, entry.lang_distribution);
          folders.set(folderPath, existing);
        } else {
          files.push({
            ...entry,
            path,
            displayName: rest,
          });
        }
      }
      return [...folders.values(), ...files].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'tree' ? -1 : 1;
        return a.displayName.localeCompare(b.displayName);
      });
    },
    filteredDirectoryEntries() {
      const query = this.fileFilter.trim().toLowerCase();
      if (!query) return this.directoryEntries;
      return this.directoryEntries.filter((entry) => (
        entry.displayName.toLowerCase().includes(query) || entry.path.toLowerCase().includes(query)
      ));
    },
    pathCrumbs() {
      const parts = this.normalizePath(this.currentPath).replace(/\/$/, '').split('/').filter(Boolean);
      return parts.map((name, index) => ({
        name,
        path: `${parts.slice(0, index + 1).join('/')}/`,
      }));
    },
    repoUrl() {
      const origin = window.location?.origin || 'http://localhost';
      return `${origin}/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
    },
    repoPath() {
      return `/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
    },
    commitsHref() {
      return `${this.repoPath}/data/commits/${encodeURIComponent(this.branchName(this.currentBranch) || this.defaultBranch || 'main')}`;
    },
    cloneCommand() {
      return `dit clone ${this.repoUrl}`;
    },
    datahubApiUrl() {
      const origin = window.location?.origin || 'http://localhost';
      return `${origin}/api/v1/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/datahub`;
    },
    createReviewCommand() {
      return `curl -X POST ${this.datahubApiUrl}/pulls -H "Authorization: token <token>" -H "Content-Type: application/json" -d '{"source_branch":"update/sft-batch","target_branch":"main","title":"Review SFT batch","author":"<your-name>"}'`;
    },
    reviewConflictText() {
      if (!this.activeReview?.conflicts?.length) return '';
      return `Conflicts: ${this.activeReview.conflicts.map((conflict) => (
        conflict.file_path || conflict.path || conflict
      )).join(', ')}`;
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
      this.fileFilter = '';
      this.currentPath = '';
      this.latestCommit = null;
      this.recentCommits = [];
      this.openPulls = [];
      this.activeReview = null;
      this.activityError = null;
      this.metaComputeError = null;
      const [tree, repoStats] = await Promise.all([
        datahubFetch(this.owner, this.repo, `/tree/${commitHash}`),
        this.fetchStats(commitHash),
      ]);
      this.repoStats = repoStats;
      const statsByPath = new Map((repoStats?.files || []).map((file) => [file.path, file]));
      const seenPaths = new Set();
      this.tree = {
        ...tree,
        entries: (tree.entries || []).map((entry) => ({
          ...entry,
          ...(statsByPath.get(entry.name) || {}),
          type: entry.type || entry.obj_type,
          hash: entry.hash || entry.obj_hash,
          path: entry.name,
        })).filter((entry) => {
          if (entry.type === 'manifest') {
            seenPaths.add(entry.path);
            return true;
          }
          return false;
        }).concat((repoStats?.files || [])
          .filter((file) => file.path && !seenPaths.has(file.path))
          .map((file) => ({
            ...file,
            name: file.path,
            path: file.path,
            type: 'manifest',
            hash: file.manifest_hash || file.hash || null,
            sidecar_hash: file.sidecar_hash || null,
          }))),
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
              `/meta/${commitHash}/${this.encodePath(entry.name)}/summary`,
            );
            sidecars[entry.name] = summary;
            entry.row_count ??= summary.row_count;
            entry.char_count ??= summary.char_count;
            entry.token_estimate ??= summary.token_estimate;
            entry.lang_distribution ??= summary.lang_distribution;
          } catch {
            sidecars[entry.name] = null;
            if (entry.row_count === null || entry.row_count === undefined) {
              try {
                const manifest = await datahubFetch(
                  this.owner, this.repo,
                  `/manifest/${commitHash}/${this.encodePath(entry.name)}?offset=0&limit=1`,
                );
                entry.row_count = manifest.total;
              } catch {
                // Leave row_count empty if the manifest itself cannot be read.
              }
            }
          }
        }
      }
      this.sidecars = sidecars;
      if (repoStats?.totals) {
        totalRows = (this.tree.entries || [])
          .filter((entry) => entry.type === 'manifest')
          .reduce((sum, entry) => sum + (entry.row_count || 0), 0);
      }
      this.stats = {fileCount, rowCount: totalRows, charCount, tokenEstimate};
      await Promise.all([
        this.loadChecks(),
        this.loadActivity(),
      ]);
    },
    async fetchStats(commitHash) {
      try {
        return await datahubFetch(this.owner, this.repo, `/stats/${commitHash}`);
      } catch {
        return null;
      }
    },
    previewHref(filePath) {
      return `${this.repoPath}/data/preview/${encodeURIComponent(this.commitHash)}/${filePath.split('/').map(encodeURIComponent).join('/')}`;
    },
    commitHref(hash) {
      return `${this.repoPath}/data/commit/${encodeURIComponent(hash)}`;
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
    mergeLangDistribution(left = {}, right = {}) {
      const merged = {...left};
      for (const [lang, count] of Object.entries(right || {})) {
        merged[lang] = (merged[lang] || 0) + count;
      }
      return merged;
    },
    normalizePath(path) {
      if (!path) return '';
      return String(path).replace(/^\/+/, '');
    },
    encodePath(path) {
      return this.normalizePath(path).split('/').map(encodeURIComponent).join('/');
    },
    openFolder(path) {
      this.currentPath = this.normalizePath(path);
      this.fileFilter = '';
    },
    async computeMeta(entry) {
      this.computingMeta = {...this.computingMeta, [entry.path]: true};
      this.metaComputeError = null;
      try {
        await datahubFetch(this.owner, this.repo, '/meta/compute', {
          method: 'POST',
          body: JSON.stringify({file: entry.path}),
        });
        await this.loadTree();
      } catch (e) {
        this.metaComputeError = e.message;
      } finally {
        const next = {...this.computingMeta};
        delete next[entry.path];
        this.computingMeta = next;
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
    async loadActivity() {
      if (!this.currentBranch) return;
      this.activityLoading = true;
      this.activityError = null;
      try {
        const [logResult, pullsResult] = await Promise.all([
          datahubFetch(this.owner, this.repo, `/log?ref=${this.currentBranch}&limit=5`),
          datahubFetch(this.owner, this.repo, '/pulls?status=open'),
        ]);
        this.recentCommits = logResult.commits || [];
        this.latestCommit = this.recentCommits[0] || null;
        this.openPulls = Array.isArray(pullsResult) ? pullsResult : (pullsResult.pull_requests || pullsResult.pulls || []);
      } catch (e) {
        this.recentCommits = [];
        this.openPulls = [];
        this.latestCommit = null;
        this.activityError = e.message;
      } finally {
        this.activityLoading = false;
      }
    },
    previewPull(pull) {
      this.activeReview = {
        id: pull.pull_request_id || pull.id,
        title: `#${pull.pull_request_id || pull.id} ${pull.title || 'Untitled data review'}`,
        oldCommit: pull.target_commit,
        newCommit: pull.source_commit,
        conflicts: pull.conflict_files || [],
      };
    },
    closeReview() {
      this.activeReview = null;
    },
    commitBase(commit) {
      if (Array.isArray(commit.parent_hashes) && commit.parent_hashes.length) return commit.parent_hashes[0];
      return commit.parent_hash || null;
    },
    branchName(refName) {
      return (refName || '').replace(/^heads\//, '') || 'unknown';
    },
    shortHash(hash) {
      return hash ? hash.slice(0, 7) : '—';
    },
    formatBlameDate(timestamp) {
      if (!timestamp) return '—';
      const d = new Date(timestamp * 1000);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
             `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
    },
    formatTimestamp(value) {
      if (!value) return '—';
      if (typeof value === 'number') return this.formatBlameDate(value);
      const parsed = Date.parse(value);
      if (Number.isNaN(parsed)) return String(value);
      return this.formatBlameDate(Math.floor(parsed / 1000));
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

.datahub-explorer {
  background: var(--color-body);
}

.datahub-explorer-header {
  align-items: flex-start;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  margin-bottom: 14px;
}

.datahub-explorer-title {
  margin: 2px 0 0 !important;
}

.datahub-file-browser {
  border: 1px solid var(--color-secondary);
  border-radius: 8px;
  background: var(--color-box-body);
}

.datahub-file-browser {
  overflow: hidden;
}

.datahub-file-browser-tools {
  align-items: center;
  background: var(--color-box-header);
  border-bottom: 1px solid var(--color-secondary);
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
}

.datahub-tool-field {
  color: var(--color-text-light-2);
  display: flex;
  flex-direction: column;
  font-size: 11px;
  font-weight: 700;
  gap: 5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.datahub-go-to-file-input {
  background: var(--color-input-background);
  border: 1px solid var(--color-input-border);
  border-radius: 6px;
  color: var(--color-input-text);
  font-size: 13px;
  height: 36px;
  padding: 0 10px;
}

.datahub-path-breadcrumbs {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  font-weight: 600;
}

.datahub-pr-workflow {
  border-color: var(--color-primary-light-4);
}

.datahub-commit-panel {
  background: var(--color-box-body);
}

.datahub-compact-header {
  margin-bottom: 8px;
}

.datahub-command-details {
  border-top: 1px solid var(--color-secondary);
  margin-top: 12px;
  padding-top: 10px;
}

.datahub-command-details summary {
  cursor: pointer;
  font-weight: 600;
}

.datahub-overview-label {
  color: var(--color-text-light-2);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.datahub-overview-value {
  margin-top: 4px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.datahub-overview-detail {
  margin-top: 3px;
  color: var(--color-text-light-2);
  font-size: 12px;
}

.datahub-hash {
  font-family: var(--fonts-monospace);
}

.datahub-inline-message {
  margin-top: 12px;
}

.datahub-section-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.datahub-section-title {
  margin-top: 2px !important;
}

.datahub-command-card {
  border: 1px solid var(--color-secondary);
  border-radius: 8px;
  background: var(--color-box-body);
  padding: 12px;
}

.datahub-command-card code {
  background: var(--color-code-bg);
  border-radius: 6px;
  display: block;
  font-size: 12px;
  line-height: 1.45;
  margin-top: 6px;
  overflow-x: auto;
  padding: 8px;
  white-space: pre-wrap;
  word-break: break-word;
}

.datahub-empty-inline {
  color: var(--color-text-light-2);
  font-size: 13px;
  padding: 10px 0;
}

.datahub-commit-list,
.datahub-pr-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.datahub-commit-row,
.datahub-pr-card {
  border-top: 1px solid var(--color-secondary);
  padding-top: 10px;
}

.datahub-commit-row:first-child,
.datahub-pr-card:first-child {
  border-top: 0;
  padding-top: 0;
}

.datahub-commit-main {
  display: flex;
  gap: 8px;
  min-width: 0;
}

.datahub-commit-message {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.datahub-pr-card-header {
  align-items: flex-start;
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.datahub-pr-title {
  font-weight: 600;
}

.datahub-pr-stats {
  display: flex;
  gap: 4px;
  margin: 8px 0;
}

.datahub-review-button {
  margin-top: 8px !important;
}

.datahub-commit-preview-button {
  margin-top: 6px !important;
}

.datahub-review-title {
  color: var(--color-text-light-2);
  margin-left: 8px;
}

.datahub-file-table td,
.datahub-file-table th {
  vertical-align: middle;
}

.datahub-file-table-wrap {
  overflow-x: auto;
}

.datahub-file-table {
  min-width: 0;
  table-layout: fixed;
  width: 100% !important;
  margin: 0 !important;
}

.datahub-file-col-name {
  width: auto;
}

.datahub-file-col-count {
  width: 62px;
}

.datahub-file-col-lang {
  width: 82px;
}

.datahub-file-name-cell,
.datahub-file-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.datahub-file-name {
  margin-right: 6px;
}

.datahub-file-link {
  font-weight: 600;
}

.datahub-file-path {
  color: var(--color-text-light-2);
  font-size: 12px;
  margin-left: 22px;
  margin-top: 2px;
}

.datahub-table-message {
  margin: 0 !important;
}

.datahub-file-actions .button {
  margin: 0 !important;
  padding-left: 9px !important;
  padding-right: 9px !important;
}

.datahub-empty-state {
  margin: 0;
}

@media (max-width: 991px) {
  .datahub-explorer-header {
    flex-direction: column;
  }
}

@media (max-width: 767px) {
  .datahub-file-browser-tools {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
