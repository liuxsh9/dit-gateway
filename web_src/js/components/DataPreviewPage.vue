<template>
  <div class="ui segments datahub-preview-page">
    <div class="ui segment datahub-page-header">
      <div>
        <div class="datahub-eyebrow">JSONL preview</div>
        <h2 class="ui header datahub-page-title">{{ filePath }}</h2>
        <div class="datahub-overview-detail">
          <span class="datahub-hash">{{ shortHash(commitHash) }}</span>
          semantic row preview for SFT data
        </div>
      </div>
      <div class="datahub-header-actions">
        <button
          type="button"
          class="ui small basic button datahub-sidebar-toggle"
          data-testid="datahub-preview-sidebar-toggle"
          :aria-pressed="filesSidebarCollapsed ? 'true' : 'false'"
          @click="toggleFilesSidebar"
        >
          <i :class="filesSidebarCollapsed ? 'columns icon' : 'angle left icon'"></i>
          {{ filesSidebarCollapsed ? 'Show files' : 'Hide files' }}
        </button>
        <a class="ui small basic button" :href="rawPath" target="_blank" rel="nofollow">
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
        <div class="datahub-preview-tree-title">Files</div>
        <div v-if="treeLoading" class="ui active centered inline loader datahub-tree-loader"></div>
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
              :class="{active: entry.path === filePath}"
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
      <main class="datahub-preview-review">
        <JsonlViewer
          :owner="owner"
          :repo="repo"
          :commit-hash="commitHash"
          :file-path="filePath"
          :single-row-mode="true"
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
      openFolders: new Set(),
      stats: null,
      filesSidebarCollapsed: false,
    };
  },
  computed: {
    repoPath() {
      return `/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
    },
    commitPath() {
      return `${this.repoPath}/data/commit/${encodeURIComponent(this.commitHash)}`;
    },
    rawPath() {
      return `/api/v1/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/datahub/export/${encodeURIComponent(this.commitHash)}/${this.filePath.split('/').map(encodeURIComponent).join('/')}`;
    },
    treeRows() {
      const manifestPaths = this.manifestPaths.toSorted();
      const folderPaths = new Set();
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
          .sort();
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
          .sort();
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
    manifestPaths() {
      const paths = new Set();
      for (const file of this.stats?.files || []) {
        if (file.path) paths.add(this.normalizePath(file.path));
      }
      for (const entry of this.tree?.entries || []) {
        if ((entry.type || entry.obj_type) === 'manifest') {
          paths.add(this.normalizePath(entry.name || entry.path));
        }
      }
      return Array.from(paths).filter(Boolean);
    },
  },
  async mounted() {
    this.seedOpenFolders();
    try {
      const [tree, stats] = await Promise.all([
        datahubFetch(this.owner, this.repo, `/tree/${this.commitHash}`),
        this.fetchStats(),
      ]);
      this.tree = tree;
      this.stats = stats;
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
      return `${this.repoPath}/data/preview/${encodeURIComponent(this.commitHash)}/${path.split('/').map(encodeURIComponent).join('/')}`;
    },
    normalizePath(path) {
      return String(path || '').replace(/^\/+/, '');
    },
    async fetchStats() {
      try {
        return await datahubFetch(this.owner, this.repo, `/stats/${this.commitHash}`);
      } catch {
        return null;
      }
    },
    seedOpenFolders() {
      const parts = this.normalizePath(this.filePath).split('/');
      const open = new Set();
      for (let index = 1; index < parts.length; index++) {
        open.add(`${parts.slice(0, index).join('/')}/`);
      }
      this.openFolders = open;
    },
    isFolderOpen(path) {
      return this.openFolders.has(path);
    },
    toggleFolder(path) {
      const next = new Set(this.openFolders);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      this.openFolders = next;
    },
    toggleFilesSidebar() {
      this.filesSidebarCollapsed = !this.filesSidebarCollapsed;
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
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
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
  gap: 14px;
  grid-template-columns: minmax(180px, 280px) minmax(0, 1fr);
  padding: 0 !important;
}

.datahub-preview-workspace.is-sidebar-collapsed {
  grid-template-columns: minmax(0, 1fr);
}

.datahub-preview-tree {
  background: var(--color-box-header);
  border-right: 1px solid var(--color-secondary);
  min-height: 680px;
  padding: 12px;
}

.datahub-preview-tree-title {
  color: var(--color-text-light-2);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.datahub-tree-loader {
  margin: 16px 0;
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
  padding: 12px 12px 12px 0;
}

.datahub-preview-workspace.is-sidebar-collapsed .datahub-preview-review {
  padding: 12px;
}

.datahub-sidebar-toggle[aria-pressed='true'] {
  background: var(--color-active) !important;
  color: var(--color-text) !important;
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

  .datahub-preview-tree {
    border-right: 0;
    border-bottom: 1px solid var(--color-secondary);
    min-height: 0;
  }

  .datahub-preview-review {
    padding: 12px;
  }
}
</style>
