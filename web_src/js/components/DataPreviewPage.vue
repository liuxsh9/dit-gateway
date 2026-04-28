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
        <a class="ui small basic button" :href="repoPath">
          <i class="arrow left icon"></i> Dataset summary
        </a>
        <a class="ui small basic button" :href="commitPath">
          Commit
        </a>
      </div>
    </div>
    <JsonlViewer
      :owner="owner"
      :repo="repo"
      :commit-hash="commitHash"
      :file-path="filePath"
    />
  </div>
</template>

<script>
import JsonlViewer from './JsonlViewer.vue';

export default {
  components: {JsonlViewer},
  props: {
    owner: String,
    repo: String,
    commitHash: String,
    filePath: String,
  },
  computed: {
    repoPath() {
      return `/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
    },
    commitPath() {
      return `${this.repoPath}/data/commit/${encodeURIComponent(this.commitHash)}`;
    },
  },
  methods: {
    shortHash(hash) {
      return hash ? hash.slice(0, 7) : '-';
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

@media (max-width: 767px) {
  .datahub-page-header {
    flex-direction: column;
  }

  .datahub-header-actions {
    justify-content: flex-start;
  }
}
</style>

