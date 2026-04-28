<template>
  <div class="ui segments datahub-home">
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
        <div class="datahub-repo-controls">
          <div class="datahub-branch-meta">
            <div class="field datahub-branch-picker">
              <span class="datahub-branch-button-icon" aria-hidden="true">
                <SvgIcon name="octicon-git-branch" :size="16" />
              </span>
              <select aria-label="Branch" class="ui dropdown" v-model="currentBranch" @change="onBranchChange">
                <option v-for="ref in refs" :key="ref.name" :value="ref.name">
                  {{ ref.name.replace('heads/', '') }}
                </option>
              </select>
              <span class="datahub-branch-button-chevron" aria-hidden="true">
                <SvgIcon name="octicon-chevron-down" :size="16" />
              </span>
            </div>
            <span class="datahub-meta-pill">
              <SvgIcon name="octicon-git-branch" :size="16" />
              {{ branchCountText }}
            </span>
            <span class="datahub-meta-pill">
              <SvgIcon name="octicon-tag" :size="16" />
              0 Tags
            </span>
          </div>
          <div class="datahub-repo-actions">
            <label class="datahub-go-to-file">
              <input
                class="datahub-go-to-file-input"
                type="text"
                placeholder="Go to file"
                v-model="fileFilter"
              />
            </label>
          </div>
        </div>

        <div v-if="metaComputeError" class="ui small negative message datahub-inline-message">{{ metaComputeError }}</div>
        <div v-if="activityError" class="ui small negative message datahub-inline-message">{{ activityError }}</div>

        <div class="datahub-file-browser">
          <div class="datahub-file-browser-tools">
            <div class="datahub-latest-commit">
              <template v-if="latestCommit">
                <span class="datahub-commit-author">{{ latestCommit.author || 'unknown author' }}</span>
                <span class="datahub-commit-message">{{ latestCommit.message || 'No commit message' }}</span>
                <span v-if="checksStatus" class="datahub-inline-ci" :class="`is-${checksStatus}`">
                  <i :class="checksStatusIcon"></i> {{ checksStatusText }}
                </span>
                <span v-else-if="checksLoading" class="datahub-inline-ci">
                  <i class="spinner loading icon"></i>
                </span>
                <a class="datahub-hash" :href="commitHref(latestCommit.commit_hash)">
                  {{ shortHash(latestCommit.commit_hash) }}
                </a>
                <span class="datahub-overview-detail">{{ formatTimestamp(latestCommit.timestamp) }}</span>
              </template>
              <template v-else>
                <span class="datahub-commit-message">No commits are available for this branch yet.</span>
                <span v-if="checksStatus" class="datahub-inline-ci" :class="`is-${checksStatus}`">
                  <i :class="checksStatusIcon"></i> {{ checksStatusText }}
                </span>
                <span v-else-if="checksLoading" class="datahub-inline-ci">
                  <i class="spinner loading icon"></i>
                </span>
              </template>
            </div>
            <a class="datahub-commit-count" :href="commitsHref">
              {{ commitCountText }}
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
                <col class="datahub-file-col-commit">
                <col class="datahub-file-col-updated">
                <col class="datahub-file-col-count">
                <col class="datahub-file-col-size">
                <col class="datahub-file-col-lang">
              </colgroup>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Last commit</th>
                  <th>Updated</th>
                  <th class="right aligned">Rows</th>
                  <th class="right aligned" :title="sizeEstimateHelp">Size</th>
                  <th class="datahub-lang-heading" :title="languageEstimateHelp">Lang</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="entry in filteredDirectoryEntries"
                  :key="entry.path"
                  class="datahub-file-row"
                  :class="entry.type === 'tree' ? 'datahub-file-row-folder' : 'datahub-file-row-file'"
                >
                  <td>
                    <div class="datahub-file-name-cell">
                      <span
                        v-if="entry.type === 'tree'"
                        class="datahub-tree-chevron"
                        aria-hidden="true"
                      ></span>
                      <span
                        v-else
                        class="datahub-tree-file-spacer"
                        aria-hidden="true"
                      ></span>
                      <span
                        class="datahub-tree-entry-icon"
                        :class="entry.type === 'tree' ? 'datahub-tree-folder-icon' : 'datahub-tree-file-icon'"
                        aria-hidden="true"
                      >
                        <SvgIcon
                          :name="entry.type === 'tree' ? 'octicon-file-directory-fill' : 'octicon-file'"
                          :size="16"
                        />
                      </span>
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
                    <div class="datahub-file-mobile-metrics" aria-label="File metrics">
                      <span><strong>Rows</strong> {{ formatCount(entry.row_count) }}</span>
                      <span><strong>Commit</strong> {{ entryCommitSummary(entry) }}</span>
                      <span><strong>Updated</strong> {{ entryUpdatedText(entry) }}</span>
                      <span><strong :title="sizeEstimateHelp">Size</strong> {{ formatSize(entrySize(entry)) }}</span>
                      <span><strong :title="languageEstimateHelp">Lang</strong> {{ entry.lang_distribution ? formatLang(entry.lang_distribution) : '—' }}</span>
                    </div>
                  </td>
                  <td class="datahub-metric-cell datahub-file-commit-cell">
                    <a v-if="entryCommit(entry)" class="datahub-file-commit-link" :href="entryCommitHref(entry)" :title="entryCommit(entry).message || shortHash(entryCommit(entry).commit_hash)">
                      {{ entryCommit(entry).message || shortHash(entryCommit(entry).commit_hash) }}
                    </a>
                    <span v-else>—</span>
                  </td>
                  <td class="datahub-metric-cell datahub-file-updated-cell">
                    {{ entryUpdatedText(entry) }}
                  </td>
                  <td class="right aligned datahub-metric-cell">{{ formatCount(entry.row_count) }}</td>
                  <td class="right aligned datahub-metric-cell" :title="sizeEstimateHelp">{{ formatSize(entrySize(entry)) }}</td>
                  <td class="datahub-metric-cell datahub-lang-cell" :title="languageEstimateHelp">{{ entry.lang_distribution ? formatLang(entry.lang_distribution) : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="ui segment datahub-card-panel datahub-pr-workflow">
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

      <div class="ui segment datahub-card-panel datahub-commit-panel">
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
import {SvgIcon} from '../svg.js';

export default {
  components: {DataDiffView, SvgIcon},
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
      fileProvenance: {},
      openPulls: [],
      activityLoading: false,
      activityError: null,
      activeReview: null,
      metaComputeError: null,
      languageEstimateHelp: 'Heuristic estimate from DIT sidecar metadata: longest JSON string per row, then script-based language guess.',
      sizeEstimateHelp: 'File size in bytes from DIT repository metadata.',
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
    branchCountText() {
      const count = this.refs.length;
      return `${this.formatCount(count)} ${count === 1 ? 'Branch' : 'Branches'}`;
    },
    commitCountText() {
      const count = this.recentCommits.length;
      return count > 0 ? `${this.formatCount(count)} ${count === 1 ? 'Commit' : 'Commits'}` : 'Commits';
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
            size: null,
          };
          existing.row_count += entry.row_count || 0;
          existing.char_count += entry.char_count || 0;
          const entryBytes = this.entrySize(entry);
          if (entryBytes !== null && entryBytes !== undefined) {
            existing.size = (existing.size || 0) + entryBytes;
          }
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
      this.fileProvenance = {};
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
    entrySize(entry) {
      if (!entry) return null;
      return entry.size_bytes ?? entry.byte_count ?? entry.size ?? null;
    },
    formatSize(bytes) {
      if (bytes === null || bytes === undefined) return '—';
      const value = Number(bytes);
      if (!Number.isFinite(value)) return '—';
      if (value < 1024) return `${value.toLocaleString()} B`;
      const units = ['KB', 'MB', 'GB', 'TB'];
      let scaled = value / 1024;
      let unitIndex = 0;
      while (scaled >= 1024 && unitIndex < units.length - 1) {
        scaled /= 1024;
        unitIndex++;
      }
      const digits = scaled >= 10 ? 0 : 1;
      return `${scaled.toFixed(digits)} ${units[unitIndex]}`;
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
    entryCommit(entry) {
      if (!entry) return null;
      if (entry.type === 'tree') return this.folderCommit(entry.path);
      return this.fileProvenance[this.normalizePath(entry.path)] || this.latestCommit || null;
    },
    entryCommitHref(entry) {
      const commit = this.entryCommit(entry);
      return commit?.commit_hash ? this.commitHref(commit.commit_hash) : '#';
    },
    entryCommitSummary(entry) {
      const commit = this.entryCommit(entry);
      if (!commit) return '—';
      return commit.message || this.shortHash(commit.commit_hash);
    },
    entryUpdatedText(entry) {
      const commit = this.entryCommit(entry);
      return commit ? this.formatRelativeTime(commit.timestamp) : '—';
    },
    folderCommit(folderPath) {
      const prefix = this.normalizePath(folderPath);
      let newest = null;
      for (const file of this.manifestEntries) {
        const path = this.normalizePath(file.path || file.name);
        if (!path.startsWith(prefix)) continue;
        const commit = this.fileProvenance[path] || this.latestCommit;
        if (!commit) continue;
        if (!newest || this.commitTime(commit) > this.commitTime(newest)) newest = commit;
      }
      return newest;
    },
    commitTime(commit) {
      if (!commit?.timestamp) return 0;
      if (typeof commit.timestamp === 'number') return commit.timestamp * 1000;
      const parsed = Date.parse(commit.timestamp);
      return Number.isNaN(parsed) ? 0 : parsed;
    },
    async buildFileProvenance(commits) {
      if (!Array.isArray(commits) || commits.length === 0) {
        this.fileProvenance = {};
        return;
      }
      const currentEntries = this.manifestEntries;
      if (currentEntries.length === 0) {
        this.fileProvenance = {};
        return;
      }
      const currentByPath = new Map(currentEntries.map((entry) => [
        this.normalizePath(entry.path || entry.name),
        entry.hash || entry.obj_hash || entry.manifest_hash,
      ]));
      const provenance = {};
      const candidates = {};
      for (const commit of commits) {
        if (!commit?.commit_hash) continue;
        let tree;
        if (commit.commit_hash === this.commitHash) {
          tree = this.tree;
        } else {
          try {
            tree = await datahubFetch(this.owner, this.repo, `/tree/${commit.commit_hash}`);
          } catch {
            continue;
          }
        }
        const treeByPath = new Map((tree?.entries || [])
          .filter((entry) => (entry.type || entry.obj_type) === 'manifest')
          .map((entry) => [
            this.normalizePath(entry.path || entry.name),
            entry.hash || entry.obj_hash || entry.manifest_hash,
          ]));
        for (const [path, hash] of currentByPath.entries()) {
          if (provenance[path] || !hash) continue;
          if (treeByPath.get(path) === hash) {
            candidates[path] = commit;
          } else if (candidates[path]) {
            provenance[path] = candidates[path];
          }
        }
      }
      for (const path of currentByPath.keys()) {
        provenance[path] ||= candidates[path] || this.latestCommit || commits[0] || null;
      }
      this.fileProvenance = provenance;
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
        await this.buildFileProvenance(this.recentCommits);
        this.openPulls = Array.isArray(pullsResult) ? pullsResult : (pullsResult.pull_requests || pullsResult.pulls || []);
      } catch (e) {
        this.recentCommits = [];
        this.openPulls = [];
        this.latestCommit = null;
        this.fileProvenance = {};
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
    formatRelativeTime(value) {
      const timestamp = this.commitTime({timestamp: value});
      if (!timestamp) return '—';
      const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
      const units = [
        ['year', 31536000],
        ['month', 2592000],
        ['week', 604800],
        ['day', 86400],
        ['hour', 3600],
        ['minute', 60],
      ];
      for (const [label, size] of units) {
        if (seconds >= size) {
          const count = Math.floor(seconds / size);
          return `${count} ${label}${count === 1 ? '' : 's'} ago`;
        }
      }
      return 'just now';
    },
  },
};
</script>

<style scoped>
.datahub-home {
  background: transparent !important;
  border: 0;
  box-shadow: none !important;
}

.datahub-branch-picker {
  align-items: center;
  display: inline-flex;
  margin: 0 !important;
  min-width: 0;
  position: relative;
}

.datahub-branch-picker select.ui.dropdown {
  appearance: none;
  background: var(--color-input-background);
  border: 1px solid var(--color-secondary);
  border-radius: 6px;
  color: var(--color-text);
  cursor: pointer;
  font-weight: 600;
  height: 32px;
  line-height: 30px;
  min-height: 32px;
  min-width: 0;
  padding: 0 30px 0 30px;
  width: auto;
}

.datahub-branch-button-icon,
.datahub-branch-button-chevron {
  align-items: center;
  color: var(--color-text-light-2);
  display: inline-flex;
  pointer-events: none;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
}

.datahub-branch-button-icon {
  left: 10px;
}

.datahub-branch-button-chevron {
  right: 9px;
}

.datahub-explorer {
  background: var(--color-body);
  padding-top: 16px !important;
}

.datahub-repo-controls {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 14px;
  min-width: 0;
}

.datahub-branch-meta {
  align-items: center;
  display: flex;
  flex: 1 1 auto;
  flex-wrap: nowrap;
  gap: 12px;
  min-width: 0;
}

.datahub-meta-pill {
  align-items: center;
  color: var(--color-text);
  display: inline-flex;
  font-size: 13px;
  font-weight: 600;
  gap: 6px;
  white-space: nowrap;
}

.datahub-repo-actions {
  align-items: center;
  display: flex;
  flex: 0 1 260px;
  justify-content: flex-end;
  min-width: 220px;
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

.datahub-go-to-file {
  margin: 0;
  width: 100%;
}

.datahub-go-to-file-input {
  background: var(--color-input-background);
  border: 1px solid var(--color-input-border);
  border-radius: 6px;
  color: var(--color-input-text);
  font-size: 13px;
  height: 36px;
  padding: 0 10px;
  width: 100%;
}

.datahub-latest-commit {
  align-items: center;
  display: flex;
  flex: 1 1 auto;
  gap: 8px;
  min-width: 0;
}

.datahub-commit-author {
  flex: 0 0 auto;
  font-weight: 600;
}

.datahub-inline-ci {
  align-items: center;
  color: var(--color-text-light-2);
  display: inline-flex;
  flex: 0 0 auto;
  gap: 4px;
}

.datahub-inline-ci.is-pass {
  color: var(--color-success-text);
}

.datahub-inline-ci.is-fail {
  color: var(--color-error-text);
}

.datahub-inline-ci.is-pending {
  color: var(--color-warning-text);
}

.datahub-commit-count {
  align-items: center;
  color: var(--color-text);
  display: inline-flex;
  flex: 0 0 auto;
  font-weight: 600;
  gap: 4px;
  white-space: nowrap;
}

.datahub-commit-count:hover {
  color: var(--color-primary);
  text-decoration: none;
}

.datahub-card-panel {
  background: var(--color-box-body);
  border: 1px solid var(--color-secondary) !important;
  border-radius: 8px !important;
  margin-left: 14px !important;
  margin-right: 14px !important;
  margin-top: 16px !important;
  overflow: hidden;
}

.datahub-pr-workflow {
  padding: 14px 16px !important;
}

.datahub-commit-panel {
  padding: 14px 16px !important;
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

.datahub-file-table th:first-child,
.datahub-file-table td:first-child {
  padding-left: 16px !important;
}

.datahub-file-table th:last-child,
.datahub-file-table td:last-child {
  padding-right: 16px !important;
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

.datahub-file-col-commit {
  width: 220px;
}

.datahub-file-col-updated {
  width: 98px;
}

.datahub-file-col-count {
  width: 56px;
}

.datahub-file-col-size {
  width: 76px;
}

.datahub-file-col-lang {
  width: 90px;
}

.datahub-lang-heading,
.datahub-lang-cell {
  text-align: left !important;
  white-space: nowrap;
}

.datahub-file-commit-cell,
.datahub-file-updated-cell {
  color: var(--color-text-light-2);
  white-space: nowrap;
}

.datahub-file-commit-link {
  color: var(--color-text-light-2);
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.datahub-file-commit-link:hover {
  color: var(--color-primary);
  text-decoration: none;
}

.datahub-file-name-cell,
.datahub-file-actions {
  align-items: center;
  display: flex;
  gap: 6px;
  min-width: 0;
}

.datahub-file-name-cell {
  flex-wrap: nowrap;
}

.datahub-file-actions {
  flex-wrap: wrap;
}

.datahub-file-name {
  margin-right: 6px;
}

.datahub-file-row {
  border-top: 1px solid var(--color-secondary);
}

.datahub-file-row:first-child {
  border-top: 0;
}

.datahub-file-row:hover {
  background: var(--color-hover);
}

.datahub-file-link {
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.datahub-file-row-folder .datahub-file-link {
  color: var(--color-text);
}

.datahub-tree-chevron,
.datahub-tree-file-spacer {
  color: var(--color-text-light-2);
  display: inline-flex;
  flex: 0 0 14px;
  font-size: 17px;
  justify-content: center;
  line-height: 1;
}

.datahub-tree-chevron::before {
  content: '›';
}

.datahub-tree-entry-icon {
  align-items: center;
  display: inline-flex;
  flex: 0 0 18px;
  justify-content: center;
}

.datahub-tree-folder-icon {
  color: var(--color-accent);
}

.datahub-tree-file-icon {
  color: var(--color-text-light-2);
}

.datahub-table-message {
  margin: 0 !important;
}

.datahub-file-actions .button {
  margin: 0 !important;
  padding-left: 9px !important;
  padding-right: 9px !important;
}

.datahub-file-mobile-metrics {
  display: none;
}

.datahub-empty-state {
  margin: 0;
}

@media (max-width: 991px) {
  .datahub-repo-controls {
    flex-wrap: wrap;
  }

  .datahub-go-to-file {
    width: 100%;
  }

  .datahub-repo-actions {
    flex: 1 1 240px;
  }
}

@media (max-width: 767px) {
  .datahub-repo-controls {
    align-items: stretch;
    flex-direction: column;
  }

  .datahub-branch-meta {
    align-items: center;
    flex-direction: row;
    flex-wrap: wrap;
  }

  .datahub-go-to-file {
    min-width: 0;
  }

  .datahub-repo-actions {
    flex: 0 1 auto;
    min-width: 0;
    width: 100%;
  }

  .datahub-file-browser-tools {
    align-items: stretch;
    flex-direction: column;
  }

  .datahub-latest-commit {
    flex-wrap: wrap;
  }

  .datahub-file-table-wrap {
    overflow-x: visible;
  }

  .datahub-file-table,
  .datahub-file-table tbody,
  .datahub-file-table tr,
  .datahub-file-table td {
    display: block;
  }

  .ui.table.datahub-file-table > thead,
  .ui.table.datahub-file-table > thead > tr,
  .ui.table.datahub-file-table > thead > tr > th {
    display: none !important;
  }

  .datahub-file-table tr.datahub-file-row {
    padding: 12px 14px;
  }

  .datahub-file-table td:first-child,
  .datahub-file-table td:last-child {
    padding: 0 !important;
  }

  .ui.table.datahub-file-table > tbody > tr > td.datahub-metric-cell {
    display: none !important;
  }

  .datahub-file-name-cell {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .datahub-file-link {
    white-space: normal;
    word-break: break-word;
  }

  .datahub-file-mobile-metrics {
    color: var(--color-text-light-2);
    display: flex;
    flex-wrap: wrap;
    font-size: 12px;
    gap: 6px 12px;
    line-height: 1.4;
    margin: 7px 0 0 38px;
  }

  .datahub-file-mobile-metrics strong {
    color: var(--color-text);
    font-weight: 600;
  }
}
</style>
