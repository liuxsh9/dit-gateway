<template>
  <div class="datahub-pull-page" :class="{'is-files-tab': activeTab === 'files'}">
    <div class="datahub-pr-header">
      <div class="datahub-pr-header-main">
        <div class="datahub-eyebrow">DIT pull request</div>
        <h2 class="datahub-pr-title">
          <span class="datahub-pr-number" v-if="pull">#{{ pullNumber(pull) }}</span>
          {{ pullTitle }}
        </h2>
        <div class="datahub-pr-merge-line" v-if="pull">
          <span class="datahub-pr-state-pill" :class="`is-${normalizedStatus}`">
            <i :class="statusIcon"></i>
            {{ statusLabel(pull.status) }}
          </span>
          <strong>{{ pull.author || 'unknown author' }}</strong>
          wants to merge
          <span class="datahub-branch">{{ sourceBranch }}</span>
          into
          <span class="datahub-branch">{{ targetBranch }}</span>
        </div>
      </div>
      <div class="datahub-header-actions">
        <a class="ui small basic button" :href="pullsPath">
          <i class="arrow left icon"></i> Pull requests
        </a>
        <a class="ui small basic button" :href="repoPath">
          Dataset summary
        </a>
      </div>
    </div>

    <div class="ui segment" v-if="loading">
      <div class="ui active centered inline loader"></div>
    </div>
    <div class="ui segment" v-else-if="error">
      <div class="ui negative message">{{ error }}</div>
    </div>
    <template v-else-if="pull">
      <nav class="datahub-pr-tabs" aria-label="Pull request sections">
        <button
          v-for="tabItem in tabs"
          :key="tabItem.key"
          type="button"
          class="datahub-pr-tab"
          :class="{active: activeTab === tabItem.key}"
          @click="selectTab(tabItem.key)"
        >
          <i :class="tabItem.icon"></i>
          {{ tabItem.label }}
          <span class="datahub-pr-tab-count">{{ formatCount(tabItem.count) }}</span>
        </button>
      </nav>

      <div class="datahub-pr-tab-panels">
        <section v-show="activeTab === 'conversation'" class="datahub-pr-panel">
          <div class="datahub-pr-layout">
            <div class="datahub-pr-main-column">
              <div class="datahub-timeline">
                <article class="datahub-timeline-item">
                  <div class="datahub-timeline-marker is-open">
                    <i class="code branch icon"></i>
                  </div>
                  <div class="datahub-timeline-card">
                    <div class="datahub-timeline-card-header">
                      <strong>{{ pull.author || 'unknown author' }}</strong>
                      opened this data pull request
                      <span class="datahub-muted">{{ formatTimestamp(pull.created_at || pull.created) }}</span>
                    </div>
                    <div class="datahub-timeline-body">
                      <p>
                        {{ pull.author || 'unknown author' }} opened this data pull request from
                        <span class="datahub-branch">{{ sourceBranch }}</span>
                        into
                        <span class="datahub-branch">{{ targetBranch }}</span>.
                      </p>
                      <div class="datahub-pr-mini-stats" aria-label="Dataset change summary">
                        <span class="datahub-stat-add">+{{ formatCount(pull.stats_added || 0) }} rows</span>
                        <span class="datahub-stat-remove">-{{ formatCount(pull.stats_removed || 0) }} rows</span>
                        <span class="datahub-stat-refresh">~{{ formatCount(pull.stats_refreshed || 0) }} refreshed</span>
                      </div>
                    </div>
                  </div>
                </article>

                <article
                  v-for="comment in normalizedComments"
                  :key="`comment-${comment.id || comment.created_at || comment.body}`"
                  class="datahub-timeline-item"
                >
                  <div class="datahub-timeline-marker">
                    <i class="comment outline icon"></i>
                  </div>
                  <div class="datahub-timeline-card">
                    <div class="datahub-timeline-card-header">
                      <strong>{{ comment.author || comment.user || 'unknown reviewer' }}</strong>
                      commented<span v-if="comment.file_path"> on {{ comment.file_path }}</span>
                      <span class="datahub-muted">{{ formatTimestamp(comment.created_at || comment.updated_at) }}</span>
                    </div>
                    <div class="datahub-timeline-body">
                      <div v-if="commentLocationText(comment)" class="datahub-row-ref">{{ commentLocationText(comment) }}</div>
                      <p>{{ comment.body || comment.content || 'No comment body.' }}</p>
                    </div>
                  </div>
                </article>

                <article
                  v-for="review in normalizedReviews"
                  :key="`review-${review.id || review.created_at || review.status}`"
                  class="datahub-timeline-item"
                >
                  <div class="datahub-timeline-marker" :class="reviewMarkerClass(review)">
                    <i :class="reviewIcon(review)"></i>
                  </div>
                  <div class="datahub-timeline-card">
                    <div class="datahub-timeline-card-header">
                      <strong>{{ review.author || review.reviewer || 'reviewer' }}</strong>
                      {{ reviewVerb(review) }}
                      <span class="datahub-muted">{{ formatTimestamp(review.created_at || review.submitted_at) }}</span>
                    </div>
                    <div class="datahub-timeline-body" v-if="review.body || review.message">
                      <p>{{ review.body || review.message }}</p>
                    </div>
                  </div>
                </article>
              </div>

              <div v-if="canWriteConversation" class="datahub-conversation-composer">
                <form class="datahub-comment-form" @submit.prevent="submitComment">
                  <label for="datahub-pr-comment">Comment</label>
                  <textarea
                    id="datahub-pr-comment"
                    v-model="newCommentBody"
                    rows="4"
                    placeholder="Leave a comment"
                    :disabled="submittingConversation"
                  ></textarea>
                  <div class="datahub-composer-actions">
                    <button class="ui primary small button" type="submit" :disabled="submittingConversation || !newCommentBody.trim()">
                      Comment
                    </button>
                  </div>
                </form>
                <form class="datahub-review-form" @submit.prevent="submitReview">
                  <label for="datahub-pr-review">Review</label>
                  <select v-model="reviewDecision" :disabled="submittingConversation">
                    <option value="approved">Approve</option>
                    <option value="changes_requested">Request changes</option>
                  </select>
                  <textarea
                    id="datahub-pr-review"
                    v-model="newReviewBody"
                    rows="3"
                    placeholder="Add review summary"
                    :disabled="submittingConversation"
                  ></textarea>
                  <div class="datahub-composer-actions">
                    <span v-if="conversationError" class="datahub-form-error">{{ conversationError }}</span>
                    <button class="ui green small button" type="submit" :disabled="submittingConversation || !newReviewBody.trim()">
                      Submit review
                    </button>
                  </div>
                </form>
              </div>
              <div v-else class="ui message datahub-conversation-locked">
                {{ conversationLockedText }}
              </div>

              <div class="datahub-merge-box" :class="mergeBoxClass">
                <div class="datahub-merge-status-icon">
                  <i :class="mergeIcon"></i>
                </div>
                <div class="datahub-merge-content">
                  <h3>{{ mergeTitle }}</h3>
                  <p>{{ mergeDescription }}</p>
                  <div class="datahub-merge-checkline">
                    <span>{{ conflictText }}</span>
                    <span v-if="pendingChecksCount">{{ pendingChecksText }}</span>
                    <span v-else-if="checks.length">{{ checksSummaryText }}</span>
                    <span
                      v-for="blocker in secondaryMergeBlockers"
                      :key="blocker"
                    >{{ blocker }}</span>
                  </div>
                  <p v-if="mergeError" class="datahub-form-error">{{ mergeError }}</p>
                  <button class="ui green button datahub-merge-button" type="button" :disabled="!mergeButtonEnabled" @click="submitMerge">
                    {{ merging ? 'Merging...' : 'Merge data pull request' }}
                  </button>
                </div>
              </div>
            </div>

            <aside class="datahub-pr-sidebar" aria-label="Pull request metadata">
              <section class="datahub-sidebar-section">
                <h3>Reviewers</h3>
                <p>{{ approvalText }}</p>
              </section>
              <section class="datahub-sidebar-section">
                <h3>Status checks</h3>
                <p>{{ checksSummaryText }}</p>
              </section>
              <section class="datahub-sidebar-section">
                <h3>Branches</h3>
                <div class="datahub-sidebar-branch">
                  <span>base</span>
                  <code>{{ targetBranch }}</code>
                </div>
                <div class="datahub-sidebar-branch">
                  <span>compare</span>
                  <code>{{ sourceBranch }}</code>
                </div>
              </section>
              <section class="datahub-sidebar-section">
                <h3>Dataset delta</h3>
                <div class="datahub-sidebar-delta">
                  <span class="datahub-stat-add">+{{ formatCount(pull.stats_added || 0) }}</span>
                  <span class="datahub-stat-remove">-{{ formatCount(pull.stats_removed || 0) }}</span>
                  <span class="datahub-stat-refresh">~{{ formatCount(pull.stats_refreshed || 0) }}</span>
                </div>
              </section>
              <section class="datahub-sidebar-section">
                <div class="datahub-sidebar-heading-row">
                  <h3>Repository governance</h3>
                  <a v-if="showGovernanceAdminLinks && governanceLinks.settings" :href="governanceLinks.settings">Settings</a>
                </div>
                <dl class="datahub-governance-list">
                  <div class="datahub-governance-row">
                    <dt>Access</dt>
                    <dd>{{ governancePermissionText }}</dd>
                  </div>
                  <div class="datahub-governance-row">
                    <dt>Merge policy</dt>
                    <dd>{{ mergePolicyText }}</dd>
                  </div>
                  <div class="datahub-governance-row">
                    <dt>Branch rule</dt>
                    <dd>{{ branchProtectionText }}</dd>
                  </div>
                  <div class="datahub-governance-row">
                    <dt>Required checks</dt>
                    <dd>{{ requiredChecksText }}</dd>
                  </div>
                  <div class="datahub-governance-row">
                    <dt>Review gate</dt>
                    <dd>{{ reviewGateText }}</dd>
                  </div>
                  <div class="datahub-governance-row">
                    <dt>Who can merge</dt>
                    <dd>{{ mergeWhitelistText }}</dd>
                  </div>
                  <div class="datahub-governance-row">
                    <dt>Who can push</dt>
                    <dd>{{ pushWhitelistText }}</dd>
                  </div>
                  <div class="datahub-governance-row">
                    <dt>Force push</dt>
                    <dd>{{ forcePushText }}</dd>
                  </div>
                  <div class="datahub-governance-row">
                    <dt>Reviewer pool</dt>
                    <dd>{{ reviewerOptionsText }}</dd>
                  </div>
                </dl>
                <div class="datahub-governance-links">
                  <a v-if="showGovernanceAdminLinks && governanceLinks.collaboration" class="ui tiny basic button" :href="governanceLinks.collaboration">
                    Manage access
                  </a>
                  <a v-if="showGovernanceAdminLinks && governanceLinks.branches" class="ui tiny basic button" :href="governanceLinks.branches">
                    Branch rules
                  </a>
                </div>
              </section>
            </aside>
          </div>
        </section>

        <section v-show="activeTab === 'commits'" class="datahub-pr-panel">
          <div class="datahub-panel-header">
            <div>
              <h3>Commits</h3>
              <p>{{ commitCount }} commit{{ commitCount === 1 ? '' : 's' }} in this data pull request.</p>
            </div>
          </div>
          <div class="datahub-commit-list">
            <article class="datahub-commit-row" v-if="pull.source_commit">
              <div class="datahub-commit-dot"></div>
              <div class="datahub-commit-main">
                <strong>{{ pull.title || 'Update dataset' }}</strong>
                <span>authored by {{ pull.author || 'unknown author' }}</span>
              </div>
              <code>{{ shortHash(pull.source_commit) }}</code>
            </article>
            <div class="ui message" v-else>No comparable DIT commits are available for this pull request yet.</div>
          </div>
          <div class="datahub-commit-range">
            <span class="ui label datahub-hash">base {{ shortHash(pull.target_commit) }}</span>
            <span class="ui label datahub-hash">head {{ shortHash(pull.source_commit) }}</span>
          </div>
        </section>

        <section v-show="activeTab === 'checks'" class="datahub-pr-panel">
          <div class="datahub-panel-header">
            <div>
              <h3>Checks</h3>
              <p>{{ checksSummaryText }}</p>
            </div>
          </div>
          <div class="datahub-check-list" v-if="checks.length">
            <article v-for="check in checks" :key="check.check_name || check.name" class="datahub-check-row">
              <span class="datahub-check-icon" :class="checkStatusClass(check)">
                <i :class="checkIcon(check)"></i>
              </span>
              <div class="datahub-check-main">
                <strong>{{ check.check_name || check.name || 'check' }}</strong>
                <span>{{ check.message || check.summary || check.status || 'No details reported.' }}</span>
              </div>
              <span class="datahub-check-status">{{ check.status || 'pending' }}</span>
            </article>
          </div>
          <div class="ui message" v-else>No checks have been reported for this commit yet.</div>
        </section>

        <section v-show="activeTab === 'files'" class="datahub-pr-panel datahub-files-panel">
          <div class="datahub-panel-header">
            <div>
              <h3>Files changed</h3>
              <p>
                Review row-level dataset changes before merging
                <span class="datahub-hash">{{ shortHash(diffBaseCommit) }}..{{ shortHash(diffHeadCommit) }}</span>.
              </p>
            </div>
          </div>
          <DataDiffView
            v-if="hasDiffCommits"
            :owner="owner"
            :repo="repo"
            :old-commit="diffBaseCommit"
            :new-commit="diffHeadCommit"
            :review-mode="true"
            :pull-id="pullNumber(pull)"
            :current-user="currentReviewerName"
            :can-comment="canWriteConversation"
            @summary-loaded="recordDiffSummary"
            @comment-created="recordInlineComment"
          />
          <div class="ui message" v-else>
            No comparable DIT commits are available for this pull request yet.
          </div>
        </section>
      </div>
    </template>
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
    pullId: String,
  },
  data() {
    return {
      pull: null,
      comments: [],
      reviews: [],
      checks: [],
      governance: null,
      newCommentBody: '',
      newReviewBody: '',
      reviewDecision: 'approved',
      submittingConversation: false,
      conversationError: null,
      merging: false,
      mergeError: null,
      diffSummary: null,
      diffFilesCount: 0,
      activeTab: 'conversation',
      loading: true,
      error: null,
    };
  },
  computed: {
    repoPath() {
      return `/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
    },
    pullsPath() {
      return `${this.repoPath}/data/pulls`;
    },
    pullTitle() {
      return this.pull?.title || 'Untitled data pull request';
    },
    hasDiffCommits() {
      return Boolean(this.diffBaseCommit && this.diffHeadCommit);
    },
    diffBaseCommit() {
      return this.pull?.base_commit || this.pull?.target_commit || '';
    },
    diffHeadCommit() {
      return this.pull?.source_commit || '';
    },
    normalizedStatus() {
      return this.pull?.status || 'open';
    },
    sourceBranch() {
      return this.branchName(this.sourceRef(this.pull));
    },
    targetBranch() {
      return this.branchName(this.targetRef(this.pull));
    },
    normalizedComments() {
      return this.normalizeList(this.comments, ['comments', 'items']);
    },
    normalizedReviews() {
      return this.normalizeList(this.reviews, ['reviews', 'items']);
    },
    normalizedReviewers() {
      return this.normalizeList(this.governance?.reviewers, ['reviewers', 'items']);
    },
    branchProtections() {
      return this.normalizeList(this.governance?.branch_protections, ['branch_protections', 'items']);
    },
    activeBranchProtection() {
      return this.branchProtections.find((rule) => this.branchRuleMatches(rule, this.targetBranch)) || this.branchProtections[0] || null;
    },
    governanceLinks() {
      return this.governance?.links || {};
    },
    commitCount() {
      return this.pull?.source_commit ? 1 : 0;
    },
    changedFilesCount() {
      return this.numericFirst([
        this.pull?.files_changed,
        this.pull?.stats_files_changed,
        this.pull?.changed_files,
        this.pull?.file_count,
        this.pull?.files_count,
        this.diffSummary?.files_changed,
        this.pull?.stats_removed,
        this.diffFilesCount,
      ]);
    },
    tabs() {
      return [
        {key: 'conversation', label: 'Conversation', count: this.normalizedComments.length, icon: 'comment outline icon'},
        {key: 'commits', label: 'Commits', count: this.commitCount, icon: 'history icon'},
        {key: 'checks', label: 'Checks', count: this.checks.length, icon: 'check circle outline icon'},
        {key: 'files', label: 'Files changed', count: this.changedFilesCount, icon: 'file alternate outline icon'},
      ];
    },
    approvedReviewsCount() {
      return this.normalizedReviews.filter((review) => ['approved', 'approve'].includes(this.reviewStatus(review))).length;
    },
    pendingChecksCount() {
      return this.checks.filter((check) => this.isPendingCheck(check)).length;
    },
    failedChecksCount() {
      return this.checks.filter((check) => this.isFailedCheck(check)).length;
    },
    passedChecksCount() {
      return this.checks.filter((check) => this.isPassedCheck(check)).length;
    },
    checksSummaryText() {
      if (!this.checks.length) return 'No checks reported';
      if (this.failedChecksCount) return `${this.failedChecksCount} check${this.failedChecksCount === 1 ? '' : 's'} failing`;
      if (this.pendingChecksCount) return `${this.pendingChecksCount} check${this.pendingChecksCount === 1 ? '' : 's'} still pending`;
      return `${this.passedChecksCount} check${this.passedChecksCount === 1 ? '' : 's'} passed`;
    },
    pendingChecksText() {
      return `${this.pendingChecksCount} check${this.pendingChecksCount === 1 ? '' : 's'} still pending`;
    },
    approvalText() {
      if (this.approvedReviewsCount) {
        return `${this.approvedReviewsCount} approval${this.approvedReviewsCount === 1 ? '' : 's'}`;
      }
      return 'No approvals yet';
    },
    conflictText() {
      if (this.pull?.is_mergeable === false) return 'This branch has conflicts that must be resolved.';
      return 'This branch has no conflicts with the base branch.';
    },
    currentUserGovernance() {
      return this.governance?.current_user || {};
    },
    currentReviewerName() {
      return this.currentUserGovernance.login || this.currentUserGovernance.username || this.currentUserGovernance.name || this.pull?.author || 'reviewer';
    },
    requiredApprovalsCount() {
      return Number(this.activeBranchProtection?.required_approvals || 0);
    },
    changesRequestedCount() {
      return this.normalizedReviews.filter((review) => ['changes_requested', 'request_changes'].includes(this.reviewStatus(review))).length;
    },
    hasRequiredApprovals() {
      return this.approvedReviewsCount >= this.requiredApprovalsCount;
    },
    hasRequiredChecks() {
      const rule = this.activeBranchProtection;
      if (!rule?.enable_status_check) return true;
      const required = rule.status_check_contexts || [];
      if (!required.length) return true;
      return required.every((context) => this.checks.some((check) => (check.check_name || check.name) === context && this.isPassedCheck(check)));
    },
    canCurrentUserMerge() {
      return this.currentUserGovernance.can_merge === true;
    },
    isSignedInForGovernance() {
      return this.currentUserGovernance.is_authenticated === true;
    },
    canWriteConversation() {
      const permissions = this.governance?.repository?.permissions || {};
      return this.isSignedInForGovernance && (permissions.push === true || permissions.admin === true);
    },
    conversationLockedText() {
      if (!this.isSignedInForGovernance) return 'Sign in to comment or review this data pull request.';
      return 'Write access is required to comment or review this data pull request.';
    },
    showGovernanceAdminLinks() {
      return this.governance?.repository?.permissions?.admin === true;
    },
    mergeBlockers() {
      const blockers = [];
      if (this.normalizedStatus !== 'open') return blockers;
      if (!this.isSignedInForGovernance) blockers.push('Sign in to merge this data pull request.');
      if (this.pull?.is_mergeable === false) blockers.push('Resolve conflicts before merging.');
      if (!this.canCurrentUserMerge) blockers.push('You do not have permission to merge into this branch.');
      if (this.failedChecksCount) blockers.push(this.checksSummaryText);
      if (!this.hasRequiredChecks) blockers.push('Required checks have not passed.');
      if (this.pendingChecksCount) blockers.push(this.pendingChecksText);
      if (!this.hasRequiredApprovals) {
        blockers.push(`${this.requiredApprovalsCount} required approval${this.requiredApprovalsCount === 1 ? '' : 's'} needed.`);
      }
      if (this.activeBranchProtection?.block_on_rejected_reviews && this.changesRequestedCount) {
        blockers.push('Changes requested reviews block merge.');
      }
      return blockers;
    },
    mergeBlockedReason() {
      return this.mergeBlockers[0] || '';
    },
    secondaryMergeBlockers() {
      return this.mergeBlockers.slice(1);
    },
    mergeTitle() {
      if (this.normalizedStatus === 'merged') return 'Pull request merged';
      if (this.normalizedStatus === 'closed') return 'Pull request closed';
      if (this.pull?.is_mergeable === false) return 'This branch has conflicts';
      if (this.failedChecksCount) return 'Some checks were not successful';
      if (this.mergeBlockers.length) return 'Merge blocked';
      return 'Ready to review and merge';
    },
    mergeDescription() {
      if (this.normalizedStatus === 'merged') return 'The data changes from this pull request have already been merged.';
      if (this.normalizedStatus === 'closed') return 'This pull request is closed and cannot be merged.';
      if (this.pull?.is_mergeable === false) return 'Resolve conflicts before merging this data pull request.';
      if (this.mergeBlockedReason) return this.mergeBlockedReason;
      if (this.pendingChecksCount) return 'Checks are still running. Review the changed files while they finish.';
      return 'All available merge gates are clear for this data pull request.';
    },
    mergeButtonEnabled() {
      return this.normalizedStatus === 'open' && this.mergeBlockers.length === 0 && !this.merging;
    },
    mergeBoxClass() {
      if (this.mergeBlockers.length) return 'is-blocked';
      if (this.normalizedStatus !== 'open') return 'is-closed';
      return 'is-ready';
    },
    mergeIcon() {
      if (this.mergeBlockers.length) return 'times icon';
      if (this.pendingChecksCount) return 'circle notch icon';
      if (this.normalizedStatus !== 'open') return 'lock icon';
      return 'check icon';
    },
    statusIcon() {
      if (this.normalizedStatus === 'merged') return 'check icon';
      if (this.normalizedStatus === 'closed') return 'times icon';
      return 'code branch icon';
    },
    governancePermissionText() {
      const permissions = this.governance?.repository?.permissions || {};
      const repository = this.governance?.repository || {};
      const labels = [];
      if (permissions.admin) labels.push('Admin access');
      if (permissions.push) labels.push('Can push');
      if (permissions.pull) labels.push('Can read');
      if ((permissions.admin || permissions.push) && this.repositoryAllowsMerge(repository)) labels.push('Can merge');
      return labels.length ? labels.join(', ') : 'Login required to view permissions';
    },
    mergePolicyText() {
      const repository = this.governance?.repository;
      if (!repository) return 'Loading repository settings';
      const methods = [];
      if (repository.allow_merge_commits) methods.push('merge commit');
      if (repository.allow_squash_merge) methods.push('squash');
      if (repository.allow_rebase) methods.push('rebase');
      if (repository.allow_rebase_explicit) methods.push('rebase merge');
      if (repository.allow_fast_forward_only_merge) methods.push('fast-forward');
      if (!methods.length) return 'Pull request merging is disabled';
      const defaultStyle = repository.default_merge_style ? `${repository.default_merge_style} default; ` : '';
      return `${defaultStyle}${methods.join(', ')}`;
    },
    branchProtectionText() {
      const rule = this.activeBranchProtection;
      if (!rule) return 'No protected branch rule';
      const approvals = Number(rule.required_approvals || 0);
      const approvalText = approvals ? `${approvals} required approval${approvals === 1 ? '' : 's'}` : 'no approval requirement';
      return `${rule.rule_name || rule.branch_name || this.targetBranch}: ${approvalText}`;
    },
    requiredChecksText() {
      const rule = this.activeBranchProtection;
      if (!rule?.enable_status_check) return 'No required checks';
      return this.formatPrincipalList(rule.status_check_contexts, 'No required checks');
    },
    reviewGateText() {
      const rule = this.activeBranchProtection;
      if (!rule) return 'No review gates configured';
      const parts = [];
      const approvals = Number(rule.required_approvals || 0);
      if (approvals) parts.push(`${approvals} approval${approvals === 1 ? '' : 's'}`);
      if (rule.block_on_rejected_reviews) parts.push('changes requested blocks merge');
      if (rule.block_on_official_review_requests) parts.push('review requests must be resolved');
      if (rule.dismiss_stale_approvals) parts.push('stale approvals dismissed');
      if (rule.block_on_outdated_branch) parts.push('outdated branch blocked');
      return parts.length ? parts.join(', ') : 'No review gates configured';
    },
    mergeWhitelistText() {
      const rule = this.activeBranchProtection;
      if (!rule) return 'Writers can merge';
      if (!rule.enable_merge_whitelist) return 'Writers can merge';
      return this.formatPrincipalList([
        ...(rule.merge_whitelist_usernames || []),
        ...(rule.merge_whitelist_teams || []).map((team) => `team:${team}`),
      ], 'No one explicitly whitelisted');
    },
    pushWhitelistText() {
      const rule = this.activeBranchProtection;
      if (!rule) return 'Writers can push';
      if (!rule.enable_push) return 'Blocked on protected branches';
      if (!rule.enable_push_whitelist) return 'Writers can push';
      return this.formatPrincipalList([
        ...(rule.push_whitelist_usernames || []),
        ...(rule.push_whitelist_teams || []).map((team) => `team:${team}`),
      ], 'No one explicitly whitelisted');
    },
    forcePushText() {
      const rule = this.activeBranchProtection;
      if (!rule) return 'Controlled by repository defaults';
      if (rule.can_force_push || rule.enable_force_push) return 'Allowed by branch rule';
      return 'Blocked on protected branches';
    },
    reviewerOptionsText() {
      const names = this.normalizedReviewers.map((reviewer) => this.principalName(reviewer)).filter(Boolean);
      return this.formatPrincipalList(names, 'No eligible reviewers found');
    },
  },
  async mounted() {
    this.activeTab = this.normalizeTabFromHash(window.location.hash);
    window.addEventListener('hashchange', this.handleHashChange);
    try {
      this.pull = await datahubFetch(this.owner, this.repo, `/pulls/${this.pullId}`);
      await this.loadSupplementalData();
    } catch (e) {
      this.error = e.message;
    } finally {
      this.loading = false;
    }
  },
  beforeUnmount() {
    window.removeEventListener('hashchange', this.handleHashChange);
  },
  methods: {
    normalizeTabFromHash(hash = window.location.hash) {
      const key = String(hash || '').replace(/^#/, '');
      return this.tabs.some((tab) => tab.key === key) ? key : 'conversation';
    },
    selectTab(tab, options = {}) {
      const nextTab = this.tabs.some((tabItem) => tabItem.key === tab) ? tab : 'conversation';
      this.activeTab = nextTab;
      if (options.updateHash === false) return;

      const nextHash = `#${nextTab}`;
      if (window.location.hash === nextHash) return;
      const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
      if (options.replace) {
        window.history.replaceState(null, '', nextUrl);
      } else {
        window.history.pushState(null, '', nextUrl);
      }
    },
    handleHashChange() {
      this.selectTab(this.normalizeTabFromHash(window.location.hash), {updateHash: false});
    },
    async loadSupplementalData() {
      const [comments, reviews, checks, governance] = await Promise.all([
        this.fetchOptional(`/pulls/${this.pullId}/comments`, []),
        this.fetchOptional(`/pulls/${this.pullId}/reviews`, []),
        this.pull?.source_commit ? this.fetchOptional(`/checks/${this.pull.source_commit}`, {checks: []}) : {checks: []},
        this.fetchOptional(`/governance?target_branch=${encodeURIComponent(this.targetBranch)}`, null),
      ]);
      this.comments = comments;
      this.reviews = reviews;
      this.checks = this.normalizeList(checks, ['checks']);
      this.governance = governance;
    },
    async refreshPull() {
      this.pull = await datahubFetch(this.owner, this.repo, `/pulls/${this.pullId}`);
      await this.loadSupplementalData();
    },
    async fetchOptional(path, fallback) {
      try {
        return await datahubFetch(this.owner, this.repo, path);
      } catch {
        return fallback;
      }
    },
    async submitComment() {
      const body = this.newCommentBody.trim();
      if (!body) return;
      this.submittingConversation = true;
      this.conversationError = null;
      try {
        const comment = await datahubFetch(this.owner, this.repo, `/pulls/${this.pullId}/comments`, {
          method: 'POST',
          body: JSON.stringify({author: this.currentReviewerName, body}),
        });
        this.comments = [...this.normalizedComments, comment];
        this.newCommentBody = '';
      } catch (e) {
        this.conversationError = e.message;
      } finally {
        this.submittingConversation = false;
      }
    },
    async submitReview() {
      const body = this.newReviewBody.trim();
      if (!body) return;
      this.submittingConversation = true;
      this.conversationError = null;
      try {
        const review = await datahubFetch(this.owner, this.repo, `/pulls/${this.pullId}/reviews`, {
          method: 'POST',
          body: JSON.stringify({status: this.reviewDecision}),
        });
        let timelineReview = review;
        if (body) {
          const comment = await datahubFetch(this.owner, this.repo, `/pulls/${this.pullId}/comments`, {
            method: 'POST',
            body: JSON.stringify({author: this.currentReviewerName, body}),
          });
          this.comments = [...this.normalizedComments, comment];
          timelineReview = {...review, body};
        }
        this.reviews = [...this.normalizedReviews, timelineReview];
        this.newReviewBody = '';
        this.reviewDecision = 'approved';
      } catch (e) {
        this.conversationError = e.message;
      } finally {
        this.submittingConversation = false;
      }
    },
    async submitMerge() {
      if (!this.mergeButtonEnabled) return;
      this.merging = true;
      this.mergeError = null;
      try {
        await datahubFetch(this.owner, this.repo, `/pulls/${this.pullId}/merge`, {
          method: 'POST',
          body: JSON.stringify({
            message: this.mergeCommitMessage(),
            author: this.currentReviewerName,
          }),
        });
        await this.refreshPull();
      } catch (e) {
        this.mergeError = e.message;
      } finally {
        this.merging = false;
      }
    },
    recordDiffSummary(payload) {
      this.diffSummary = payload?.summary || null;
      this.diffFilesCount = payload?.filesCount || 0;
    },
    recordInlineComment(comment) {
      this.comments = [...this.normalizedComments, comment];
      this.selectTab('conversation', {replace: true});
    },
    commentLocationText(comment) {
      const parts = [];
      if (comment.change_type) parts.push(comment.change_type);
      if (comment.field_path) parts.push(comment.field_path);
      if (comment.row_hash) parts.push(`row ${this.shortHash(comment.row_hash)}`);
      return parts.join(' ');
    },
    pullNumber(pull) {
      return pull.pull_request_id || pull.id || this.pullId;
    },
    mergeCommitMessage() {
      return `Merge pull request #${this.pullNumber(this.pull)} from ${this.sourceBranch}`;
    },
    sourceRef(pull) {
      return pull?.source_ref || pull?.source_branch || '';
    },
    targetRef(pull) {
      return pull?.target_ref || pull?.target_branch || '';
    },
    branchName(refName) {
      return (refName || '').replace(/^heads\//, '') || 'unknown';
    },
    statusLabel(status) {
      if (status === 'merged') return 'Merged';
      if (status === 'closed') return 'Closed';
      return 'Open';
    },
    reviewStatus(review) {
      return String(review.status || review.state || review.event || '').toLowerCase();
    },
    reviewVerb(review) {
      const status = this.reviewStatus(review);
      if (status === 'approved' || status === 'approve') return 'approved these changes';
      if (status === 'changes_requested' || status === 'request_changes') return 'requested changes';
      return 'reviewed these changes';
    },
    reviewIcon(review) {
      const status = this.reviewStatus(review);
      if (status === 'approved' || status === 'approve') return 'check icon';
      if (status === 'changes_requested' || status === 'request_changes') return 'times icon';
      return 'eye icon';
    },
    reviewMarkerClass(review) {
      const status = this.reviewStatus(review);
      if (status === 'approved' || status === 'approve') return 'is-approved';
      if (status === 'changes_requested' || status === 'request_changes') return 'is-blocked';
      return '';
    },
    isPendingCheck(check) {
      const status = String(check.status || '').toLowerCase();
      return !status || ['pending', 'queued', 'running', 'in_progress', 'neutral'].includes(status);
    },
    isFailedCheck(check) {
      const status = String(check.status || '').toLowerCase();
      return ['fail', 'failed', 'failure', 'error', 'cancelled', 'timed_out'].includes(status);
    },
    isPassedCheck(check) {
      const status = String(check.status || '').toLowerCase();
      return ['pass', 'passed', 'success', 'ok'].includes(status);
    },
    checkStatusClass(check) {
      if (this.isFailedCheck(check)) return 'is-failed';
      if (this.isPendingCheck(check)) return 'is-pending';
      return 'is-passed';
    },
    checkIcon(check) {
      if (this.isFailedCheck(check)) return 'times icon';
      if (this.isPendingCheck(check)) return 'circle notch icon';
      return 'check icon';
    },
    normalizeList(value, keys) {
      if (Array.isArray(value)) return value;
      for (const key of keys) {
        if (Array.isArray(value?.[key])) return value[key];
      }
      return [];
    },
    principalName(value) {
      if (!value) return '';
      if (typeof value === 'string') return value;
      return value.login || value.username || value.name || value.full_name || '';
    },
    formatPrincipalList(value, emptyText) {
      const names = this.normalizeList(value, []).map((item) => this.principalName(item)).filter(Boolean);
      return names.length ? names.join(', ') : emptyText;
    },
    repositoryAllowsMerge(repository) {
      return Boolean(repository.allow_merge_commits || repository.allow_squash_merge || repository.allow_rebase || repository.allow_rebase_explicit || repository.allow_fast_forward_only_merge);
    },
    branchRuleMatches(rule, branch) {
      const ruleName = rule?.rule_name || rule?.branch_name || '';
      if (!ruleName || !branch) return false;
      if (ruleName === branch) return true;
      if (!ruleName.includes('*')) return false;
      const escaped = ruleName.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      return new RegExp(`^${escaped}$`).test(branch);
    },
    numericFirst(values) {
      for (const value of values) {
        if (value !== null && value !== undefined && value !== '') return Number(value) || 0;
      }
      return 0;
    },
    shortHash(hash) {
      return hash ? String(hash).slice(0, 7) : '-';
    },
    formatCount(value) {
      return Number(value || 0).toLocaleString();
    },
    formatTimestamp(value) {
      if (!value) return 'recently';
      const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
      if (Number.isNaN(date.getTime())) return 'recently';
      return date.toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'});
    },
  },
};
</script>

