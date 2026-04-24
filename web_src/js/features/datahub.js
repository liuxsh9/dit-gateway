import {createApp} from 'vue';

export function initDatahubDataRepoHome() {
  const el = document.getElementById('data-repo-home');
  if (!el) return;
  import('../components/DataRepoHome.vue').then(({default: App}) => {
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
  import('../components/DataDiffView.vue').then(({default: App}) => {
    createApp(App, {
      owner: el.dataset.owner,
      repo: el.dataset.repo,
      oldCommit: el.dataset.oldCommit,
      newCommit: el.dataset.newCommit,
    }).mount(el);
  });
}

export function initDatahubConflictResolver() {
  const el = document.getElementById('conflict-resolver');
  if (!el) return;
  import('../components/ConflictResolver.vue').then(({default: App}) => {
    createApp(App, {
      owner: el.dataset.owner,
      repo: el.dataset.repo,
      pullId: el.dataset.pullId,
    }).mount(el);
  });
}
