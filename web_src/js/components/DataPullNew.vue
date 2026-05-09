<template>
  <div class="datahub-pull-new">
    <div class="datahub-pr-new-header">
      <a class="ui basic button" :href="pullListHref">Back to pull requests</a>
      <h2 class="ui header">New pull request</h2>
    </div>

    <div v-if="loading" class="datahub-pr-loading">
      <div class="ui active centered inline loader"></div>
    </div>
    <div v-else class="ui segment">
      <div v-if="error" class="ui negative message">{{ error }}</div>
      <form class="ui form" @submit.prevent="submitPull">
        <div class="two fields">
          <div class="required field">
            <label>Base branch</label>
            <select v-model="targetBranch" required>
              <option v-for="branch in branchNames" :key="`target-${branch}`" :value="branch">{{ branch }}</option>
            </select>
          </div>
          <div class="required field">
            <label>Compare branch</label>
            <select v-model="sourceBranch" required>
              <option v-for="branch in branchNames" :key="`source-${branch}`" :value="branch">{{ branch }}</option>
            </select>
          </div>
        </div>

        <div class="required field">
          <label>Title</label>
          <input v-model="title" name="title" maxlength="255" required placeholder="Summarize the dataset change">
        </div>
        <div class="field">
          <label>Description</label>
          <textarea v-model="body" name="body" rows="12" placeholder="Describe source, processing, risk, and reviewer focus"></textarea>
        </div>

        <button class="ui primary button" type="submit" :disabled="submitting || !canSubmit">
          {{ submitting ? 'Creating pull request...' : 'Create pull request' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script>
import {datahubFetch} from '../utils/datahub-api.js';

export default {
  props: {
    owner: String,
    repo: String,
    defaultBranch: {
      type: String,
      default: 'main',
    },
  },
  data() {
    return {
      refs: [],
      title: '',
      body: '',
      sourceBranch: '',
      targetBranch: this.defaultBranch || 'main',
      loading: true,
      submitting: false,
      error: null,
    };
  },
  computed: {
    repoPath() {
      return `/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
    },
    pullListHref() {
      return `${this.repoPath}/data/pulls`;
    },
    branchNames() {
      return this.refs.map((ref) => this.branchName(ref.name));
    },
    canSubmit() {
      return this.title.trim() && this.sourceBranch && this.targetBranch && this.sourceBranch !== this.targetBranch;
    },
  },
  async mounted() {
    await this.loadForm();
  },
  methods: {
    async loadForm() {
      this.loading = true;
      this.error = null;
      try {
        const [refs, template] = await Promise.all([
          datahubFetch(this.owner, this.repo, '/refs'),
          datahubFetch(this.owner, this.repo, '/templates/default?kind=pull_request').catch(() => null),
        ]);
        this.refs = (refs || []).filter((ref) => ref.name?.startsWith('heads/'));
        this.targetBranch = this.queryParam('target') || this.defaultBranch || this.branchNames[0] || 'main';
        this.sourceBranch = this.queryParam('source') || this.branchNames.find((branch) => branch !== this.targetBranch) || '';
        this.body = template?.content || '';
        if (template?.name && !this.title) this.title = template.name;
      } catch (e) {
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    },
    async submitPull() {
      if (!this.canSubmit) return;
      this.submitting = true;
      this.error = null;
      try {
        const result = await datahubFetch(this.owner, this.repo, '/pulls', {
          method: 'POST',
          body: JSON.stringify({
            title: this.title.trim(),
            description: this.body,
            source_branch: this.sourceBranch,
            target_branch: this.targetBranch,
          }),
        });
        const id = result?.pull_request_id || result?.id;
        window.location.href = id ? `${this.repoPath}/data/pulls/${encodeURIComponent(id)}` : this.pullListHref;
      } catch (e) {
        this.error = e.message;
      } finally {
        this.submitting = false;
      }
    },
    branchName(refName) {
      return String(refName || '').replace(/^heads\//, '');
    },
    queryParam(name) {
      try {
        return new URLSearchParams(window.location.search).get(name) || '';
      } catch {
        return '';
      }
    },
  },
};
</script>

<style scoped>
.datahub-pull-new {
  margin: 24px 0;
}

.datahub-pr-new-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.datahub-pr-new-header .ui.header {
  margin: 0;
}
</style>
