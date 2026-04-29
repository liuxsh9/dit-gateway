<template>
  <div class="ui segments datahub-preview-page">
    <div class="ui segment datahub-page-header">
      <div>
        <div class="datahub-eyebrow">JSONL preview</div>
        <h2 class="ui header datahub-page-title">{{ resolvedFilePath || filePath || commitHash }}</h2>
        <div class="datahub-overview-detail">
          <span class="datahub-hash">{{ shortHash(resolvedCommitHash || commitHash) }}</span>
          semantic row preview for SFT data
        </div>
      </div>
      <div class="datahub-header-actions">
        <div v-if="openDataIssueCount" class="ui tiny warning message datahub-export-warning">
          <span>{{ openDataIssueCount }} open data {{ openDataIssueCount === 1 ? 'issue' : 'issues' }} before export</span>
          <a :href="openDataIssuesHref">Review</a>
        </div>
        <a v-if="canPreviewFile" class="ui small basic button" :href="rawPath" target="_blank" rel="nofollow">
          Raw
        </a>
        <a class="ui small basic button" :href="repoPath">
          <i class="arrow left icon"></i> Dataset summary
        </a>
        <a class="ui small basic button" :href="commitPath">
          Commit
        </a>
      </div>
    </div>
    <div class="ui segment datahub-preview-workspace" :class="{'is-sidebar-collapsed': filesSidebarCollapsed}">
      <aside v-if="!filesSidebarCollapsed" class="datahub-preview-tree">
        <div class="datahub-preview-tree-heading">
          <div class="datahub-preview-tree-title">Files</div>
          <button
            type="button"
            class="datahub-sidebar-edge-toggle"
            data-testid="datahub-preview-sidebar-toggle"
            aria-label="Hide files sidebar"
            @click="toggleFilesSidebar"
          >
            <SvgIcon name="octicon-chevron-left" :size="14"/>
          </button>
        </div>
        <div v-if="treeLoading" class="datahub-tree-loading">
          <div class="ui active inline loader datahub-tree-loader"></div>
          <div>
            <strong>Loading file list</strong>
            <span>Resolving files and row counts.</span>
          </div>
        </div>
        <div v-else-if="treeError" class="ui tiny negative message">{{ treeError }}</div>
        <nav v-else class="datahub-tree-list" aria-label="Dataset files">
          <template v-for="entry in treeRows" :key="entry.path">
            <button
              v-if="entry.type === 'tree'"
              type="button"
              class="datahub-tree-row datahub-tree-folder"
              :style="{paddingLeft: `${8 + entry.depth * 14}px`}"
              @click="toggleFolder(entry.path)"
            >
              <span
                class="datahub-tree-chevron"
                :class="{'is-open': isFolderOpen(entry.path)}"
                aria-hidden="true"
              ></span>
              <span class="datahub-tree-entry-icon datahub-tree-folder-icon" aria-hidden="true">
                <SvgIcon name="octicon-file-directory-fill" :size="16"/>
              </span>
              <span class="datahub-tree-label">{{ entry.name }}</span>
            </button>
            <a
              v-else
              class="datahub-tree-row"
              :class="{active: entry.path === resolvedFilePath}"
              :href="previewHref(entry.path)"
              :style="{paddingLeft: `${8 + entry.depth * 14}px`}"
            >
              <span class="datahub-tree-file-spacer" aria-hidden="true"></span>
              <span class="datahub-tree-entry-icon datahub-tree-file-icon" aria-hidden="true">
                <SvgIcon name="octicon-file" :size="16"/>
              </span>
              <span class="datahub-tree-label">{{ entry.name }}</span>
            </a>
          </template>
        </nav>
      </aside>
      <aside v-else class="datahub-preview-tree-rail" aria-label="Files sidebar collapsed">
        <button
          type="button"
          class="datahub-sidebar-rail-toggle"
          data-testid="datahub-preview-sidebar-toggle"
          aria-label="Show files sidebar"
          @click="toggleFilesSidebar"
        >
          <SvgIcon name="octicon-chevron-right" :size="14"/>
        </button>
      </aside>
      <main class="datahub-preview-review">
        <div v-if="treeError && !canPreviewFile" class="ui negative message">
          {{ treeError }}
        </div>
        <div v-else-if="treeLoading && !canPreviewFile" class="ui message datahub-preview-loading-state">
          <div class="ui active inline loader"></div>
          <div>
            <strong>Loading preview</strong>
            <p>Resolving the first JSONL manifest for this ref.</p>
          </div>
        </div>
        <div v-else-if="!canPreviewFile" class="ui message">
          No JSONL manifest files are available for this ref yet.
        </div>
        <JsonlViewer
          v-else-if="canPreviewFile"
          :owner="owner"
          :repo="repo"
          :commit-hash="resolvedCommitHash"
          :file-path="resolvedFilePath"
          :single-row-mode="true"
          @open-issues-loaded="handleOpenIssuesLoaded"
        />
      </main>
    </div>
  </div>
