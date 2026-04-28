import {createApp} from 'vue';

export function initDatahubDataRepoHome() {
  const el = document.getElementById('data-repo-home');
  if (!el) return;
  import(/* webpackChunkName: "datahub-repo-home" */'../components/DataRepoHome.vue').then(({default: App}) => {
    createApp(App, {
      owner: el.dataset.owner,
      repo: el.dataset.repo,
      defaultBranch: el.dataset.defaultBranch,
    }).mount(el);
  });
}

export function initDatahubDiffView() {
  const el = document.getElementById('data-diff-view');
  if (!el) return;
  import(/* webpackChunkName: "datahub-diff-view" */'../components/DataDiffView.vue').then(({default: App}) => {
    createApp(App, {
      owner: el.dataset.owner,
      repo: el.dataset.repo,
      oldCommit: el.dataset.oldCommit,
      newCommit: el.dataset.newCommit,
    }).mount(el);
  });
}

export function initDatahubCommitList() {
  const el = document.getElementById('data-commit-list');
  if (!el) return;
  import(/* webpackChunkName: "datahub-commit-list" */'../components/DataCommitList.vue').then(({default: App}) => {
    createApp(App, {
      owner: el.dataset.owner,
      repo: el.dataset.repo,
      branch: el.dataset.branch,
    }).mount(el);
  });
}

export function initDatahubCommitPage() {
  const el = document.getElementById('data-commit-page');
  if (!el) return;
  import(/* webpackChunkName: "datahub-commit-page" */'../components/DataCommitPage.vue').then(({default: App}) => {
    createApp(App, {
      owner: el.dataset.owner,
      repo: el.dataset.repo,
      commitHash: el.dataset.commit,
    }).mount(el);
  });
}

export function initDatahubPreviewPage() {
  const el = document.getElementById('data-preview-page');
  if (!el) return;
  import(/* webpackChunkName: "datahub-preview-page" */'../components/DataPreviewPage.vue').then(({default: App}) => {
    createApp(App, {
      owner: el.dataset.owner,
      repo: el.dataset.repo,
      commitHash: el.dataset.commit,
      filePath: el.dataset.path,
    }).mount(el);
  });
}

export function initDatahubConflictResolver() {
  const el = document.getElementById('conflict-resolver');
  if (!el) return;
  import(/* webpackChunkName: "datahub-conflict-resolver" */'../components/ConflictResolver.vue').then(({default: App}) => {
    createApp(App, {
      owner: el.dataset.owner,
      repo: el.dataset.repo,
      pullId: el.dataset.pullId,
    }).mount(el);
  });
}
