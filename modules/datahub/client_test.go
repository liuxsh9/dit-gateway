package datahub_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"forgejo.org/modules/datahub"
	"forgejo.org/modules/setting"
)

func newTestClient(t *testing.T, handler http.Handler) *datahub.Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	setting.DataHub.CoreURL = srv.URL
	setting.DataHub.ServiceToken = "test-token"
	datahub.ResetDefaultClient()
	return datahub.DefaultClient()
}

func TestListRefs(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/api/v1/repos/myrepo/refs", r.URL.Path)
		assert.Equal(t, "Bearer test-token", r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`[]`))
	}))
	data, status, err := client.ListRefs(context.Background(), "myrepo")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)
	assert.Equal(t, []byte(`[]`), data)
}

func TestCreateRepo(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/v1/repos", r.URL.Path)
		w.WriteHeader(http.StatusCreated)
	}))
	err := client.CreateRepo(context.Background(), "newrepo")
	require.NoError(t, err)
}

func TestDeleteRepoNotFound(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	err := client.DeleteRepo(context.Background(), "gone-repo")
	require.NoError(t, err)
}

func TestDeleteRepoServerError(t *testing.T) {
	client := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	err := client.DeleteRepo(context.Background(), "broken-repo")
	require.Error(t, err)
}
