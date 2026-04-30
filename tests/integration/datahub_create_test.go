// Copyright 2026 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package integration

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	auth_model "forgejo.org/models/auth"
	"forgejo.org/models/db"
	git_model "forgejo.org/models/git"
	perm_model "forgejo.org/models/perm"
	"forgejo.org/models/repo"
	"forgejo.org/models/unittest"
	user_model "forgejo.org/models/user"
	"forgejo.org/modules/datahub"
	repo_module "forgejo.org/modules/repository"
	"forgejo.org/modules/setting"
	"forgejo.org/modules/test"
	"forgejo.org/tests"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type datahubCoreCreateRecorder struct {
	mu             sync.Mutex
	created        bool
	listed         bool
	logged         bool
	statsRead      bool
	dedupRead      bool
	exportRead     bool
	commentsListed bool
	reviewsListed  bool
	commentCreated bool
	reviewCreated  bool
}

const datahubTestMainCommit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

func mockDatahubCoreCreate(t *testing.T, expectedRepo string) *datahubCoreCreateRecorder {
	t.Helper()

	recorder := &datahubCoreCreateRecorder{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "test-service-token", r.Header.Get("X-Service-Token"))

		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/repos":
			body, err := io.ReadAll(r.Body)
			require.NoError(t, err)
			assert.JSONEq(t, fmt.Sprintf(`{"name":%q}`, expectedRepo), string(body))

			recorder.mu.Lock()
			recorder.created = true
			recorder.mu.Unlock()

			w.WriteHeader(http.StatusCreated)
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/repos/"+expectedRepo+"/refs":
			recorder.mu.Lock()
			recorder.listed = true
			recorder.mu.Unlock()

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(fmt.Appendf(nil, `[{"name":"heads/master","target_hash":%q},{"name":"heads/main","target_hash":%q}]`, datahubTestMainCommit, datahubTestMainCommit))
		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/api/v1/repos/"+expectedRepo+"/refs/heads/"):
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(fmt.Appendf(nil, `{"name":%q,"target_hash":%q}`, strings.TrimPrefix(r.URL.Path, "/api/v1/repos/"+expectedRepo+"/refs/"), datahubTestMainCommit))
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/repos/"+expectedRepo+"/log":
			ref := r.URL.Query().Get("ref")
			assert.Contains(t, []string{"heads/master", "heads/main", "heads/feature/foo"}, ref)

			recorder.mu.Lock()
			recorder.logged = true
			recorder.mu.Unlock()

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(fmt.Appendf(nil, `{"commits":[],"ref":%q}`, ref))
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/repos/"+expectedRepo+"/stats/"+datahubTestMainCommit:
			recorder.mu.Lock()
			recorder.statsRead = true
			recorder.mu.Unlock()

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"row_count":2}`))
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/repos/"+expectedRepo+"/dedup/"+datahubTestMainCommit:
			recorder.mu.Lock()
			recorder.dedupRead = true
			recorder.mu.Unlock()

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"duplicate_rows":0}`))
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/repos/"+expectedRepo+"/export/"+datahubTestMainCommit+"/train.jsonl":
			recorder.mu.Lock()
			recorder.exportRead = true
			recorder.mu.Unlock()

			w.Header().Set("Content-Type", "application/x-ndjson")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("{\"id\":1}\n"))
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/repos/"+expectedRepo+"/pulls/1/comments":
			recorder.mu.Lock()
			recorder.commentsListed = true
			recorder.mu.Unlock()

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`[{"id":1,"author":"reviewer","body":"Looks good"}]`))
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/repos/"+expectedRepo+"/pulls/1/reviews":
			recorder.mu.Lock()
			recorder.reviewsListed = true
			recorder.mu.Unlock()

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`[{"id":1,"status":"approved"}]`))
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/repos/"+expectedRepo+"/pulls/1":
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"id":1,"target_ref":"heads/main","source_ref":"heads/import"}`))
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/repos/"+expectedRepo+"/pulls/1/comments":
			body, err := io.ReadAll(r.Body)
			require.NoError(t, err)
			assert.JSONEq(t, `{"author":"user2","body":"Needs owner sign-off"}`, string(body))

			recorder.mu.Lock()
			recorder.commentCreated = true
			recorder.mu.Unlock()

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"id":2,"body":"Needs owner sign-off"}`))
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/repos/"+expectedRepo+"/pulls/1/reviews":
			body, err := io.ReadAll(r.Body)
			require.NoError(t, err)
			assert.JSONEq(t, `{"status":"approved"}`, string(body))

			recorder.mu.Lock()
			recorder.reviewCreated = true
			recorder.mu.Unlock()

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"id":2,"status":"approved"}`))
		default:
			t.Fatalf("unexpected datahub core request: %s %s", r.Method, r.URL.Path)
		}
	}))

	oldCoreURL := setting.DataHub.CoreURL
	oldServiceToken := setting.DataHub.ServiceToken
	oldEnabled := setting.DataHub.Enabled
	setting.DataHub.CoreURL = server.URL
	setting.DataHub.ServiceToken = "test-service-token"
	setting.DataHub.Enabled = true
	datahub.ResetDefaultClient()

	t.Cleanup(func() {
		server.Close()
		setting.DataHub.CoreURL = oldCoreURL
		setting.DataHub.ServiceToken = oldServiceToken
		setting.DataHub.Enabled = oldEnabled
		datahub.ResetDefaultClient()
	})

	return recorder
}

func (r *datahubCoreCreateRecorder) assertCreated(t *testing.T) {
	t.Helper()

	r.mu.Lock()
	defer r.mu.Unlock()
	assert.True(t, r.created, "expected gateway to create the backing datahub-core repo")
}

func (r *datahubCoreCreateRecorder) assertListed(t *testing.T) {
	t.Helper()

	r.mu.Lock()
	defer r.mu.Unlock()
	assert.True(t, r.listed, "expected gateway datahub proxy to list refs from datahub-core")
}

func (r *datahubCoreCreateRecorder) assertLogRead(t *testing.T) {
	t.Helper()

	r.mu.Lock()
	defer r.mu.Unlock()
	assert.True(t, r.logged, "expected gateway datahub proxy to read the default branch log from datahub-core")
}

func (r *datahubCoreCreateRecorder) assertStatsAndDedupRead(t *testing.T) {
	t.Helper()

	r.mu.Lock()
	defer r.mu.Unlock()
	assert.True(t, r.statsRead, "expected gateway datahub proxy to resolve branch stats through datahub-core")
	assert.True(t, r.dedupRead, "expected gateway datahub proxy to resolve branch dedup through datahub-core")
}

func (r *datahubCoreCreateRecorder) assertExportRead(t *testing.T) {
	t.Helper()

	r.mu.Lock()
	defer r.mu.Unlock()
	assert.True(t, r.exportRead, "expected gateway datahub proxy to probe export through datahub-core")
}

func (r *datahubCoreCreateRecorder) assertPullConversationListed(t *testing.T) {
	t.Helper()

	r.mu.Lock()
	defer r.mu.Unlock()
	assert.True(t, r.commentsListed, "expected gateway datahub proxy to list PR comments from datahub-core")
	assert.True(t, r.reviewsListed, "expected gateway datahub proxy to list PR reviews from datahub-core")
}

func (r *datahubCoreCreateRecorder) assertPullConversationCreated(t *testing.T) {
	t.Helper()

	r.mu.Lock()
	defer r.mu.Unlock()
	assert.True(t, r.commentCreated, "expected gateway datahub proxy to create PR comments in datahub-core")
	assert.True(t, r.reviewCreated, "expected gateway datahub proxy to create PR reviews in datahub-core")
}

func TestAPICreateDataRepo(t *testing.T) {
	defer tests.PrepareTestEnv(t)()

	repoName := "api-data-repo-create"
	recorder := mockDatahubCoreCreate(t, repoName)

	session := loginUser(t, "user2")
	require.NotNil(t, session.GetCookie(setting.SessionConfig.CookieName))
	token := getTokenForLoggedInUser(t, session, auth_model.AccessTokenScopeWriteRepository, auth_model.AccessTokenScopeWriteUser)
	require.NotNil(t, session.GetCookie(setting.SessionConfig.CookieName))

	req := NewRequestWithJSON(t, "POST", "/api/v1/user/repos", map[string]any{
		"name":         repoName,
		"is_data_repo": true,
	}).AddTokenAuth(token)
	resp := session.MakeRequest(t, req, http.StatusCreated)

	var apiRepo map[string]any
	DecodeJSON(t, resp, &apiRepo)
	assert.Equal(t, true, apiRepo["is_data_repo"])

	createdRepo := unittest.AssertExistsAndLoadBean(t, &repo.Repository{OwnerID: 2, Name: repoName})
	assert.True(t, createdRepo.IsDataRepo)
	assert.True(t, createdRepo.IsEmpty)
	assert.False(t, createdRepo.IsFsckEnabled)
	recorder.assertCreated(t)

	req = NewRequest(t, "GET", "/api/v1/repos/user2/"+repoName+"/datahub/refs").AddTokenAuth(token)
	session.MakeRequest(t, req, http.StatusOK)
	recorder.assertListed(t)
}

func TestAPIDatahubPullConversationProxy(t *testing.T) {
	defer tests.PrepareTestEnv(t)()

	repoName := "api-data-repo-pr-conversation"
	recorder := mockDatahubCoreCreate(t, repoName)

	session := loginUser(t, "user2")
	token := getTokenForLoggedInUser(t, session, auth_model.AccessTokenScopeWriteRepository, auth_model.AccessTokenScopeWriteUser)

	req := NewRequestWithJSON(t, "POST", "/api/v1/user/repos", map[string]any{
		"name":         repoName,
		"is_data_repo": true,
	}).AddTokenAuth(token)
	session.MakeRequest(t, req, http.StatusCreated)

	req = NewRequest(t, "GET", "/api/v1/repos/user2/"+repoName+"/datahub/pulls/1/comments").AddTokenAuth(token)
	resp := session.MakeRequest(t, req, http.StatusOK)
	assert.Contains(t, resp.Body.String(), "Looks good")

	req = NewRequest(t, "GET", "/api/v1/repos/user2/"+repoName+"/datahub/pulls/1/reviews").AddTokenAuth(token)
	resp = session.MakeRequest(t, req, http.StatusOK)
	assert.Contains(t, resp.Body.String(), "approved")

	req = NewRequestWithJSON(t, "POST", "/api/v1/repos/user2/"+repoName+"/datahub/pulls/1/comments", map[string]any{
		"author": "user2",
		"body":   "Needs owner sign-off",
	}).AddTokenAuth(token)
	resp = session.MakeRequest(t, req, http.StatusCreated)
	assert.Contains(t, resp.Body.String(), "Needs owner sign-off")

	req = NewRequestWithJSON(t, "POST", "/api/v1/repos/user2/"+repoName+"/datahub/pulls/1/reviews", map[string]any{
		"status": "approved",
	}).AddTokenAuth(token)
	resp = session.MakeRequest(t, req, http.StatusCreated)
	assert.Contains(t, resp.Body.String(), "approved")

	recorder.assertPullConversationListed(t)
	recorder.assertPullConversationCreated(t)
}

func TestAPIGitRefsOnDataRepoReturnsUnsupportedWithoutOpeningGit(t *testing.T) {
	defer tests.PrepareTestEnv(t)()

	repoName := "api-data-repo-git-refs"
	recorder := mockDatahubCoreCreate(t, repoName)

	session := loginUser(t, "user2")
	token := getTokenForLoggedInUser(t, session, auth_model.AccessTokenScopeWriteRepository, auth_model.AccessTokenScopeWriteUser)

	req := NewRequestWithJSON(t, "POST", "/api/v1/user/repos", map[string]any{
		"name":         repoName,
		"is_data_repo": true,
	}).AddTokenAuth(token)
	session.MakeRequest(t, req, http.StatusCreated)
	recorder.assertCreated(t)

	req = NewRequest(t, "GET", "/api/v1/repos/user2/"+repoName+"/git/refs").AddTokenAuth(token)
	resp := session.MakeRequest(t, req, http.StatusConflict)
	assert.Contains(t, resp.Body.String(), "data repositories do not expose a Git repository")
	assert.Contains(t, resp.Body.String(), "/datahub")
}

func TestAPIDatahubLogDefaultsToRepositoryDefaultBranch(t *testing.T) {
	defer tests.PrepareTestEnv(t)()

	repoName := "api-data-repo-log-default"
	recorder := mockDatahubCoreCreate(t, repoName)

	session := loginUser(t, "user2")
	token := getTokenForLoggedInUser(t, session, auth_model.AccessTokenScopeWriteRepository, auth_model.AccessTokenScopeWriteUser)

	req := NewRequestWithJSON(t, "POST", "/api/v1/user/repos", map[string]any{
		"name":         repoName,
		"is_data_repo": true,
	}).AddTokenAuth(token)
	session.MakeRequest(t, req, http.StatusCreated)

	req = NewRequest(t, "GET", "/api/v1/repos/user2/"+repoName+"/datahub/log").AddTokenAuth(token)
	resp := session.MakeRequest(t, req, http.StatusOK)
	assert.Contains(t, resp.Body.String(), `"ref":"heads/master"`)

	req = NewRequest(t, "GET", "/api/v1/repos/user2/"+repoName+"/datahub/log/main").AddTokenAuth(token)
	resp = session.MakeRequest(t, req, http.StatusOK)
	assert.Contains(t, resp.Body.String(), `"ref":"heads/main"`)

	req = NewRequest(t, "GET", "/api/v1/repos/user2/"+repoName+"/datahub/log/feature/foo").AddTokenAuth(token)
	resp = session.MakeRequest(t, req, http.StatusOK)
	assert.Contains(t, resp.Body.String(), `"ref":"heads/feature/foo"`)
	recorder.assertLogRead(t)
}

func TestAPIDatahubStatsAndDedupAcceptBranchNames(t *testing.T) {
	defer tests.PrepareTestEnv(t)()

	repoName := "api-data-repo-stats-branch"
	recorder := mockDatahubCoreCreate(t, repoName)

	session := loginUser(t, "user2")
	token := getTokenForLoggedInUser(t, session, auth_model.AccessTokenScopeWriteRepository, auth_model.AccessTokenScopeWriteUser)

	req := NewRequestWithJSON(t, "POST", "/api/v1/user/repos", map[string]any{
		"name":         repoName,
		"is_data_repo": true,
	}).AddTokenAuth(token)
	session.MakeRequest(t, req, http.StatusCreated)

	req = NewRequest(t, "GET", "/api/v1/repos/user2/"+repoName+"/datahub/stats/main").AddTokenAuth(token)
	resp := session.MakeRequest(t, req, http.StatusOK)
	assert.Contains(t, resp.Body.String(), `"row_count":2`)

	req = NewRequest(t, "GET", "/api/v1/repos/user2/"+repoName+"/datahub/dedup/main").AddTokenAuth(token)
	resp = session.MakeRequest(t, req, http.StatusOK)
	assert.Contains(t, resp.Body.String(), `"duplicate_rows":0`)

	req = NewRequest(t, "GET", "/api/v1/repos/user2/"+repoName+"/datahub/stats/feature/foo").AddTokenAuth(token)
	resp = session.MakeRequest(t, req, http.StatusOK)
	assert.Contains(t, resp.Body.String(), `"row_count":2`)

	req = NewRequest(t, "GET", "/api/v1/repos/user2/"+repoName+"/datahub/dedup/feature/foo").AddTokenAuth(token)
	resp = session.MakeRequest(t, req, http.StatusOK)
	assert.Contains(t, resp.Body.String(), `"duplicate_rows":0`)
	recorder.assertStatsAndDedupRead(t)
}

func TestAPIDatahubExportSupportsHead(t *testing.T) {
	defer tests.PrepareTestEnv(t)()

	repoName := "api-data-repo-export-head"
	recorder := mockDatahubCoreCreate(t, repoName)

	session := loginUser(t, "user2")
	token := getTokenForLoggedInUser(t, session, auth_model.AccessTokenScopeWriteRepository, auth_model.AccessTokenScopeWriteUser)

	req := NewRequestWithJSON(t, "POST", "/api/v1/user/repos", map[string]any{
		"name":         repoName,
		"is_data_repo": true,
	}).AddTokenAuth(token)
	session.MakeRequest(t, req, http.StatusCreated)

	req = NewRequest(t, "HEAD", "/api/v1/repos/user2/"+repoName+"/datahub/export/"+datahubTestMainCommit+"/train.jsonl").AddTokenAuth(token)
	resp := session.MakeRequest(t, req, http.StatusOK)
	assert.Equal(t, "application/x-ndjson", resp.Header().Get("Content-Type"))
	assert.Empty(t, resp.Body.String())
	recorder.assertExportRead(t)
}

func TestAPIDatahubMergeRequiresAuthenticatedWriter(t *testing.T) {
	defer tests.PrepareTestEnv(t)()

	repoName := "api-data-repo-pr-merge-permissions"
	recorder := mockDatahubCoreCreate(t, repoName)

	session := loginUser(t, "user2")
	token := getTokenForLoggedInUser(t, session, auth_model.AccessTokenScopeWriteRepository, auth_model.AccessTokenScopeWriteUser)

	req := NewRequestWithJSON(t, "POST", "/api/v1/user/repos", map[string]any{
		"name":         repoName,
		"is_data_repo": true,
	}).AddTokenAuth(token)
	session.MakeRequest(t, req, http.StatusCreated)
	recorder.assertCreated(t)

	req = NewRequestWithJSON(t, "POST", "/api/v1/repos/user2/"+repoName+"/datahub/pulls/1/merge", map[string]any{
		"merge_style": "squash",
	})
	session.MakeRequest(t, req, http.StatusUnauthorized)

	readerSession := loginUser(t, "user4")
	readerToken := getTokenForLoggedInUser(t, readerSession, auth_model.AccessTokenScopeReadRepository)
	req = NewRequestWithJSON(t, "POST", "/api/v1/repos/user2/"+repoName+"/datahub/pulls/1/merge", map[string]any{
		"merge_style": "squash",
	}).AddTokenAuth(readerToken)
	readerSession.MakeRequest(t, req, http.StatusForbidden)
}

func TestAPIDatahubMergeHonorsProtectedBranchMergeWhitelist(t *testing.T) {
	defer tests.PrepareTestEnv(t)()

	repoName := "api-data-repo-pr-merge-whitelist"
	recorder := mockDatahubCoreCreate(t, repoName)

	session := loginUser(t, "user2")
	token := getTokenForLoggedInUser(t, session, auth_model.AccessTokenScopeWriteRepository, auth_model.AccessTokenScopeWriteUser)

	req := NewRequestWithJSON(t, "POST", "/api/v1/user/repos", map[string]any{
		"name":         repoName,
		"is_data_repo": true,
	}).AddTokenAuth(token)
	session.MakeRequest(t, req, http.StatusCreated)
	recorder.assertCreated(t)

	createdRepo := unittest.AssertExistsAndLoadBean(t, &repo.Repository{OwnerID: 2, Name: repoName})
	reviewer := unittest.AssertExistsAndLoadBean(t, &user_model.User{ID: 4})
	require.NoError(t, repo_module.AddCollaborator(db.DefaultContext, createdRepo, reviewer))
	require.NoError(t, repo.ChangeCollaborationAccessMode(db.DefaultContext, createdRepo, reviewer.ID, perm_model.AccessModeWrite))
	require.NoError(t, git_model.UpdateProtectBranch(db.DefaultContext, createdRepo, &git_model.ProtectedBranch{
		RepoID:               createdRepo.ID,
		RuleName:             "main",
		CanPush:              true,
		EnableWhitelist:      true,
		EnableMergeWhitelist: true,
	}, git_model.WhitelistOptions{
		UserIDs:      []int64{reviewer.ID},
		MergeUserIDs: []int64{reviewer.ID},
	}))

	req = NewRequestWithJSON(t, "POST", "/api/v1/repos/user2/"+repoName+"/datahub/pulls/1/merge", map[string]any{
		"merge_style": "squash",
	}).AddTokenAuth(token)
	session.MakeRequest(t, req, http.StatusForbidden)
}

func TestAPIDatahubGovernance(t *testing.T) {
	defer tests.PrepareTestEnv(t)()

	repoName := "api-data-repo-governance"
	recorder := mockDatahubCoreCreate(t, repoName)

	session := loginUser(t, "user2")
	token := getTokenForLoggedInUser(t, session, auth_model.AccessTokenScopeWriteRepository, auth_model.AccessTokenScopeWriteUser)

	req := NewRequestWithJSON(t, "POST", "/api/v1/user/repos", map[string]any{
		"name":         repoName,
		"is_data_repo": true,
	}).AddTokenAuth(token)
	session.MakeRequest(t, req, http.StatusCreated)
	recorder.assertCreated(t)

	createdRepo := unittest.AssertExistsAndLoadBean(t, &repo.Repository{OwnerID: 2, Name: repoName})
	reviewer := unittest.AssertExistsAndLoadBean(t, &user_model.User{ID: 4})
	require.NoError(t, repo_module.AddCollaborator(db.DefaultContext, createdRepo, reviewer))
	require.NoError(t, repo.ChangeCollaborationAccessMode(db.DefaultContext, createdRepo, reviewer.ID, perm_model.AccessModeWrite))
	require.NoError(t, git_model.UpdateProtectBranch(db.DefaultContext, createdRepo, &git_model.ProtectedBranch{
		RepoID:                        createdRepo.ID,
		RuleName:                      "main",
		CanPush:                       true,
		EnableWhitelist:               true,
		EnableMergeWhitelist:          true,
		EnableStatusCheck:             true,
		StatusCheckContexts:           []string{"schema", "toxicity"},
		RequiredApprovals:             2,
		BlockOnRejectedReviews:        true,
		BlockOnOfficialReviewRequests: true,
	}, git_model.WhitelistOptions{
		UserIDs:      []int64{reviewer.ID},
		MergeUserIDs: []int64{reviewer.ID},
	}))

	req = NewRequest(t, "GET", "/api/v1/repos/user2/"+repoName+"/datahub/governance?target_branch=main").AddTokenAuth(token)
	resp := session.MakeRequest(t, req, http.StatusOK)

	var payload map[string]any
	DecodeJSON(t, resp, &payload)
	repoPayload := payload["repository"].(map[string]any)
	assert.Equal(t, true, repoPayload["is_data_repo"])
	assert.NotEmpty(t, repoPayload["default_branch"])

	links := payload["links"].(map[string]any)
	assert.Equal(t, "/user2/"+repoName+"/settings", links["settings"])
	assert.Equal(t, "/user2/"+repoName+"/settings/collaboration", links["collaboration"])
	assert.Equal(t, "/user2/"+repoName+"/settings/branches", links["branches"])
	assert.Equal(t, "/user2/"+repoName+"/settings/branches/edit", links["new_branch_rule"])

	currentUser := payload["current_user"].(map[string]any)
	assert.Equal(t, true, currentUser["is_authenticated"])
	assert.Equal(t, false, currentUser["can_merge"])
	assert.Equal(t, "main", currentUser["target_branch"])

	reviewers := payload["reviewers"].([]any)
	require.NotEmpty(t, reviewers)
	reviewerLogins := make([]any, 0, len(reviewers))
	for _, reviewer := range reviewers {
		reviewerLogins = append(reviewerLogins, reviewer.(map[string]any)["login"])
	}
	assert.Contains(t, reviewerLogins, "user4")

	branchProtections := payload["branch_protections"].([]any)
	require.Len(t, branchProtections, 1)
	protection := branchProtections[0].(map[string]any)
	assert.Equal(t, "main", protection["rule_name"])
	assert.EqualValues(t, 2, protection["required_approvals"])
	assert.Equal(t, true, protection["block_on_rejected_reviews"])
	assert.Equal(t, true, protection["block_on_official_review_requests"])
	assert.ElementsMatch(t, []any{"schema", "toxicity"}, protection["status_check_contexts"].([]any))
	assert.ElementsMatch(t, []any{"user4"}, protection["push_whitelist_usernames"].([]any))
	assert.ElementsMatch(t, []any{"user4"}, protection["merge_whitelist_usernames"].([]any))

	user4Session := loginUser(t, "user4")
	user4Token := getTokenForLoggedInUser(t, user4Session, auth_model.AccessTokenScopeReadRepository)
	req = NewRequest(t, "GET", "/api/v1/repos/user2/"+repoName+"/datahub/governance?target_branch=main").AddTokenAuth(user4Token)
	resp = user4Session.MakeRequest(t, req, http.StatusOK)
	DecodeJSON(t, resp, &payload)
	currentUser = payload["current_user"].(map[string]any)
	assert.Equal(t, true, currentUser["is_authenticated"])
	assert.Equal(t, true, currentUser["can_merge"])
}

func TestAPIDatahubGovernanceAcceptsSignedInWebSession(t *testing.T) {
	defer tests.PrepareTestEnv(t)()

	repoName := "api-data-repo-governance-session"
	recorder := mockDatahubCoreCreate(t, repoName)

	session := loginUser(t, "user2")
	token := getTokenForLoggedInUser(t, session, auth_model.AccessTokenScopeWriteRepository, auth_model.AccessTokenScopeWriteUser)

	req := NewRequestWithJSON(t, "POST", "/api/v1/user/repos", map[string]any{
		"name":         repoName,
		"is_data_repo": true,
	}).AddTokenAuth(token)
	session.MakeRequest(t, req, http.StatusCreated)
	recorder.assertCreated(t)

	req = NewRequest(t, "GET", "/api/v1/repos/user2/"+repoName+"/datahub/governance?target_branch=main")
	req.AddCookie(session.GetCookie(setting.SessionConfig.CookieName))
	resp := session.MakeRequest(t, req, http.StatusOK)

	var payload map[string]any
	DecodeJSON(t, resp, &payload)
	currentUser := payload["current_user"].(map[string]any)
	assert.Equal(t, true, currentUser["is_authenticated"])
	assert.Equal(t, true, currentUser["can_merge"])

	repoPayload := payload["repository"].(map[string]any)
	permissions := repoPayload["permissions"].(map[string]any)
	assert.Equal(t, true, permissions["admin"])
	assert.Equal(t, true, permissions["push"])
}

func TestAPIDatahubPullConversationAcceptsSignedInWebSession(t *testing.T) {
	defer tests.PrepareTestEnv(t)()

	repoName := "api-data-repo-pr-session"
	recorder := mockDatahubCoreCreate(t, repoName)

	session := loginUser(t, "user2")
	token := getTokenForLoggedInUser(t, session, auth_model.AccessTokenScopeWriteRepository, auth_model.AccessTokenScopeWriteUser)

	req := NewRequestWithJSON(t, "POST", "/api/v1/user/repos", map[string]any{
		"name":         repoName,
		"is_data_repo": true,
	}).AddTokenAuth(token)
	session.MakeRequest(t, req, http.StatusCreated)
	recorder.assertCreated(t)

	req = NewRequestWithJSON(t, "POST", "/api/v1/repos/user2/"+repoName+"/datahub/pulls/1/comments", map[string]any{
		"author": "user2",
		"body":   "Needs owner sign-off",
	})
	req.AddCookie(session.GetCookie(setting.SessionConfig.CookieName))
	session.MakeRequest(t, req, http.StatusCreated)

	req = NewRequestWithJSON(t, "POST", "/api/v1/repos/user2/"+repoName+"/datahub/pulls/1/reviews", map[string]any{
		"status": "approved",
	})
	req.AddCookie(session.GetCookie(setting.SessionConfig.CookieName))
	session.MakeRequest(t, req, http.StatusCreated)

	recorder.assertPullConversationCreated(t)
}

func TestWebCreateDataRepo(t *testing.T) {
	defer tests.PrepareTestEnv(t)()

	repoName := "web-data-repo-create"
	recorder := mockDatahubCoreCreate(t, repoName)

	session := loginUser(t, "user2")
	req := NewRequestWithValues(t, "POST", "/repo/create", map[string]string{
		"uid":          "2",
		"repo_name":    repoName,
		"is_data_repo": "true",
	})
	resp := session.MakeRequest(t, req, http.StatusSeeOther)
	assert.Equal(t, "/user2/"+repoName, test.RedirectURL(resp))

	createdRepo := unittest.AssertExistsAndLoadBean(t, &repo.Repository{OwnerID: 2, Name: repoName})
	assert.True(t, createdRepo.IsDataRepo)
	assert.True(t, createdRepo.IsEmpty)
	assert.False(t, createdRepo.IsFsckEnabled)
	recorder.assertCreated(t)

	resp = session.MakeRequest(t, NewRequest(t, "GET", "/user2/"+repoName), http.StatusOK)
	htmlDoc := NewHTMLParser(t, resp.Body)
	htmlDoc.AssertElement(t, "#data-repo-home[data-owner='user2'][data-repo='"+repoName+"']", true)
	htmlDoc.AssertElement(t, "overflow-menu .item[href='/user2/"+repoName+"']", true)
}

func TestDataRepoActionsPageDoesNotRequireGitRepo(t *testing.T) {
	defer tests.PrepareTestEnv(t)()

	repoName := "data-repo-actions"
	recorder := mockDatahubCoreCreate(t, repoName)

	session := loginUser(t, "user2")
	req := NewRequestWithValues(t, "POST", "/repo/create", map[string]string{
		"uid":          "2",
		"repo_name":    repoName,
		"is_data_repo": "true",
	})
	resp := session.MakeRequest(t, req, http.StatusSeeOther)
	assert.Equal(t, "/user2/"+repoName, test.RedirectURL(resp))
	recorder.assertCreated(t)

	resp = session.MakeRequest(t, NewRequest(t, "GET", "/user2/"+repoName+"/actions"), http.StatusOK)
	htmlDoc := NewHTMLParser(t, resp.Body)
	htmlDoc.AssertElement(t, ".repository.actions", true)
	htmlDoc.AssertElement(t, ".empty-placeholder", true)
}

func TestRepoCreateFormExposesDataRepoOption(t *testing.T) {
	defer tests.PrepareTestEnv(t)()

	session := loginUser(t, "user2")
	resp := session.MakeRequest(t, NewRequest(t, "GET", "/repo/create"), http.StatusOK)
	htmlDoc := NewHTMLParser(t, resp.Body)

	htmlDoc.AssertElement(t, "input[name='is_data_repo'][type='checkbox']", true)
}