<style scoped>
.datahub-pull-page {
  display: grid;
  gap: 16px;
  margin: 0 auto;
  max-width: 1280px;
  width: 100%;
}

.datahub-pull-page.is-files-tab {
  max-width: none;
}

.datahub-pr-header {
  align-items: flex-start;
  border-bottom: 1px solid var(--color-secondary);
  display: flex;
  gap: 16px;
  justify-content: space-between;
  padding-bottom: 14px;
}

.datahub-pr-title {
  color: var(--color-text);
  font-size: 28px;
  font-weight: 400;
  letter-spacing: 0;
  line-height: 1.25;
  margin: 2px 0 8px;
}

.datahub-pr-number {
  color: var(--color-text-light-2);
  font-weight: 300;
}

.datahub-eyebrow {
  color: var(--color-text-light-2);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.datahub-pr-merge-line,
.datahub-muted {
  color: var(--color-text-light-2);
  font-size: 13px;
}

.datahub-pr-state-pill {
  align-items: center;
  border-radius: 2em;
  color: var(--color-white);
  display: inline-flex;
  font-size: 13px;
  font-weight: 600;
  gap: 6px;
  margin-right: 8px;
  min-height: 28px;
  padding: 3px 10px;
}

.datahub-pr-state-pill.is-open {
  background: var(--color-green);
}

.datahub-pr-state-pill.is-merged {
  background: var(--color-purple);
}

.datahub-pr-state-pill.is-closed {
  background: var(--color-text-light-2);
}

.datahub-header-actions,
.datahub-commit-range {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.datahub-branch,
.datahub-hash,
.datahub-row-ref,
.datahub-sidebar-branch code,
.datahub-commit-row code {
  font-family: var(--fonts-monospace);
}

.datahub-branch {
  background: var(--color-markup-code-block);
  border-radius: 6px;
  color: var(--color-accent);
  padding: 2px 6px;
}

.datahub-stat-add,
.datahub-stat-remove,
.datahub-stat-refresh {
  font-weight: 600;
  margin-right: 8px;
}

.datahub-stat-add {
  color: var(--color-green);
}

.datahub-stat-remove {
  color: var(--color-red);
}

.datahub-stat-refresh {
  color: var(--color-yellow);
}

.datahub-pr-tabs {
  border-bottom: 1px solid var(--color-secondary);
  display: flex;
  gap: 2px;
  overflow-x: auto;
}

.datahub-pr-tab {
  align-items: center;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--color-text-light);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  gap: 7px;
  min-height: 48px;
  padding: 0 12px;
  white-space: nowrap;
}

.datahub-pr-tab.active {
  border-bottom-color: var(--color-primary);
  color: var(--color-text);
  font-weight: 600;
}

.datahub-pr-tab-count {
  background: var(--color-secondary);
  border-radius: 2em;
  color: var(--color-text);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  min-width: 20px;
  padding: 0 6px;
}

.datahub-pr-panel {
  padding-top: 16px;
}

.datahub-pr-layout {
  align-items: start;
  display: grid;
  gap: 24px;
  grid-template-columns: minmax(0, 1fr) 260px;
}

.datahub-timeline {
  display: grid;
  gap: 12px;
}

.datahub-timeline-item {
  display: grid;
  gap: 12px;
  grid-template-columns: 34px minmax(0, 1fr);
}

.datahub-timeline-marker {
  align-items: center;
  background: var(--color-box-header);
  border: 1px solid var(--color-secondary);
  border-radius: 50%;
  color: var(--color-text-light);
  display: inline-flex;
  height: 34px;
  justify-content: center;
  width: 34px;
}

.datahub-timeline-marker.is-open,
.datahub-timeline-marker.is-approved {
  background: var(--color-green);
  border-color: var(--color-green);
  color: var(--color-white);
}

.datahub-timeline-marker.is-blocked {
  background: var(--color-red);
  border-color: var(--color-red);
  color: var(--color-white);
}

.datahub-timeline-card,
.datahub-merge-box,
.datahub-pr-sidebar,
.datahub-commit-list,
.datahub-check-list {
  border: 1px solid var(--color-secondary);
  border-radius: 6px;
  background: var(--color-box-body);
}

.datahub-timeline-card-header {
  background: var(--color-box-header);
  border-bottom: 1px solid var(--color-secondary);
  border-radius: 6px 6px 0 0;
  color: var(--color-text-light);
  padding: 10px 14px;
}

.datahub-timeline-body {
  padding: 14px;
}

.datahub-timeline-body p {
  margin: 0;
}

.datahub-row-ref {
  color: var(--color-text-light-2);
  font-size: 12px;
  margin-bottom: 8px;
}

.datahub-pr-mini-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.datahub-conversation-composer {
  border: 1px solid var(--color-secondary);
  border-radius: 6px;
  display: grid;
  gap: 0;
  margin-top: 18px;
  overflow: hidden;
}

.datahub-comment-form,
.datahub-review-form {
  background: var(--color-box-body);
  display: grid;
  gap: 8px;
  padding: 14px;
}

.datahub-review-form {
  border-top: 1px solid var(--color-secondary);
}

.datahub-comment-form label,
.datahub-review-form label {
  color: var(--color-text);
  font-weight: 600;
}

.datahub-comment-form textarea,
.datahub-review-form textarea,
.datahub-review-form select {
  background: var(--color-input-background);
  border: 1px solid var(--color-secondary);
  border-radius: 6px;
  color: var(--color-text);
  font: inherit;
  min-width: 0;
  padding: 8px 10px;
}

.datahub-comment-form textarea,
.datahub-review-form textarea {
  min-height: 88px;
  resize: vertical;
}

.datahub-review-form select {
  min-height: 36px;
}

.datahub-composer-actions {
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.datahub-form-error {
  color: var(--color-red);
  flex: 1;
  font-size: 12px;
  text-align: left;
}

.datahub-merge-box {
  display: grid;
  gap: 14px;
  grid-template-columns: 42px minmax(0, 1fr);
  margin-top: 18px;
  padding: 16px;
}

.datahub-merge-box.is-ready {
  border-color: var(--color-green);
}

.datahub-merge-box.is-blocked {
  border-color: var(--color-red);
}

.datahub-merge-status-icon {
  align-items: center;
  border-radius: 50%;
  color: var(--color-white);
  display: flex;
  height: 42px;
  justify-content: center;
  width: 42px;
}

.datahub-merge-box.is-ready .datahub-merge-status-icon {
  background: var(--color-green);
}

.datahub-merge-box.is-blocked .datahub-merge-status-icon {
  background: var(--color-red);
}

.datahub-merge-box.is-closed .datahub-merge-status-icon {
  background: var(--color-text-light-2);
}

.datahub-merge-content h3,
.datahub-panel-header h3,
.datahub-sidebar-section h3 {
  font-size: 16px;
  letter-spacing: 0;
  margin: 0 0 4px;
}

.datahub-merge-content p,
.datahub-panel-header p,
.datahub-sidebar-section p {
  color: var(--color-text-light);
  margin: 0;
}

.datahub-merge-checkline {
  color: var(--color-text-light);
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 12px 0;
}

.datahub-merge-button {
  margin-top: 2px !important;
}

.datahub-pr-sidebar {
  display: grid;
  gap: 0;
}

.datahub-sidebar-section {
  border-bottom: 1px solid var(--color-secondary);
  padding: 14px;
}

.datahub-sidebar-section:last-child {
  border-bottom: 0;
}

.datahub-sidebar-heading-row {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.datahub-sidebar-heading-row a {
  font-size: 12px;
}

.datahub-sidebar-branch,
.datahub-sidebar-delta {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  margin-top: 8px;
}

.datahub-sidebar-branch span {
  color: var(--color-text-light-2);
  font-size: 12px;
}

.datahub-governance-list {
  display: grid;
  gap: 8px;
  margin: 10px 0 0;
}

.datahub-governance-row {
  display: grid;
  gap: 2px;
}

.datahub-governance-row dt {
  color: var(--color-text-light-2);
  font-size: 12px;
}

.datahub-governance-row dd {
  color: var(--color-text);
  margin: 0;
  overflow-wrap: anywhere;
}

.datahub-governance-links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.datahub-panel-header {
  align-items: flex-start;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.datahub-commit-list,
.datahub-check-list {
  overflow: hidden;
}

.datahub-commit-row,
.datahub-check-row {
  align-items: center;
  border-bottom: 1px solid var(--color-secondary);
  display: grid;
  gap: 12px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  padding: 12px 14px;
}

.datahub-commit-row:last-child,
.datahub-check-row:last-child {
  border-bottom: 0;
}

.datahub-commit-dot {
  background: var(--color-green);
  border-radius: 50%;
  height: 10px;
  width: 10px;
}

.datahub-commit-main,
.datahub-check-main {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.datahub-commit-main span,
.datahub-check-main span,
.datahub-check-status {
  color: var(--color-text-light-2);
  font-size: 12px;
}

.datahub-check-icon {
  align-items: center;
  border-radius: 50%;
  display: inline-flex;
  height: 24px;
  justify-content: center;
  width: 24px;
}

.datahub-check-icon.is-passed {
  color: var(--color-green);
}

.datahub-check-icon.is-failed {
  color: var(--color-red);
}

.datahub-check-icon.is-pending {
  color: var(--color-yellow);
}

.datahub-commit-range {
  justify-content: flex-start;
  margin-top: 12px;
}

.datahub-files-panel {
  padding-top: 12px;
}

.datahub-pull-page.is-files-tab .datahub-pr-tabs {
  margin-left: auto;
  margin-right: auto;
  max-width: 1280px;
  width: 100%;
}

.datahub-pull-page.is-files-tab .datahub-pr-tab-panels,
.datahub-pull-page.is-files-tab .datahub-files-panel {
  width: 100%;
}

.datahub-pull-page.is-files-tab .datahub-files-panel {
  padding-top: 10px;
}

.datahub-pull-page.is-files-tab .datahub-files-panel :deep(.datahub-diff-layout) {
  grid-template-columns: minmax(200px, 18vw) minmax(0, 1fr);
}

.datahub-pull-page.is-files-tab .datahub-files-panel :deep(.datahub-file-sidebar) {
  max-height: calc(100vh - 220px);
}

.datahub-pull-page.is-files-tab .datahub-files-panel :deep(.datahub-diff-row-list),
.datahub-pull-page.is-files-tab .datahub-files-panel :deep(.datahub-diff-refresh-side) {
  padding: 8px;
}

.datahub-pull-page.is-files-tab .datahub-files-panel :deep(.datahub-sft-row-card) {
  border-radius: 4px;
}

@media (max-width: 900px) {
  .datahub-pr-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 767px) {
  .datahub-pr-header,
  .datahub-panel-header {
    flex-direction: column;
  }

  .datahub-header-actions {
    justify-content: flex-start;
  }

  .datahub-pr-title {
    font-size: 22px;
  }

  .datahub-timeline-item {
    grid-template-columns: 28px minmax(0, 1fr);
  }

  .datahub-timeline-marker {
    height: 28px;
    width: 28px;
  }
}
</style>