</template>

<script>
import {datahubFetch} from '../utils/datahub-api.js';
import JsonlViewer from './JsonlViewer.vue';
import {SvgIcon} from '../svg.js';

export default {
  components: {JsonlViewer, SvgIcon},
  props: {
    owner: String,
    repo: String,
    commitHash: String,
    filePath: String,
  },
  data() {
    return {
      tree: null,
      treeLoading: true,
      treeError: null,
      treeDirectories: {},
      openFolders: new Set(),
      manuallyClosedFolders: new Set(),
      stats: null,
      filesSidebarCollapsed: false,
      openDataIssueCount: 0,
      openDataIssuesHref: '',
      resolvedCommitHash: '',
      resolvedFilePath: '',
    };
  },
  computed: {
    canPreviewFile() {
      return Boolean(this.resolvedCommitHash && this.isManifestPath(this.resolvedFilePath));
    },
    repoPath() {
      return `/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
    },
    commitPath() {
      return `${this.repoPath}/data/commit/${encodeURIComponent(this.resolvedCommitHash || this.commitHash)}`;
    },
    rawPath() {
      return `/api/v1/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/datahub/export/${encodeURIComponent(this.resolvedCommitHash)}/${this.resolvedFilePath.split('/').map(encodeURIComponent).join('/')}`;
    },
    treeStateStorageKey() {
      const commit = this.resolvedCommitHash || this.commitHash || '';
      return `datahub-preview-tree:${this.owner}/${this.repo}:${commit}`;
    },
    treeRows() {
      const manifestPaths = this.manifestPaths.toSorted((a, b) => this.compareTreeNames(a, b));
      const folderPaths = new Set(this.loadedFolderPaths);
      for (const path of manifestPaths) {
        const parts = path.split('/');
        for (let index = 1; index < parts.length; index++) {
          folderPaths.add(`${parts.slice(0, index).join('/')}/`);
        }
      }

      const rows = [];
      const appendLevel = (prefix, depth) => {
        const folders = Array.from(folderPaths)
          .filter((folder) => folder.startsWith(prefix) && folder.slice(prefix.length).split('/').filter(Boolean).length === 1)
          .sort((a, b) => this.compareTreeNames(a.slice(prefix.length), b.slice(prefix.length)));
        for (const folder of folders) {
          rows.push({
            type: 'tree',
            path: folder,
            name: folder.slice(prefix.length).replace(/\/$/, ''),
            depth,
          });
          if (this.isFolderOpen(folder)) appendLevel(folder, depth + 1);
        }
        const files = manifestPaths
          .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
          .sort((a, b) => this.compareTreeNames(a.slice(prefix.length), b.slice(prefix.length)));
        for (const path of files) {
          rows.push({
            type: 'manifest',
            path,
            name: path.slice(prefix.length),
            depth,
          });
        }
      };
      appendLevel('', 0);
      return rows;
    },
    loadedTreeEntries() {
      const entries = [];
      for (const [directory, directoryEntries] of Object.entries(this.treeDirectories)) {
        const prefix = this.normalizeDirectoryPath(directory);
        for (const entry of directoryEntries || []) {
          const type = entry.type || entry.obj_type;
          const name = this.normalizePath(entry.name || entry.path);
          if (!name || !['manifest', 'tree'].includes(type)) continue;
          entries.push({
            ...entry,
            type,
            path: this.joinPath(prefix, name),
          });
        }
      }
      return entries;
    },
    loadedFolderPaths() {
      return this.loadedTreeEntries
        .filter((entry) => entry.type === 'tree')
        .map((entry) => this.normalizeDirectoryPath(entry.path));
    },
    manifestPaths() {
      const paths = new Set();
      for (const file of this.stats?.files || []) {
        if (file.path) paths.add(this.normalizePath(file.path));
      }
      for (const entry of this.loadedTreeEntries) {
        if (entry.type === 'manifest') {
          paths.add(this.normalizePath(entry.path));
        }
      }
      return Array.from(paths).filter(Boolean);
    },
  },
  async mounted() {
    this.restoreTreeState();
    this.ensureSelectedPathFoldersOpen();
    try {
      this.resolvedCommitHash = await this.resolveCommitHash();
      const requestedFilePath = this.normalizePath(this.filePath);
      this.resolvedFilePath = this.isManifestPath(requestedFilePath) ? requestedFilePath : '';
      this.restoreTreeState();
      this.ensureSelectedPathFoldersOpen();

      const statsPromise = this.fetchStats();
      const tree = await datahubFetch(this.owner, this.repo, `/tree/${this.resolvedCommitHash}`);
      this.tree = tree;
      this.setTreeDirectory('', tree.entries || []);
      this.treeLoading = false;
      if (!this.resolvedFilePath) {
        this.resolvedFilePath = this.resolveFilePath();
        this.ensureSelectedPathFoldersOpen();
      }
      await this.loadSelectedPathDirectories();
      await this.loadOpenFolderDirectories();
      this.resolvedFilePath = await this.resolvePreviewFilePath(this.resolvedFilePath || requestedFilePath);
      this.ensureSelectedPathFoldersOpen();
      await this.loadSelectedPathDirectories();
      await this.loadOpenFolderDirectories();

      const stats = await statsPromise;
      this.stats = stats;
      this.ensureSelectedPathFoldersOpen();
      if (!this.resolvedFilePath) {
        this.resolvedFilePath = this.resolveFilePath();
        this.ensureSelectedPathFoldersOpen();
        await this.loadSelectedPathDirectories();
        await this.loadOpenFolderDirectories();
      }
    } catch (e) {
      this.treeError = e.message;
    } finally {
      this.treeLoading = false;
    }
  },
  methods: {
    shortHash(hash) {
      return hash ? hash.slice(0, 7) : '-';
    },
    previewHref(path) {
      return `${this.repoPath}/data/preview/${encodeURIComponent(this.resolvedCommitHash || this.commitHash)}/${path.split('/').map(encodeURIComponent).join('/')}`;
    },
    compareTreeNames(a, b) {
      const left = String(a || '').replace(/\/+$/, '');
      const right = String(b || '').replace(/\/+$/, '');
      return left.localeCompare(right);
    },
    normalizePath(path) {
      return String(path || '').replace(/^\/+/, '');
    },
    normalizeDirectoryPath(path) {
      const clean = this.normalizePath(path).replace(/\/+$/, '');
      return clean ? `${clean}/` : '';
    },
    joinPath(prefix, path) {
      const cleanPath = this.normalizePath(path);
      const cleanPrefix = this.normalizeDirectoryPath(prefix);
      if (!cleanPrefix || cleanPath.startsWith(cleanPrefix)) return cleanPath;
      return `${cleanPrefix}${cleanPath}`;
    },
    encodePath(path) {
      return String(path || '').split('/').map(encodeURIComponent).join('/');
    },
    setTreeDirectory(path, entries) {
      const directory = this.normalizeDirectoryPath(path);
      this.treeDirectories = {
        ...this.treeDirectories,
        [directory]: entries,
      };
    },
    async loadTreeDirectory(path) {
      const directory = this.normalizeDirectoryPath(path);
      if (!directory || this.treeDirectories[directory]) return;
      try {
        const tree = await datahubFetch(
          this.owner,
          this.repo,
          `/tree/${this.resolvedCommitHash}/${this.encodePath(directory.replace(/\/$/, ''))}`,
        );
        this.setTreeDirectory(directory, tree.entries || []);
      } catch {
        // Keep the sidebar usable with the directories already loaded.
      }
    },
    async loadSelectedPathDirectories() {
      const path = this.normalizePath(this.resolvedFilePath || this.filePath);
      const parts = path.split('/').filter(Boolean);
      const directories = [];
      for (let index = 1; index < parts.length; index++) {
        directories.push(parts.slice(0, index).join('/'));
      }
      await Promise.all(directories.map((directory) => this.loadTreeDirectory(directory)));
    },
    async loadOpenFolderDirectories() {
      await Promise.all(Array.from(this.openFolders).map((directory) => this.loadTreeDirectory(directory)));
    },
    async fetchStats() {
      try {
        return await datahubFetch(this.owner, this.repo, `/stats/${this.resolvedCommitHash}`);
      } catch {
        return null;
      }
    },
    async resolveCommitHash() {
      if (/^[a-f0-9]{4,64}$/.test(this.commitHash || '')) return this.commitHash;
      const refName = String(this.commitHash || '').replace(/^heads\//, '');
      const ref = await datahubFetch(this.owner, this.repo, `/refs/heads/${this.encodePath(refName)}`);
      return ref.target_hash || ref.object_hash || ref.hash || ref.commit_hash || '';
    },
    resolveFilePath() {
      const normalized = this.normalizePath(this.filePath);
      if (normalized && this.manifestPaths.includes(normalized)) return normalized;
      return this.manifestPaths.toSorted((a, b) => this.compareTreeNames(a, b))[0] || '';
    },
    isManifestPath(path) {
      return /\.jsonl$/i.test(this.normalizePath(path));
    },
    async resolvePreviewFilePath(path) {
      const normalized = this.normalizePath(path);
      if (!normalized || this.manifestPaths.includes(normalized)) return normalized;
      const candidates = await this.findManifestPathsUnder(normalized);
      return candidates[0] || normalized;
    },
    async findManifestPathsUnder(path) {
      const directory = this.normalizeDirectoryPath(path);
      await this.loadTreeDirectory(directory);
      const directEntries = (this.treeDirectories[directory] || []).map((entry) => ({
        ...entry,
        type: entry.type || entry.obj_type,
        path: this.joinPath(directory, entry.name || entry.path),
      }));
      const directManifests = directEntries
        .filter((entry) => entry.type === 'manifest')
        .map((entry) => this.normalizePath(entry.path))
        .sort((a, b) => this.compareTreeNames(a, b));
      if (directManifests.length) return directManifests;
      const folders = directEntries
        .filter((entry) => entry.type === 'tree')
        .map((entry) => this.normalizeDirectoryPath(entry.path))
        .sort((a, b) => this.compareTreeNames(a, b));
      for (const folder of folders) {
        const nested = await this.findManifestPathsUnder(folder);
        if (nested.length) return nested;
      }
      return [];
    },
    selectedPathFolders() {
      const parts = this.normalizePath(this.resolvedFilePath || this.filePath).split('/');
      const folders = [];
      for (let index = 1; index < parts.length; index++) {
        folders.push(`${parts.slice(0, index).join('/')}/`);
      }
      return folders;
    },
    ensureSelectedPathFoldersOpen() {
      const next = new Set(this.openFolders);
      for (const folder of this.selectedPathFolders()) {
        if (!this.manuallyClosedFolders.has(folder)) next.add(folder);
      }
      this.openFolders = next;
    },
    restoreTreeState() {
      try {
        const stored = JSON.parse(window.sessionStorage.getItem(this.treeStateStorageKey) || '{}');
        this.openFolders = new Set((stored.open || []).map((path) => this.normalizeDirectoryPath(path)));
        this.manuallyClosedFolders = new Set((stored.closed || []).map((path) => this.normalizeDirectoryPath(path)));
      } catch {
        this.openFolders = new Set();
        this.manuallyClosedFolders = new Set();
      }
    },
    persistTreeState() {
      try {
        window.sessionStorage.setItem(this.treeStateStorageKey, JSON.stringify({
          open: Array.from(this.openFolders).toSorted((a, b) => this.compareTreeNames(a, b)),
          closed: Array.from(this.manuallyClosedFolders).toSorted((a, b) => this.compareTreeNames(a, b)),
        }));
      } catch {
        // sessionStorage can be unavailable in restricted browser contexts.
      }
    },
    isFolderOpen(path) {
      return this.openFolders.has(path);
    },
    toggleFolder(path) {
      const directory = this.normalizeDirectoryPath(path);
      const next = new Set(this.openFolders);
      const closed = new Set(this.manuallyClosedFolders);
      if (next.has(directory)) {
        next.delete(directory);
        closed.add(directory);
      } else {
        next.add(directory);
        closed.delete(directory);
        this.loadTreeDirectory(directory);
      }
      this.openFolders = next;
      this.manuallyClosedFolders = closed;
      this.persistTreeState();
    },
    toggleFilesSidebar() {
      this.filesSidebarCollapsed = !this.filesSidebarCollapsed;
    },
    handleOpenIssuesLoaded(payload = {}) {
      this.openDataIssueCount = Number(payload.count) || 0;
      this.openDataIssuesHref = payload.href || `${this.repoPath}/issues`;
    },
  },
};
</script>

<style scoped>
.datahub-preview-page {
  border: 0;
}

.datahub-page-header {
  align-items: flex-start;
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.datahub-page-title {
  margin: 2px 0 0 !important;
  overflow-wrap: anywhere;
}

.datahub-header-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.datahub-export-warning {
  align-items: center;
  display: inline-flex;
  gap: 8px;
  margin: 0 !important;
  min-height: 32px;
  padding: 6px 10px !important;
}

.datahub-eyebrow {
  color: var(--color-text-light-2);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.datahub-overview-detail {
  margin-top: 3px;
  color: var(--color-text-light-2);
  font-size: 12px;
}

.datahub-hash {
  font-family: var(--fonts-monospace);
}

.datahub-preview-workspace {
  display: grid;
  gap: 0;
  grid-template-columns: minmax(180px, 280px) minmax(0, 1fr);
  padding: 0 !important;
}

.datahub-preview-workspace.is-sidebar-collapsed {
  gap: 0;
  grid-template-columns: 42px minmax(0, 1fr);
}

.datahub-preview-tree {
  background: var(--color-box-header);
  border-right: 1px solid var(--color-secondary);
  min-height: 680px;
  padding: 12px;
  position: relative;
}

.datahub-preview-tree-heading {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  min-height: 28px;
  margin-bottom: 8px;
  padding-right: 8px;
}

.datahub-preview-tree-title {
  color: var(--color-text-light-2);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.datahub-sidebar-edge-toggle,
.datahub-sidebar-rail-toggle {
  align-items: center;
  background: var(--color-box-body);
  border: 1px solid var(--color-secondary);
  color: var(--color-text-light);
  cursor: pointer;
  display: inline-flex;
  justify-content: center;
  transition: background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease, color 0.12s ease;
}

.datahub-sidebar-edge-toggle {
  border-radius: 0 8px 8px 0;
  box-shadow: 1px 1px 2px var(--color-shadow);
  height: 34px;
  margin-right: 0;
  position: absolute;
  right: -22px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  z-index: 1;
}

.datahub-sidebar-edge-toggle:hover,
.datahub-sidebar-rail-toggle:hover,
.datahub-sidebar-edge-toggle:focus-visible,
.datahub-sidebar-rail-toggle:focus-visible {
  background: var(--color-active);
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 18%, transparent);
  color: var(--color-text);
  outline: none;
}

.datahub-preview-tree-rail {
  background: var(--color-box-header);
  border-right: 1px solid var(--color-secondary);
  min-height: 680px;
  padding: 0;
  position: relative;
}

.datahub-sidebar-rail-toggle {
  border-radius: 0 8px 8px 0;
  box-shadow: 1px 1px 2px var(--color-shadow);
  height: 34px;
  padding: 0;
  position: absolute;
  right: -22px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  z-index: 1;
}

.datahub-tree-loading {
  align-items: center;
  color: var(--color-text-light-2);
  display: flex;
  gap: 12px;
  margin: 16px 0;
}

.datahub-tree-loading strong,
.datahub-tree-loading span {
  display: block;
}

.datahub-tree-loading strong {
  color: var(--color-text);
  font-size: 12px;
}

.datahub-tree-loading span {
  font-size: 12px;
}

.datahub-tree-loader {
  flex: 0 0 auto;
  margin: 0;
}

.datahub-tree-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.datahub-tree-row {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--color-text);
  cursor: pointer;
  display: flex;
  gap: 6px;
  min-height: 32px;
  overflow: hidden;
  padding-right: 8px;
  text-align: left;
  width: 100%;
}

.datahub-tree-row:hover,
.datahub-tree-row.active {
  background: var(--color-active);
  border-color: var(--color-secondary);
  text-decoration: none;
}

.datahub-tree-row.active {
  border-left-color: var(--color-accent);
  box-shadow: inset 3px 0 0 var(--color-accent);
  font-weight: 600;
}

.datahub-tree-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.datahub-tree-chevron {
  transition: transform 0.12s ease;
}

.datahub-tree-chevron::before {
  content: '›';
}

.datahub-tree-chevron.is-open {
  transform: rotate(90deg);
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

.datahub-preview-review {
  min-width: 0;
  padding: 12px 12px 12px 32px;
}

.datahub-preview-loading-state {
  align-items: center;
  display: flex;
  gap: 12px;
}

.datahub-preview-loading-state p {
  margin: 2px 0 0;
}

.datahub-preview-workspace.is-sidebar-collapsed .datahub-preview-review {
  padding: 12px 12px 12px 32px;
}

@media (max-width: 767px) {
  .datahub-page-header {
    flex-direction: column;
  }

  .datahub-header-actions {
    justify-content: flex-start;
  }

  .datahub-preview-workspace {
    grid-template-columns: 1fr;
  }

  .datahub-preview-workspace.is-sidebar-collapsed {
    grid-template-columns: 1fr;
  }

  .datahub-preview-tree {
    border-right: 0;
    border-bottom: 1px solid var(--color-secondary);
    min-height: 0;
  }

  .datahub-sidebar-edge-toggle {
    border-radius: 8px;
    height: 30px;
    margin-right: 0;
    position: static;
    transform: none;
    width: 30px;
  }

  .datahub-preview-tree-rail {
    align-items: center;
    border-right: 0;
    border-bottom: 1px solid var(--color-secondary);
    justify-content: flex-start;
    min-height: 0;
    position: static;
    padding: 8px 12px;
  }

  .datahub-sidebar-rail-toggle {
    flex-direction: row;
    height: 30px;
    min-height: 30px;
    padding: 5px 10px;
    position: static;
    transform: none;
    width: auto;
  }

  .datahub-preview-review {
    padding: 12px;
  }
}
</style>
