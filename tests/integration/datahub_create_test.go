// Copyright 2026 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package integration

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	auth_model "forgejo.org/models/auth"
	"forgejo.org/models/repo"
	"forgejo.org/models/unittest"
	"forgejo.org/modules/datahub"
	"forgejo.org/modules/setting"
	"forgejo.org/modules/test"
	"forgejo.org/tests"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type datahubCoreCreateRecorder struct {
	mu      sync.Mutex
	created bool
	listed  bool
}

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
			_, _ = w.Write([]byte(`[]`))
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

func TestAPICreateDataRepo(t *testing.T) {
	defer tests.PrepareTestEnv(t)()

	repoName := "api-data-repo-create"
	recorder := mockDatahubCoreCreate(t, repoName)

	session := loginUser(t, "user2")
	token := getTokenForLoggedInUser(t, session, auth_model.AccessTokenScopeWriteRepository, auth_model.AccessTokenScopeWriteUser)

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

func TestRepoCreateFormExposesDataRepoOption(t *testing.T) {
	defer tests.PrepareTestEnv(t)()

	session := loginUser(t, "user2")
	resp := session.MakeRequest(t, NewRequest(t, "GET", "/repo/create"), http.StatusOK)
	htmlDoc := NewHTMLParser(t, resp.Body)

	htmlDoc.AssertElement(t, "input[name='is_data_repo'][type='checkbox']", true)
}
