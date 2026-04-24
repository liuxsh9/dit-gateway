<template>
  <div class="ui grid">
    <!-- Conflict file sidebar -->
    <div class="four wide column">
      <div class="ui segment">
        <h4 class="ui header">Conflict Files</h4>
        <div class="ui list">
          <a class="item" v-for="file in conflictFiles" :key="file"
             :class="{active: file === activeFile}" @click="activeFile = file">
            <i class="warning sign icon"></i> {{ file }}
          </a>
        </div>
      </div>
      <div class="ui segment">
        <div class="ui small statistic">
          <div class="value">{{ resolvedCount }} / {{ totalConflicts }}</div>
          <div class="label">Resolved</div>
        </div>
      </div>
    </div>

    <!-- Conflict rows -->
    <div class="twelve wide column">
      <div class="ui segment" v-for="conflict in activeConflicts" :key="conflict.row_hash">
        <div class="ui two column grid">
          <div class="column">
            <h5 class="ui header">Source</h5>
            <pre class="datahub-conflict-content">{{ formatRow(conflict.source) }}</pre>
          </div>
          <div class="column">
            <h5 class="ui header">Target</h5>
            <pre class="datahub-conflict-content">{{ formatRow(conflict.target) }}</pre>
          </div>
        </div>
        <div class="ui buttons" style="margin-top: 8px;">
          <button class="ui button" :class="{green: getResolution(conflict.row_hash) === 'source'}"
                  @click="resolve(conflict.row_hash, 'source')">Keep Source</button>
          <button class="ui button" :class="{blue: getResolution(conflict.row_hash) === 'target'}"
                  @click="resolve(conflict.row_hash, 'target')">Keep Target</button>
        </div>
      </div>

      <!-- Submit -->
      <div class="ui segment" v-if="totalConflicts > 0">
        <button class="ui primary button" :disabled="resolvedCount < totalConflicts || submitting"
                :class="{loading: submitting}" @click="submitResolutions">
          Submit Resolution ({{ resolvedCount }}/{{ totalConflicts }})
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import {datahubFetch} from '../utils/datahub-api.js';

export default {
  props: {
    owner: String,
    repo: String,
    pullId: String,
  },
  data() {
    return {
      conflictFiles: [],
      conflicts: {},
      resolutions: {},
      activeFile: null,
      submitting: false,
    };
  },
  computed: {
    activeConflicts() {
      return this.conflicts[this.activeFile] || [];
    },
    totalConflicts() {
      let count = 0;
      for (const file of Object.values(this.conflicts)) count += file.length;
      return count;
    },
    resolvedCount() {
      return Object.keys(this.resolutions).length;
    },
  },
  async mounted() {
    const pr = await datahubFetch(this.owner, this.repo, `/pulls/${this.pullId}`);
    if (pr.conflict_files) {
      this.conflictFiles = JSON.parse(pr.conflict_files);
      for (const file of this.conflictFiles) {
        const diff = await datahubFetch(this.owner, this.repo,
          `/diff/${pr.target_commit}/${pr.source_commit}`);
        const fileData = diff.files?.find((f) => f.path === file);
        if (fileData) this.conflicts[file] = fileData.changes?.filter((c) => c.conflict) || [];
      }
      if (this.conflictFiles.length > 0) this.activeFile = this.conflictFiles[0];
    }
  },
  methods: {
    resolve(rowHash, choice) {
      this.resolutions[rowHash] = choice;
    },
    getResolution(rowHash) {
      return this.resolutions[rowHash] || null;
    },
    formatRow(content) {
      if (!content) return '';
      return JSON.stringify(content, null, 2);
    },
    async submitResolutions() {
      this.submitting = true;
      try {
        await datahubFetch(this.owner, this.repo, `/pulls/${this.pullId}/merge`, {
          method: 'POST',
          body: JSON.stringify({resolutions: this.resolutions}),
        });
        window.location.reload();
      } catch (e) {
        alert(`Resolution failed: ${e.message}`);
      } finally {
        this.submitting = false;
      }
    },
  },
};
</script>

<style scoped>
.datahub-conflict-content {
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow: auto;
  font-size: 12px;
  background: var(--color-body, #f8f8f8);
  padding: 8px;
  border-radius: 4px;
  margin: 0;
}
</style>
